import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Accumulates many small primitives (boxes, cylinders, ...) into a single vertex-coloured geometry.
 * Everything in a carpet tile is merged this way so a whole tile renders in a couple of draw calls.
 */
export class PartBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private origin = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  /** Sets the transform applied to all subsequently added parts (position on the ground + heading). */
  setOrigin(x: number, z: number, rotY = 0, y = 0): void {
    this.origin.makeRotationY(rotY).setPosition(x, y, z);
  }

  getOrigin(): THREE.Matrix4 {
    return this.origin.clone();
  }

  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, local?: THREE.Matrix4): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    this.tmp.copy(this.origin);
    if (local) this.tmp.multiply(local);
    g.applyMatrix4(this.tmp);
    this.color.set(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.color.r;
      colors[i * 3 + 1] = this.color.g;
      colors[i * 3 + 2] = this.color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), color, local(x, y, z, rotY));
  }

  /** Box whose bottom sits at height y. */
  block(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0): void {
    this.box(x, y + h / 2, z, w, h, d, color, rotY);
  }

  cylinder(x: number, y: number, z: number, rTop: number, rBottom: number, h: number, color: THREE.ColorRepresentation, segments = 12): void {
    this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments), color, local(x, y + h / 2, z));
  }

  /** Horizontal cylinder along the local x axis (wheels, fuselages). */
  cylinderX(x: number, y: number, z: number, r: number, length: number, color: THREE.ColorRepresentation, segments = 12): void {
    const m = local(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    this.add(new THREE.CylinderGeometry(r, r, length, segments), color, m);
  }

  /** Horizontal cylinder along the local z axis. */
  cylinderZ(x: number, y: number, z: number, rFront: number, rBack: number, length: number, color: THREE.ColorRepresentation, segments = 12): void {
    const m = local(x, y, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.add(new THREE.CylinderGeometry(rFront, rBack, length, segments), color, m);
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, segments = 12, rotY = 0): void {
    this.add(new THREE.ConeGeometry(r, h, segments), color, local(x, y + h / 2, z, rotY));
  }

  sphere(x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, sx = 1, sy = 1, sz = 1, detail = 1): void {
    const m = local(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
    this.add(new THREE.IcosahedronGeometry(r, detail), color, m);
  }

  /** Gable roof: triangular prism with the ridge running along the local x axis. */
  gable(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0): void {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    // Extrusion runs along +z; rotate so the ridge runs along x and centre it.
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    this.add(g, color, local(x, y, z, rotY));
  }

  /** Four-sided pyramid roof. */
  pyramid(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation): void {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    g.rotateY(Math.PI / 4);
    g.scale(w, h, d);
    this.add(g, color, local(x, y + h / 2, z));
  }

  isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Failed to merge geometry');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

export function local(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
}

interface AtlasEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * A canvas texture atlas for signs and roof markings. Quads that reference atlas regions are merged
 * into a single textured geometry.
 */
export class SignAtlas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly entries = new Map<string, AtlasEntry>();
  private cursorX = 0;
  private cursorY = 0;
  private rowH = 0;
  private parts: THREE.BufferGeometry[] = [];
  private origin = new THREE.Matrix4();

  constructor(size = 2048) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;
  }

  /** Registers a drawing in the atlas. `draw` receives a context translated to the region origin. */
  define(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const pad = 4;
    if (this.cursorX + w + pad > this.canvas.width) {
      this.cursorX = 0;
      this.cursorY += this.rowH + pad;
      this.rowH = 0;
    }
    if (this.cursorY + h > this.canvas.height) throw new Error('Sign atlas is full');
    const x = this.cursorX;
    const y = this.cursorY;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.beginPath();
    this.ctx.rect(0, 0, w, h);
    this.ctx.clip();
    draw(this.ctx, w, h);
    this.ctx.restore();
    const S = this.canvas.width;
    // Inset by half a texel to avoid bleeding from neighbouring regions.
    this.entries.set(key, { u0: (x + 0.5) / S, u1: (x + w - 0.5) / S, v0: 1 - (y + h - 0.5) / S, v1: 1 - (y + 0.5) / S });
    this.cursorX += w + pad;
    this.rowH = Math.max(this.rowH, h);
  }

  setOrigin(origin: THREE.Matrix4): void {
    this.origin = origin;
  }

  /**
   * Adds a quad showing the atlas entry `key`. By default the quad stands upright facing +z;
   * set `flat` to lay it on a horizontal surface (its top edge pointing to -z).
   */
  quad(key: string, x: number, y: number, z: number, w: number, h: number, rotY = 0, flat = false): void {
    const e = this.entries.get(key);
    if (!e) throw new Error(`Unknown sign ${key}`);
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) === 0 ? e.u0 : e.u1, uv.getY(i) === 0 ? e.v0 : e.v1);
    }
    if (flat) g.rotateX(-Math.PI / 2);
    const m = this.origin.clone().multiply(local(x, y, z, rotY));
    const ng = g.toNonIndexed();
    g.dispose();
    ng.applyMatrix4(m);
    this.parts.push(ng);
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Failed to merge sign geometry');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }

  createTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  }
}
