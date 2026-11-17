#!/usr/bin/env node
// Quality gate. Checks a film against the cut rhythm, chapter loop and asset rules before rendering.
// usage: node scripts/validate.mjs films/<name> [--allow-missing]
// Errors stop the render. Warnings are printed and the render goes ahead.
import fs from 'node:fs';
import path from 'node:path';
import {buildTimeline, MAX_CLIP} from '../src/timeline.mjs';
import {filmDir, flag, loadFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const allowMissing = flag('--allow-missing');
const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);
const f1 = (n) => n.toFixed(1);
const at = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- structure
const tiers = (film.tiers ?? [{label: 'S'}, {label: 'A'}, {label: 'B'}, {label: 'C'}, {label: 'D'}]).map((t) => t.label);
const names = (film.opponents ?? []).map((o) => o.name);
film.beats.forEach((b, i) => {
  const id = `beat ${i}`;
  if (b.seg !== 'title' && !b.text) E(`${id}: no narration text`);
  if (b.seg === 'title' && !b.title) E(`${id}: title card without a title`);
  if (b.seg === 'tier') {
    if (!b.tier || !names.includes(b.tier.item)) E(`${id}: tier item "${b.tier?.item}" is not in opponents`);
    if (b.tier && !tiers.includes(b.tier.row)) E(`${id}: tier row "${b.tier.row}" does not exist (${tiers.join(', ')})`);
  }
  if (b.seg === 'wheel' && (!b.wheel || !b.wheel.names.includes(b.wheel.pick))) E(`${id}: wheel pick must be one of the names`);
  if (['hook', 'stats', 'action', 'outro'].includes(b.seg) && !(b.shots ?? []).length) E(`${id}: no shots under this line`);
});

// ---- writing rules (banned AI tells)
const banned = /\b(delve|delves|delving|testament|tapestry|pivotal|showcase|showcases|underscore|underscores|realm|unleash|game-changer|in conclusion)\b/i;
const negPar = [/\bit'?s not\b[^.?!]{1,60}[,;—–-]\s*it'?s\b/i, /\b(not|n't)\b[^.?!]{1,50}\bbut\b/i, /\bnot because\b[^.?!]{1,60}\bbut because\b/i];
film.beats.forEach((b, i) => {
  if (!b.text) return;
  const m = b.text.match(banned);
  if (m) E(`beat ${i}: banned word "${m[0]}"`);
  if (negPar.some((r) => r.test(b.text))) E(`beat ${i}: "not X but Y" construction: ${b.text}`);
});

// ---- assets
const used = new Map();
const each = [];
(film.opponents ?? []).forEach((o, k) => o.thumb && each.push([`thumb-${k}`, o.thumb]));
film.beats.forEach((b, bi) => (b.shots ?? []).forEach((s, si) => each.push([`b${String(bi).padStart(2, '0')}-${si}`, s])));
for (const [sid, s] of each) {
  if (!s.src) { (allowMissing ? W : E)(`${sid}: no asset yet (${s.q ?? s.url ?? s.kind})`); continue; }
  if (!fs.existsSync(path.join(dir, s.src))) E(`${sid}: file missing ${s.src}`);
  if (s.kind === 'clip' && (s.dur ?? 0) > MAX_CLIP + 0.05) E(`${sid}: clip is ${f1(s.dur)}s, the limit is ${MAX_CLIP}s`);
  if (s.kind === 'receipt' && !(Array.isArray(s.highlight) ? s.highlight.length : s.highlight)) W(`${sid}: receipt has no highlight (words "${s.find}" not found on the page)`);
  if (s.source && s.kind !== 'receipt') {
    if (used.has(s.source) && !sid.startsWith('thumb')) E(`${sid}: same source as ${used.get(s.source)} (${s.source}); every asset is used once`);
    else used.set(s.source, sid);
  }
}

// ---- timing: cut rhythm
const tl = buildTimeline(film);
for (const it of tl.items) {
  if (it.type !== 'shot') continue;
  const where = `${at(it.from)} beat ${it.bi}`;
  const d = it.dur;
  if (it.seg === 'hook') {
    if (d > 4 || d < 1) E(`${where}: hook shot is ${f1(d)}s, hook cuts are 1.5-3 s (split the line into more shots)`);
    else if (d > 3.2 || d < 1.4) W(`${where}: hook shot is ${f1(d)}s, aim for 1.5-3 s`);
  } else {
    if (it.shot.kind !== 'clip' && d > 8) E(`${where}: still on screen ${f1(d)}s, body visuals are 4-7 s`);
    else if (d > 7.3 || (d < 3.5 && (it.beat.shots ?? []).length > 1)) W(`${where}: visual is ${f1(d)}s, body visuals are 4-7 s`);
  }
  if (it.shot.kind === 'clip' && it.shot.src) {
    const rate = (it.shot.dur ?? MAX_CLIP) / d;
    if (rate < 0.75) E(`${where}: clip is ${f1(it.shot.dur ?? 5)}s but has to cover ${f1(d)}s; add another shot to this line`);
  }
}
const hook = tl.items.filter((it) => it.seg === 'hook');
if (hook.length) {
  const end = Math.max(...hook.map((h) => h.from + h.dur));
  if (end > 32) W(`hook runs ${f1(end)}s, keep it under 30 s`);
}

// ---- chapter loop: dip -> title -> stats -> action -> tier -> dip, 60-90 s
let ch = null;
const chapters = [];
for (const it of tl.items) {
  if (it.type === 'title') { ch = {title: it.beat.title, from: it.from, segs: {stats: 0, action: 0, tier: 0}, order: []}; chapters.push(ch); continue; }
  if (!ch) continue;
  const seg = it.type === 'tier' ? 'tier' : it.seg;
  if (seg in ch.segs) {
    ch.segs[seg] += it.dur;
    if (ch.order[ch.order.length - 1] !== seg) ch.order.push(seg);
  }
  if (it.type === 'tier') ch.to = it.from + it.dur;
}
for (const c of chapters) {
  const name = `chapter "${c.title}"`;
  if (c.order.join('>') !== 'stats>action>tier') W(`${name}: order is ${c.order.join(' > ') || 'empty'}, the loop is stats > action > tier`);
  const {stats, action, tier} = c.segs;
  if (stats && (stats < 15 || stats > 25)) W(`${name}: stats section is ${f1(stats)}s (15-25 s)`);
  if (action && (action < 25 || action > 40)) W(`${name}: action B-roll is ${f1(action)}s (25-40 s)`);
  if (tier && (tier < 8 || tier > 12)) W(`${name}: tier segment is ${f1(tier)}s (8-12 s)`);
  const len = (c.to ?? c.from) - c.from + 0.5;
  if (len < 55 || len > 95) W(`${name}: chapter is ${f1(len)}s (60-90 s)`);
}

for (const w of warns) console.log('warn  ', w);
for (const e of errors) console.log('ERROR ', e);
console.log(`\n${film.title}: ${at(tl.total)} long, ${chapters.length} chapters, ${tl.items.filter((i) => i.type === 'shot').length} shots. ${errors.length} errors, ${warns.length} warnings.`);
process.exit(errors.length ? 1 : 0);
