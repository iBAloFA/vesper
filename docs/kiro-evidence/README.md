# Kiro Evidence

This folder holds real screenshots and short screen recordings from the Kiro session that built Vesper. Nothing here is staged, mocked, or recreated.

## Required shots

| File | What it should show |
| --- | --- |
| `spec-requirements.png` | `.kiro/specs/vigil-core/requirements.md` open in Kiro with EARS-style acceptance criteria visible. |
| `spec-design.png` | The timer state machine or correctness properties in `design.md`. |
| `spec-tasks.png` | `tasks.md` with completed and remaining checkboxes. |
| `steering-panel.png` | The steering list showing always, fileMatch, and manual inclusions. |
| `hooks-panel.png` | The Agent Hooks panel as Kiro renders it: the lifecycle and spec-task hooks all enabled. |
| `hooks-files.png` | The Explorer's `.kiro/hooks/` folder with all eight JSON hook files on disk. |
| `hook-firing.png` | A new Kiro session firing `session-brief`, with the brief's gates in the agent's reply. |
| `guard-block.png` | `guard-secrets` blocking a `.env` read, with the explanation in the transcript. |
| `mcp-config.png` | Playwright MCP enabled in `.kiro/settings/mcp.json`. |
| `browser-verification.png` | Playwright MCP navigating the deployed vigil route and reporting the rendered state. |
| `browser-verification-page.png` | The 1280×720 screenshot the Playwright MCP took during that run. |
| `demo-video-link.md` | Final video URL, duration, and the date captured. |

## Surface notes

- Kiro's Agent Hooks panel lists the hooks that participate in a session's lifecycle and spec-task execution: `guard-secrets` (PreToolUse), `post-compact-reminder` (PostCompact), `session-brief` (SessionStart), and the two PostTaskExec hooks. The FileSave and PromptSubmit hooks are active from `.kiro/hooks/` on their events but are not listed in this panel in Kiro 1.x; `hooks-files.png` records all eight files instead.
- Kiro renders a Run Command Hook card for PreToolUse and SessionStart hooks. FileSave hooks (typecheck and contract tests) ran during the capture without a transcript card, so `hook-firing.png` uses `session-brief`, whose output visibly reached the agent.
- `guard-block.png` is a post-fix run. A live PreToolUse probe showed Kiro sending `tool_name: "execute_pwsh"`, which the original `shell|write` matcher did not match; the guard file now lists the real tool IDs. The probe hook was deleted after the diagnosis.

## Rules

- Capture from the actual Kiro workspace, not a re-creation.
- Include the file tree or tab title so the artifact is identifiable.
- Do not crop out error states or failed hook runs that are part of the story; the documentation should match what happened.
- If a screenshot cannot be produced, record the gap in this file rather than substituting a mock. The submission must not imply evidence that does not exist.

## Adding files

Drop PNGs or MP4s into this folder and reference them from [`docs/kiro-usage.md`](../kiro-usage.md) and the README. Keep each image under ~1 MB where possible; use `pngquant` or `sharp` if needed. Do not add credentials, wallet keys, or private intentions visible in the editor.
