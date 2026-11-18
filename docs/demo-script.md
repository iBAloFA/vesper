# Demo Script

Target length **2:20–2:40**. Hard limit is 3:00. The film should show a real session, not a mock. If a step fails on camera, either retry honestly or cut it; never edit a failure into a success.

The submitted film is the 37-second silent captioned walkthrough committed at [`docs/vesper-demo.mp4`](vesper-demo.mp4) and published unlisted on YouTube — see [kiro-evidence/demo-video-link.md](kiro-evidence/demo-video-link.md). It was recorded with Playwright against the real app: landing, setup, a one-minute vigil, pause and resume, the return with its seal, and the crypt. It fits the event's only hard rule (under 3:00); the captions describe each step and the YouTube description states what Kiro contributed.

The storyboard below describes a longer narrated cut (2:20–2:40) that would also show the CLI verifier, the undeployed registry, and the Kiro workspace. It was not filmed. Keep it as the plan for a future edit rather than presenting it as the submission.

## Storyboard

| Time | Picture | Action | Narration / caption |
| --- | --- | --- | --- |
| 0:00–0:08 | Title card over the landing altar | — | "Vesper. A haunted focus ritual. Built with Kiro for Kiroween." |
| 0:08–0:28 | Landing page, slow scroll to the three acts | Hover "Begin a vigil" | "No feeds, no leaderboards. Name the work, keep the vigil, leave a sigil." |
| 0:28–0:50 | Vigil setup | Type an intention, choose 5 minutes (or a 1-minute custom run for the demo), pick "Hollow", enable sound | "The room is procedural audio. Wind, rain, a distant bell — synthesized live, no samples, no network." |
| 0:50–1:15 | Ritual screen | Begin; let the candle burn; pause; show the timer hold; resume | "The clock is derived from wall time. Hiding the tab or pausing cannot steal minutes." |
| 1:15–1:35 | Ritual finishes | Auto-return to the Return view; reveal the transmission and sigil | "When the hour is kept, a transmission and a deterministic sigil return with it." |
| 1:35–1:58 | Seal flow | Connect or create a local keeper; seal the vigil; show "verified" after signer recovery | "Sealing signs an EIP-712 record. The app recovers the signer locally before it says verified." |
| 1:58–2:12 | Crypt | Open the new vigil, show the attestation JSON, download it / export archive | "The archive stays in this browser. Export it, or hand a single attestation to anyone." |
| 2:12–2:30 | Terminal | Run `npm run verify:attestation -- attestation.json` | "This verifier imports viem and nothing from Vesper. No trust in the app required." |
| 2:30–2:40 | Kiro workspace | Show specs, steering, hooks panel, then the live URL | "Specs, steering, hooks and MCP — built in Kiro. Vesper is live at the link below." |

## Capture setup

- Viewport **1440×900**, device scale factor 2, browser zoom 100%.
- Use a clean browser profile with no wallet extension; use the local keeper for the seal.
- Pre-create a second, already-verified vigil in the crypt so the archive view has content.
- Set the OS clock normally; do not fake timestamps.
- Use a 1-minute custom vigil for the recording so the finish is real but quick. Say that it is a one-minute vigil.
- Record at 60 fps if possible; 30 fps is acceptable.
- Capture system audio only if the ambience is audible and not clipped. Otherwise record narration separately and mute game audio.

## Terminal shot

```bash
npm run verify:attestation -- attestation.json
```

Expected shape:

```
Vesper attestation verifier
  address    0x…
  chain      8453
✓ signature recovers to the keeper
✓ seal matches the vigil record

✓ 1 of 1 attestations verified. No Vesper code was trusted.
```

Use a real file exported from the session. Do not hand-write the output.

## Assembly

Keep a `demo-artifacts/` folder (ignored by git) with the raw capture, narration, and captions.

```bash
# Normalize the capture
ffmpeg -i raw.mkv -vf "scale=1920:1200,setsar=1" -r 30 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p video.mp4

# Optional narration track
ffmpeg -i video.mp4 -i narration.wav -c:v copy -c:a aac -b:a 192k -shortest video-narrated.mp4

# Burn captions (keep a sidecar .srt as well)
ffmpeg -i video-narrated.mp4 -vf "subtitles=captions.srt:force_style='FontName=Inter,FontSize=22,Outline=1,Shadow=0'" -c:a copy vesper-demo.mp4
```

Check the result:

```bash
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 vesper-demo.mp4
```

Upload the final file to YouTube or Vimeo as **unlisted/public**, confirm it plays without a login, and put the link in the README and the Devpost submission.

## Honesty rules

- Show the real app at the deployed URL (or localhost) — no mockups.
- Show the verifier output that the terminal actually produced.
- If on-chain minting is not deployed, do not imply it is. Say "the registry ships in the repo; this build verifies signatures locally."
- Do not show fabricated Kiro screenshots; show the actual workspace.
- Keep the product name, category, and deadline consistent with the submission.
