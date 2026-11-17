#!/usr/bin/env node
// Renders the picture in chunks (so long films fit in a small machine's memory), joins them, then runs the audio mix.
// usage: node scripts/render.mjs films/<name> [--scale 1] [--chunk 40] [--from 0] [--to 60] [--no-mix]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildTimeline} from '../src/timeline.mjs';
import {arg, filmDir, flag, loadFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const tl = buildTimeline(film);
const fps = tl.fps;
const total = tl.frames;
const scale = arg('--scale', '1');
const chunk = Number(arg('--chunk', 40)) * fps;
// --frames a-b (exact, used by the parallel cloud render) or --from/--to in seconds
const fr = arg('--frames', null);
const first = fr ? Number(fr.split('-')[0]) : Math.round(Number(arg('--from', 0)) * fps);
const last = fr ? Math.min(total - 1, Number(fr.split('-')[1])) : Math.min(total, Math.round(Number(arg('--to', total / fps)) * fps)) - 1;
const video = arg('--out', `out/${film.id}.video.mp4`);

// Remotion serves files from public/: give it this film's assets
const pub = path.join('public', 'films', film.id);
fs.rmSync(pub, {recursive: true, force: true});
fs.mkdirSync(pub, {recursive: true});
if (fs.existsSync(path.join(dir, 'assets'))) fs.cpSync(path.join(dir, 'assets'), path.join(pub, 'assets'), {recursive: true});

fs.mkdirSync('out', {recursive: true});
const tmp = fs.mkdtempSync(path.join('out', '.chunks-'));
const propsFile = path.join(tmp, 'props.json');
fs.writeFileSync(propsFile, JSON.stringify({film}));
const cli = path.resolve('node_modules/@remotion/cli/remotion-cli.js');
const browser = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null);
const parts = [];
const t0 = Date.now();
for (let a = first; a <= last; a += chunk) {
  const b = Math.min(last, a + chunk - 1);
  const part = path.join(tmp, `part-${String(parts.length).padStart(3, '0')}.mp4`);
  console.log(`rendering frames ${a}-${b} of ${total} (${((Date.now() - t0) / 1000).toFixed(0)}s so far)`);
  execFileSync(process.execPath, [cli, 'render', 'src/index.ts', 'Film', part, `--props=${propsFile}`, `--frames=${a}-${b}`,
    `--scale=${scale}`, `--concurrency=${process.env.REMOTION_CONCURRENCY || 2}`, '--muted', '--color-space=bt709',
    '--crf=18', '--log=error', ...(browser ? [`--browser-executable=${browser}`] : [])], {stdio: 'inherit'});
  parts.push(part);
}
if (parts.length === 1) fs.copyFileSync(parts[0], video);
else {
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${path.resolve(p)}'`).join('\n'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
}
fs.rmSync(tmp, {recursive: true, force: true});
console.log('picture:', video, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (!flag('--no-mix') && !fr) execFileSync(process.execPath, ['scripts/mix.mjs', dir, '--video', video], {stdio: 'inherit'});
