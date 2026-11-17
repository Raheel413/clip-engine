import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {buildTimeline} from './timeline.mjs';
import type {Film as FilmT} from './types';
import sample from '../films/grizzly-test/film.json';

export const Root: React.FC = () => (
  <Composition
    id="Film"
    component={Film as unknown as React.FC<Record<string, unknown>>}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
    defaultProps={{film: {...(sample as unknown as FilmT), id: 'grizzly-test'}}}
    calculateMetadata={({props}) => {
      const film = (props as {film: FilmT}).film;
      const tl = buildTimeline(film);
      return {fps: tl.fps, durationInFrames: tl.frames};
    }}
  />
);
