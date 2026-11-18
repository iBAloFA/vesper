---
inclusion: manual
---

# Kiroween 2026 Playbook

## Submission requirements (from the event)

- Deadline: **December 4, 2026, 2:00 pm PST**.
- Public repository that includes the `.kiro/` directory: specs, steering, hooks (and MCP settings if used).
- A functional, publicly reachable app URL.
- A demo video **under 3 minutes**.
- Documentation of how Kiro was used: vibe coding, agent hooks, spec-driven development, steering docs, MCP.
- Category target: **Vampire — Costume Contest** (polished, atmospheric execution).

## Repository checklist

- [ ] `.kiro/specs/vigil-core/{requirements,design,tasks}.md`
- [ ] `.kiro/specs/proof-of-focus/{requirements,design,tasks}.md`
- [ ] `.kiro/steering/*.md` (always, fileMatch, and manual files)
- [ ] `.kiro/hooks/*.json` (enabled, valid v1 schema)
- [ ] `.kiro/settings/mcp.json` (Playwright MCP)
- [ ] `AGENTS.md` at the root and in `contracts/`
- [ ] README with live URL, screenshots, setup, architecture, Kiro usage summary
- [ ] `docs/kiro-usage.md` with concrete examples and evidence
- [ ] `docs/kiro-evidence/` containing **real** screenshots from the Kiro session (user-supplied)
- [ ] LICENSE (MIT), SECURITY.md, CONTRIBUTING.md
- [ ] `.github/workflows/` deploying to Pages
- [ ] No secrets, no `.env`, no private keys in history

## Evidence rules

1. Never fabricate Kiro screenshots, chat transcripts, or session logs. The human must supply real captures.
2. Every claim in `docs/kiro-usage.md` must point to a file in the repo or to a supplied capture.
3. Do not edit a screenshot to change its content. Crop only.
4. If evidence is missing, say so explicitly in the docs and leave a checklist item open.

## Demo video rules

- Under 3:00 total; aim for 2:30–2:45.
- Capture at 1920×1080, 30 fps, readable text, no browser chrome clutter.
- Show: landing → begin a short vigil → ambience → return screen → seal with local keeper → crypt → CLI verification → optional mint → offline reload.
- Narration or captions must state what Kiro contributed; keep claims verifiable.
- No copyrighted music. Use the app's own ambience or silence.

## Publishing rules

- Do not push, create repositories, enable Pages, tag releases, or post externally without explicit user approval.
- Verify the live URL after deployment, including a hard reload on a subpath and an offline reload.
- Keep `VITE_REPO_URL` aligned with the final repository URL.

## Final audit

- [ ] Fresh clone → `npm ci` → `npm run build` succeeds.
- [ ] `npm test`, `npm run test:e2e`, and the contracts suite pass.
- [ ] Live URL loads over HTTPS, installs as a PWA, and works offline.
- [ ] Video is < 3:00 and publicly accessible.
- [ ] Repo is public and contains `.kiro`.
- [ ] Submission text names the category and links repo, app, and video.
