import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

// Chapter title: Anton, all caps, pure white, thick black outline, 0.3 s cross dissolve in and out.
export const TitleCard: React.FC<{text: string; bg?: string; durationInFrames: number}> = ({text, bg, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = 0.3 * fps;
  const opacity = interpolate(frame, [0, fade, durationInFrames - fade, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const size = text.length > 16 ? 140 : 180;
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <AbsoluteFill style={{opacity}}>
        {bg ? (
          <AbsoluteFill style={{transform: 'scale(1.2)'}}>
            <Img src={bg} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.35)'}} />
          </AbsoluteFill>
        ) : null}
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: 80}}>
          <div
            style={{
              fontFamily: 'Anton, Impact, sans-serif',
              fontSize: size,
              lineHeight: 1.05,
              color: '#FFFFFF',
              textTransform: 'uppercase',
              textAlign: 'center',
              WebkitTextStroke: '14px #000', // drawn under the fill: 7 px of outline shows
              paintOrder: 'stroke fill',
              textShadow: '0 10px 30px rgba(0,0,0,0.7)',
              letterSpacing: 2,
            }}
          >
            {text}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
