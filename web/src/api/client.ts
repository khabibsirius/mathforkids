import type {
  AttemptResult,
  Child,
  ChildToken,
  HintTicket,
  LlmHealth,
  NextExercise,
  Progress,
  SessionResult,
  SessionStart,
  Tier,
  Topic,
  TokenPair,
  TopicCode,
  TutorHint,
} from './types';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

/**
 * Errors carry the API's kidMessage separately from the developer message.
 * Anything rendered on a child-facing screen uses kidMessage; `message` is for
 * the console and the parent view.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly kidMessage: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KEY = 'mathsclub.session.v1';

interface Stored {
  parentToken?: string;
  refreshToken?: string;
  parentEmail?: string;
  childToken?: string;
  childId?: string;
  childName?: string;
  childAvatar?: string;
}

/**
 * localStorage can throw or come back empty (private windows, blocked site
 * data), so every access is guarded and the app renders correctly without it —
 * the only cost is signing in again.
 */
function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(next: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* session stays in memory only */
  }
}

let state: Stored = read();

export const session = {
  get snapshot(): Stored {
    return { ...state };
  },
  get hasParent(): boolean {
    return Boolean(state.parentToken);
  },
  get hasChild(): boolean {
    return Boolean(state.childToken);
  },
  get childId(): string | undefined {
    return state.childId;
  },
  get childName(): string | undefined {
    return state.childName;
  },
  get childAvatar(): string | undefined {
    return state.childAvatar;
  },
  get parentEmail(): string | undefined {
    return state.parentEmail;
  },
  setParent(pair: TokenPair): void {
    state = {
      ...state,
      parentToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      parentEmail: pair.parent.email,
    };
    write(state);
  },
  setChild(tok: ChildToken): void {
    state = {
      ...state,
      childToken: tok.childToken,
      childId: tok.child.id,
      childName: tok.child.name,
      childAvatar: tok.child.avatar,
    };
    write(state);
  },
  leaveChild(): void {
    state = { ...state, childToken: undefined, childId: undefined, childName: undefined, childAvatar: undefined };
    write(state);
  },
  signOut(): void {
    state = {};
    write(state);
  },
};

type Which = 'none' | 'parent' | 'child';

interface Options {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  as?: Which;
  /** Internal: prevents an infinite refresh loop. */
  retried?: boolean;
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, as = 'none' } = opts;
  const token = as === 'parent' ? state.parentToken : as === 'child' ? state.childToken : undefined;

  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.ok) {
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  let code = 'INTERNAL';
  let kidMessage = 'Something went wrong. It is not your fault!';
  let message = `${method} ${path} failed with ${res.status}`;
  let details: unknown;

  try {
    const envelope = (await res.json()) as {
      error?: { code?: string; message?: string; kidMessage?: string; details?: unknown };
    };
    if (envelope.error) {
      code = envelope.error.code ?? code;
      kidMessage = envelope.error.kidMessage ?? kidMessage;
      message = envelope.error.message ?? message;
      details = envelope.error.details;
    }
  } catch {
    /* non-JSON error body */
  }

  // One transparent refresh attempt when a parent access token has aged out.
  if (res.status === 401 && as === 'parent' && state.refreshToken && !opts.retried) {
    try {
      const pair = await request<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: state.refreshToken },
        retried: true,
      });
      session.setParent(pair);
      return request<T>(path, { ...opts, retried: true });
    } catch {
      session.signOut();
    }
  }

  throw new ApiError(res.status, code, kidMessage, message, details);
}

export const api = {
  baseUrl: BASE,

  // --- auth ---------------------------------------------------------------
  async register(email: string, password: string): Promise<TokenPair> {
    const pair = await request<TokenPair>('/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    session.setParent(pair);
    return pair;
  },

  async login(email: string, password: string): Promise<TokenPair> {
    const pair = await request<TokenPair>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    session.setParent(pair);
    return pair;
  },

  // --- children -----------------------------------------------------------
  listChildren(): Promise<Child[]> {
    return request<Child[]>('/children', { as: 'parent' });
  },

  createChild(name: string, age: number, avatar: string): Promise<Child> {
    return request<Child>('/children', {
      method: 'POST',
      body: { name, age, avatar },
      as: 'parent',
    });
  },

  async chooseChild(childId: string): Promise<ChildToken> {
    const tok = await request<ChildToken>(`/children/${childId}/token`, {
      method: 'POST',
      as: 'parent',
    });
    session.setChild(tok);
    return tok;
  },

  // --- play ---------------------------------------------------------------
  topics(): Promise<Topic[]> {
    return request<Topic[]>('/topics', { as: 'child' });
  },

  /**
   * Omit the tier and the round runs at whatever level the adaptive rule has
   * arrived at. Supplying one is an explicit choice that also becomes the
   * child's level for this topic.
   */
  startSession(topic: TopicCode, tier?: Tier): Promise<SessionStart> {
    return request<SessionStart>('/sessions', {
      method: 'POST',
      body: tier ? { topic, tier } : { topic },
      as: 'child',
    });
  },

  /** Parent-only. The adaptive rule keeps running from the level that is set. */
  setChildLevel(childId: string, topic: TopicCode, level: number): Promise<Child> {
    return request<Child>(`/children/${childId}/levels`, {
      method: 'PATCH',
      body: { topic, level },
      as: 'parent',
    });
  },

  nextExercise(sessionId: string): Promise<NextExercise> {
    return request<NextExercise>(`/sessions/${sessionId}/next`, { as: 'child' });
  },

  submit(exerciseId: string, answer: number, responseMs: number): Promise<AttemptResult> {
    return request<AttemptResult>('/attempts', {
      method: 'POST',
      body: { exerciseId, answer, responseMs },
      as: 'child',
    });
  },

  hint(ticket: string): Promise<HintTicket> {
    return request<HintTicket>(`/hints/${ticket}`, { as: 'child' });
  },

  finish(sessionId: string): Promise<SessionResult> {
    return request<SessionResult>(`/sessions/${sessionId}/finish`, {
      method: 'POST',
      as: 'child',
    });
  },

  // --- progress -----------------------------------------------------------
  progress(childId: string, as: Which = 'child'): Promise<Progress> {
    return request<Progress>(`/children/${childId}/progress`, { as });
  },

  llmHealth(): Promise<LlmHealth> {
    return request<LlmHealth>(`${BASE}/health/llm`);
  },
};

/**
 * Polls for the tutor's explanation, then gives up and leaves the static hint
 * in place. No websocket, no queue — this is a polling interaction and
 * treating it as more than that would be infrastructure for its own sake.
 *
 * The window is ~22s because a local model on CPU-only hardware takes 10-20s
 * to produce a hint (measured: ~11.7s median for qwen2.5-coder:7b). That is
 * affordable only because nothing is waiting on it: the static hint is already
 * on screen, a wrong answer waits for an explicit "Next question" tap, and if
 * the child has already moved on the result is simply discarded.
 */
export async function awaitTutorHint(
  ticket: string,
  attempts = 9,
  delayMs = 2500,
): Promise<TutorHint | null> {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const res = await api.hint(ticket);
      if (res.status === 'ready' && res.hint) return res.hint;
      if (res.status === 'failed') return null;
    } catch {
      return null;
    }
  }
  return null;
}
