import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Shot} from '../types';
import {Attribution} from './Attribution';

// The "anti-black-bar" stack. Every asset, whatever its shape (square paleoart, vertical museum
// photo, 720p documentary rip), fills the 16:9 frame the same way:
//   V1  the same asset, blown up to fill the frame, blurred and darkened
//   V2  the asset itself, centred at 90-98 %, with a soft drop shadow
// Stills never sit still: they scale 90 % -> 98 % or drift 30 px over their whole duration.
// Clips are punched in 104 % inside their own frame to crop broadcast logos.

type Box = {x: number; y: number; w: number; h: number};
const SHADOW = '0 15px 40px rgba(0,0,0,0.6)'; // distance 15, softness 40, opacity 60 %

type Props = {shot: Shot; url: string; variant: number; durationInFrames: number};

export const Stack: React.FC<Props> = ({shot, url, variant, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const isVideo = shot.kind === 'clip';
  const aspect0 = shot.w && shot.h ? shot.w / shot.h : 16 / 9;
  // Landscape documentary B-roll fills the whole frame, punched in 104 % to crop broadcast logos.
  // Everything else (stills, square or vertical clips) goes in the blurred stack.
  const fullFrame = isVideo && aspect0 >= 1.55;
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {extrapolateRight: 'clamp'});

  // fit the asset's aspect ratio into the frame
  const aspect = shot.w && shot.h ? shot.w / shot.h : 16 / 9;
  const fitW = Math.min(width, height * aspect);
  const fitH = fitW / aspect;

  // motion: stills zoom 90 -> 98 % (two in three) or drift 30 px at 92 %; clips hold at 92 %
  let scale = 0.92;
  let dx = 0;
  if (!isVideo) {
    if (variant % 3 === 2) dx = interpolate(p, [0, 1], variant % 2 ? [-15, 15] : [15, -15]);
    else scale = interpolate(p, [0, 1], [0.9, 0.98]);
  }

  // slow a clip slightly rather than freeze it when the line runs longer than the clip
  const clipDur = shot.dur ?? 5;
  const rate = isVideo ? Math.min(1, clipDur / (durationInFrames / fps)) : 1;

  const media = (style: React.CSSProperties) =>
    isVideo ? (
      <OffthreadVideo src={url} muted playbackRate={rate} style={style} />
    ) : (
      <Img src={url} style={style} />
    );

  if (fullFrame)
    return (
      <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
        {media({width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.04)'})}
        {shot.label ? <StatLabel text={shot.label} /> : null}
        {shot.credit ? <Attribution text={shot.credit} /> : null}
      </AbsoluteFill>
    );

  return (
    <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
      {/* V1: blurred, darkened fill */}
      <AbsoluteFill style={{transform: 'scale(1.25)'}}>
        {media({width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.65)'})}
      </AbsoluteFill>

      {/* V2: the asset */}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div
          style={{
            position: 'relative',
            width: fitW,
            height: fitH,
            transform: `translateX(${dx}px) scale(${scale})`,
            boxShadow: SHADOW,
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          {media({
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: isVideo ? 'scale(1.04)' : undefined,
          })}
          {shot.kind === 'receipt' && shot.highlight
            ? (Array.isArray(shot.highlight) ? shot.highlight : [shot.highlight]).map((b, i, all) => (
                <Highlighter key={i} box={b} delay={0.5 + (0.4 / all.length) * i} span={0.4 / all.length} />
              ))
            : null}
        </div>
      </AbsoluteFill>

      {shot.label ? <StatLabel text={shot.label} /> : null}
      {shot.credit ? <Attribution text={shot.credit} /> : null}
    </AbsoluteFill>
  );
};

// Big stat text over a picture ("3.7 - 4 Meters / 40 KG"): Anton, white, black outline, 0.3 s dissolve.
const StatLabel: React.FC<{text: string}> = ({text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = interpolate(frame, [0.2 * fps, 0.5 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 170, opacity}}>
      <div style={{fontFamily: 'Anton, Impact, sans-serif', fontSize: 92, lineHeight: 1.05, color: '#fff', textAlign: 'center',
        whiteSpace: 'pre-line', WebkitTextStroke: '12px #000', paintOrder: 'stroke fill', textShadow: '0 8px 24px rgba(0,0,0,0.6)'}}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Yellow highlighter on a receipt: multiply blend, 60 % opacity, 0.4 s left-to-right wipe.
// Several lines are wiped one after another inside the same 0.4 s.
const Highlighter: React.FC<{box: Box; delay: number; span: number}> = ({box, delay, span}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const start = delay * fps;
  const wipe = interpolate(frame, [start, start + Math.max(1, span * fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100 * wipe}%`,
        height: `${box.h * 100}%`,
        backgroundColor: '#FFE600',
        mixBlendMode: 'multiply',
        opacity: 0.6,
      }}
    />
  );
};
