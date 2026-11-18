import { describe, expect, it } from "vitest";
import { ambienceLabel, composeTransmission } from "../src/lib/transmissions";

const INPUT = {
  id: "vigil-1",
  seal: "0x" + "ab".repeat(32),
  intention: "Finish the chapter",
  minutes: 25,
  ambience: "hollow" as const,
  completed: true,
  startedAt: 1_767_000_000_000,
};

describe("composeTransmission", () => {
  it("is deterministic for the same vigil", () => {
    expect(composeTransmission(INPUT)).toBe(composeTransmission(INPUT));
  });

  it("returns a short passage", () => {
    const text = composeTransmission(INPUT);
    expect(text.length).toBeGreaterThan(20);
    expect(text.length).toBeLessThan(800);
    expect(text.trim()).toBe(text);
    expect(text.endsWith(".")).toBe(true);
  });

  it("varies with the seal and outcome", () => {
    const base = composeTransmission(INPUT);
    expect(composeTransmission({ ...INPUT, seal: "0x" + "cd".repeat(32) })).not.toBe(base);
    expect(composeTransmission({ ...INPUT, completed: false })).not.toBe(base);
  });

  it("never prints malformed minute labels", () => {
    for (let minutes = 1; minutes <= 5; minutes += 1) {
      expect(composeTransmission({ ...INPUT, minutes })).not.toContain("1 minutes");
    }
  });
});

describe("ambienceLabel", () => {
  it("returns the preset name", () => {
    expect(ambienceLabel("hollow")).toBe("The Hollow");
    expect(ambienceLabel("chapel")).toBe("Vigil Chapel");
    expect(ambienceLabel("still")).toBe("Still Air");
  });
});
