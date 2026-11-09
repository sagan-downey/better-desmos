interface CacheEntry<K, V> {
  key: K;
  value: V;
  previous?: CacheEntry<K, V>;
  next?: CacheEntry<K, V>;
}

export class BoundedCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<K, V>>();
  private oldest?: CacheEntry<K, V>;
  private newest?: CacheEntry<K, V>;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error("Cache capacity must be a positive integer.");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.promote(entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      this.promote(existing);
      return;
    }
    if (this.entries.size >= this.capacity && this.oldest) {
      const evicted = this.oldest;
      this.unlink(evicted);
      this.entries.delete(evicted.key);
    }
    const entry: CacheEntry<K, V> = { key, value };
    this.entries.set(key, entry);
    this.append(entry);
  }

  private unlink(entry: CacheEntry<K, V>): void {
    if (entry.previous) entry.previous.next = entry.next;
    else this.oldest = entry.next;
    if (entry.next) entry.next.previous = entry.previous;
    else this.newest = entry.previous;
    entry.previous = undefined;
    entry.next = undefined;
  }

  private append(entry: CacheEntry<K, V>): void {
    entry.previous = this.newest;
    if (this.newest) this.newest.next = entry;
    else this.oldest = entry;
    this.newest = entry;
  }

  private promote(entry: CacheEntry<K, V>): void {
    if (entry !== this.newest) {
      this.unlink(entry);
      this.append(entry);
    }
  }
}

export function referencedVariableSignature(
  source: string,
  variables: Record<string, number>,
): string {
  const names = new Set(
    (source.match(/[a-zA-Z]+(?:_[a-zA-Z0-9]+)?/g) ?? []).map((name) => name.toLowerCase()),
  );
  return JSON.stringify(Object.keys(variables).filter((name) => names.has(name)).sort()
    .map((name) => [name, Object.is(variables[name], -0) ? "-0" : String(variables[name])]));
}

export interface IndexedCurve {
  segments: number[];
  hoverPoint?: (x: number, y: number) => { x: number; y: number };
}

export function refinementLevels(width: number, height: number, dpr: number): number[] {
  if (![width, height, dpr].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Refinement requires positive finite viewport dimensions and pixel ratio.");
  }
  return [1.5, 2, 3, 4].filter((factor) =>
    Math.round(width * dpr * factor) * Math.round(height * dpr * factor) <= 16_000_000);
}

export function tangentBranchRange(slope: number, offset: number, min: number, max: number) {
  if (![slope, offset, min, max].every(Number.isFinite) || slope === 0) {
    throw new Error("Tangent branches require finite bounds and a nonzero finite slope.");
  }
  const first = Math.ceil((Math.min(slope * min, slope * max) + offset - Math.PI / 2) / Math.PI);
  const last = Math.floor((Math.max(slope * min, slope * max) + offset + Math.PI / 2) / Math.PI);
  return { first, last };
}

export function tangentPixelCoverage(period: number, lineWidth: number, opacity: number): number {
  if (!Number.isFinite(period) || period < 0 || !Number.isFinite(lineWidth) || lineWidth <= 0 ||
      !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error("Tangent coverage requires valid spacing, line width, and opacity.");
  }
  return opacity * (period === 0 ? 1 : Math.min(1, lineWidth / period));
}

