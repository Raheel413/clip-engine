# Clip Engine

Turns a script into a finished animal "versus" documentary: clips downloaded from anywhere, the blurred anti-black-bar stack, chapter title cards, receipts with a highlighter, a TierMaker board, a Wheel of Names round, and a mastered mix. It renders on GitHub, split across many machines at once.

## One-time setup

### 1. Keys (GitHub → Settings → Secrets and variables → Actions → New repository secret)

| Secret | What for | Where to get it |
|---|---|---|
| `YOUTUBE_API_KEY` | searching YouTube | console.cloud.google.com → new project → enable "YouTube Data API v3" → Credentials → API key |
| `SERPER_API_KEY` | Google search for TikTok, Instagram, Pinterest, any site, and Google Images | serper.dev → sign up → API key |
| `DEEPGRAM_API_KEY` | the voiceover | the key you already use |
| `ANTHROPIC_API_KEY` | optional: AI checks each clip shows the right animal | console.anthropic.com → API keys |

### 2. Your laptop (for the footage GitHub can't reach)

YouTube, Instagram and often TikTok block downloads from GitHub's machines. Your laptop gets through.

1. Install Python 3.12, Git and ffmpeg: `winget install Python.Python.3.12 Git.Git Gyan.FFmpeg`
2. `git clone https://github.com/Raheel413/clip-engine` and open the folder.
3. Make a file called `.env` in that folder (it never gets uploaded):
   ```
   YOUTUBE_API_KEY=...
   SERPER_API_KEY=...
   ANTHROPIC_API_KEY=...
   ```
4. Instagram needs a login. Sign in to a spare Instagram account in **Firefox** (Chrome encrypts its cookies so downloaders can't read them on Windows), then add `-Browser firefox` when you run the hunt.

## Making a video

1. Claude writes `films/<name>/film.json` (script + shot searches) following `SKILL.md` and pushes it.
2. GitHub starts **Actions → Make video** by itself: it hunts footage, screenshots receipts, records the voice, saves everything into the repo and checks the rules.
3. If footage is missing, the run summary says so. On your laptop:
   ```
   .\hunt\run.ps1 <name>                     # find the rest and push
   .\hunt\run.ps1 <name> -Browser firefox    # same, with your Instagram login
   .\hunt\run.ps1 <name> -Redo b05-0,b07-1   # replace shots you don't like (ids are in credits.md)
   ```
   The push starts the render again by itself.
4. Download the MP4, a contact sheet and `credits.md` from **Artifacts** at the bottom of the run page.

To see a video before every shot is found: **Actions → Make video → Run workflow**, quality = `draft`. Missing shots show as red cards.

## Music

Drop 2-4 dark ambient tracks into `music/` (or `films/<name>/music/` for one video). They play in turn with crossfades. With no tracks, the engine generates a synth pulse bed.

## How the spec maps to the code

| Spec | Where |
|---|---|
| Hook cuts 1.5-3 s, body visuals 4-7 s, cuts on sentence or noun boundaries | `src/timeline.mjs`, checked by `scripts/validate.mjs` |
| Chapter loop: dip 0.5 s → title 3.5 s → stats 15-25 s → B-roll 25-40 s → tier 8-12 s → cut to black | `src/timeline.mjs` (dips and titles are automatic) |
| Blurred fill, 90 % asset with shadow (15 / 40 / 60 %), 90→98 % zoom or 30 px drift, clips punched in 104 %, attribution 50 % bottom-left | `src/components/Stack.tsx`, `Attribution.tsx` |
| Anton title cards, white with a thick black outline, 0.3 s dissolve | `src/components/TitleCard.tsx` |
| Italic footnotes for 3 s | `src/components/Footnote.tsx` |
| Receipts: screenshot + yellow highlighter, multiply, 60 %, 0.4 s wipe | `scripts/receipts.mjs`, `Stack.tsx` |
| TierMaker drag with visible cursor, 0.5 s pause, cut | `src/components/TierBoard.tsx` |
| Wheel of Names with peg ticks, sped up | `src/components/Wheel.tsx` |
| Voice: 3:1 compression, de-ess, +120 Hz, +4 kHz, -14 LUFS. Music low-passed at about -30, +4 dB swell at dips. Boom -12 dB, whooshes -18 dB | `scripts/mix.mjs`, `scripts/make_sounds.mjs` |
| Clips 5 s or less, each source used once | `hunt/hunt.py`, `scripts/validate.mjs` |

## Local commands

```
npm install
node scripts/validate.mjs films/<name> --allow-missing
node scripts/render.mjs films/<name> --scale 0.5 --from 0 --to 60   # a 540p preview of the first minute
npm run studio                                                       # live preview
```

This repo is public: films, scripts and downloaded clips can be seen by anyone. Switch it to private in Settings if that matters (private repos get 3,000 Actions minutes a month on GitHub Pro).
