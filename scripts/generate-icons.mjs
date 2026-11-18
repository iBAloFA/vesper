import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
await mkdir(iconsDir, { recursive: true });

const sigil = (scale = 1) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <circle cx="32" cy="32" r="26" fill="none" stroke="#e08a4b" stroke-opacity=".5" stroke-width=".8"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="#e9e2d0" stroke-opacity=".2" stroke-width=".6" stroke-dasharray="2 5"/>
    <circle cx="32" cy="32" r="16" fill="none" stroke="#e9e2d0" stroke-opacity=".14" stroke-width=".5" stroke-dasharray="1 7"/>
    <g stroke="#e9e2d0" stroke-opacity=".28" stroke-width=".6">
      <path d="M32 6v4M32 54v4M6 32h4M54 32h4"/>
      <path d="M13.6 13.6l2.2 2.2M48.2 48.2l2.2 2.2M13.6 50.4l2.2-2.2M48.2 15.8l2.2-2.2" stroke-opacity=".18"/>
    </g>
    <circle cx="45.5" cy="24.5" r="1.5" fill="#e08a4b" opacity=".8"/>
    <circle cx="19.8" cy="38.4" r="1.1" fill="#e9e2d0" opacity=".55"/>
  </g>`;

const candle = `
  <circle cx="32" cy="31" r="18" fill="url(#glow)" opacity=".5"/>
  <path d="M28.6 43.5h6.8v8.6a1.7 1.7 0 0 1-1.7 1.7h-3.4a1.7 1.7 0 0 1-1.7-1.7z" fill="#d9c6a6"/>
  <path d="M28.6 43.5h6.8v2h-6.8z" fill="#f1e2c6"/>
  <path d="M32 34.2c2 2.2 3 3.9 3 5.4a3 3 0 1 1-6 0c0-1.5 1-3.2 3-5.4z" fill="#e08a4b"/>
  <path d="M32 36.6c.9 1.1 1.4 1.9 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.8.5-1.6 1.4-2.7z" fill="#ffe2b5"/>`;

const iconSvg = ({ maskable = false } = {}) => {
  const inset = maskable ? 10 : 0;
  const size = 64 + inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-inset} ${-inset} ${size} ${size}" width="${size * 8}" height="${size * 8}">
    <defs>
      <radialGradient id="warm" cx="50%" cy="47%" r="55%">
        <stop offset="0%" stop-color="#120d15"/>
        <stop offset="60%" stop-color="#0a0810"/>
        <stop offset="100%" stop-color="#07060b"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e08a4b" stop-opacity=".5"/>
        <stop offset="55%" stop-color="#e08a4b" stop-opacity=".16"/>
        <stop offset="100%" stop-color="#e08a4b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="${-inset}" y="${-inset}" width="${size}" height="${size}" fill="#07060b"/>
    <rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="url(#warm)"/>
    ${sigil(maskable ? 0.86 : 1)}
    ${candle}
  </svg>`;
};

const render = async (svg, file, size) => {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(`wrote ${file}`);
};

await render(iconSvg(), join(iconsDir, "icon-192.png"), 192);
await render(iconSvg(), join(iconsDir, "icon-512.png"), 512);
await render(iconSvg({ maskable: true }), join(iconsDir, "icon-maskable-512.png"), 512);
await render(iconSvg(), join(iconsDir, "apple-touch-icon.png"), 180);

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="72%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#1b1019"/>
      <stop offset="48%" stop-color="#0c0910"/>
      <stop offset="100%" stop-color="#060509"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e08a4b" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#e08a4b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" x2="1">
      <stop offset="0%" stop-color="#e08a4b"/>
      <stop offset="100%" stop-color="#e08a4b" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(905 315)">
    <circle r="230" fill="url(#glow)" opacity=".16"/>
    <g fill="none">
      <circle r="196" stroke="#e08a4b" stroke-opacity=".34" stroke-width="1.2"/>
      <circle r="160" stroke="#e9e2d0" stroke-opacity=".2" stroke-width="1" stroke-dasharray="3 12"/>
      <circle r="122" stroke="#e9e2d0" stroke-opacity=".14" stroke-width="1" stroke-dasharray="1 9"/>
      <circle r="84" stroke="#8a7fbd" stroke-opacity=".22" stroke-width="1" stroke-dasharray="8 10"/>
      <g stroke="#e9e2d0" stroke-opacity=".22" stroke-width="1">
        <path d="M0 -196v-14M0 196v14M-196 0h-14M196 0h14"/>
        <path d="M-138.6 -138.6l-10 -10M138.6 138.6l10 10M-138.6 138.6l-10 10M138.6 -138.6l10 -10"/>
      </g>
    </g>
    <circle cx="112" cy="-118" r="5" fill="#e08a4b"/>
    <circle cx="-138" cy="84" r="4" fill="#e9e2d0" opacity=".7"/>
    <circle cx="52" cy="158" r="3" fill="#8a7fbd" opacity=".8"/>
    <g transform="translate(0 34)">
      <rect x="-26" y="-46" width="52" height="124" rx="7" fill="#d9c6a6"/>
      <rect x="-26" y="-46" width="52" height="12" rx="4" fill="#f1e2c6"/>
      <path d="M0 -92c16 18 24 32 24 43a24 24 0 1 1-48 0c0-11 8-25 24-43z" fill="#e08a4b"/>
      <path d="M0 -74c7 8 11 15 11 21a11 11 0 0 1-22 0c0-6 4-13 11-21z" fill="#ffe2b5"/>
      <circle cy="-56" r="64" fill="url(#glow)" opacity=".28"/>
    </g>
  </g>
  <g font-family="Georgia, 'Times New Roman', serif">
    <text x="96" y="196" fill="#a09aab" font-family="Inter, Segoe UI, sans-serif" font-size="17" letter-spacing="7">A HAUNTED FOCUS RITUAL</text>
    <text x="92" y="322" fill="#f8f2e6" font-size="104" letter-spacing="10">VESPER</text>
    <text x="96" y="394" fill="#c9bea9" font-size="34" font-style="italic">Keep a vigil. Leave a sigil.</text>
    <rect x="96" y="442" width="330" height="2" fill="url(#rule)"/>
    <text x="96" y="502" fill="#a09aab" font-family="Inter, Segoe UI, sans-serif" font-size="16" letter-spacing="4">PROOF OF FOCUS · KIROWEEN 2026</text>
  </g>
</svg>`;

await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(join(root, "public", "og.png"));
console.log("wrote public/og.png");