export function selectHoverPoint<C extends IndexedCurve>(
  candidates: Iterable<{ curve: C; offset: number }>,
  x: number,
  y: number,
  priority: (curve: C) => number,
): { curve: C; x: number; y: number; distance: number } | undefined {
  let nearest: { curve: C; x: number; y: number; distance: number } | undefined;
  let nearestPriority = Infinity;
  for (const { curve, offset } of candidates) {
    const rank = priority(curve);
    if (rank === Infinity || rank > nearestPriority) continue;
    const projected = offset === -1 ? curve.hoverPoint?.(x, y) : undefined;
    const x1 = projected?.x ?? curve.segments[offset]!;
    const y1 = projected?.y ?? curve.segments[offset + 1]!;
    if (projected) {
      const distance = Math.hypot(x - x1, y - y1);
      if (distance <= 10 &&
          (!nearest || rank < nearestPriority || distance < nearest.distance)) {
        nearest = { curve, x: x1, y: y1, distance };
        nearestPriority = rank;
      }
      continue;
    }
    const dx = curve.segments[offset + 2]! - x1;
    const dy = curve.segments[offset + 3]! - y1;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
    const nearestX = x1 + fraction * dx;
    const nearestY = y1 + fraction * dy;
    const distance = Math.hypot(x - nearestX, y - nearestY);
    if (distance <= 10 &&
        (!nearest || rank < nearestPriority || distance < nearest.distance)) {
      nearest = { curve, x: nearestX, y: nearestY, distance };
      nearestPriority = rank;
    }
  }
  return nearest;
}

interface SegmentReference<C> {
  curve: C;
  offset: number;
  order: number;
}

export class SegmentIndex<C extends IndexedCurve> {
  private readonly buckets = new Map<string, SegmentReference<C>[]>();
  private readonly oversized: SegmentReference<C>[] = [];

  constructor(curves: C[], readonly cellSize = 64) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error("Segment index cell size must be positive and finite.");
    }
    let order = 0;
    for (const curve of curves) {
      if (curve.hoverPoint) this.oversized.push({ curve, offset: -1, order: order++ });
      for (let offset = 0; offset < curve.segments.length; offset += 4) {
        const x1 = curve.segments[offset];
        const y1 = curve.segments[offset + 1];
        const x2 = curve.segments[offset + 2];
        const y2 = curve.segments[offset + 3];
        if (![x1, y1, x2, y2].every((value) => value !== undefined && Number.isFinite(value))) {
          throw new Error("Segment coordinates must be finite.");
        }
        const startColumn = Math.floor(Math.min(x1!, x2!) / cellSize);
        const endColumn = Math.floor(Math.max(x1!, x2!) / cellSize);
        const startRow = Math.floor(Math.min(y1!, y2!) / cellSize);
        const endRow = Math.floor(Math.max(y1!, y2!) / cellSize);
        const reference = { curve, offset, order: order++ };
        if (![startColumn, endColumn, startRow, endRow].every(Number.isSafeInteger) ||
            (endColumn - startColumn + 1) * (endRow - startRow + 1) > 256) {
          this.oversized.push(reference);
          continue;
        }
        for (let row = startRow; row <= endRow; row += 1) {
          for (let column = startColumn; column <= endColumn; column += 1) {
            const key = `${column}:${row}`;
            const bucket = this.buckets.get(key);
            if (bucket) bucket.push(reference);
            else this.buckets.set(key, [reference]);
          }
        }
      }
    }
  }

  nearby(x: number, y: number, radius: number): SegmentReference<C>[] {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) {
      throw new Error("Segment query requires finite coordinates and a nonnegative finite radius.");
    }
    const matches = new Set(this.oversized);
    const startColumn = Math.floor((x - radius) / this.cellSize);
    const endColumn = Math.floor((x + radius) / this.cellSize);
    const startRow = Math.floor((y - radius) / this.cellSize);
    const endRow = Math.floor((y + radius) / this.cellSize);
    if (![startColumn, endColumn, startRow, endRow].every(Number.isSafeInteger) ||
        (endColumn - startColumn + 1) * (endRow - startRow + 1) > 256) {
      for (const bucket of this.buckets.values()) {
        for (const reference of bucket) matches.add(reference);
      }
      return [...matches].sort((left, right) => left.order - right.order);
    }
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        for (const reference of this.buckets.get(`${column}:${row}`) ?? []) {
          matches.add(reference);
        }
      }
    }
    return [...matches].sort((left, right) => left.order - right.order);
  }
}
