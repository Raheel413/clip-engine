---
name: clip-engine
description: Write and produce clip-driven animal documentaries ("Could X beat every Y predator?") with this repo. Use when asked to script, plan or make a video for the animal versus channel.
---

# Clip Engine: director's manual

You turn a topic into `films/<name>/film.json`. The engine does the rest: footage hunt, receipts, voice, rule check, parallel render, audio master. Read this whole file before writing a film.

## 1. The format

One famous modern animal (the hero) against a run of opponents from one era. Each opponent is one chapter. Order opponents from easiest to deadliest so the stakes climb, and put the most famous killer last.

- **Hook (0:00-0:30):** stakes in the first sentence. Hard cuts every 1.5-3 s.
- **Chapters (60-90 s each):** the engine adds the dip to black and the title card. You write:
  1. `stats` lines (15-25 s): size, weight, bite, skull, where the fossils come from. Use receipts for numbers.
  2. `action` lines (25-40 s): how the fight would go, built on real behaviour of living relatives.
  3. one `tier` line (8-12 s): the verdict. The board drag and the cut to black are automatic.
- **Bonus wheel (optional):** a `wheel` beat that picks the next video's opponent.
- **Outro:** one or two lines.

Full videos: 11-13 opponents for 16-19 minutes. Tests: 3 opponents.

## 1b. The quality bar: Fossil (@FossilVideos)

Studied frame by frame ("Could a Polar Bear Beat Every Ice Age Predator?", 2.9M views):
- **Clips are premium documentary footage**: Prehistoric Planet: Ice Age, Walking with Beasts, BBC (Frozen Planet, Planet Earth). Landscape, HD, full frame, tiny credit bottom-left. No TikTok-style vertical clips. Set `doc_sources` and the hunter searches those first (YouTube, so run the hunt on the laptop).
- **Hook**: 20 s of full-frame documentary shots cut every 1-2 s, extreme close-ups of the hero's face first.
- **Stills** (paleoart, skulls, museum mounts, fossil diagrams) sit centred on a dark blurred fill.
- **Title cards**: the animal's name in Anton, as written (not all caps), white-to-grey, soft shadow, over the blurred animal. `"title_style": "plain"`.
- **Stat labels** over pictures: "3.7 - 4 Meters / 40 KG". Use `label` on the shot.
- **Size charts**: silhouette comparisons (hero vs human vs opponent). Search "<animal> size comparison chart".
- **Receipts**: Google snippet or study text with the claim highlighted.
- **Tier board labels** say what the row means for the hero: "Destroys the Bear", "Beats the Bear (rough)", "50/50", "Bear Wins (rough)", "Bear Wins Easy"; the whole roster waits in the pool from the start, plus a "?" (`tier_extra`).

## 2. Writing rules

- One beat = one sentence (two short ones at most). Cuts land on beat boundaries or on a word you pin with `at`.
- About 150 words per minute. A 60-90 s chapter is roughly 150-220 words.
- Every number must be real and sourced. Weight estimates for extinct animals are ranges: say "around" or "up to", and add a `note` when scientists disagree.
- Short, concrete, spoken. Second person works ("Your grizzly comes up to its chest").
- Banned (the validator rejects them): "it's not X, it's Y", "not X but Y", "not because X but because Y", and the words delve, testament, tapestry, pivotal, showcase, underscore, realm, unleash, game-changer. Also avoid the two-sentence version ("They don't bite to kill. They bite to...").

## 3. Shots

Every spoken beat needs `shots`. Each shot is a search the hunter runs.

| kind | use for | notes |
|---|---|---|
| `clip` | living animals, behaviour, landscapes, documentary CGI | cut to 5 s or less from the best uninterrupted camera shot |
| `image` | paleoart, museum skeletons, skulls, size charts | moves 90 to 98 % or drifts 30 px; never static; `label` adds big stat text |
| `receipt` | the page a number comes from | `url` + `find` (exact words on the page). PDFs: add `page` |

- **How many:** in the hook, one shot per 1.5-3 s (split each line into 2-3 shots, pin cuts with `at`, the word index where the shot starts). In the body, one visual per 4-7 s: lines up to ~6 s get one shot, longer lines get two. A clip can stretch to at most 1.33x its length (it is slowed slightly), so a long line over clips needs two shots.
- **Queries:** say what the frame shows, 3-6 words: "grizzly bear swipe paw", "smilodon skeleton museum", "arctodus size comparison human". Extinct animals: ask for paleoart, skeleton, skull or "documentary". Living relatives carry the action sections.
- `from` limits where to look: `["youtube","tiktok","instagram","pinterest","web"]` for clips, `["web","commons","pinterest"]` for images.
- `url` on a clip or image skips the search and downloads that exact link (any site yt-dlp supports).
- `note` on a beat shows an italic footnote for 3 s (`note_at` = word index). Use it for caveats: "Its diet is still debated".

## 4. film.json

```json
{
  "title": "Could a Grizzly Bear Beat Every Ice Age Predator?",
  "voice": "aura-2-zeus-en",
  "hero": "Grizzly Bear",
  "tier_title": "Ice Age Threat Ranking",
  "title_style": "plain",
  "doc_sources": ["Prehistoric Planet Ice Age", "Walking with Beasts", "BBC Earth"],
  "tier_extra": ["?"],
  "tiers": [{"label": "S", "color": "#ff7f7f"}, {"label": "A", "color": "#ffbf7f"}, {"label": "B", "color": "#ffdf7f"}, {"label": "C", "color": "#ffff7f"}, {"label": "D", "color": "#bfff7f"}],
  "opponents": [{"name": "Dire Wolf", "thumb": {"kind": "image", "q": "dire wolf paleoart"}}],
  "beats": [
    {"seg": "hook", "text": "...", "shots": [{"kind": "clip", "q": "..."}, {"kind": "image", "q": "...", "at": 6}]},
    {"seg": "title", "title": "Dire Wolf"},
    {"seg": "stats", "text": "...", "shots": [{"kind": "receipt", "url": "https://...", "find": "La Brea Tar Pits"}]},
    {"seg": "action", "text": "...", "note": "Pack size is an estimate", "shots": [{"kind": "clip", "q": "..."}]},
    {"seg": "tier", "text": "Dire wolves go in C tier...", "tier": {"item": "Dire Wolf", "row": "C"}},
    {"seg": "wheel", "text": "Bonus round...", "wheel": {"names": ["Cave Lion", "Woolly Rhino"], "pick": "Cave Lion"}},
    {"seg": "outro", "text": "...", "shots": [{"kind": "image", "q": "..."}]}
  ]
}
```

Tell the viewer what the tiers mean in the first tier line (for example S = the hero dies, D = easy win).

## 5. Make it

1. Write `films/<name>/film.json`, run `node scripts/validate.mjs films/<name> --allow-missing`, fix every error.
2. Push it. GitHub hunts what it can, records the voice and checks the rules.
3. If shots are still missing, Raheel runs `.\hunt\run.ps1 <name>` on his laptop. That pushes, and the render starts by itself.
4. Bad pick? `.\hunt\run.ps1 <name> -Redo b05-0,b07-1` throws those shots away and finds new ones. Shot ids are `b<beat>-<shot>` (beat index from 0) and `thumb-<n>`; `credits.md` lists them.
5. The MP4, a contact sheet and `credits.md` arrive under Artifacts on the Actions run.
