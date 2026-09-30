import { useEffect, type ReactNode } from 'react';

/**
 * Number pad for typed answers.
 *
 * A keypad rather than a text field, for two reasons. A child on a tablet gets
 * the whole screen to aim at instead of a 40px input and whatever keyboard the
 * OS decides to show; and non-numeric input becomes impossible rather than
 * merely validated, so there is no "please enter a number" error to write.
 *
 * A physical keyboard still works, because a ten-year-old on a laptop will try
 * it and being ignored would feel broken.
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
    <div className="keypad-wrap">
      <div className="keypad" role="group" aria-label="Type your answer">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
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

        <button type="button" className="key" disabled={disabled} onClick={() => press('0')}>
          0
        </button>

        <button
          type="button"
          className="key key--ok"
          disabled={!ready}
          onClick={onSubmit}
          aria-label="Check my answer"
        >
          <span aria-hidden="true">&#10003;</span>
        </button>
      </div>

      <p className="tiny center" style={{ margin: 0 }}>
        {ready ? 'Tap the tick when you are ready.' : 'Type the answer. Take your time.'}
      </p>
    </div>
  );
}
