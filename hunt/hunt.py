#!/usr/bin/env python3
"""Footage hunter: finds and downloads a short clip or image for every shot in a film.

    python hunt/hunt.py films/<name> [--browser firefox] [--no-vision] [--redo b05-0,b07-1]

For each shot that has no `src` yet it:
  1. searches (YouTube Data API, Google via Serper for TikTok / Instagram / Pinterest / any site,
     Google Images, Wikimedia Commons),
  2. downloads a window of the video with yt-dlp (or the image),
  3. finds the longest uninterrupted camera shot inside that window (ffmpeg scene detection) and
     cuts at most 5 seconds of it, re-encoded to 30 fps H.264 without audio,
  4. optionally asks Claude to look at a frame and confirm it shows what the line is about,
  5. writes `src`, `credit`, `source`, size and length back into film.json and logs it in credits.md.

Keys come from the environment or a `.env` file in the repo root:
  YOUTUBE_API_KEY, SERPER_API_KEY, ANTHROPIC_API_KEY (optional, for the vision check)
Run it on your own computer when YouTube / Instagram block the GitHub machines.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

MAX_CLIP = 5.0          # hard limit, seconds
MIN_CLIP = 2.5
WINDOW = 30             # seconds of a long video to download and search for a clean shot
MAX_TRIES = 6           # candidates tried per shot before giving up
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".hunt-cache"

CLIP_SOURCES = ["youtube", "vimeo", "dailymotion", "web", "tiktok", "instagram"]
IMAGE_SOURCES = ["web", "commons", "pinterest"]


# ---------------------------------------------------------------- setup

def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m and not os.environ.get(m.group(1)):
                os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def log(*a):
    print(*a, flush=True)


def need(cmd):
    if not shutil.which(cmd):
        sys.exit(f"{cmd} is not installed or not on PATH")


# ---------------------------------------------------------------- search

def youtube_search(q, n=8):
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        return []
    try:
        r = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={"part": "snippet", "q": q, "type": "video", "maxResults": n, "key": key, "safeSearch": "none"},
            timeout=20,
        )
        r.raise_for_status()
        return [f"https://www.youtube.com/watch?v={i['id']['videoId']}" for i in r.json().get("items", [])]
    except Exception as e:  # quota, bad key, network
        log(f"    youtube search failed: {e}")
        return []


def serper(endpoint, q, n=10):
    key = os.environ.get("SERPER_API_KEY")
    if not key:
        return []
    try:
        r = requests.post(
            f"https://google.serper.dev/{endpoint}",
            headers={"X-API-KEY": key, "Content-Type": "application/json"},
            json={"q": q, "num": n},
            timeout=20,
        )
        r.raise_for_status()
        return r.json().get(endpoint, [])
    except Exception as e:
        log(f"    serper {endpoint} failed: {e}")
        return []


DOCS = []  # documentaries to search first (film.json "doc_sources")


def video_candidates(q, sources):
    lists = []
    # premium documentary footage first: "<query> Prehistoric Planet", "<query> Walking with Beasts", ...
    if "youtube" in sources:
        for d in DOCS[:3]:
            lists.append(youtube_search(f"{q} {d}", n=5))
    for s in sources:
        if s == "youtube":
            lists.append(youtube_search(q))
        elif s == "tiktok":
            lists.append([v["link"] for v in serper("videos", f"{q} site:tiktok.com") if "tiktok.com" in v.get("link", "")])
        elif s == "instagram":
            lists.append([v["link"] for v in serper("videos", f"{q} site:instagram.com") if "instagram.com" in v.get("link", "")])
        elif s == "pinterest":
            lists.append([v["link"] for v in serper("videos", f"{q} site:pinterest.com") if "pinterest." in v.get("link", "")])
        elif s == "vimeo":
            lists.append([v["link"] for v in serper("videos", f"{q} site:vimeo.com") if "vimeo.com" in v.get("link", "")])
        elif s == "dailymotion":
            lists.append([v["link"] for v in serper("videos", f"{q} site:dailymotion.com") if "dailymotion.com" in v.get("link", "")])
        elif s == "web":
            lists.append([v["link"] for v in serper("videos", q) if v.get("link")])
    # interleave so one blocked site doesn't use up every try
    out, seen = [], set()
    for i in range(max((len(l) for l in lists), default=0)):
        for l in lists:
            if i < len(l) and l[i] not in seen:
                seen.add(l[i])
                out.append(l[i])
    return out


def image_candidates(q, sources):
    lists = []
    for s in sources:
        if s in ("web", "pinterest"):
            query = f"{q} site:pinterest.com" if s == "pinterest" else q
            res = serper("images", query)
            lists.append([
                {"url": r["imageUrl"], "page": r.get("link", r["imageUrl"]), "credit": r.get("source") or urlparse(r.get("link", "")).netloc,
                 "w": r.get("imageWidth"), "h": r.get("imageHeight")}
                for r in res if r.get("imageUrl")
            ])
        elif s == "commons":
            lists.append(commons_search(q))
    out, seen = [], set()
    for i in range(max((len(l) for l in lists), default=0)):
        for l in lists:
            if i < len(l) and l[i]["url"] not in seen:
                seen.add(l[i]["url"])
                out.append(l[i])
    # biggest first among the top results
    return out


def commons_search(q, n=8):
    try:
        r = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params={"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": q,
                    "gsrlimit": n, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 2000},
            headers=UA, timeout=20,
        )
        pages = r.json().get("query", {}).get("pages", {}).values()
        out = []
        for p in sorted(pages, key=lambda p: p.get("index", 0)):
            ii = (p.get("imageinfo") or [{}])[0]
            if not ii.get("thumburl") or not re.search(r"\.(jpe?g|png|webp)$", ii.get("url", ""), re.I):
                continue
            meta = ii.get("extmetadata", {})
            artist = re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
            lic = meta.get("LicenseShortName", {}).get("value", "")
            out.append({"url": ii["thumburl"], "page": ii.get("descriptionurl", ii["url"]),
                        "credit": " / ".join(x for x in [artist[:40], lic, "Wikimedia Commons"] if x),
                        "w": ii.get("thumbwidth"), "h": ii.get("thumbheight")})
        return out
    except Exception as e:
        log(f"    commons search failed: {e}")
        return []


# ---------------------------------------------------------------- video

def ydl_opts(args, out=None):
    o = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 30, "retries": 2}
    if args.browser:
        o["cookiesfrombrowser"] = (args.browser,)
    cookies = os.environ.get("HUNT_COOKIES")
    if cookies and Path(cookies).exists():
        o["cookiefile"] = cookies
    if out:
        o["outtmpl"] = out
    return o


def site_name(info):
    ext = (info.get("extractor_key") or info.get("extractor") or "").replace(":", " ")
    who = info.get("uploader") or info.get("channel") or info.get("uploader_id") or ""
    names = {"Youtube": "YouTube", "TikTok": "TikTok", "Instagram": "Instagram", "Pinterest": "Pinterest"}
    site = names.get(ext, ext or urlparse(info.get("webpage_url", "")).netloc)
    return f"{who} / {site}" if who else site


def fetch_window(url, args, tag, landscape_only=False):
    """Download up to WINDOW seconds of a video. Returns (path, info) or (None, reason)."""
    import yt_dlp
    from yt_dlp.utils import download_range_func

    try:
        with yt_dlp.YoutubeDL(ydl_opts(args)) as y:
            info = y.extract_info(url, download=False)
    except Exception as e:
        return None, f"blocked or unavailable ({str(e).splitlines()[0][:120]})"
    if info.get("_type") == "playlist":
        entries = [e for e in info.get("entries") or [] if e]
        if not entries:
            return None, "empty playlist"
        info = entries[0]
    dur = info.get("duration") or 0
    iw, ih = info.get("width") or 0, info.get("height") or 0
    if landscape_only and iw and ih and iw < ih * 1.2:
        return None, "vertical"
    if dur and dur < 2:
        return None, "too short"
    if dur and dur > 4 * 3600:
        return None, "too long"

    opts = ydl_opts(args, str(CACHE / f"{tag}.%(ext)s"))
    opts["format"] = "bv*[height<=1080][height>=720]/bv*[height<=1080][height>=480]/b[height<=1080][height>=480]/bv*/b"
    if dur > WINDOW + 10:
        # pick a window away from intros and outros; the shot id decides where, so reruns are stable
        frac = 0.15 + (int(hashlib.md5(tag.encode()).hexdigest(), 16) % 600) / 1000  # 0.15 .. 0.75
        a = max(0, dur * frac)
        opts["download_ranges"] = download_range_func(None, [(a, a + WINDOW)])
    for f in CACHE.glob(f"{tag}.*"):
        f.unlink()
    try:
        with yt_dlp.YoutubeDL(opts) as y:
            y.download([info.get("webpage_url") or url])
    except Exception as e:
        return None, f"download failed ({str(e).splitlines()[0][:120]})"
    files = [f for f in CACHE.glob(f"{tag}.*") if f.suffix not in (".part", ".ytdl")]
    if not files:
        return None, "nothing downloaded"
    return files[0], info


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height:format=duration", "-of", "json", str(path)], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    s = (j.get("streams") or [{}])[0]
    return s.get("width", 0), s.get("height", 0), float(j.get("format", {}).get("duration", 0) or 0)


def best_segment(path, length):
    """Longest stretch between camera cuts, as (start, dur). Prefers the middle of the window."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-an", "-vf", "select='gt(scene,0.32)',showinfo",
                        "-f", "null", "-"], capture_output=True, text=True)
    cuts = [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    marks = [0.0] + [c for c in cuts if 0 < c < length] + [length]
    segs = [(marks[i] + 0.15, marks[i + 1] - marks[i] - 0.3) for i in range(len(marks) - 1)]
    segs = [s for s in segs if s[1] > 0.5]
    if not segs:
        return 0.0, min(length, MAX_CLIP)
    mid = length / 2
    best = max(segs, key=lambda s: (min(s[1], MAX_CLIP), -abs(s[0] + s[1] / 2 - mid)))
    take = min(best[1], MAX_CLIP)
    start = best[0] + max(0, (best[1] - take) / 2)  # centre the take inside the camera shot
    return start, take


def cut_clip(src, start, dur, out):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
        "-an", "-vf", "scale='min(1920,iw)':-2:flags=lanczos,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", str(out),
    ], check=True)


