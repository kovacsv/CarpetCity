import type { Point } from './layout';

/** Positive modulo. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Shortest signed difference between two coordinates on a ring of length n. */
export function wrapDelta(a: number, b: number, n: number): number {
  let d = mod(a - b, n);
  if (d > n / 2) d -= n;
  return d;
}

/**
 * Samples a Catmull-Rom spline through the given points. Open curves keep their end points;
 * closed curves wrap around.
 */
export function sampleSpline(points: Point[], closed = false, step = 4): Point[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const out: Point[] = [];
  const get = (i: number): Point => {
    if (closed) return points[mod(i, n)];
    if (i < 0) {
      const [a, b] = [points[0], points[1]];
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    if (i >= n) {
      const [a, b] = [points[n - 1], points[n - 2]];
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return points[i];
  };
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Distance from point p to segment ab. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolyline(px: number, py: number, line: Point[], closed = false): number {
  let best = Infinity;
  const n = line.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = line[i];
    const b = line[(i + 1) % n];
    const d = distToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Splits a polyline into full-length dashes, omitting a short trailing remainder. */
export function fullDashes(line: Point[], length: number, gap: number): Point[][] {
  const result: Point[][] = [];
  let distance = 0;
  let nextStart = 0;
  let dash: Point[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const segmentLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segmentLength === 0) continue;
    const end = distance + segmentLength;
    const at = (d: number): Point => {
      const t = (d - distance) / segmentLength;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    while (nextStart < end) {
      if (dash.length === 0) dash.push(at(nextStart));
      const dashEnd = nextStart + length;
      dash.push(at(Math.min(dashEnd, end)));
      if (dashEnd > end) break;
      result.push(dash);
      dash = [];
      nextStart += length + gap;
    }
    distance = end;
  }
  return result;
}

/** Index of the polyline vertex closest to (x, y) together with the local direction there. */
export function nearestOnPolyline(line: Point[], x: number, y: number): { index: number; angle: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = (line[i][0] - x) ** 2 + (line[i][1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const a = line[Math.max(0, best - 1)];
  const b = line[Math.min(line.length - 1, best + 1)];
  return { index: best, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Small deterministic PRNG (mulberry32) so the generated world is identical on every load. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
