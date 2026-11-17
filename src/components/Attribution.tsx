import React from 'react';

// Tiny attribution label pinned bottom-left: Arial/Helvetica, 18 pt, 50 % opacity, no shadow.
export const Attribution: React.FC<{text: string}> = ({text}) => (
  <div
    style={{
      position: 'absolute',
      left: 28,
      bottom: 22,
      fontFamily: 'Arial, Helvetica, "Liberation Sans", sans-serif',
      fontSize: 24,
      color: '#fff',
      opacity: 0.5,
      maxWidth: 900,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
  >
    {text}
  </div>
);
