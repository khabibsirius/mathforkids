import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, awaitTutorHint, session } from '../api/client';
import { isTier } from '../api/types';
import type { AttemptResult, Exercise, SessionResult, TopicCode, TutorHint } from '../api/types';
import Keypad from '../components/Keypad';
import { Avatar, Dots, Loading, Notice, Speak, Stat, TopBar } from '../components/ui';

/** One gentle nudge, then nothing. Never ends the turn, never costs points. */
const IDLE_NUDGE_MS = 45_000;

/** A correct answer moves on by itself; a wrong one waits to be read. */
const AUTO_ADVANCE_MS = 1400;

type Phase = 'loading' | 'question' | 'feedback' | 'finished' | 'error';

export default function Play() {
  const { topic } = useParams<{ topic: string }>();
  const [searchParams] = useSearchParams();
  const tierParam = searchParams.get('tier');
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [typedValue, setTypedValue] = useState('');
  /** Set when the child taps "I would rather type it" on a choice question. */
  const [switchedToTyping, setSwitchedToTyping] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [tutorHint, setTutorHint] = useState<TutorHint | null>(null);
  const [history, setHistory] = useState<('right' | 'wrong')[]>([]);
  const [summary, setSummary] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [busy, setBusy] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const started = useRef(false);

  /**
   * Typing is used either because the server served a TYPED exercise — which
   * arrives with no choices at all — or because the child asked to type on a
   * choice question. There is no way back from a TYPED one, because there are
   * no options to return to.
   */
  const usingKeypad = exercise !== null && (exercise.inputMode === 'TYPED' || switchedToTyping);

  // --- start (or restart) the round ---------------------------------------
  const begin = useCallback((): void => {
    setPhase('loading');
    setSessionId(null);
    setExercise(null);
    setResult(null);
    setTutorHint(null);
    setChosen(null);
    setTypedValue('');
    setSwitchedToTyping(false);
    setHistory([]);
    setSummary(null);
    setError(null);

    api
      // An absent or malformed tier simply means "run at my current level",
      // so a hand-edited URL degrades instead of 422-ing at a child.
      .startSession(topic as TopicCode, isTier(tierParam) ? tierParam : undefined)
      .then((start) => {
        setSessionId(start.sessionId);
        setTargetCount(start.targetCount);
        setExercise(start.exercise);
        shownAt.current = Date.now();
        setPhase('question');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.kidMessage : 'Could not start the round.');
        setPhase('error');
      });
  }, [topic, tierParam]);

  useEffect(() => {
    // Guarded because StrictMode double-invokes effects in development, and a
    // second call here would open a second session.
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  // --- next question ------------------------------------------------------
  const advance = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    setTutorHint(null);
    setResult(null);
    setChosen(null);
    setTypedValue('');
    setSwitchedToTyping(false);

    try {
      const next = await api.nextExercise(sessionId);
      if (next.done || !next.exercise) {
        setSummary(await api.finish(sessionId));
        setPhase('finished');
        return;
      }
      setExercise(next.exercise);
      setTargetCount(next.targetCount);
      shownAt.current = Date.now();
      setPhase('question');
    } catch (err) {
      setError(err instanceof ApiError ? err.kidMessage : 'Lost the round. Start another?');
      setPhase('error');
    }
  }, [sessionId]);

  // A right answer carries its own momentum; don't make them tap for it.
  useEffect(() => {
    if (phase !== 'feedback' || !result?.correct) return;
    const timer = setTimeout(() => void advance(), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [phase, result, advance]);

  // The idle nudge. One wiggle per question, and then it leaves them alone.
  useEffect(() => {
    if (phase !== 'question') return;
    const timer = setTimeout(() => setNudge(true), IDLE_NUDGE_MS);
    return () => clearTimeout(timer);
  }, [phase, exercise?.id]);

  useEffect(() => {
    if (!nudge) return;
    const timer = setTimeout(() => setNudge(false), 700);
    return () => clearTimeout(timer);
  }, [nudge]);

  // --- answer -------------------------------------------------------------
  const answer = async (value: number, typed: boolean): Promise<void> => {
    if (phase !== 'question' || !exercise || busy) return;
    if (!Number.isFinite(value)) return;

    setBusy(true);
    if (!typed) setChosen(value);
    setNudge(false);

    try {
      const res = await api.submit(exercise.id, value, Date.now() - shownAt.current, typed);
      setResult(res);
      setHistory((h) => [...h, res.correct ? 'right' : 'wrong']);
      setPhase('feedback');

      // The fork from the process model, on the client side: the static hint
      // is already on screen, and this quietly upgrades it if the tutor
      // produces something that passes the safety gate.
      if (!res.correct && res.hint?.ticket) {
        void awaitTutorHint(res.hint.ticket).then((hint) => {
          if (hint) setTutorHint(hint);
        });
      }
    } catch (err) {
      if (!typed) setChosen(null);
      setError(err instanceof ApiError ? err.kidMessage : 'That did not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const choiceClass = (choice: number): string => {
    if (phase !== 'feedback' || !result) return 'choice';
    if (choice === result.correctAnswer) return 'choice choice--right';
    if (!result.correct && choice === chosen) return 'choice choice--chosen-wrong';
    return 'choice choice--dimmed';
  };

  // --- render -------------------------------------------------------------

  if (phase === 'loading') return <Loading what="Getting your questions" />;

  if (phase === 'error') {
    return (
      <div className="shell">
        <TopBar />
        <div className="card stack">
          <Notice kind="bad">{error ?? 'Something went wrong.'}</Notice>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
            Back to the games
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'finished' && summary) {
    return (
      <div className="shell">
        <TopBar />
        <div className="stack">
          <div className="card result-hero stack">
            <div className="result-hero__score">
              {summary.correct}
              <span style={{ color: 'var(--ink-faint)', fontSize: '0.45em' }}> / {summary.total}</span>
            </div>
            {/* Always a true, positive statement — built server-side from the
                attempt log, never invented. */}
            <h1>{summary.highlight}</h1>
            {summary.levelAfter > summary.levelBefore ? (
              <p className="muted">
                <strong>{summary.topicLabel}</strong> just got a bit bigger, because you were ready for it.
              </p>
            ) : null}
          </div>

          {summary.newBadges.length > 0 ? (
            <div className="card stack">
              <h2 className="center">New {summary.newBadges.length === 1 ? 'badge' : 'badges'}!</h2>
              <div className="badge-row">
                {summary.newBadges.map((badge) => (
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
            </div>
          ) : null}

          <div className="card stack">
            <div className="stat-row">
              <Stat value={`+${summary.xpEarned}`} label="XP earned" />
              <Stat value={summary.bestCombo} label="Best run" />
              <Stat value={summary.currentStreak} label="Day streak" />
              <Stat value={summary.xpTotal} label="XP total" />
            </div>
          </div>

          <div className="row result-actions" style={{ justifyContent: 'center' }}>
            {/* Calls begin() rather than navigating: the destination route is
                the one already rendered, so React Router would keep this
                component mounted and nothing would restart. */}
            <button type="button" className="btn btn--primary btn--big" onClick={begin}>
              Play again
            </button>
            <Link to="/" className="btn btn--big">
              Another game
            </Link>
            <Link to="/trophies" className="btn">
              My trophies
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!exercise) return <Loading what="Getting your questions" />;

  const hintText = tutorHint?.text ?? result?.hint?.text;
  const encouragement = tutorHint?.encouragement || result?.hint?.encouragement;

  return (
    <div className="shell">
      <TopBar
        right={
          <div className="row">
            <div className="who">
              <Avatar name={session.childAvatar} />
              <strong>{session.childName}</strong>
            </div>
            <Link to="/" className="btn btn--ghost">
              Stop for now
            </Link>
          </div>
        }
      />

      <div className="play">
        <div className="spread">
          <Dots history={history} total={targetCount} />
          <span className="tier">Level {exercise.level}</span>
        </div>

        <div className="question">
          <p className="tiny" style={{ marginTop: 0 }}>
            Question {Math.min(history.length + 1, targetCount)} of {targetCount}
            {usingKeypad ? ' · type the answer' : ''}
          </p>
          <div className="question__sum">
            {exercise.operandA} <em aria-label={exercise.topic.toLowerCase()}>{exercise.symbol}</em>{' '}
            {exercise.operandB}{' '}
            {usingKeypad ? (
              <span className="question__blank">
                ={' '}
                <span className={typedValue ? 'typed-slot' : 'typed-slot typed-slot--empty'}>
                  {typedValue || '?'}
                </span>
              </span>
            ) : (
              <span className="question__blank">= ?</span>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <Speak
              topic={exercise.topic}
              operandA={exercise.operandA}
              operandB={exercise.operandB}
            />
          </div>
        </div>

        {usingKeypad ? (
          <Keypad
            value={typedValue}
            onChange={setTypedValue}
            onSubmit={() => void answer(Number(typedValue), true)}
            disabled={phase !== 'question' || busy}
          />
        ) : (
          <>
            <div className={nudge ? 'choices choices--nudge' : 'choices'}>
              {exercise.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={choiceClass(choice)}
                  disabled={phase === 'feedback' || busy}
                  onClick={() => void answer(choice, false)}
                >
                  {choice}
                </button>
              ))}
            </div>

            {/* Always available, never the loud option: a child who would
                rather work it out than recognise it can, on any question. */}
            {phase === 'question' ? (
              <div className="switch-input">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setSwitchedToTyping(true);
                    setTypedValue('');
                  }}
                >
                  I would rather type it
                </button>
              </div>
            ) : null}
          </>
        )}

        <div aria-live="polite">
          {phase === 'feedback' && result ? (
            result.correct ? (
              <div className="feedback feedback--right">
                <div className="feedback__title">
                  <span aria-hidden="true">{'\u{1F31F}'}</span> Yes! That is right.
                </div>
                <div className="row">
                  <span className="xp-pop">+{result.xpEarned} XP</span>
                  {result.combo >= 3 ? <span className="tier">{result.combo} in a row</span> : null}
                </div>
              </div>
            ) : (
              <div className="feedback feedback--wrong stack">
                <div className="feedback__title">
                  Not quite &mdash; it was <strong>{result.correctAnswer}</strong>
                </div>

                {hintText ? (
                  <div className="hint">
                    <span className="hint__mark" aria-hidden="true">
                      {tutorHint ? '\u{1F9E0}' : '\u{1F4A1}'}
                    </span>
                    <div>
                      <div>{hintText}</div>
                      {encouragement ? <div className="tiny">{encouragement}</div> : null}
                      {tutorHint ? (
                        <div className="hint__swap" style={{ marginTop: 4 }}>
                          <span aria-hidden="true">{'✨'}</span> from your maths helper
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <button type="button" className="btn btn--primary btn--big" onClick={() => void advance()}>
                  Next question
                </button>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
