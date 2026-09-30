import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitAttemptDto {
  @IsString()
  exerciseId: string;

  /** Must be one of the four choices the exercise was served with. */
  @IsInt()
  answer: number;

  /**
   * Milliseconds from question shown to answer tapped. Recorded for the
   * adaptive rule; never shown to the child and never penalised.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  responseMs?: number;
}

export class HintView {
  text: string;
  encouragement: string;
  /** 'static' on this response, always. An AI hint arrives via the ticket. */
  source: 'static';
  /**
   * Poll GET /hints/{ticket} for the tutor's explanation. Null when the tutor
   * is disabled or unavailable, in which case the static hint is the whole
   * answer and the child notices nothing.
   */
  ticket: string | null;
}

export class AttemptResultView {
  correct: boolean;
  /** Safe to send now: the attempt is recorded and cannot be replayed. */
  correctAnswer: number;
  xpEarned: number;
  /** Consecutive correct answers including this one. */
  combo: number;
  hint: HintView | null;
  progress: { answered: number; of: number; correct: number };
  level: { current: number; changed: 'up' | 'down' | 'hold' };
}
