import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, continueRender, delayRender, staticFile} from 'remotion';
import '@fontsource/anton';
import {buildTimeline} from './timeline.mjs';
import type {Film as FilmT} from './types';
import {Stack} from './components/Stack';
import {TitleCard} from './components/TitleCard';
import {Footnote} from './components/Footnote';
import {TierBoard} from './components/TierBoard';
import {Wheel} from './components/Wheel';
import {Missing} from './components/Missing';

export const DEFAULT_TIERS = [
  {label: 'S', color: '#ff7f7f'},
  {label: 'A', color: '#ffbf7f'},
  {label: 'B', color: '#ffdf7f'},
  {label: 'C', color: '#ffff7f'},
  {label: 'D', color: '#bfff7f'},
];

export const Film: React.FC<{film: FilmT}> = ({film}) => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle));
  }, [handle]);

  const tl = buildTimeline(film);
  const fps = tl.fps;
  const id = film.id ?? 'grizzly-test';
  const url = (src: string) => staticFile(`films/${id}/${src}`);
  const frames = (from: number, dur: number) => {
    const a = Math.round(from * fps);
    return {from: a, durationInFrames: Math.max(1, Math.round((from + dur) * fps) - a)};
  };

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {tl.items.map((it: any, i: number) => {
        const f = frames(it.from, it.dur);
        let body: React.ReactNode = null;
        if (it.type === 'dip') body = <AbsoluteFill style={{backgroundColor: '#000'}} />;
        else if (it.type === 'title') {
          // background: the next chapter's opponent thumbnail, if the hunter found one
          const opp = film.opponents?.[it.chapter - 1];
          body = <TitleCard text={it.beat.title} bg={opp?.thumb?.src ? url(opp.thumb.src) : undefined} durationInFrames={f.durationInFrames} plain={film.title_style === 'plain'} />;
        } else if (it.type === 'tier')
          body = (
            <TierBoard film={id} rows={film.tiers ?? DEFAULT_TIERS} title={film.tier_title} placed={it.placed} pool={[...it.pool, ...(film.tier_extra ?? []).map((x) => ({item: x}))]} drop={it.drop} dragAt={it.dragAt} />
          );
        else if (it.type === 'wheel') body = <Wheel names={it.beat.wheel.names} pick={it.pick} />;
        else if (it.type === 'shot')
          body = it.shot.src ? (
            <Stack shot={it.shot} url={url(it.shot.src)} variant={i} durationInFrames={f.durationInFrames} />
          ) : (
            <Missing label={it.shot.q ?? it.shot.url ?? it.shot.kind} />
          );
        return (
          <Sequence key={i} {...f} name={`${it.type} ${it.bi ?? ''}`}>
            {body}
          </Sequence>
        );
      })}
      {tl.overlays.map((o: any, i: number) => {
        const f = frames(o.from, o.dur);
        return (
          <Sequence key={`o${i}`} {...f} name="footnote">
            <Footnote text={o.text} durationInFrames={f.durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
