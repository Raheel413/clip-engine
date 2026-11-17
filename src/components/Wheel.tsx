import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {WHEEL_SPIN, wheelAngle} from '../timeline.mjs';

// Wheel of Names style spinner. The spin curve lives in timeline.mjs so the peg ticks in the
// audio mix land exactly on the frames where a peg passes the pointer.
const COLORS = ['#3369e8', '#d50f25', '#eeb211', '#009925'];

export const Wheel: React.FC<{names: string[]; pick: number}> = ({names, pick}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const n = names.length;
  const seg = 360 / n;
  const R = 430;
  const cx = 860;
  const cy = 540;
  const angle = wheelAngle(t, n, pick);
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (d: number, r: number) => `${cx + r * Math.cos(rad(d))},${cy + r * Math.sin(rad(d))}`;
  const done = t > WHEEL_SPIN + 0.2;
  const pop = interpolate(t, [WHEEL_SPIN + 0.2, WHEEL_SPIN + 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#f2f2f2'}}>
      <svg width={1920} height={1080}>
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          {names.map((name, i) => {
            const a0 = i * seg;
            const a1 = a0 + seg;
            const large = seg > 180 ? 1 : 0;
            return (
              <g key={i}>
                <path d={`M${cx},${cy} L${pt(a0, R)} A${R},${R} 0 ${large} 1 ${pt(a1, R)} Z`} fill={COLORS[i % COLORS.length]} />
                <text
                  x={cx + R - 30}
                  y={cy}
                  transform={`rotate(${a0 + seg / 2} ${cx} ${cy})`}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontSize={Math.max(22, Math.min(46, 420 / n + 14))}
                  fill={i % COLORS.length === 2 ? '#000' : '#fff'}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx={cx} cy={cy} r={60} fill="#fff" />
        {/* pointer on the right */}
        <path d={`M${cx + R - 18},${cy} L${cx + R + 50},${cy - 26} L${cx + R + 50},${cy + 26} Z`} fill="#444" />
      </svg>
      {done ? (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(0,0,0,${0.35 * pop})`}}>
          <div style={{opacity: pop, transform: `scale(${0.9 + 0.1 * pop})`, backgroundColor: '#fff', borderRadius: 8, padding: '36px 80px', fontFamily: 'Arial, Helvetica, sans-serif', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.4)'}}>
            <div style={{fontSize: 30, color: '#555', marginBottom: 12}}>We have a winner!</div>
            <div style={{fontSize: 72, fontWeight: 700, color: '#111'}}>{names[pick]}</div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
