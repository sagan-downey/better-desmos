export const RANDOM_NAMES = ["random", "shuffle"] as const;
let seed = 1;

export function setRandomSeed(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error("Random seed must be a 32-bit unsigned integer.");
  seed = value;
}
export function getRandomSeed(): number { return seed; }
export function randomKey(source: string): number {
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) value = Math.imul(value ^ source.charCodeAt(index), 16777619) >>> 0;
  return value;
}

export function randomGenerator(key: string): () => number {
  let state = seed;
  for (let index = 0; index < key.length; index += 1) state = Math.imul(state ^ key.charCodeAt(index), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function sampleCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2048) throw new Error("Random sample size must be an integer from 1 to 2048.");
  return value;
}
