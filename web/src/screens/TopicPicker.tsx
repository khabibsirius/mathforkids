import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, session } from '../api/client';
import type { Topic } from '../api/types';
import { Avatar, Loading, Notice, TOPIC_CLASS, TopBar } from '../components/ui';

/** "What shall we practise?" — one decision, four big targets. */
export default function TopicPicker({ onLeave }: { onLeave: () => void }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api
      .topics()
      .then((list) => alive && setTopics(list))
      .catch((err: unknown) => {
        if (!alive) return;
        // An expired child token is the common case here; going back to the
        // picker is the right recovery and needs no explanation to a child.
        if (err instanceof ApiError && (err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_INVALID')) {
          onLeave();
          return;
        }
        setError(err instanceof ApiError ? err.kidMessage : 'Could not load the games.');
        setTopics([]);
      });
    return () => {
      alive = false;
    };
  }, [onLeave]);

  if (topics === null) return <Loading what="Getting the games ready" />;

  return (
    <div className="shell">
      <TopBar
        right={
          <div className="who">
            <Avatar name={session.childAvatar} />
            <div style={{ lineHeight: 1.25 }}>
              <strong>{session.childName}</strong>
              <div className="tiny">Not you?{' '}
                <button type="button" className="btn btn--ghost" style={{ padding: 0, minHeight: 0 }} onClick={onLeave}>
                  Switch
                </button>
              </div>
            </div>
          </div>
        }
      />

      <div className="stack">
        <div className="spread">
          <h1>What shall we practise?</h1>
          <Link to="/trophies" className="btn">
            <span aria-hidden="true">{'\u{1F3C6}'}</span> My trophies
          </Link>
        </div>

        {error ? <Notice kind="bad">{error}</Notice> : null}

        <div className="pick-grid">
          {topics.map((topic) => (
            <button
              key={topic.code}
              type="button"
              className={`pick ${TOPIC_CLASS[topic.code]}`}
              onClick={() => navigate(`/play/${topic.code}`)}
            >
              <div className="topic__symbol" aria-hidden="true">
                {topic.symbol}
              </div>
              <span className="pick__name">{topic.label}</span>
              <span className="tier">{topic.tier}</span>
              <span className="tiny">{topic.levelDescription}</span>
            </button>
          ))}
        </div>

        <p className="tiny center">
          Ten questions a round. There is no timer &mdash; take as long as you like.
        </p>
      </div>
    </div>
  );
}
