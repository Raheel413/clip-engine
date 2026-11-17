import React from 'react';

// Plain arrow pointer (open hand while dragging), like a real screen recording.
export const Cursor: React.FC<{x: number; y: number; grabbing?: boolean}> = ({x, y, grabbing}) => (
  <svg width={34} height={44} viewBox="0 0 17 22" style={{position: 'absolute', left: x - 2, top: y - 2, overflow: 'visible'}}>
    {grabbing ? (
      <g transform="translate(-4,-4)">
        <path d="M6 9V5.5a1.3 1.3 0 0 1 2.6 0V9m0-1.5V4a1.3 1.3 0 0 1 2.6 0v4m0-1V5a1.3 1.3 0 0 1 2.6 0v4.5m0-2a1.3 1.3 0 0 1 2.6 0V13c0 3-2 5.5-5.5 5.5S6 16.5 5 14l-1.6-3.2a1.2 1.2 0 0 1 2-1.2L6 11"
          fill="#fff" stroke="#000" strokeWidth={0.9} strokeLinejoin="round" />
      </g>
    ) : (
      <path d="M1 1 L1 17 L5 13 L8 20 L11 18.7 L8 12 L13.5 12 Z" fill="#fff" stroke="#000" strokeWidth={1.1} strokeLinejoin="round" />
    )}
  </svg>
);
