export class TopicProgressView {
  topic: string;
  label: string;
  symbol: string;
  level: number;
  tier: string;
  levelDescription: string;
  attempts: number;
  correct: number;
  /** Null when the child has not attempted this topic yet. */
  accuracy: number | null;
  avgResponseMs: number;
}

export class BadgeAwardView {
  code: string;
  name: string;
  description: string;
  emoji: string;
  awardedAt: string;
}

export class DailyPointView {
  /** YYYY-MM-DD, UTC. */
  date: string;
  attempts: number;
  correct: number;
}

export class ProgressView {
  child: {
    id: string;
    name: string;
    age: number;
    avatar: string;
    xpTotal: number;
    currentStreak: number;
    longestStreak: number;
  };
  totals: { attempts: number; correct: number; accuracy: number | null; sessions: number };
  topics: TopicProgressView[];
  badges: BadgeAwardView[];
  /** Fourteen days, oldest first. Zero-filled so charts need no gap handling. */
  daily: DailyPointView[];
  /** The topic to practise next, or null until there is enough data to say. */
  weakest: { topic: string; label: string; accuracy: number } | null;
}
