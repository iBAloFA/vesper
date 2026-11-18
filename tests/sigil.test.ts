import { describe, expect, it } from "vitest";
import { buildSigil, sigilSvg } from "../src/lib/sigil";

describe("buildSigil", () => {
  it("is deterministic for a seed", () => {
    expect(buildSigil("vesper-genesis")).toEqual(buildSigil("vesper-genesis"));
  });

  it("produces the documented structure", () => {
    const sigil = buildSigil("a seed");
    expect(sigil.rings).toHaveLength(4);
    expect(sigil.lines.length).toBeGreaterThanOrEqual(24);
    expect(sigil.lines.length).toBeLessThanOrEqual(36);
    expect(sigil.dots.length).toBeGreaterThanOrEqual(4);
    expect(sigil.dots.length).toBeLessThanOrEqual(7);
    expect(sigil.colors[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(sigil.colors[1]).toMatch(/^#[0-9a-f]{6}$/);
    expect(sigil.colors[0]).not.toBe(sigil.colors[1]);
    expect(sigil.centerRotation).toBeGreaterThanOrEqual(0);
    expect(sigil.centerRotation).toBeLessThan(360);
    expect(sigil.rings.map((ring) => ring.radius)).toEqual([88, 72, 56, 40]);
  });

  it("keeps every coordinate finite and inside the viewBox", () => {
    for (const seed of ["one", "two", "three", "four", "seal:123:456"]) {
      const sigil = buildSigil(seed);
      for (const line of sigil.lines) {
        expect(Number.isFinite(line.x1)).toBe(true);
        expect(line.x1).toBeGreaterThanOrEqual(0);
        expect(line.x1).toBeLessThanOrEqual(200);
        expect(line.y1).toBeGreaterThanOrEqual(0);
        expect(line.y1).toBeLessThanOrEqual(200);
      }
      for (const dot of sigil.dots) {
        expect(dot.cx).toBeGreaterThanOrEqual(0);
        expect(dot.cx).toBeLessThanOrEqual(200);
        expect(dot.r).toBeGreaterThan(0);
      }
    }
  });
});

describe("sigilSvg", () => {
  it("renders a self-contained SVG at the requested size", () => {
    const svg = sigilSvg("vesper-genesis", 320);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="320"');
    expect(svg).toContain('viewBox="0 0 200 200"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Vesper sigil");
    expect(svg).not.toContain("undefined");
    expect(svg).not.toContain("NaN");
  });

  it("is stable across calls", () => {
    expect(sigilSvg("stable")).toBe(sigilSvg("stable"));
  });
});