def frame_jpeg(path, t):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
                        "-vf", "scale=768:-2", "-f", "image2", "-c:v", "mjpeg", "-"], capture_output=True)
    return r.stdout


# ---------------------------------------------------------------- free checks: burned-in text, orientation

def ocr_words(png):
    """Words tesseract reads with confidence >= 70 (3+ letters or digits)."""
    if not shutil.which("tesseract"):
        return []
    r = subprocess.run(["tesseract", str(png), "-", "--psm", "11", "tsv"], capture_output=True, text=True)
    out = []
    for line in r.stdout.splitlines()[1:]:
        p = line.split("\t")
        if len(p) < 12:
            continue
        try:
            conf = float(p[10])
        except ValueError:
            continue
        if conf >= 70 and len(re.sub(r"[^A-Za-z0-9]", "", p[11])) >= 3:
            out.append(p[11])
    return out


def clip_has_text(path, start, take):
    """True when captions, subtitles or meme text are burned into the clip."""
    if not shutil.which("tesseract"):
        return False, []
    png = CACHE / "_ocr.png"
    for t in (start + 0.3, start + take / 2, start + max(0.3, take - 0.3)):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
                        "-vf", "scale='if(lt(iw,1500),iw*2,iw)':-2", str(png)])
        w = ocr_words(png)
        if len(w) >= 2:
            return True, w
    return False, []


