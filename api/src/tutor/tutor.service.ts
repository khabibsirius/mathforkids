import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Topic } from '@prisma/client';
import { AppConfig, CONFIG } from '../config/env';
import { HINT_JSON_SCHEMA, runSafetyGate, Strategy } from '../domain/safety-gate';
import { AgeBand } from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClient, OllamaError } from './ollama.client';
import { buildTutorMessages } from './prompt';

export interface HintRequest {
  topic: Topic;
  level: number;
  operandA: number;
  operandB: number;
  correctAnswer: number;
  submitted: number;
  age: number;
  ageBand: AgeBand;
}

export type TicketStatus = 'pending' | 'ready' | 'failed';

export interface TutorHintView {
  text: string;
  encouragement: string;
  strategy: Strategy;
  source: 'ai' | 'cache';
  model: string;
}

export interface TicketView {
  status: TicketStatus;
  hint: TutorHintView | null;
  /** Populated on failure so the reason is visible without reading logs. */
  failure?: string;
}

interface Ticket extends TicketView {
  createdAt: number;
}

/** Tickets are short-lived; the client polls twice within a few seconds. */
const TICKET_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class TutorService implements OnModuleInit {
  private readonly logger = new Logger(TutorService.name);

  /**
   * In-memory ticket store.
   *
   * Deliberately not Redis. The whole lifetime of a ticket is a few seconds
   * between one HTTP response and the poll that follows it, and adding a
   * broker to carry that would be infrastructure for its own sake. The
   * trade-off is real and worth stating: with more than one API replica a poll
   * could land on the instance that did not generate the hint, and the client
   * would simply keep the static hint. That is an acceptable outcome, and the
   * fix — should this ever scale out — is a shared store behind this same
   * interface.
   */
  private readonly tickets = new Map<string, Ticket>();

  private readonly stats = {
    requested: 0,
    cacheHits: 0,
    modelCalls: 0,
    accepted: 0,
    rejected: 0,
    timeouts: 0,
    unreachable: 0,
    badResponses: 0,
    lastLatencyMs: 0,
    lastRejection: null as string | null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaClient,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.config.tutor.enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('tutor disabled — every hint will come from the static templates');
      return;
    }
    // Not awaited: a slow or absent Ollama must never delay API startup.
    void this.ollama.warmup();
  }

  /**
   * Starts hint generation and returns a ticket immediately.
   *
   * Returns null when the tutor is off, in which case the caller's static hint
   * is the whole answer and the child notices nothing.
   */
  request(req: HintRequest): string | null {
    if (!this.enabled) return null;

    this.prune();
    this.stats.requested += 1;

    const ticketId = randomUUID();
    this.tickets.set(ticketId, { status: 'pending', hint: null, createdAt: Date.now() });

    // Fire and forget. Nothing on the request path awaits this.
    void this.work(ticketId, req).catch((err: unknown) => {
      this.fail(ticketId, `unexpected: ${(err as Error).message}`);
    });

    return ticketId;
  }

  peek(ticketId: string): TicketView | null {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    return { status: ticket.status, hint: ticket.hint, ...(ticket.failure ? { failure: ticket.failure } : {}) };
  }

  // -------------------------------------------------------------------------

  private cacheKey(req: HintRequest): string {
    // Two children of the same age making the same mistake on the same problem
    // share one model call.
    return [req.topic, req.level, req.operandA, req.operandB, req.submitted, req.ageBand].join(':');
  }

  private async work(ticketId: string, req: HintRequest): Promise<void> {
    const key = this.cacheKey(req);

    const cached = await this.prisma.tutorHint.findUnique({ where: { cacheKey: key } });
    if (cached) {
      const ageMs = Date.now() - cached.createdAt.getTime();
      if (ageMs < this.config.tutor.cacheTtlHours * 3600_000) {
        this.stats.cacheHits += 1;
        this.resolve(ticketId, {
          text: cached.hint,
          encouragement: '',
          strategy: cached.strategy as Strategy,
          source: 'cache',
          model: cached.model,
        });
        return;
      }
    }

    const { system, user } = buildTutorMessages({
      topic: req.topic,
      operandA: req.operandA,
      operandB: req.operandB,
      correctAnswer: req.correctAnswer,
      submitted: req.submitted,
      age: req.age,
    });

    let result;
    try {
      this.stats.modelCalls += 1;
      result = await this.ollama.chatJson(system, user, HINT_JSON_SCHEMA);
      this.stats.lastLatencyMs = result.latencyMs;
    } catch (err) {
      const kind = err instanceof OllamaError ? err.kind : 'bad_response';
      if (kind === 'timeout') this.stats.timeouts += 1;
      else if (kind === 'unreachable') this.stats.unreachable += 1;
      else this.stats.badResponses += 1;

      this.logger.warn(`hint call failed (${kind}): ${(err as Error).message}`);
      this.fail(ticketId, kind);
      return;
    }

    // Everything the model said is now checked. Seven checks; any failure
    // discards the output entirely.
    const gate = runSafetyGate(result.value, {
      operandA: req.operandA,
      operandB: req.operandB,
      correctAnswer: req.correctAnswer,
      ageBand: req.ageBand,
    });

    if (!gate.ok) {
      this.stats.rejected += 1;
      this.stats.lastRejection = `${gate.failure}: ${gate.detail}`;
      // The raw output is logged so a rejection can be inspected rather than
      // guessed at — this is how the gate gets tuned.
      this.logger.warn(
        `safety gate rejected a hint [${gate.failure}] ${gate.detail} — raw: ${result.raw.slice(0, 300)}`,
      );
      this.fail(ticketId, gate.failure);
      return;
    }

    this.stats.accepted += 1;

    // Only verified output is cached. A transient failure must not poison the
    // cache for the next 24 hours.
    await this.prisma.tutorHint
      .upsert({
        where: { cacheKey: key },
        create: {
          cacheKey: key,
          topic: req.topic,
          level: req.level,
          operandA: req.operandA,
          operandB: req.operandB,
          ageBand: req.ageBand,
          hint: gate.value.hint,
          strategy: gate.value.strategy,
          model: this.config.tutor.model,
        },
        update: {
          hint: gate.value.hint,
          strategy: gate.value.strategy,
          model: this.config.tutor.model,
          createdAt: new Date(),
        },
      })
      .catch((err: unknown) => {
        // A cache write failure must not lose a good hint.
        this.logger.warn(`could not cache hint: ${(err as Error).message}`);
      });

    this.resolve(ticketId, {
      text: gate.value.hint,
      encouragement: gate.value.encouragement,
      strategy: gate.value.strategy,
      source: 'ai',
      model: this.config.tutor.model,
    });
  }

  private resolve(ticketId: string, hint: TutorHintView): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;
    ticket.status = 'ready';
    ticket.hint = hint;
  }

  private fail(ticketId: string, reason: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;
    ticket.status = 'failed';
    ticket.hint = null;
    ticket.failure = reason;
  }

  private prune(): void {
    const cutoff = Date.now() - TICKET_TTL_MS;
    for (const [id, ticket] of this.tickets) {
      if (ticket.createdAt < cutoff) this.tickets.delete(id);
    }
  }

  /**
   * Everything a reviewer needs to tell whether the AI is actually working,
   * including the rejection rate — which is the evidence that the safety gate
   * is real rather than decorative.
   */
  async health(): Promise<Record<string, unknown>> {
    const { enabled, model, baseUrl } = { ...this.config.tutor };
    if (!enabled) {
      return {
        enabled: false,
        note: 'Tutor is off. Static hints are in use and the product is complete without it.',
      };
    }

    const [version, models] = await Promise.all([this.ollama.version(), this.ollama.listModels()]);
    const verdicts = this.stats.accepted + this.stats.rejected;

    return {
      enabled: true,
      reachable: version !== null,
      ollamaVersion: version,
      model,
      baseUrl,
      modelPulled: models.includes(model),
      modelsAvailable: models.length,
      stats: {
        ...this.stats,
        cacheHitRate: this.stats.requested
          ? Number((this.stats.cacheHits / this.stats.requested).toFixed(3))
          : null,
        rejectionRate: verdicts ? Number((this.stats.rejected / verdicts).toFixed(3)) : null,
      },
      pendingTickets: this.tickets.size,
    };
  }
}
