import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Child, LlmHealth, Progress } from '../api/types';
import Chart from '../components/Chart';
import { Avatar, Loading, Notice, Stat, TopBar } from '../components/ui';

const pct = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

/**
 * The grown-up's view.
 *
 * Everything here is derived from the attempt log rather than stored, so it
 * cannot drift from what actually happened. It says the useful thing plainly
 * — which topic to practise next — instead of leaving a parent to read it out
 * of a chart.
 */
export default function ParentDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [llm, setLlm] = useState<LlmHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listChildren()
      .then((list) => {
        if (!alive) return;
        setChildren(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Could not load players.');
        setChildren([]);
      });

    // Best effort — the dashboard is useful whether or not the tutor is up.
    api
      .llmHealth()
      .then((h) => alive && setLlm(h))
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setProgress(null);
    api
      .progress(selected, 'parent')
      .then((p) => alive && setProgress(p))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Could not load progress.');
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  if (children === null) return <Loading what="Loading the dashboard" />;

  return (
    <div className="shell shell--wide">
      <TopBar
        right={
          <div className="row">
            <Link to="/" className="btn">
              Back to playing
            </Link>
            <button type="button" className="btn btn--ghost" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        }
      />

      <div className="stack">
        <h1>Progress</h1>
        {error ? <Notice kind="bad">{error}</Notice> : null}

        {children.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No players yet. Add one from the home screen.
            </p>
          </div>
        ) : (
          <div className="row">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                className="who"
                aria-pressed={selected === child.id}
                onClick={() => setSelected(child.id)}
                style={{
                  outline: selected === child.id ? '3px solid var(--blue)' : 'none',
                  outlineOffset: 2,
                }}
              >
                <Avatar name={child.avatar} />
                <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                  <strong>{child.name}</strong>
                  <div className="tiny">age {child.age}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && !progress ? <Loading what="Loading progress" /> : null}

        {progress ? (
          <>
            <div className="stat-row">
              <Stat value={progress.totals.sessions} label="Rounds finished" />
              <Stat value={progress.totals.attempts} label="Questions" />
              <Stat value={pct(progress.totals.accuracy)} label="Correct" />
              <Stat value={progress.child.currentStreak} label="Day streak" />
              <Stat value={progress.child.xpTotal} label="XP" />
            </div>

            {progress.weakest ? (
              <Notice kind="info">
                <strong>Worth a look:</strong> {progress.weakest.label.toLowerCase()} is at{' '}
                {pct(progress.weakest.accuracy)}. Everything else is going better.
              </Notice>
            ) : (
              <Notice kind="info">
                Not enough practice yet to say which topic needs attention. Five questions in a
                topic is enough for this to become useful.
              </Notice>
            )}

            <div className="card stack">
              <div className="spread">
                <h2>Last 14 days</h2>
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--green)' }} />
                    Right
                  </span>
                  <span>
                    <i style={{ background: 'var(--surface-sunk)' }} />
                    Attempted
                  </span>
                </div>
              </div>
              <Chart data={progress.daily} />
            </div>

            <div className="card stack">
              <h2>By topic</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Level</th>
                      <th>What that means</th>
                      <th className="num">Asked</th>
                      <th className="num">Right</th>
                      <th style={{ minWidth: 120 }}>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.topics.map((topic) => (
                      <tr key={topic.topic}>
                        <td>
                          <strong>
                            <span aria-hidden="true">{topic.symbol}</span> {topic.label}
                          </strong>
                        </td>
                        <td>
                          <span className="tier">{topic.tier}</span>
                        </td>
                        <td className="tiny">{topic.levelDescription}</td>
                        <td className="num">{topic.attempts}</td>
                        <td className="num">{topic.correct}</td>
                        <td>
                          {topic.accuracy === null ? (
                            <span className="tiny">not tried yet</span>
                          ) : (
                            <div className="row" style={{ gap: 8 }}>
                              <div className="meter grow">
                                <i style={{ width: `${Math.round(topic.accuracy * 100)}%` }} />
                              </div>
                              <span className="tiny" style={{ minWidth: 34 }}>
                                {pct(topic.accuracy)}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tiny" style={{ margin: 0 }}>
                Difficulty is tracked per topic, so being strong at adding does not make sharing
                harder. Answer speed is recorded but never affects progression.
              </p>
            </div>

            <div className="card stack">
              <h2>Badges earned</h2>
              {progress.badges.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  None yet.
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
                        <div className="tiny">
                          {new Date(badge.awardedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* Deliberately visible to a parent: this is where "is the AI actually
            working, and is it being checked" gets answered honestly. */}
        {llm ? (
          <div className="card stack">
            <h2>Maths helper</h2>
            {!llm.enabled ? (
              <p className="muted" style={{ margin: 0 }}>
                Turned off. Children still get a written hint on every wrong answer &mdash; the
                helper only rephrases it for their age.
              </p>
            ) : (
              <>
                <p style={{ margin: 0 }}>
                  {llm.reachable ? (
                    <>
                      Running on this machine using <strong>{llm.model}</strong>
                      {llm.modelPulled === false ? ' (model not downloaded yet)' : ''}. Nothing your
                      child types leaves the computer, and there is no account or API key involved.
                    </>
                  ) : (
                    <>
                      Not reachable right now, so children are seeing the built-in hints instead.
                      Nothing is broken &mdash; that is the designed fallback.
                    </>
                  )}
                </p>
                {llm.stats ? (
                  <div className="stat-row">
                    <Stat value={llm.stats.modelCalls ?? 0} label="Helper answers" />
                    <Stat value={llm.stats.rejected ?? 0} label="Rejected as unsafe" />
                    <Stat
                      value={
                        llm.stats.rejectionRate === null || llm.stats.rejectionRate === undefined
                          ? '—'
                          : `${Math.round(llm.stats.rejectionRate * 100)}%`
                      }
                      label="Rejection rate"
                    />
                    <Stat value={llm.stats.cacheHits ?? 0} label="Reused" />
                  </div>
                ) : null}
                <p className="tiny" style={{ margin: 0 }}>
                  Every answer the helper writes is checked before a child sees it: that it does not
                  give away the answer, that it is short enough, that the words suit their age, and
                  that every number in it is one they can actually see on screen. Anything that
                  fails is thrown away and the built-in hint is used instead.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
