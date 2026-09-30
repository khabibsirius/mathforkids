import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, session } from '../api/client';
import type { Child } from '../api/types';
import { Avatar, AVATAR_EMOJI, AVATARS, Loading, Notice, TopBar } from '../components/ui';

/**
 * "Who is playing?" — the whole of child sign-in.
 *
 * Tapping a face calls POST /children/:id/token and mints a child-scoped
 * token. No password, no username, nothing to read.
 */
export default function ProfilePicker({
  onChosen,
  onSignOut,
}: {
  onChosen: () => void;
  onSignOut: () => void;
}) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('7');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listChildren()
      .then((list) => {
        if (!alive) return;
        setChildren(list);
        if (list.length === 0) setAdding(true);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Could not load players.');
        setChildren([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const choose = async (childId: string): Promise<void> => {
    setBusy(true);
    try {
      await api.chooseChild(childId);
      onChosen();
    } catch (err) {
      setError(err instanceof ApiError ? err.kidMessage : 'Could not start. Try again.');
      setBusy(false);
    }
  };

  const add = async (): Promise<void> => {
    const parsedAge = Number.parseInt(age, 10);
    setBusy(true);
    setError(null);
    try {
      const child = await api.createChild(name.trim(), parsedAge, avatar);
      setChildren((prev) => [...(prev ?? []), child]);
      setAdding(false);
      setName('');
      await choose(child.id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'VALIDATION_FAILED' || err.code === 'AGE_OUT_OF_RANGE'
            ? 'Please type a name and an age between 5 and 10.'
            : err.kidMessage
          : 'Could not add a player.',
      );
      setBusy(false);
    }
  };

  if (children === null) return <Loading what="Finding your players" />;

  return (
    <div className="shell">
      <TopBar
        right={
          <div className="row">
            <Link to="/parent" className="btn">
              <span aria-hidden="true">{'\u{1F4CA}'}</span> Grown-up view
            </Link>
            <button type="button" className="btn btn--ghost" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        }
      />

      <div className="stack">
        <div>
          <h1>Who is playing?</h1>
          {session.parentEmail ? (
            <p className="muted" style={{ marginTop: 6 }}>
              Signed in as {session.parentEmail}
            </p>
          ) : null}
        </div>

        {error ? <Notice kind="bad">{error}</Notice> : null}

        <div className="pick-grid">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="pick"
              disabled={busy}
              onClick={() => void choose(child.id)}
            >
              <Avatar name={child.avatar} large />
              <span className="pick__name">{child.name}</span>
              <span className="tiny">
                {child.xpTotal} XP
                {child.currentStreak > 0 ? ` · ${child.currentStreak} day streak` : ''}
              </span>
            </button>
          ))}

          {!adding && children.length < 6 ? (
            <button type="button" className="pick" onClick={() => setAdding(true)}>
              <div className="avatar avatar--lg" aria-hidden="true">
                +
              </div>
              <span className="pick__name">Add a player</span>
            </button>
          ) : null}
        </div>

        {adding ? (
          <div className="card stack">
            <h2>Add a player</h2>

            <div className="field">
              <label htmlFor="child-name">Their first name</label>
              <input
                id="child-name"
                type="text"
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Amina"
              />
            </div>

            <div className="field">
              <label htmlFor="child-age">How old are they?</label>
              <input
                id="child-age"
                type="number"
                min={5}
                max={10}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              <p className="tiny" style={{ marginTop: 6 }}>
                Maths Club is built for ages 5 to 10. The starting difficulty comes from this.
              </p>
            </div>

            <div className="field">
              <label>Pick a picture</label>
              <div className="row">
                {AVATARS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="avatar"
                    aria-label={key}
                    aria-pressed={avatar === key}
                    onClick={() => setAvatar(key)}
                    style={{
                      outline: avatar === key ? '3px solid var(--blue)' : 'none',
                      outlineOffset: 2,
                    }}
                  >
                    {AVATAR_EMOJI[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || name.trim().length === 0}
                onClick={() => void add()}
              >
                {busy ? 'Adding…' : 'Add and start playing'}
              </button>
              {children.length > 0 ? (
                <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