def image_has_text(img):
    if not shutil.which("tesseract"):
        return False, []
    png = CACHE / "_ocr.png"
    im = img.copy()
    if im.size[0] < 1500:
        im = im.resize((im.size[0] * 2, im.size[1] * 2))
    im.save(png)
    w = ocr_words(png)
    return len(w) >= 8, w


# ---------------------------------------------------------------- vision check

def vision_ok(jpeg_bytes, q, line, args):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if args.no_vision or not key or not jpeg_bytes:
        return True, "unchecked"
    prompt = (
        "This frame is a candidate visual for a YouTube animal documentary.\n"
        f"Search: {q}\nNarration over it: {line}\n"
        "Answer with JSON only: {\"match\": true|false, \"heavy_text\": true|false, \"reason\": \"<10 words\"}.\n"
        "match = the frame clearly shows the subject of the search (right animal, fossil, artwork or place). "
        "Paleoart, museum skeletons and documentary CGI count for extinct animals. "
        "heavy_text = big captions, subtitles, a meme, a thumbnail or a slide cover a large part of the frame."
    )
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.environ.get("HUNT_VISION_MODEL", "claude-haiku-5-5"), "max_tokens": 120,
                  "messages": [{"role": "user", "content": [
                      {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                   "data": base64.b64encode(jpeg_bytes).decode()}},
                      {"type": "text", "text": prompt}]}]},
            timeout=60,
        )
        r.raise_for_status()
        text = "".join(c.get("text", "") for c in r.json().get("content", []))
        j = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
        ok = bool(j.get("match")) and not j.get("heavy_text")
        return ok, j.get("reason", "")
    except Exception as e:
        log(f"    vision check skipped: {e}")
        return True, "unchecked"


# ---------------------------------------------------------------- per shot

