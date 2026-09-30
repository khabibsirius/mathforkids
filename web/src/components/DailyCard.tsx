import { useState, type ReactNode } from 'react';
import { api, ApiError, session } from '../api/client';
import type { DailyChallenge, TopicCode } from '../api/types';

/**
 * Today's challenge, at the top of the home screen.
 *
 * Three states, one at a time: something to do, a prize to collect, or done
 * for today. Progress is filled dots rather than a percentage, for the same
 * reason the play screen uses them — a seven-year-old can see five of eight
 * filled without reading anything.
 *
 * The button only ever *asks* to collect. The server recounts the attempt log
 * and refuses if the goal was not really met, so a tampered client gains
 * nothing.
 */
export default function DailyCard({
  challenge,
  onPlay,
  onClaimed,
}: {
  challenge: DailyChallenge;
  onPlay: (topic: TopicCode) => void;
  onClaimed: (next: DailyChallenge, xpAwarded: number) => void;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justWon, setJustWon] = useState<number | null>(null);

  const collect = async (): Promise<void> => {
    const childId = session.childId;
    if (!childId) return;

    setBusy(true);
    setError(null);
    try {
      const result = await api.claimDaily(childId);
      setJustWon(result.xpAwarded);
      onClaimed(result.challenge, result.xpAwarded);
    } catch (err) {
      setError(err instanceof ApiError ? err.kidMessage : 'Could not collect that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="daily" aria-labelledby="daily-title">
      <div className="daily__mark" aria-hidden="true">
        {challenge.symbol}
      </div>

      <div className="daily__body">
        <p className="daily__eyebrow" id="daily-title">
          {challenge.title}
        </p>
        <p className="daily__goal">{challenge.description}</p>

        <div
          className="dots"
          role="img"
          aria-label={`${challenge.progress} of ${challenge.target} done`}
        >
          {Array.from({ length: challenge.target }, (_, i) => (
            <span key={i} className={i < challenge.progress ? 'dot dot--right' : 'dot'} />
          ))}
          <span className="tiny" style={{ marginLeft: 6 }}>
            {challenge.progress} / {challenge.target}
          </span>
        </div>

        {error ? (
          <p className="tiny" style={{ color: 'var(--coral)', margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="daily__action">
        {challenge.claimed ? (
          <div className="daily__done">
            <span aria-hidden="true">{'✓'}</span>
            <span>
              {justWon !== null ? `+${justWon} XP!` : 'Done today'}
              <br />
              <span className="tiny">Come back tomorrow</span>
            </span>
          </div>
        ) : challenge.complete ? (
          <button
            type="button"
            className="btn btn--primary btn--big"
            disabled={busy}
            onClick={() => void collect()}
          >
            {busy ? 'Collecting…' : `Collect +${challenge.xpReward} XP`}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onPlay(challenge.topic)}
          >
            Play {challenge.topicLabel.toLowerCase()}
          </button>
        )}
      </div>
    </section>
  );
}
