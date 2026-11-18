import { createRng, hashString } from "./hash";

const PALETTE = ["#e58a4b", "#e9e2d0", "#9a93ad", "#6d8b76", "#b05466"] as const;

export interface SigilRing {
  radius: number;
  dash: string;
  rotation: number;
  opacity: number;
  width: number;
}

export interface SigilLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  width: number;
}

export interface SigilDot {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

export interface SigilGeometry {
  rings: SigilRing[];
  lines: SigilLine[];
  dots: SigilDot[];
  colors: [string, string];
  centerRotation: number;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function pointOnCircle(radius: number, angleDegrees: number): { x: number; y: number } {
  const angle = (angleDegrees * Math.PI) / 180;
  return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius };
}

export function buildSigil(seed: string): SigilGeometry {
  const rng = createRng(hashString(seed));
  const first = Math.floor(rng() * PALETTE.length);
  let second = Math.floor(rng() * PALETTE.length);
  if (second === first) second = (second + 1) % PALETTE.length;
  const colors: [string, string] = [PALETTE[first], PALETTE[second]];

  const rings: SigilRing[] = [88, 72, 56, 40].map((radius) => ({
    radius,
    dash: `${round(1.5 + rng() * 16)} ${round(3 + rng() * 14)}`,
    rotation: round(rng() * 360),
    opacity: round(0.32 + rng() * 0.55),
    width: round(0.6 + rng() * 1.1),
  }));

  const lines: SigilLine[] = [];
  const tickCount = 24 + Math.floor(rng() * 13);
  for (let index = 0; index < tickCount; index += 1) {
    const angle = (index / tickCount) * 360 + rng() * 2;
    const inner = 92;
    const outer = 92 - (3 + rng() * 7);
    const start = pointOnCircle(inner, angle);
    const end = pointOnCircle(outer, angle);
    lines.push({
      x1: round(start.x),
      y1: round(start.y),
      x2: round(end.x),
      y2: round(end.y),
      opacity: round(0.2 + rng() * 0.55),
      width: round(0.5 + rng() * 0.9),
    });
  }

  const dots: SigilDot[] = [];
  const dotCount = 4 + Math.floor(rng() * 4);
  for (let index = 0; index < dotCount; index += 1) {
    const angle = rng() * 360;
    const radius = 18 + rng() * 64;
    const point = pointOnCircle(radius, angle);
    dots.push({
      cx: round(point.x),
      cy: round(point.y),
      r: round(0.9 + rng() * 1.8),
      opacity: round(0.4 + rng() * 0.5),
    });
  }

  return {
    rings,
    lines,
    dots,
    colors,
    centerRotation: round(rng() * 360),
  };
}

export function sigilSvg(seed: string, size = 200): string {
  const geometry = buildSigil(seed);
  const rings = geometry.rings
    .map(
      (ring) =>
        `<circle cx="100" cy="100" r="${ring.radius}" stroke="${geometry.colors[0]}" stroke-width="${ring.width}" stroke-dasharray="${ring.dash}" opacity="${ring.opacity}" transform="rotate(${ring.rotation} 100 100)" />`,
    )
    .join("");
  const lines = geometry.lines
    .map(
      (line) =>
        `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${geometry.colors[1]}" stroke-width="${line.width}" opacity="${line.opacity}" />`,
    )
    .join("");
  const dots = geometry.dots
    .map(
      (dot) =>
        `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${geometry.colors[1]}" opacity="${dot.opacity}" />`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="Vesper sigil"><title>Vesper sigil</title><g fill="none" stroke-linecap="round">${rings}${lines}</g>${dots}<g transform="rotate(${geometry.centerRotation} 100 100)" stroke="${geometry.colors[0]}" stroke-linecap="round"><circle cx="100" cy="100" r="13" fill="none" opacity="0.7" stroke-width="1.2" /><path d="M100 76 L100 124" opacity="0.6" stroke-width="1" /><path d="M84 100 L116 100" opacity="0.35" stroke-width="0.7" /></g></svg>`;
}
