import { useEffect, type ReactNode } from 'react';

/**
 * Compact number pad, shown under the four options on every question.
 *
 * Two rows of six rather than the usual phone-dialler 4x3: a dialler block is
 * roughly 300px tall and dominated the screen when it sits below the choices
 * rather than replacing them. This is about a third of that height and still
 * gives every key a comfortable target.
 *
 * A keypad rather than a text field so non-numeric input is impossible rather
 * than merely validated, and so a child on a tablet never triggers the OS
 * keyboard over the question. A physical keyboard still works, because a
 * ten-year-old on a laptop will try it.
 */
export default function Keypad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  maxLength = 7,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength?: number;
}): ReactNode {
  const press = (digit: string): void => {
    if (disabled || value.length >= maxLength) return;
    // No leading zeros: "007" is not an answer a child means to give.
    onChange(value === '0' ? digit : value + digit);
  };

  const back = (): void => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key >= '0' && event.key <= '9') {
        press(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        back();
      } else if (event.key === 'Enter' && value.length > 0) {
        event.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ready = value.length > 0 && !disabled;

  return (
    <div className="keypad" role="group" aria-label="Type your answer">
      {['1', '2', '3', '4', '5'].map((digit) => (
        <button
          key={digit}
          type="button"
          className="key"
          disabled={disabled}
          onClick={() => press(digit)}
        >
          {digit}
        </button>
      ))}

      <button
        type="button"
        className="key key--del"
        disabled={disabled || value.length === 0}
        onClick={back}
        aria-label="Delete the last digit"
      >
        <span aria-hidden="true">&#9003;</span>
      </button>

      {['6', '7', '8', '9', '0'].map((digit) => (
        <button
          key={digit}
          type="button"
          className="key"
          disabled={disabled}
          onClick={() => press(digit)}
        >
          {digit}
        </button>
      ))}

      <button
        type="button"
        className="key key--ok"
        disabled={!ready}
        onClick={onSubmit}
        aria-label="Check my typed answer"
      >
        <span aria-hidden="true">&#10003;</span>
      </button>
    </div>
  );
}
