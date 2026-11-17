#!/usr/bin/env node
// "Browser / paper receipts": screenshots the page or PDF a claim comes from and records where the
// quoted words sit, so the render can wipe a yellow highlighter across them.
// usage: node scripts/receipts.mjs films/<name> [--redo]
//   shot: {"kind": "receipt", "url": "https://...", "find": "words on the page", "page": 3 (PDFs)}
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {filmDir, flag, loadFilm, saveFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const redo = flag('--redo');
const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const jobs = [];
film.beats.forEach((b, bi) => (b.shots ?? []).forEach((s, si) => {
  if (s.kind === 'receipt' && (redo || !s.src || !fs.existsSync(path.join(dir, s.src)))) jobs.push({s, sid: `b${String(bi).padStart(2, '0')}-${si}`});
}));
if (!jobs.length) { console.log('receipts: nothing to do'); process.exit(0); }
fs.mkdirSync(path.join(dir, 'assets'), {recursive: true});

const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const browser = await chromium.launch({executablePath: chrome, headless: true});
const ctx = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 2, locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'});

for (const {s, sid} of jobs) {
  try {
    const isPdf = /\.pdf($|\?)/i.test(s.url) || (await fetch(s.url, {method: 'HEAD'}).then((r) => r.headers.get('content-type') || '').catch(() => '')).includes('pdf');
    const out = path.join(dir, 'assets', `${sid}.png`);
    if (isPdf) Object.assign(s, await pdfReceipt(s, out));
    else Object.assign(s, await pageReceipt(s, out));
    s.src = `assets/${sid}.png`;
    s.credit = s.credit || host(s.url);
    s.source = s.url;
    console.log(`${sid}: ${s.url} ${s.highlight ? 'highlighted' : 'NO MATCH for "' + s.find + '"'}`);
  } catch (e) {
    console.error(`${sid}: failed ${s.url}: ${e.message}`);
  }
}
await browser.close();
saveFilm(dir, film);

async function pageReceipt(s, out) {
  const page = await ctx.newPage();
  await page.goto(s.url, {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.waitForTimeout(2500);
  // close cookie banners
  for (const label of ['Accept all', 'Accept', 'I agree', 'Agree', 'Got it', 'OK']) {
    const b = page.getByRole('button', {name: label, exact: true}).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(500); break; }
  }
  const box = await page.evaluate((find) => {
    if (!find) return null;
    const want = find.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.toLowerCase().indexOf(want);
      if (i < 0) continue;
      const el = n.parentElement;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || !el.offsetParent) continue;
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + find.length);
      el.scrollIntoView({block: 'center'});
      const rects = [...r.getClientRects()].filter((q) => q.width > 2);
      if (!rects.length) continue;
      // merge the pieces of each text line into one bar per line
      const lines = [];
      for (const q of rects) {
        const l = lines.find((L) => Math.abs(L.y - q.top) < q.height / 2);
        if (l) { const x1 = Math.max(l.x + l.w, q.right); l.x = Math.min(l.x, q.left); l.w = x1 - l.x; }
        else lines.push({x: q.left, y: q.top, w: q.width, h: q.height});
      }
      return lines;
    }
    return null;
  }, s.find || '');
  await page.waitForTimeout(400);
  // crop a 16:10 window around the quoted words so the text is big enough to read
  const VW = 1280, VH = 800, CW = 880, CH = 550;
  let clip = {x: 0, y: 0, width: CW, height: CH};
  if (box) {
    const b0 = box[0];
    const cx = Math.min(Math.max(b0.x + b0.w / 2, CW / 2), VW - CW / 2);
    const cy = Math.min(Math.max(b0.y + b0.h / 2, CH / 2), VH - CH / 2);
    clip = {x: Math.round(cx - CW / 2), y: Math.round(cy - CH / 2), width: CW, height: CH};
  } else clip = {x: Math.round((VW - CW) / 2), y: 0, width: CW, height: CH};
  await page.screenshot({path: out, clip});
  await page.close();
  const pad = 3;
  const hl = box ? box.map((b) => ({x: (b.x - clip.x - pad) / CW, y: (b.y - clip.y - pad / 2) / CH, w: (b.w + pad * 2) / CW, h: (b.h + pad) / CH})) : undefined;
  return {w: CW * 2, h: CH * 2, highlight: hl};
}

async function pdfReceipt(s, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcpt-'));
  const pdf = path.join(tmp, 'doc.pdf');
  fs.writeFileSync(pdf, Buffer.from(await (await fetch(s.url)).arrayBuffer()));
  const want = (s.find || '').toLowerCase().split(/\s+/).filter(Boolean);
  const pages = s.page ? [s.page] : Array.from({length: 30}, (_, i) => i + 1);
  for (const p of pages) {
    let html;
    try { html = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-bbox', pdf, '-'], {maxBuffer: 1 << 26}).toString(); } catch { break; }
    const pg = html.match(/<page width="([\d.]+)" height="([\d.]+)"/);
    if (!pg) break;
    const [PW, PH] = [Number(pg[1]), Number(pg[2])];
    const words = [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((m) => ({x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5].toLowerCase().replace(/[^\p{L}\p{N}.%°-]/gu, '')}));
    let hit = -1;
    for (let i = 0; want.length && i <= words.length - want.length; i++) {
      if (want.every((w, k) => words[i + k].t.includes(w.replace(/[^\p{L}\p{N}.%°-]/gu, '')))) { hit = i; break; }
    }
    if (hit < 0 && !s.page) continue; // keep looking on the next page
    // crop a 16:10 band of the page around the hit
    const sel = hit >= 0 ? words.slice(hit, hit + want.length) : [];
    const cy = sel.length ? (Math.min(...sel.map((w) => w.y0)) + Math.max(...sel.map((w) => w.y1))) / 2 : PH * 0.3;
    const bandH = Math.min(PH, PW / 1.6);
    const top = Math.max(0, Math.min(PH - bandH, cy - bandH / 2));
    const dpi = 1920 / (PW / 72);
    const px = (v) => Math.round((v / 72) * dpi);
    execFileSync('pdftoppm', ['-f', String(p), '-l', String(p), '-r', String(dpi.toFixed(1)), '-x', '0', '-y', String(px(top)), '-W', String(px(PW)), '-H', String(px(bandH)), '-png', '-singlefile', pdf, out.replace(/\.png$/, '')]);
    const hl = sel.length ? {
      x: (Math.min(...sel.map((w) => w.x0)) - 2) / PW,
      y: (Math.min(...sel.map((w) => w.y0)) - top - 1) / bandH,
      w: (Math.max(...sel.map((w) => w.x1)) - Math.min(...sel.map((w) => w.x0)) + 4) / PW,
      h: (Math.max(...sel.map((w) => w.y1)) - Math.min(...sel.map((w) => w.y0)) + 2) / bandH,
    } : undefined;
    return {w: px(PW), h: px(bandH), highlight: hl, page: p};
  }
  throw new Error(`"${s.find}" not found in the first pages of the PDF; set "page"`);
}
