# Kiro Evidence

This folder holds real screenshots and short screen recordings from the Kiro session that built Vesper. Nothing here is staged, mocked, or recreated.

## Required shots

| File | What it should show |
| --- | --- |
| `spec-requirements.png` | `.kiro/specs/vigil-core/requirements.md` open in Kiro with EARS-style acceptance criteria visible. |
| `spec-design.png` | The timer state machine or correctness properties in `design.md`. |
| `spec-tasks.png` | `tasks.md` with completed and remaining checkboxes. |
| `steering-panel.png` | The steering list showing always, fileMatch, and manual inclusions. |
| `hooks-panel.png` | The eight hooks from `.kiro/hooks/` listed in the Agent Hooks panel. |
| `hook-firing.png` | A save or spec task triggering `typecheck-on-save` or `spec-task-verify`, with the result visible. |
| `guard-block.png` | `guard-secrets` blocking a `.env` write or a push, with the explanation in the transcript. |
| `mcp-config.png` | Playwright MCP enabled in `.kiro/settings/mcp.json`. |
| `browser-verification.png` | Playwright MCP verifying the ritual or crypt in the browser. |
| `demo-video-link.md` | Final video URL, duration, and the date captured. |

## Rules

- Capture from the actual Kiro workspace, not a re-creation.
- Include the file tree or tab title so the artifact is identifiable.
- Do not crop out error states or failed hook runs that are part of the story; the documentation should match what happened.
- If a screenshot cannot be produced, record the gap in this file rather than substituting a mock. The submission must not imply evidence that does not exist.

## Adding files

Drop PNGs or MP4s into this folder and reference them from [`docs/kiro-usage.md`](../kiro-usage.md) and the README. Keep each image under ~1 MB where possible; use `pngquant` or `sharp` if needed. Do not add credentials, wallet keys, or private intentions visible in the editor.
