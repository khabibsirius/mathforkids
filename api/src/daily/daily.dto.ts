export class DailyChallengeView {
  /** YYYY-MM-DD, UTC — the same day boundary the streak uses. */
  date: string;
  topic: string;
  topicLabel: string;
  symbol: string;
  title: string;
  description: string;

  /** Correct answers needed today in this topic. */
  target: number;
  /** Correct answers so far today, counted from the attempt log. */
  progress: number;
  /** True once progress has reached the target. */
  complete: boolean;
  /** True once the reward has been collected. Resets tomorrow. */
  claimed: boolean;

  xpReward: number;
  /** The child's level in the challenge topic, so the card can say it. */
  level: number;
  tier: string;
}

export class DailyClaimView {
  xpAwarded: number;
  /** The child's XP after the reward, so the interface need not add up. */
  xpTotal: number;
  challenge: DailyChallengeView;
}
