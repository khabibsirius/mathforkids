import { IsIn, IsOptional, IsInt, Max, Min } from 'class-validator';
import type { Exercise, Topic } from '@prisma/client';
import { TOPIC_META, TOPICS } from '../domain/topics';

export class StartSessionDto {
  @IsIn(TOPICS)
  topic: Topic;

  /** Questions in the round. Defaults to 10. */
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  targetCount?: number;
}

/**
 * The ONLY way an exercise is serialised for a client.
 *
 * Note what is absent: `correctAnswer`. It is written to the database at
 * generation time and read back by POST /attempts to grade. It is never on the
 * wire, so the browser cannot be inspected for the answer and the client is
 * never trusted to mark its own work. Every path that returns an exercise
 * funnels through toExerciseView so there is one place to audit.
 */
export class ExerciseView {
  id: string;
  ordinal: number;
  topic: string;
  /** +, −, × or ÷ — rendered large. */
  symbol: string;
  level: number;
  operandA: number;
  operandB: number;
  /** Four options, already shuffled. Order is stable for this exercise. */
  choices: number[];
  /** Ready-made display string, e.g. "7 + 5". */
  prompt: string;
}

export function toExerciseView(exercise: Exercise): ExerciseView {
  const symbol = TOPIC_META[exercise.topic].symbol;
  return {
    id: exercise.id,
    ordinal: exercise.ordinal,
    topic: exercise.topic,
    symbol,
    level: exercise.level,
    operandA: exercise.operandA,
    operandB: exercise.operandB,
    choices: exercise.choices,
    prompt: `${exercise.operandA} ${symbol} ${exercise.operandB}`,
  };
}

export class SessionStartView {
  sessionId: string;
  topic: string;
  topicLabel: string;
  level: number;
  tier: string;
  targetCount: number;
  answered: number;
  exercise: ExerciseView;
}

export class NextExerciseView {
  /** True once the child has answered every question in the round. */
  done: boolean;
  exercise: ExerciseView | null;
  answered: number;
  targetCount: number;
  level: number;
}

export class BadgeView {
  code: string;
  name: string;
  description: string;
  emoji: string;
}

export class SessionResultView {
  sessionId: string;
  topic: string;
  topicLabel: string;
  total: number;
  correct: number;
  accuracy: number;
  xpEarned: number;
  bestCombo: number;
  hintsUsed: number;
  /** Always a true, positive statement. Never invented. */
  highlight: string;
  levelBefore: number;
  levelAfter: number;
  newBadges: BadgeView[];
  currentStreak: number;
  xpTotal: number;
}
