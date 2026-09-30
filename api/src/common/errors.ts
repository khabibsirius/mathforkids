/**
 * One error shape for the whole API.
 *
 * The unusual field is `kidMessage`. `message` is for the developer and the
 * logs; `kidMessage` is the only string the child-facing interface is allowed
 * to render. Without that split, either a five-year-old reads
 * "EXERCISE_ALREADY_ANSWERED" or the logs lose the detail — and a child
 * hitting a raw 500 is a product failure whatever caused it.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN_CHILD'
  | 'CHILD_NOT_FOUND'
  | 'AGE_OUT_OF_RANGE'
  | 'CHILD_LIMIT_REACHED'
  | 'TOPIC_UNKNOWN'
  | 'TOPIC_NOT_AVAILABLE_AT_LEVEL'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ALREADY_FINISHED'
  | 'SESSION_COMPLETE'
  | 'EXERCISE_NOT_FOUND'
  | 'EXERCISE_ALREADY_ANSWERED'
  | 'ANSWER_NOT_A_CHOICE'
  | 'HINT_NOT_FOUND'
  | 'TUTOR_DISABLED'
  | 'DAILY_NOT_COMPLETE'
  | 'DAILY_ALREADY_CLAIMED'
  | 'INTERNAL';

interface ErrorSpec {
  status: number;
  kidMessage: string;
}

const SPEC: Record<ErrorCode, ErrorSpec> = {
  VALIDATION_FAILED: { status: 422, kidMessage: 'Something in that was not quite right.' },
  EMAIL_TAKEN: { status: 409, kidMessage: 'That email already has an account.' },
  INVALID_CREDENTIALS: { status: 401, kidMessage: 'That email and password do not match.' },
  TOKEN_INVALID: { status: 401, kidMessage: 'Please choose your name again.' },
  TOKEN_EXPIRED: { status: 401, kidMessage: 'You were away a while — tap your name again.' },
  FORBIDDEN_CHILD: { status: 403, kidMessage: 'That is somebody else’s page.' },
  CHILD_NOT_FOUND: { status: 404, kidMessage: 'We could not find that name.' },
  AGE_OUT_OF_RANGE: { status: 422, kidMessage: 'This game is for ages 5 to 10.' },
  CHILD_LIMIT_REACHED: { status: 409, kidMessage: 'That is as many players as one grown-up can add.' },
  TOPIC_UNKNOWN: { status: 404, kidMessage: 'We do not have that kind of sum.' },
  TOPIC_NOT_AVAILABLE_AT_LEVEL: { status: 409, kidMessage: 'Try an easier kind of sum first.' },
  SESSION_NOT_FOUND: { status: 404, kidMessage: 'That round has gone. Start a new one!' },
  SESSION_ALREADY_FINISHED: { status: 409, kidMessage: 'That round is already finished.' },
  SESSION_COMPLETE: { status: 409, kidMessage: 'You finished all the questions — well done!' },
  EXERCISE_NOT_FOUND: { status: 404, kidMessage: 'That question has gone. Here comes another.' },
  EXERCISE_ALREADY_ANSWERED: { status: 409, kidMessage: 'You already answered that one!' },
  ANSWER_NOT_A_CHOICE: { status: 422, kidMessage: 'Pick one of the buttons.' },
  HINT_NOT_FOUND: { status: 404, kidMessage: 'No help for that one — have another go.' },
  TUTOR_DISABLED: { status: 503, kidMessage: 'The helper is having a rest.' },
  DAILY_NOT_COMPLETE: { status: 409, kidMessage: 'Keep going — you are not finished yet!' },
  DAILY_ALREADY_CLAIMED: {
    status: 409,
    kidMessage: 'You already got today’s prize. Come back tomorrow!',
  },
  INTERNAL: { status: 500, kidMessage: 'Something went wrong. It is not your fault!' },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly kidMessage: string;
  readonly meta?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, meta?: Record<string, unknown>) {
    const spec = SPEC[code];
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = spec.status;
    this.kidMessage = spec.kidMessage;
    this.meta = meta;
  }

  static statusFor(code: ErrorCode): number {
    return SPEC[code].status;
  }

  static kidMessageFor(code: ErrorCode): string {
    return SPEC[code].kidMessage;
  }
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    kidMessage: string;
    details?: unknown;
  };
}

export function toEnvelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return {
    error: { code, message, kidMessage: SPEC[code].kidMessage, ...(details ? { details } : {}) },
  };
}
