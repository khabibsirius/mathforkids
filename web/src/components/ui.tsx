import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TopicCode } from '../api/types';

/** Fixed avatar set — a child chooses by tapping a picture, never by typing. */
export const AVATAR_EMOJI: Record<string, string> = {
  fox: '\u{1F98A}',
  panda: '\u{1F43C}',
  owl: '\u{1F989}',
  cat: '\u{1F431}',
  robot: '\u{1F916}',
  dino: '\u{1F995}',
  bee: '\u{1F41D}',
  whale: '\u{1F433}',
};

export const AVATARS = Object.keys(AVATAR_EMOJI);

export function Avatar({ name, large }: { name?: string; large?: boolean }): ReactNode {
  return (
    <div className={large ? 'avatar avatar--lg' : 'avatar'} aria-hidden="true">
      {AVATAR_EMOJI[name ?? 'fox'] ?? AVATAR_EMOJI.fox}
    </div>
  );
}

export const TOPIC_CLASS: Record<TopicCode, string> = {
  ADDITION: 'topic--add',
  SUBTRACTION: 'topic--sub',
  MULTIPLICATION: 'topic--mul',
  DIVISION: 'topic--div',
};

export function Loading({ what = 'Loading' }: { what?: string }): ReactNode {
  return (
    <div className="loading">
      <div style={{ fontSize: 34, letterSpacing: 10, color: 'var(--blue)' }} aria-hidden="true">
        + &minus; &times; &divide;
      </div>
      <p>{what}&hellip;</p>
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'bad';
  children: ReactNode;
}): ReactNode {
  return (
    <div className={`notice notice--${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function TopBar({ right }: { right?: ReactNode }): ReactNode {
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        Maths Club <span aria-hidden="true">+ &minus; &times; &divide;</span>
      </Link>
      {right}
    </header>
  );
}

/**
 * Ten dots rather than a percentage or a fraction.
 *
 * A seven-year-old can see four dots filled and six empty without reading
 * anything. "40%" is a second problem stacked on the first.
 */
export function Dots({
  history,
  total,
}: {
  history: ('right' | 'wrong')[];
  total: number;
}): ReactNode {
  return (
    <div
      className="dots"
      role="img"
      aria-label={`${history.length} of ${total} questions answered, ${history.filter((h) => h === 'right').length} right`}
    >
      {Array.from({ length: total }, (_, i) => {
        const mark = history[i];
        const cls = mark === 'right' ? 'dot dot--right' : mark === 'wrong' ? 'dot dot--wrong' : i === history.length ? 'dot dot--now' : 'dot';
        return <span key={i} className={cls} />;
      })}
    </div>
  );
}

const SPOKEN_OPERATOR: Record<TopicCode, string> = {
  ADDITION: 'plus',
  SUBTRACTION: 'take away',
  MULTIPLICATION: 'times',
  DIVISION: 'shared by',
};

/**
 * Reads the question aloud with the browser's own speech synthesiser.
 *
 * Zero backend cost and no model call, which is what makes the voice bonus
 * worth an hour rather than a day — and it genuinely serves the five- and
 * six-year-olds who cannot read the screen yet.
 */
export function Speak({
  topic,
  operandA,
  operandB,
}: {
  topic: TopicCode;
  operandA: number;
  operandB: number;
}): ReactNode {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  if (!supported) return null;

  const say = (): void => {
    try {
      window.speechSynthesis.cancel();
      const phrase = `What is ${operandA} ${SPOKEN_OPERATOR[topic]} ${operandB}?`;
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 0.85;
      utterance.pitch = 1.1;
      utterance.lang = 'en-GB';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={say} aria-label="Read the question aloud">
      <span aria-hidden="true">{speaking ? '\u{1F50A}' : '\u{1F509}'}</span> Read it to me
    </button>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }): ReactNode {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
