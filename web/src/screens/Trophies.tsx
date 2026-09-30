import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, session } from '../api/client';
import type { Progress } from '../api/types';
import { Avatar, Loading, Notice, Stat, TOPIC_CLASS, TopBar } from '../components/ui';

/**
 * The child's own shelf.
 *
 * Deliberately not the parent dashboard: no accuracy percentages, no "weakest
 * topic", no response times. A child sees what they have collected and how far
 * each game has come. Diagnostics are for the grown-up.
 */
export default function Trophies({ onLeave }: { onLeave: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const childId = session.childId;
    if (!childId) {
      onLeave();
      return;
    }
    let alive = true;
    api
      .progress(childId, 'child')
      .then((p) => alive && setProgress(p))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.kidMessage : 'Could not load your trophies.');
      });
    return () => {
      alive = false;
    };
  }, [onLeave]);

  if (error) {
    return (
      <div className="shell">
        <TopBar />
        <div className="card stack">
          <Notice kind="bad">{error}</Notice>
          <Link to="/" className="btn btn--primary">
            Back to the games
          </Link>
        </div>
      </div>
    );
  }

  if (!progress) return <Loading what="Polishing your trophies" />;

  return (
    <div className="shell">
      <TopBar
        right={
          <Link to="/" className="btn">
            Back to the games
          </Link>
        }
      />

      <div className="stack">
        <div className="card row" style={{ gap: 18 }}>
          <Avatar name={progress.child.avatar} large />
          <div className="grow">
            <h1>{progress.child.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {progress.totals.correct} questions right, all time
            </p>
          </div>
        </div>

        <div className="stat-row">
          <Stat value={progress.child.xpTotal} label="XP" />
          <Stat value={progress.child.currentStreak} label="Day streak" />
          <Stat value={progress.child.longestStreak} label="Best streak" />
          <Stat value={progress.badges.length} label="Badges" />
        </div>

        <div className="card stack">
          <h2>Badges</h2>
          {progress.badges.length === 0 ? (
            <p className="muted">
              None yet. Finish a round and the first one is yours.
            </p>
          ) : (
            <div className="badge-row" style={{ justifyContent: 'flex-start' }}>
              {progress.badges.map((badge) => (
                <div key={badge.code} className="badge">
                  <span className="badge__emoji" aria-hidden="true">
                    {badge.emoji}
                  </span>
                  <div>
                    <div className="badge__name">{badge.name}</div>
                    <div className="tiny">{badge.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card stack">
          <h2>How far each game has come</h2>
          <div className="pick-grid">
            {progress.topics.map((topic) => (
              <div key={topic.topic} className={`pick ${TOPIC_CLASS[topic.topic]}`} style={{ cursor: 'default' }}>
                <div className="topic__symbol" aria-hidden="true">
                  {topic.symbol}
                </div>
                <span className="pick__name">{topic.label}</span>
                <span className="tier">{topic.tier}</span>
                <span className="tiny">{topic.levelDescription}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
