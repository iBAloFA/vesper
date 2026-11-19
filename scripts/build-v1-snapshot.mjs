// Copies a built v0.1 dist into public/v1 as the frozen Kiroween archive.
// Usage: node scripts/build-v1-snapshot.mjs <path-to-v1-dist>
// The v0.1 build must be produced from the entry commit (07dccef) with its
// three storage keys suffixed ".archive" so the two builds never rewrite each
// other's vault; see README, "The v0.1 archive".
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-v1-snapshot.mjs <path-to-v1-dist>");
  process.exit(1);
}
const DEST = join(root, "public", "v1");

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(resolve(src), DEST, {
  recursive: true,
  filter: (source) => !source.endsWith(".map") && !source.endsWith("robots.txt"),
});

writeFileSync(
  join(DEST, "sw.js"),
  `// The v0.1 archive ships without offline support: v0.1's cache name ("vesper-v5")
// is shared with the live build, and the two workers would evict each other.
// This worker exists so the live site's service worker does not answer /v1/
// navigations offline with the v0.2 shell. It does nothing else.
`,
  "utf8",
);

const badge = `    <a class="v1-archive-badge" href="../" aria-label="Open the current version of Vesper"
      title="A frozen copy of the Kiroween entry build. It keeps its own records.">
      v0.1 archive · open the current version <span aria-hidden="true">→</span>
    </a>
    <style>
      .v1-archive-badge {
        position: fixed;
        right: 16px;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border: 1px solid rgba(214, 204, 178, 0.35);
        border-radius: 999px;
        background: rgba(7, 7, 11, 0.92);
        color: #e8e0cc;
        font: 500 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0.06em;
        text-decoration: none;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      }
      .v1-archive-badge:hover,
      .v1-archive-badge:focus-visible {
        border-color: rgba(214, 204, 178, 0.7);
        outline: 2px solid rgba(214, 204, 178, 0.5);
        outline-offset: 2px;
      }
      @media (max-width: 640px) {
        .v1-archive-badge {
          right: 12px;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          font-size: 11px;
        }
      }
      @media (prefers-reduced-motion: no-preference) {
        .v1-archive-badge { transition: border-color 0.2s ease; }
      }
    </style>
`;

const indexPath = join(DEST, "index.html");
const html = readFileSync(indexPath, "utf8");
if (!html.includes("</body>")) throw new Error("The built index.html has no </body>.");
writeFileSync(indexPath, html.replace("</body>", `${badge}  </body>`), "utf8");

function size(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name);
    return total + (entry.isDirectory() ? size(path) : statSync(path).size);
  }, 0);
}
console.log(`snapshot written to ${DEST}: ${(size(DEST) / 1024 / 1024).toFixed(2)} MiB`);