def hunt_clip(shot, sid, line, film_dir, used, args):
    """Two passes: first only landscape clips (they fill a 16:9 frame), then anything."""
    if shot.get("url"):
        cands = [shot["url"]]
    else:
        cands = video_candidates(shot["q"], shot.get("from") or CLIP_SOURCES)
    tried = set()
    for landscape_only in (True, False):
        tries = 0
        for url in cands:
            if url in used or url in tried:
                continue
            if tries >= MAX_TRIES:
                break
            tries += 1
            log(f"    try {url}{'' if landscape_only else '  (vertical allowed)'}")
            path, info = fetch_window(url, args, f"{sid}-{len(tried)}", landscape_only)
            if not path:
                log(f"      skip: {info}")
                if info != "vertical":
                    tried.add(url)
                continue
            tried.add(url)
            w, h, length = probe(path)
            if min(w, h) < 480 or length < MIN_CLIP:  # too small to hold up in a 1080p video
                log(f"      skip: {w}x{h}, {length:.1f}s")
                continue
            if landscape_only and (w < h * 1.2 or h < 700):
                log(f"      skip: {w}x{h} (looking for landscape HD first)")
                tried.discard(url)
                continue
            start, take = best_segment(path, length)
            if take < MIN_CLIP and length >= MIN_CLIP:
                start, take = 0.0, min(length, MAX_CLIP)  # choppy source: just take the opening
            texty, words = clip_has_text(path, start, take)
            if texty:
                log(f"      skip: text on screen ({' '.join(words[:6])})")
                continue
            ok, why = vision_ok(frame_jpeg(path, start + take / 2), shot["q"], line, args)
            if not ok:
                log(f"      rejected by vision check: {why}")
                continue
            out = film_dir / "assets" / f"{sid}.mp4"
            out.parent.mkdir(exist_ok=True)
            cut_clip(path, start, take, out)
            w2, h2, d2 = probe(out)
            page = info.get("webpage_url") or url
            used.add(url)
            used.add(page)
            shot.update({"src": f"assets/{sid}.mp4", "credit": site_name(info), "source": page, "w": w2, "h": h2,
                         "dur": round(min(d2, MAX_CLIP), 2)})
            log(f"      got {take:.1f}s at {start:.1f}s, {w2}x{h2}  ({site_name(info)})")
            return True
    return False


