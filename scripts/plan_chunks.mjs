#!/usr/bin/env node
// Splits a film into frame ranges for the parallel cloud render. Prints JSON for a GitHub matrix.
// usage: node scripts/plan_chunks.mjs films/<name> [--max 18] [--min-seconds 40]
import {buildTimeline} from '../src/timeline.mjs';
import {arg, filmDir, loadFilm} from './lib.mjs';
const film = loadFilm(filmDir(process.argv[2]));
const tl = buildTimeline(film);
const max = Number(arg('--max', 18));
const minF = Number(arg('--min-seconds', 40)) * tl.fps;
const size = Math.max(minF, Math.ceil(tl.frames / max));
const chunks = [];
for (let a = 0, i = 0; a < tl.frames; a += size, i++) chunks.push({i: String(i).padStart(2, '0'), frames: `${a}-${Math.min(tl.frames - 1, a + size - 1)}`});
console.log(JSON.stringify(chunks));
