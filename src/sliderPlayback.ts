export const PLAYBACK_MODES = ["bounce", "repeat", "once", "continuous"] as const;
export type PlaybackMode = typeof PLAYBACK_MODES[number];
export function advanceSlider(
  value: number, direction: 1 | -1, elapsed: number,
  options: { min: number; max: number; speed: number; mode?: PlaybackMode },
): { value: number; direction: 1 | -1; complete: boolean } {
  const { min, max, speed } = options, mode = options.mode ?? "bounce";
  if (![value, elapsed, min, max, speed].every(Number.isFinite) || elapsed < 0 || min >= max || speed <= 0 ||
      !PLAYBACK_MODES.includes(mode)) throw new Error("Invalid slider playback settings.");
  const span = max - min, distance = speed * elapsed;
  if (mode === "continuous") {
    const next = value + distance;
    if (!Number.isFinite(next)) throw new Error("Slider playback exceeded the finite numeric range.");
    return { value: next, direction: 1, complete: false };
  }
  if (mode === "once") return { value: Math.min(max, value + distance), direction: 1, complete: value + distance >= max };
  if (mode === "repeat") return { value: min + ((value - min + distance) % span + span) % span, direction: 1, complete: false };
  const phase = direction > 0 ? value - min : 2 * span - (value - min);
  const next = ((phase + distance) % (2 * span) + 2 * span) % (2 * span);
  return { value: min + (next <= span ? next : 2 * span - next), direction: next < span ? 1 : -1, complete: false };
}
