#!/usr/bin/env node
// QA: tiles one frame every N seconds of a rendered video into a contact sheet to look at.
// usage: node scripts/contact_sheet.mjs out/film.mp4 [--every 2] [--cols 4]
import {execFileSync} from 'node:child_process';
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const video = process.argv[2];
const every = Number(arg('--every', 2));
const cols = Number(arg('--cols', 4));
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
const rows = Math.ceil(Math.ceil(dur / every) / cols);
const out = video.replace(/\.mp4$/, '.sheet.jpg');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-vf', `fps=1/${every}:start_time=${every / 2},scale=640:-1,drawtext=text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=black:box=1:boxcolor=yellow,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', out]);
console.log('wrote', out);