def hunt_image(shot, sid, line, film_dir, used, args):
    from PIL import Image

    if shot.get("url"):
        cands = [{"url": shot["url"], "page": shot["url"], "credit": urlparse(shot["url"]).netloc}]
    else:
        cands = image_candidates(shot["q"], shot.get("from") or IMAGE_SOURCES)
    tries = 0
    for c in cands:
        if c["url"] in used or c["page"] in used:
            continue
        if tries >= MAX_TRIES + 2:
            break
        tries += 1
        try:
            r = requests.get(c["url"], headers={**UA, "Referer": c["page"]}, timeout=25)
            r.raise_for_status()
            img = Image.open(io.BytesIO(r.content))
            img.load()
            img = img.convert("RGB")
        except Exception as e:
            log(f"    skip image ({str(e)[:80]})")
            continue
        w, h = img.size
        if min(w, h) < 500 or not (0.4 <= w / h <= 3.0):
            log(f"    skip image {w}x{h}")
            continue
        texty, words = image_has_text(img)
        if texty:
            log(f"    skip image: text-heavy ({' '.join(words[:6])})")
            continue
        buf = io.BytesIO()
        small = img.copy()
        small.thumbnail((768, 768))
        small.save(buf, "JPEG", quality=85)
        ok, why = vision_ok(buf.getvalue(), shot["q"], line, args)
        if not ok:
            log(f"    rejected by vision check: {why}")
            continue
        img.thumbnail((2400, 2400), Image.LANCZOS)
        out = film_dir / "assets" / f"{sid}.jpg"
        out.parent.mkdir(exist_ok=True)
        img.save(out, "JPEG", quality=92)
        used.update([c["url"], c["page"]])
        shot.update({"src": f"assets/{sid}.jpg", "credit": c["credit"], "source": c["page"], "w": img.size[0], "h": img.size[1]})
        log(f"    got image {img.size[0]}x{img.size[1]}  ({c['credit']})")
        return True
    return False


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film", help="film folder, e.g. films/grizzly-test")
    ap.add_argument("--browser", default="", help="read login cookies from this browser (firefox recommended)")
    ap.add_argument("--no-vision", action="store_true", help="skip the Claude vision check")
    ap.add_argument("--redo", default="", help="comma-separated shot ids to hunt again, e.g. b05-0,thumb-1")
    ap.add_argument("--recheck", action="store_true", help="re-test found clips and images for burned-in text and replace the ones that fail")
    ap.add_argument("--landscape", action="store_true", help="with --recheck: also replace vertical clips (use on your laptop, where YouTube works)")
    ap.add_argument("--sources", default="", help="override sources for every clip, e.g. tiktok,instagram")
    args = ap.parse_args()

    load_env()
    need("ffmpeg")
    need("ffprobe")
    film_dir = Path(args.film).resolve()
    film_path = film_dir / "film.json"
    film = json.loads(film_path.read_text(encoding="utf-8"))
    DOCS[:] = film.get("doc_sources", [])
    CACHE.mkdir(exist_ok=True)
    redo = {s.strip() for s in args.redo.split(",") if s.strip()}
    if not (os.environ.get("YOUTUBE_API_KEY") or os.environ.get("SERPER_API_KEY")):
        log("warning: no YOUTUBE_API_KEY or SERPER_API_KEY, only shots with a direct `url` can be found")

    # every shot that needs an asset, with an id that never changes
    jobs = []
    for k, o in enumerate(film.get("opponents", [])):
        if o.get("thumb"):
            jobs.append((f"thumb-{k}", o["thumb"], o["name"]))
    for bi, b in enumerate(film["beats"]):
        for si, s in enumerate(b.get("shots") or []):
            if s["kind"] != "receipt":
                jobs.append((f"b{bi:02d}-{si}", s, b.get("text", "")))

    used = {s.get("source") for _, s, _ in jobs if s.get("source")}
    rejected = film.setdefault("rejected", [])
    used.update(rejected)

    checked = set()
    if args.recheck:
        from PIL import Image
        for sid, s, _ in jobs:
            src = film_dir / s["src"] if s.get("src") else None
            if not src or not src.exists():
                continue
            bad = ""
            if s["kind"] == "clip":
                texty, words = clip_has_text(src, 0, s.get("dur") or MAX_CLIP)
                if texty:
                    bad = f"text on screen ({' '.join(words[:5])})"
                elif args.landscape and (s.get("w") or 1) < (s.get("h") or 0):
                    bad = "vertical"
            elif s["kind"] == "image":
                texty, words = image_has_text(Image.open(src).convert("RGB"))
                if texty:
                    bad = f"text-heavy ({' '.join(words[:5])})"
            if bad:
                log(f"recheck {sid}: {bad}, finding a new one")
                if s.get("source"):
                    rejected.append(s["source"])
                    used.add(s["source"])
                checked.add(sid)
    for sid in redo | checked:
        for jid, s, _ in jobs:
            if jid == sid:
                if s.get("source") and sid in redo:
                    rejected.append(s["source"])  # never pick the thing you threw away again
                if s.get("src") and (film_dir / s["src"]).exists():
                    (film_dir / s["src"]).unlink()
                for key in ("src", "credit", "source", "w", "h", "dur"):
                    s.pop(key, None)

    todo = [(sid, s, line) for sid, s, line in jobs if not s.get("src") or not (film_dir / s["src"]).exists()]
    log(f"{len(jobs)} shots, {len(todo)} to find")
    found = 0
    for n, (sid, shot, line) in enumerate(todo, 1):
        log(f"[{n}/{len(todo)}] {sid} {shot['kind']}: {shot.get('q') or shot.get('url')}")
        if args.sources and shot["kind"] == "clip" and not shot.get("url"):
            shot = {**shot, "from": args.sources.split(",")}
        ok = (hunt_clip if shot["kind"] == "clip" else hunt_image)(shot, sid, line, film_dir, used, args)
        if ok:
            found += 1
            # copy results back into the real shot (shot may be a copy when --sources is used)
            for jid, s, _ in jobs:
                if jid == sid:
                    s.update({k: shot[k] for k in ("src", "credit", "source", "w", "h", "dur") if k in shot})
            film_path.write_text(json.dumps(film, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            log("    NOT FOUND")
        time.sleep(0.3)

    film["rejected"] = sorted(set(rejected))
    film_path.write_text(json.dumps(film, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    missing = [(sid, s) for sid, s, _ in jobs if not s.get("src")]
    lines = ["# Credits", "", "| Shot | Credit | Source |", "|---|---|---|"]
    lines += [f"| {sid} | {s.get('credit', '')} | {s.get('source', '')} |" for sid, s, _ in jobs if s.get("src")]
    if missing:
        lines += ["", "## Still missing", ""] + [f"- {sid}: {s.get('q') or s.get('url')}" for sid, s in missing]
    (film_dir / "credits.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    log(f"\nfound {found} new, {len(missing)} still missing")
    if missing:
        for sid, s in missing:
            log(f"  missing {sid}: {s.get('q') or s.get('url')}")


if __name__ == "__main__":
    main()
