// Small helpers shared by the scripts.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
export const flag = (k) => process.argv.includes(k);

/** Accepts films/<id>, films/<id>/film.json or just <id>. */
export function filmDir(p) {
  if (!p) { console.error('usage: <script> films/<name>'); process.exit(2); }
  let d = p.endsWith('.json') ? path.dirname(p) : p;
  if (!fs.existsSync(d) && fs.existsSync(path.join('films', d))) d = path.join('films', d);
  return d;
}
export function loadFilm(dir) {
  const film = JSON.parse(fs.readFileSync(path.join(dir, 'film.json'), 'utf8'));
  film.id = path.basename(path.resolve(dir));
  return film;
}
export function saveFilm(dir, film) {
  const {id, ...rest} = film;
  fs.writeFileSync(path.join(dir, 'film.json'), JSON.stringify(rest, null, 2) + '\n');
}
export const seconds = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
export const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: ['ignore', 'inherit', 'inherit']});

/** Decode any audio file to mono float32 samples at `rate`. */
export function decode(file, rate = 48000) {
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
/** Write mono float32 samples as a WAV file. */
export function writeWav(file, samples, rate = 48000) {
  const h = Buffer.alloc(44);
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
