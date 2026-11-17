import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Cursor} from './Cursor';

// A TierMaker-style board, drawn by code so it looks like a clean 60 fps screen recording:
// visible cursor, drag the square thumbnail into its row, pause 0.5 s after the drop, cut.
// No zoom-ins, no motion tracking.

type Placed = {item: string; row: string; thumb?: string};
type Props = {
  film: string;
  rows: {label: string; color: string}[];
  title?: string;
  placed: Placed[];
  pool: {item: string; thumb?: string}[];
  drop: {item: string; row: string; thumb?: string};
  dragAt: number; // seconds into this segment when the drag starts
};

const X0 = 210;
const W = 1500;
const LABEL = 160;
const TOP = 130;
const ROWS_H = 700;
const POOL_Y = 870;

export const TierBoard: React.FC<Props> = ({film, rows, title, placed, pool, drop, dragAt}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const rowH = ROWS_H / rows.length;
  const T = Math.min(124, rowH - 14);
  const url = (src?: string) => (src ? staticFile(`films/${film}/${src}`) : undefined);

  const slot = (rowLabel: string, i: number) => {
    const r = Math.max(0, rows.findIndex((x) => x.label === rowLabel));
    return {x: X0 + LABEL + 8 + i * (T + 6), y: TOP + r * rowH + (rowH - T) / 2};
  };
  const poolSlot = (i: number) => ({x: X0 + i * (T + 8), y: POOL_Y});

  const inRow = (label: string) => placed.filter((p) => p.row === label);
  const target = slot(drop.row, inRow(drop.row).length);
  const start = poolSlot(0);

  // cursor path: rest -> item -> target
  const rest = {x: X0 + 760, y: POOL_Y + 150};
  const approach = [dragAt - 0.5, dragAt];
  const drag = [dragAt + 0.1, dragAt + 1.3];
  const ease = Easing.inOut(Easing.cubic);
  const grabX = start.x + T / 2;
  const grabY = start.y + T / 2;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const k1 = interpolate(t, approach, [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  const k2 = interpolate(t, drag, [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  const holding = t >= dragAt && t < drag[1];
  const dropped = t >= drag[1];
  let cx = lerp(rest.x, grabX, k1);
  let cy = lerp(rest.y, grabY, k1);
  if (t >= dragAt) {
    cx = lerp(grabX, target.x + T / 2, k2);
    cy = lerp(grabY, target.y + T / 2, k2);
  }

  const Thumb: React.FC<{src?: string; name: string; x: number; y: number; lifted?: boolean}> = ({src, name, x, y, lifted}) => (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: T,
        height: T,
        transform: lifted ? 'scale(1.06)' : undefined,
        boxShadow: lifted ? '0 12px 28px rgba(0,0,0,0.6)' : undefined,
        backgroundColor: '#333',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <Img src={url(src)!} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      ) : (
        <div style={{color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: 18, padding: 8, textAlign: 'center'}}>{name}</div>
      )}
    </div>
  );

  const poolRest = pool;
  return (
    <AbsoluteFill style={{backgroundColor: '#1a1a17'}}>
      {title ? (
        <div style={{position: 'absolute', top: 40, width: '100%', textAlign: 'center', color: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: 46}}>
          {title}
        </div>
      ) : null}
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            position: 'absolute',
            left: X0,
            top: TOP + i * rowH,
            width: W,
            height: rowH,
            backgroundColor: '#1a1a17',
            border: '2px solid #000',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: LABEL,
              height: '100%',
              backgroundColor: r.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: r.label.length > 3 ? 26 : 44,
              color: '#000',
              textAlign: 'center',
              padding: 6,
              boxSizing: 'border-box',
            }}
          >
            {r.label}
          </div>
        </div>
      ))}
      {rows.flatMap((r) => inRow(r.label).map((p, i) => <Thumb key={p.item} src={p.thumb} name={p.item} {...slot(r.label, i)} />))}
      {/* the pool: item being dragged sits first, the rest after it */}
      {poolRest.map((p, i) => <Thumb key={p.item} src={p.thumb} name={p.item} {...poolSlot(i + 1)} />)}
      {dropped ? (
        <Thumb src={drop.thumb} name={drop.item} {...target} />
      ) : holding ? (
        <Thumb src={drop.thumb} name={drop.item} x={cx - T / 2} y={cy - T / 2} lifted />
      ) : (
        <Thumb src={drop.thumb} name={drop.item} {...start} />
      )}
      <Cursor x={cx} y={cy} grabbing={holding} />
    </AbsoluteFill>
  );
};
