import type { ReactNode } from 'react';

interface Point {
  date: string;
  attempts: number;
  correct: number;
}

/**
 * Fourteen days of practice, hand-drawn as SVG.
 *
 * No charting library: this is one chart with one scale, and a 60 KB
 * dependency to draw fourteen rectangles would be weight for its own sake.
 * Every tick names a value the chart actually reaches, and the series is
 * zero-filled by the API so there is no gap handling here.
 */
export default function Chart({ data }: { data: Point[] }): ReactNode {
  const W = 700;
  const H = 210;
  const padL = 34;
  const padR = 10;
  const padT = 14;
  const padB = 30;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bottom = padT + plotH;

  const peak = Math.max(5, ...data.map((d) => d.attempts));
  // Round the top of the scale up to something a person would choose.
  const step = peak <= 10 ? 5 : peak <= 30 ? 10 : 20;
  const max = Math.ceil(peak / step) * step;

  const y = (value: number): number => bottom - (value / max) * plotH;
  const slot = plotW / data.length;
  const barW = Math.min(26, slot * 0.6);

  const ticks = [0, max / 2, max];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart"
      role="img"
      aria-label={`Practice over the last ${data.length} days. Peak of ${peak} questions in a day.`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--rule)"
            strokeWidth="1"
          />
          <text
            x={padL - 8}
            y={y(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--ink-faint)"
            fontFamily="var(--body)"
          >
            {tick}
          </text>
        </g>
      ))}

      {data.map((point, i) => {
        const cx = padL + slot * i + slot / 2;
        const x = cx - barW / 2;
        const attemptsH = Math.max(0, bottom - y(point.attempts));
        const correctH = Math.max(0, bottom - y(point.correct));
        const day = point.date.slice(8);
        const isToday = i === data.length - 1;

        return (
          <g key={point.date}>
            {point.attempts > 0 ? (
              <>
                <rect
                  x={x}
                  y={y(point.attempts)}
                  width={barW}
                  height={attemptsH}
                  rx="4"
                  fill="var(--surface-sunk)"
                />
                <rect
                  x={x}
                  y={y(point.correct)}
                  width={barW}
                  height={correctH}
                  rx="4"
                  fill="var(--green)"
                />
              </>
            ) : (
              <circle cx={cx} cy={bottom - 3} r="2" fill="var(--rule)" />
            )}
            {i % 2 === 0 || isToday ? (
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fontSize="10.5"
                fill={isToday ? 'var(--blue)' : 'var(--ink-faint)'}
                fontFamily="var(--body)"
                fontWeight={isToday ? 700 : 400}
              >
                {isToday ? 'today' : day}
              </text>
            ) : null}
          </g>
        );
      })}

      <line x1={padL} x2={W - padR} y1={bottom} y2={bottom} stroke="var(--ink-faint)" strokeWidth="1" />
    </svg>
  );
}
