---
inclusion: manual
---

# Demo Capture

Use this when recording screenshots or the submission video. Keep the product in charge; the recording should feel like a visit, not a feature tour.

## Pre-flight

```bash
npm ci
npm run build
npm run preview        # http://localhost:4173
```

- Fresh browser profile, 1920×1080, 100% zoom, no extensions or bookmarks bar.
- Clear site data for `localhost:4173` so the archive starts empty.
- Use a **short custom vigil (1 minute)** for the live take; do not wait 25 minutes on camera.
- Pre-create a local keeper in a separate profile only if the take needs a seeded archive; otherwise create it on camera — it is part of the story.

## Storyboard (target 2:30)

| Time | Shot | Notes |
| --- | --- | --- |
| 0:00–0:15 | Landing | Slow scroll: wordmark, tagline, pillars, candle. |
| 0:15–0:35 | Vigil setup | Type an intention, pick 1 minute custom, choose an ambience, tweak one channel. |
| 0:35–0:55 | Ritual | Begin; show the clock, candle, pause/resume, sound toggle. |
| 0:55–1:10 | Return | Completion chime; transmission and sigil appear. Highlight the seal. |
| 1:10–1:30 | Seal | Create local keeper or connect wallet; sign; show verified state. |
| 1:30–1:50 | Crypt | Stats, seven-day chart, constellation; open the vigil; show attestation. |
| 1:50–2:10 | Proof | Terminal: `npm run verify:attestation -- archive.json`; show signer recovery and seal match. |
| 2:10–2:25 | Optional mint | If configured: mint on Base Sepolia; show the receipt link. Otherwise show the disabled state and explain. |
| 2:25–2:40 | Offline | DevTools → Network offline → reload; ritual opens from the service worker. |
| 2:40–2:50 | Kiro | Brief shot of `.kiro/specs`, `steering`, `hooks` in the editor; state what they drove. |
| 2:50–3:00 | Close | Repo URL, live URL, "keep a vigil, leave a sigil". |

## Capture commands

- Chrome screen recording or OBS at 1080p30; record the tab, not the desktop.
- Terminal font ≥ 16 px; use a dark theme that matches Vesper.
- If narrating, write the lines first and read them; otherwise burn captions with ffmpeg.

## Assembly

```bash
# Normalise clips to a common format
ffmpeg -i clip.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -crf 20 -preset medium -c:a aac clip_norm.mp4

# Concatenate
printf "file 'clip1_norm.mp4'\nfile 'clip2_norm.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy vesper-demo-raw.mp4

# Trim to the hard limit
ffmpeg -i vesper-demo-raw.mp4 -t 179 -c copy vesper-demo.mp4
```

- Keep the final file under 3:00 with at least 5 seconds of margin.
- Check the first and last frames; no black gaps, no cursor parked over copy.
- Watch the whole video once at 1× before upload.

## Honesty rules

- Never fake a signature, mint, verifier run, or offline state. Record real executions.
- If a step fails on camera, keep it only if the recovery is the point; otherwise re-record.
- Do not claim the contract is audited; say "tested, not audited".
- Do not imply on-chain features exist when the build is unconfigured.

## Cleanup

- Stop preview and dev servers.
- Remove `.tmp/` scratch scripts and raw clips from the repo; keep only the final video link and approved screenshots in `docs/`.
