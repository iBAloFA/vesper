import { describe, expect, it } from "vitest";
import { createRng, hashString, pick, pickMany } from "../src/lib/hash";

describe("hashString", () => {
  it("is deterministic and unsigned", () => {
    expect(hashString("vesper")).toBe(hashString("vesper"));
    expect(hashString("vesper")).not.toBe(hashString("Vesper"));
    expect(hashString("")).toBe(2166136261);
    for (const value of ["", "a", "a longer seed", "seal:123"]) {
      const hash = hashString(value);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe("createRng", () => {
  it("produces a repeatable sequence in [0, 1)", () => {
    const first = createRng(42);
    const second = createRng(42);
    for (let index = 0; index < 100; index += 1) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("differs for different seeds", () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe("pick", () => {
  it("returns a member of the list", () => {
    const rng = createRng(7);
    const values = ["a", "b", "c"] as const;
    for (let index = 0; index < 20; index += 1) {
      expect(values).toContain(pick(rng, values));
    }
  });

  it("throws on an empty list", () => {
    expect(() => pick(createRng(1), [])).toThrow("empty");
  });
});

describe("pickMany", () => {
  it("returns unique members and never exceeds the pool", () => {
    const rng = createRng(9);
    const values = ["a", "b", "c", "d"];
    const result = pickMany(rng, values, 3);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(pickMany(rng, values, 99)).toHaveLength(4);
  });
});
