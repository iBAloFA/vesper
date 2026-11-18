export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error("Cannot pick from an empty list");
  }
  return values[Math.floor(rng() * values.length)] as T;
}

export function pickMany<T>(rng: Rng, values: readonly T[], count: number): T[] {
  const pool = [...values];
  const result: T[] = [];
  const total = Math.min(count, pool.length);
  for (let index = 0; index < total; index += 1) {
    const pickIndex = Math.floor(rng() * pool.length);
    result.push(pool.splice(pickIndex, 1)[0] as T);
  }
  return result;
}
