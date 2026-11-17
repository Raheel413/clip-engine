#!/usr/bin/env node
// Generates the sound kit with ffmpeg, so there is nothing to license:
//   boom.wav   sub-bass impact with a long reverb tail, peaks at -12 dB (title cards)
//   whoosh.wav soft filtered whoosh, peaks at -18 dB (pop-ups, receipts, tier board)
//   tick.wav   wheel peg tick
//   bed.wav    dark ambient synth pulses, low-passed, no melody (only used when no music is supplied)
// usage: node scripts/make_sounds.mjs [--out sounds] [--bed-seconds 600]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {arg, ff} from './lib.mjs';

const out = arg('--out', 'sounds');
const bedSeconds = Number(arg('--bed-seconds', 600));
fs.mkdirSync(out, {recursive: true});

function normalizePeak(src, dst, dB) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'});
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr || '');
  const max = m ? Number(m[1]) : 0;
  ff(['-i', src, '-af', `volume=${(dB - max).toFixed(2)}dB,pan=stereo|c0=c0|c1=c0`, '-ar', '48000', dst]);
  fs.unlinkSync(src);
}
const tmp = (n) => path.join(out, `_${n}`);

// boom: falling sine 70 -> 32 Hz, fast thump, long tail
ff(['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(32*t+38*(1-exp(-3*t))/3))*exp(-2.2*t)+0.5*(random(0)*2-1)*exp(-35*t)':s=48000:d=3.5",
  '-af', 'lowpass=f=180,aecho=0.8:0.6:180|360|720|1200:0.45|0.32|0.2|0.12,afade=t=out:st=2.6:d=0.9', tmp('boom.wav')]);
normalizePeak(tmp('boom.wav'), path.join(out, 'boom.wav'), -12);

// whoosh: pink noise swelling and fading over 0.8 s, band-limited so it stays soft
ff(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:d=0.8:r=48000:a=0.8', '-af',
  "volume='pow(sin(PI*t/0.8),3)':eval=frame,highpass=f=350,lowpass=f=2800,aecho=0.6:0.5:60:0.3", tmp('whoosh.wav')]);
normalizePeak(tmp('whoosh.wav'), path.join(out, 'whoosh.wav'), -18);

// tick: short plastic click
ff(['-f', 'lavfi', '-i', "aevalsrc='(0.8*sin(2*PI*2300*t)+0.6*(random(0)*2-1))*exp(-160*t)':s=48000:d=0.05", tmp('tick.wav')]);
normalizePeak(tmp('tick.wav'), path.join(out, 'tick.wav'), -16);

// bed: A minor-ish drones that move every 8 s (A, F, G, E), a soft pulse every 0.8 s, heavy low-pass
const root = 'if(eq(mod(floor(t/8),4),0),55,if(eq(mod(floor(t/8),4),1),43.65,if(eq(mod(floor(t/8),4),2),49,41.2)))';
const edge = 'min(1,mod(t,8)*2)*min(1,(8-mod(t,8))*2)';
const pad = `0.35*(sin(2*PI*${root}*t)+0.5*sin(2*PI*${root}*1.5*t)+0.3*sin(2*PI*${root}*2.003*t))*${edge}*(0.75+0.25*sin(2*PI*0.07*t))`;
const pulse = `0.45*sin(2*PI*${root}*t)*exp(-4*mod(t,0.8))*${edge}`;
ff(['-f', 'lavfi', '-i', `aevalsrc='${pad}+${pulse}':s=48000:d=${bedSeconds}`, '-af',
  'lowpass=f=700,aecho=0.8:0.7:400|800:0.35|0.25,alimiter=limit=0.7', '-ac', '2', path.join(out, 'bed.wav')]);
console.log('sounds written to', out);
