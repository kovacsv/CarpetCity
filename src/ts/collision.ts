import { mod } from './geometry';

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  /** Half extents along the box's local x and z axes. */
  hw: number;
  hd: number;
  rot: number;
  /** Vertical extent of the obstacle (used for camera occlusion). */
  bottom?: number;
  top?: number;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  bottom?: number;
  top?: number;
}

export type Collider = BoxCollider | CircleCollider;

export interface Contact {
  /** Push-out direction (unit vector) and penetration depth. */
  nx: number;
  nz: number;
  depth: number;
}

/**
 * Colliders of a single tile, in world units relative to the tile origin. The world is an infinite
 * repetition of the tile, so queries are wrapped into tile space first.
 */
export class TiledColliders {
  private readonly items: { c: Collider; bound: number }[] = [];

  constructor(private readonly tileW: number, private readonly tileH: number) {}

  add(c: Collider): void {
    const bound = c.kind === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    this.items.push({ c, bound });
  }

  get count(): number {
    return this.items.length;
  }

  /** True if a probe of radius r at (x, y, z) comes within r (horizontally) / vMargin (vertically) of an obstacle. */
  occludes(x: number, y: number, z: number, r: number, vMargin = r): boolean {
    const lx = mod(x, this.tileW);
    const lz = mod(z, this.tileH);
    for (const ox of [-this.tileW, 0, this.tileW]) {
      for (const oz of [-this.tileH, 0, this.tileH]) {
        const px = lx - ox;
        const pz = lz - oz;
        for (const { c, bound } of this.items) {
          if (y - vMargin > (c.top ?? Infinity) || y + vMargin < (c.bottom ?? 0)) continue;
          const dx = px - c.x;
          const dz = pz - c.z;
          const reach = bound + r;
          if (dx * dx + dz * dz > reach * reach) continue;
          if (c.kind === 'circle' ? circleVsCircle(dx, dz, r, c.r) : circleVsBox(dx, dz, r, c)) return true;
        }
      }
    }
    return false;
  }

  /** Finds the deepest contact between a circle at world position (x, z) and any collider. */
  collideCircle(x: number, z: number, r: number): Contact | null {
    const lx = mod(x, this.tileW);
    const lz = mod(z, this.tileH);
    let best: Contact | null = null;
    for (const ox of [-this.tileW, 0, this.tileW]) {
      for (const oz of [-this.tileH, 0, this.tileH]) {
        const px = lx - ox;
        const pz = lz - oz;
        for (const { c, bound } of this.items) {
          const dx = px - c.x;
          const dz = pz - c.z;
          const reach = bound + r;
          if (dx * dx + dz * dz > reach * reach) continue;
          const contact = c.kind === 'circle' ? circleVsCircle(dx, dz, r, c.r) : circleVsBox(dx, dz, r, c);
          if (contact && (!best || contact.depth > best.depth)) best = contact;
        }
      }
    }
    return best;
  }
}

function circleVsCircle(dx: number, dz: number, r: number, cr: number): Contact | null {
  const d = Math.hypot(dx, dz);
  const depth = r + cr - d;
  if (depth <= 0) return null;
  if (d < 1e-6) return { nx: 1, nz: 0, depth };
  return { nx: dx / d, nz: dz / d, depth };
}

function circleVsBox(dx: number, dz: number, r: number, b: BoxCollider): Contact | null {
  // Transform the circle centre into the box's local frame.
  const cos = Math.cos(b.rot);
  const sin = Math.sin(b.rot);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const cx = Math.max(-b.hw, Math.min(b.hw, lx));
  const cz = Math.max(-b.hd, Math.min(b.hd, lz));
  let nx = lx - cx;
  let nz = lz - cz;
  const dist = Math.hypot(nx, nz);
  let depth: number;
  if (dist > 1e-6) {
    depth = r - dist;
    if (depth <= 0) return null;
    nx /= dist;
    nz /= dist;
  } else {
    // Centre is inside the box: push out through the nearest face.
    const px = b.hw - Math.abs(lx);
    const pz = b.hd - Math.abs(lz);
    if (px < pz) {
      nx = Math.sign(lx) || 1;
      nz = 0;
      depth = px + r;
    } else {
      nx = 0;
      nz = Math.sign(lz) || 1;
      depth = pz + r;
    }
  }
  // Rotate the normal back to world space.
  return { nx: nx * cos + nz * sin, nz: -nx * sin + nz * cos, depth };
}
