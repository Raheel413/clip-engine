// Shared timeline builder. Used by the Remotion composition (to draw) and by the Node scripts
// (validate, mix, render) so pictures and sound always agree on when things happen.
//
// A film is a list of beats. Each beat is one sentence of narration (or a title card) with the
// shots that play under it. The timeline adds the chapter furniture automatically:
//   dip to black (0.5 s) -> title card (3.5 s) -> stats beats -> action beats -> tier beat -> hard cut to black (0.5 s)

export const DIP = 0.5;          // dip to black between chapters
export const TITLE = 3.5;        // chapter title card
export const PAD = 0.2;          // breath after each spoken line
export const WPS = 2.6;          // words per second when there is no voiceover yet
export const FOOTNOTE = 3;       // caveat notes stay up for 3 s
export const TIER_MIN = 8;       // TierMaker segment 8-12 s
export const TIER_DRAG = 1.6;    // cursor travel + drop
export const TIER_HOLD = 0.5;    // pause after the drop, then cut to black
export const WHEEL_SPIN = 6.5;   // wheel spin, already sped up 1.15x
export const SWELL = 1.5;        // music swell at chapter dips
export const MAX_CLIP = 5;       // no clip longer than 5 s

const words = (s = '') => s.trim().split(/\s+/).filter(Boolean);

export function speechDur(beat) {
  if (beat.vo_dur) return beat.vo_dur;
  return Math.max(1.2, words(beat.text).length / WPS);
}

/** Start time (s) of word index `w` inside a beat, by character position (good enough for cut points). */
function wordTime(beat, w, dur) {
  const ws = words(beat.text);
  if (!ws.length || w <= 0) return 0;
  const before = ws.slice(0, w).join(' ').length + 1;
  const all = ws.join(' ').length;
  return Math.min(dur, (before / all) * Math.min(dur, speechDur(beat)));
}

/** Split a beat's duration between its shots. `at` (word index) pins where a shot starts. */
function splitShots(beat, dur) {
  const shots = beat.shots ?? [];
  if (!shots.length) return [];
  const starts = shots.map((s, i) => (s.at != null ? wordTime(beat, s.at, dur) : null));
  // shots without `at` are spread evenly between their pinned neighbours
  starts[0] = 0;
  let i = 0;
  while (i < shots.length) {
    let j = i + 1;
    while (j < shots.length && starts[j] == null) j++;
    const a = starts[i];
    const b = j < shots.length ? starts[j] : dur;
    for (let k = i + 1; k < j; k++) starts[k] = a + ((b - a) * (k - i)) / (j - i);
    i = j;
  }
  return shots.map((shot, k) => ({shot, start: starts[k], dur: (k + 1 < shots.length ? starts[k + 1] : dur) - starts[k]}));
}

/** Deterministic wheel spin: returns the angle (deg) at time t (s) for a wheel that lands on `pick`. */
export function wheelAngle(t, n, pickIndex) {
  const seg = 360 / n;
  // pointer sits at the right (0 deg). Land in the middle of the picked slice after 5 full turns.
  const final = 5 * 360 + (360 - (pickIndex * seg + seg / 2));
  const p = Math.min(1, Math.max(0, t / WHEEL_SPIN));
  const ease = 1 - Math.pow(1 - p, 3.2); // fast start, long slow-down like Wheel of Names
  return final * ease;
}

export function buildTimeline(film) {
  const fps = film.fps ?? 30;
  const items = [];      // full-frame visuals, back to back
  const overlays = [];   // footnotes and other things drawn on top
  const audio = {vo: [], booms: [], whooshes: [], ticks: [], swells: []};
  const placed = [];     // tier placements so far
  const opponents = film.opponents ?? [];
  let t = 0;
  let chapter = 0;

  const dip = () => {
    const last = items[items.length - 1];
    if (last && last.type === 'dip') return;
    items.push({type: 'dip', from: t, dur: DIP});
    audio.swells.push([t, t + SWELL]);
    t += DIP;
  };

  film.beats.forEach((beat, bi) => {
    if (beat.seg === 'title') {
      if (items.length) dip();
      chapter += 1;
      items.push({type: 'title', from: t, dur: TITLE, beat, bi, chapter});
      audio.booms.push(t);
      t += TITLE;
      return;
    }

    const speech = speechDur(beat);

    if (beat.seg === 'tier') {
      const dur = Math.max(TIER_MIN, speech + 0.3 + TIER_DRAG + TIER_HOLD);
      const pool = opponents.filter((o) => !placed.some((p) => p.item === o.name) && o.name !== beat.tier.item);
      items.push({
        type: 'tier', from: t, dur, beat, bi,
        placed: placed.map((p) => ({...p})),
        pool: pool.map((o) => ({item: o.name, thumb: o.thumb?.src})),
        drop: {...beat.tier, thumb: opponents.find((o) => o.name === beat.tier.item)?.thumb?.src},
        dragAt: dur - TIER_HOLD - TIER_DRAG,
      });
      if (beat.vo) audio.vo.push({file: beat.vo, start: t + 0.3, bi});
      audio.whooshes.push(t);
      placed.push({item: beat.tier.item, row: beat.tier.row, thumb: opponents.find((o) => o.name === beat.tier.item)?.thumb?.src});
      t += dur;
      dip(); // hard cut to black after the drop
      return;
    }

    if (beat.seg === 'wheel') {
      const names = beat.wheel.names;
      const pick = Math.max(0, names.indexOf(beat.wheel.pick));
      const dur = Math.max(speech + PAD, WHEEL_SPIN + 1.5);
      items.push({type: 'wheel', from: t, dur, beat, bi, pick});
      if (beat.vo) audio.vo.push({file: beat.vo, start: t, bi});
      // a tick every time a peg passes the pointer
      const seg = 360 / names.length;
      let last = 0;
      for (let f = 0; f <= WHEEL_SPIN * fps; f++) {
        const a = wheelAngle(f / fps, names.length, pick);
        const k = Math.floor(a / seg);
        if (k > last) { audio.ticks.push(t + f / fps); last = k; }
      }
      t += dur;
      return;
    }

    // hook / stats / action / outro: narration with shots under it
    const dur = speech + PAD;
    if (beat.vo) audio.vo.push({file: beat.vo, start: t, bi});
    for (const s of splitShots(beat, dur)) {
      items.push({type: 'shot', from: t + s.start, dur: s.dur, shot: s.shot, beat, bi, seg: beat.seg});
      if (s.shot.kind === 'receipt') audio.whooshes.push(t + s.start);
    }
    if (beat.note) {
      const at = beat.note_at != null ? wordTime(beat, beat.note_at, dur) : 0.3;
      overlays.push({type: 'footnote', from: t + at, dur: FOOTNOTE, text: beat.note});
      audio.whooshes.push(t + at);
    }
    t += dur;
  });

  const total = t + 0.4;
  return {fps, items, overlays, audio, total, frames: Math.ceil(total * fps)};
}
