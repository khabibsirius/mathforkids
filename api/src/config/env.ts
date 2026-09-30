/**
 * Configuration, validated once at boot.
 *
 * Every missing or malformed variable is reported in a single throw, so a bad
 * deployment produces one readable list rather than a game of whack-a-mole
 * across restarts.
 */

export const CONFIG = Symbol('APP_CONFIG');

export interface TutorConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  keepAlive: string;
  temperature: number;
  numPredict: number;
  cacheTtlHours: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTtl: string;
  refreshTtl: string;
  childTtl: string;
  corsOrigins: string[];
  seedOnBoot: boolean;
  tutor: TutorConfig;
}

class ConfigErrors {
  private readonly problems: string[] = [];

  add(problem: string): void {
    this.problems.push(problem);
  }

  throwIfAny(): void {
    if (this.problems.length === 0) return;
    throw new Error(
      `Invalid configuration:\n${this.problems.map((p) => `  - ${p}`).join('\n')}\n` +
        `See .env.example for the full list with defaults.`,
    );
  }
}

function asInt(raw: string | undefined, fallback: number, name: string, errs: ConfigErrors): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    errs.add(`${name} must be an integer, got "${raw}"`);
    return fallback;
  }
  return n;
}

function asFloat(raw: string | undefined, fallback: number, name: string, errs: ConfigErrors): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    errs.add(`${name} must be a number, got "${raw}"`);
    return fallback;
  }
  return n;
}

function asBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const errs = new ConfigErrors();

  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  if (!env.DATABASE_URL) {
    errs.add('DATABASE_URL is required (postgresql://user:pass@host:5432/db)');
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    errs.add('JWT_SECRET is required');
  } else if (nodeEnv === 'production' && jwtSecret.includes('dev-only')) {
    // Refuse to start in production with the value shipped in .env.example.
    errs.add('JWT_SECRET is still the example value — set a real secret in production');
  } else if (jwtSecret.length < 16) {
    errs.add(`JWT_SECRET must be at least 16 characters, got ${jwtSecret.length}`);
  }

  const tutorEnabled = asBool(env.TUTOR_ENABLED, true);
  const baseUrl = env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
  const model = env.OLLAMA_MODEL ?? 'phi4:14b';

  if (tutorEnabled && model.endsWith('-cloud')) {
    // A ":cloud" tagged model routes to ollama.com. That reintroduces the
    // external dependency and the account this design exists to avoid, so it
    // is refused rather than silently accepted.
    errs.add(
      `OLLAMA_MODEL "${model}" is a cloud-hosted tag and would send children's ` +
        `answers off this machine. Use a local model (phi4:14b, qwen2.5-coder:7b) ` +
        `or set TUTOR_ENABLED=false.`,
    );
  }

  const config: AppConfig = {
    nodeEnv,
    port: asInt(env.PORT, 3000, 'PORT', errs),
    databaseUrl: env.DATABASE_URL ?? '',
    jwtSecret,
    accessTtl: env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: env.JWT_REFRESH_TTL ?? '7d',
    // Long enough that a child is not logged out mid-session, short enough
    // that a shared family tablet does not stay open for a week.
    childTtl: env.JWT_CHILD_TTL ?? '12h',
    corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:8080,http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    seedOnBoot: asBool(env.SEED_ON_BOOT, true),
    tutor: {
      enabled: tutorEnabled,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model,
      timeoutMs: asInt(env.OLLAMA_TIMEOUT_MS, 8000, 'OLLAMA_TIMEOUT_MS', errs),
      keepAlive: env.OLLAMA_KEEP_ALIVE ?? '30m',
      temperature: asFloat(env.OLLAMA_TEMPERATURE, 0.3, 'OLLAMA_TEMPERATURE', errs),
      numPredict: asInt(env.OLLAMA_NUM_PREDICT, 160, 'OLLAMA_NUM_PREDICT', errs),
      cacheTtlHours: asInt(env.TUTOR_CACHE_TTL_HOURS, 24, 'TUTOR_CACHE_TTL_HOURS', errs),
    },
  };

  errs.throwIfAny();
  return Object.freeze(config);
}
