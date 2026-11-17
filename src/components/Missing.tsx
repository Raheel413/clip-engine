import React from 'react';
import {AbsoluteFill} from 'remotion';

// Drawn in drafts when the hunter has not found an asset yet, so gaps are obvious.
export const Missing: React.FC<{label: string}> = ({label}) => (
  <AbsoluteFill style={{backgroundColor: '#20232a', alignItems: 'center', justifyContent: 'center'}}>
    <div style={{fontFamily: 'Arial, sans-serif', color: '#ff6b6b', fontSize: 44, textAlign: 'center', maxWidth: 1400}}>
      MISSING: {label}
    </div>
  </AbsoluteFill>
);
