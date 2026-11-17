#!/usr/bin/env node
// Voiceover with Deepgram Aura-2: one clip per spoken beat, cached by voice + text, real lengths written into film.json.
// usage: DEEPGRAM_API_KEY=... node scripts/vo_deepgram.mjs films/<name> [--voice aura-2-zeus-en]
// American male voices: aura-2-zeus-en (deep), aura-2-orion-en (calm), aura-2-arcas-en (smooth), aura-2-apollo-en (casual).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {arg, filmDir, loadFilm, saveFilm, seconds} from './lib.mjs';

const key = process.env.DEEPGRAM_API_KEY;
if (!key) { console.error('Set DEEPGRAM_API_KEY'); process.exit(2); }
const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const voice = arg('--voice', film.voice || 'aura-2-zeus-en');
fs.mkdirSync(path.join(dir, 'vo'), {recursive: true});

async function speak(text, mp3) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=mp3`, {
      method: 'POST',
      headers: {Authorization: `Token ${key}`, 'content-type': 'application/json'},
      body: JSON.stringify({text}),
    });
    if (res.ok) { fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer())); return; }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) { console.warn(`retry ${attempt}: ${res.status}`); await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    console.error(res.status, body); process.exit(1);
  }
  console.error('Deepgram kept failing'); process.exit(1);
}

let total = 0;
for (const [i, b] of film.beats.entries()) {
  if (!b.text || b.seg === 'title') continue;
  const h = crypto.createHash('sha1').update(voice + '|' + b.text).digest('hex').slice(0, 8);
  const rel = `vo/b${String(i).padStart(2, '0')}-${h}.mp3`;
  const mp3 = path.join(dir, rel);
  if (!fs.existsSync(mp3)) await speak(b.text, mp3);
  b.vo = rel;
  b.vo_dur = +seconds(mp3).toFixed(3);
  total += b.vo_dur;
  console.log(rel, b.vo_dur.toFixed(2) + 's');
}
saveFilm(dir, film);
console.log(`voiceover ${voice}: ${total.toFixed(1)}s of speech`);
