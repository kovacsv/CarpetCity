import * as THREE from 'three';
import { PartBuilder, SignAtlas, local } from './builder';
import { TiledColliders } from './collision';
import { WORLD_SCALE as S, TILE_W, TILE_H, buildings, props, roundabouts, type Building, type Prop } from './layout';
import type { TileMap } from './tileMap';
import { createRandom } from './geometry';

const C = {
  white: '#f3f3ef',
  offWhite: '#e7e4dc',
  glass: '#2f62d2',
  glassLight: '#5d8ff0',
  red: '#d7312b',
  darkRed: '#a8221d',
  yellow: '#f3c92e',
  blue: '#2f6fe0',
  navy: '#1d3a8a',
  grey: '#9aa1aa',
  darkGrey: '#3b3f46',
  black: '#1b1c1f',
  trunk: '#7a4a21',
  orange: '#ef8a2c',
};

const TREE_GREENS = ['#2f7a2c', '#2a6e2a', '#3b8a33', '#24622a'];

/** Approximate heights of each object, used so the camera knows what can block its view. */
const BUILDING_HEIGHT: Record<Building['kind'], number> = {
  hospital: 6.6, police: 4.9, fireStation: 5.1, townHall: 10, house: 5.4, chapel: 9.6, garage: 4.6,
  postOffice: 5.4, terminal: 5.6, tower: 11, busShelter: 2.7, shop: 3.3,
};
const PROP_HEIGHT: Record<Prop['kind'], number> = {
  fountain: 4.5, flowerbed: 0.8, plane: 4, ambulance: 2, policeCar: 1.4, fireTruck: 2.5, parkedCar: 1.3, pump: 1.7,
  mailbox: 1.6, parkingSign: 2.7, bench: 1,
};
/** Height assigned to colliders created by the builder currently running. */
let colliderTop = 0;

export interface WorldTile {
  /** Merged vertex-coloured geometry of all static objects in one tile. */
  staticGeometry: THREE.BufferGeometry;
  /** Merged geometry of all textured sign quads in one tile. */
  signGeometry: THREE.BufferGeometry;
  atlas: SignAtlas;
  /** Obstacles the car collides with. */
  colliders: TiledColliders;
  /** Tree crowns; the camera avoids sitting inside them. */
  foliage: TiledColliders;
}

export function buildWorldTile(map: TileMap): WorldTile {
  const pb = new PartBuilder();
  const atlas = new SignAtlas(2048);
  defineSigns(atlas);
  const colliders = new TiledColliders(TILE_W * S, TILE_H * S);
  const foliage = new TiledColliders(TILE_W * S, TILE_H * S);

  for (const b of buildings) {
    pb.setOrigin(b.x * S, b.y * S);
    atlas.setOrigin(pb.getOrigin());
    colliderTop = BUILDING_HEIGHT[b.kind];
    buildBuilding(pb, atlas, colliders, b);
  }

  for (const p of props) {
    const rot = p.rot ?? 0;
    pb.setOrigin(p.x * S, p.y * S, rot);
    atlas.setOrigin(pb.getOrigin());
    colliderTop = PROP_HEIGHT[p.kind];
    buildProp(pb, atlas, colliders, p);
  }

  for (const ra of roundabouts) {
    // Kerbed islands in the middle of roundabouts.
    const top = ra.centre === 'fountain' ? PROP_HEIGHT.fountain : 0.3;
    colliders.add({ kind: 'circle', x: ra.x * S, z: ra.y * S, r: ra.island * S * 0.9, top });
    if (ra.centre === 'dot') {
      pb.setOrigin(ra.x * S, ra.y * S);
      pb.cylinder(0, 0, 0, ra.island * S, ra.island * S, 0.12, C.yellow, 20);
    }
  }

  const rand = createRandom(4242);
  for (const [x, y] of map.trees) {
    const scale = 0.8 + rand() * 0.45;
    pb.setOrigin(x * S, y * S, rand() * Math.PI * 2);
    tree(pb, scale, TREE_GREENS[Math.floor(rand() * TREE_GREENS.length)], rand);
    colliders.add({ kind: 'circle', x: x * S, z: y * S, r: 0.45, top: 2 * scale });
    foliage.add({ kind: 'circle', x: x * S, z: y * S, r: 1.3 * scale, bottom: 1.3 * scale, top: 3.8 * scale });
  }

  for (const b of map.bushes) {
    const radius = b.r * S;
    pb.setOrigin(b.x * S, b.y * S);
    const crown = new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    crown.scale(1, 0.8, 1);
    pb.add(crown, '#2e6d2e');
    const base = new THREE.CircleGeometry(radius, 12);
    base.rotateX(Math.PI / 2);
    pb.add(base, '#2e6d2e');
  }

  pb.setOrigin(0, 0);
  return { staticGeometry: pb.build(), signGeometry: atlas.build(), atlas, colliders, foliage };
}

// ---------------------------------------------------------------------------------------------
// Signs
// ---------------------------------------------------------------------------------------------

function textSign(text: string, bg: string, fg: string, border?: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = h * 0.08;
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = h * 0.72;
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    while (ctx.measureText(text).width > w * 0.9 && size > 8) {
      size -= 2;
      ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    }
    ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  };
}

function defineSigns(atlas: SignAtlas): void {
  atlas.define('hospital', 640, 112, textSign('HOSPITAL', C.white, C.red, C.red));
  atlas.define('police', 512, 112, textSign('POLICE', C.white, C.navy, C.navy));
  atlas.define('fire', 768, 112, textSign('FIRE STATION', C.blue, C.white));
  atlas.define('airport', 640, 112, textSign('AIRPORT', C.white, C.navy, C.red));
  atlas.define('post', 640, 112, textSign('POST OFFICE', C.blue, C.yellow));
  atlas.define('busSign', 128, 128, textSign('BUS', C.yellow, C.navy, C.navy));
  atlas.define('helipad', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = C.red;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = C.white;
    ctx.font = 'bold 190px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', w / 2, h / 2 + 8);
  });
  atlas.define('redCross', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.red;
    ctx.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.76);
    ctx.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24);
  });
  const parking = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = C.blue;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = w * 0.06;
    ctx.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
    ctx.fillStyle = C.white;
    ctx.font = `bold ${h * 0.75}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', w / 2, h / 2 + h * 0.04);
  };
  atlas.define('parking', 128, 128, parking);
  atlas.define('parkingRoof', 256, 256, parking);
  atlas.define('envelope', 160, 112, (ctx, w, h) => {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 7;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.beginPath();
    ctx.moveTo(12, 12);
    ctx.lineTo(w / 2, h * 0.6);
    ctx.lineTo(w - 12, 12);
    ctx.stroke();
  });
  atlas.define('clock', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = C.yellow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.white;
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2, h * 0.2);
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w * 0.72, h / 2);
    ctx.stroke();
  });
  atlas.define('awning', 256, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? C.white : C.red;
      ctx.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------

function boxCollider(cols: TiledColliders, pb: PartBuilder, x: number, z: number, hw: number, hd: number, rot = 0): void {
  const p = new THREE.Vector3(x, 0, z).applyMatrix4(pb.getOrigin());
  const e = new THREE.Euler().setFromRotationMatrix(pb.getOrigin(), 'YXZ');
  cols.add({ kind: 'box', x: p.x, z: p.z, hw, hd, rot: e.y + rot, top: colliderTop });
}

function circleCollider(cols: TiledColliders, pb: PartBuilder, x: number, z: number, r: number): void {
  const p = new THREE.Vector3(x, 0, z).applyMatrix4(pb.getOrigin());
  cols.add({ kind: 'circle', x: p.x, z: p.z, r, top: colliderTop });
}

/** A row of window panes on a facade facing +z (front) or -z (back). */
function windows(pb: PartBuilder, xs: number[], y: number, z: number, w: number, h: number, color: string, back = false): void {
  for (const x of xs) {
    pb.box(x, y, z + (back ? -0.03 : 0.03), w + 0.16, h + 0.16, 0.06, C.white);
    pb.box(x, y, z + (back ? -0.06 : 0.06), w, h, 0.06, color);
  }
}

/** Window panes on a side facade facing +x (right) or -x (left). */
function sideWindows(pb: PartBuilder, zs: number[], y: number, x: number, w: number, h: number, color: string): void {
  const s = Math.sign(x);
  for (const z of zs) {
    pb.box(x + s * 0.03, y, z, 0.06, h + 0.16, w + 0.16, C.white);
    pb.box(x + s * 0.06, y, z, 0.06, h, w, color);
  }
}

function spread(from: number, to: number, count: number, skip?: (x: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? (from + to) / 2 : from + ((to - from) * i) / (count - 1);
    if (!skip || !skip(x)) out.push(x);
  }
  return out;
}

function buildBuilding(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, b: Building): void {
  const W = b.w * S;
  const D = b.d * S;
  switch (b.kind) {
    case 'hospital':
      return hospital(pb, atlas, cols, W, D);
    case 'police':
      return police(pb, atlas, cols, W, D);
    case 'fireStation':
      return fireStation(pb, atlas, cols, W, D);
    case 'townHall':
      return townHall(pb, atlas, cols, W, D);
    case 'house':
      return house(pb, cols, W, D);
    case 'chapel':
      return chapel(pb, cols, W, D);
    case 'garage':
      return garage(pb, cols, W, D);
    case 'postOffice':
      return postOffice(pb, atlas, cols, W, D);
    case 'terminal':
      return terminal(pb, atlas, cols, W, D);
    case 'tower':
      return controlTower(pb, cols, W);
    case 'busShelter':
      return busShelter(pb, atlas, cols, W, D);
    case 'shop':
      return shop(pb, atlas, cols, W, D);
  }
}

function hospital(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const H = 6;
  pb.block(0, 0, 0, W, H, D, C.white);
  pb.block(0, 0, 0, W + 0.06, 0.5, D + 0.06, C.grey);
  pb.box(0, 3.05, 0, W + 0.08, 0.28, D + 0.08, C.red);
  pb.block(0, H, 0, W + 0.3, 0.3, D + 0.3, C.grey);
  pb.block(0, H + 0.3, 0, W - 0.4, 0.12, D - 0.4, '#b9c0c8');
  atlas.quad('helipad', -W / 2 + 3, H + 0.44, 0, 4.4, 4.4, 0, true);
  atlas.quad('redCross', W / 2 - 3, H + 0.44, 0, 3.4, 3.4, 0, true);
  const front = D / 2;
  const cols1 = spread(-W / 2 + 1.3, W / 2 - 1.3, 9, (x) => Math.abs(x) < 1.6);
  windows(pb, cols1, 1.8, front, 1.3, 1.5, C.glass);
  windows(pb, spread(-W / 2 + 1.3, W / 2 - 1.3, 9), 4.4, front, 1.3, 1.5, C.glass);
  windows(pb, spread(-W / 2 + 1.3, W / 2 - 1.3, 9), 1.8, -front, 1.3, 1.5, C.glass, true);
  windows(pb, spread(-W / 2 + 1.3, W / 2 - 1.3, 9), 4.4, -front, 1.3, 1.5, C.glass, true);
  sideWindows(pb, [-1.5, 1.5], 1.8, W / 2, 1.3, 1.5, C.glass);
  sideWindows(pb, [-1.5, 1.5], 4.4, W / 2, 1.3, 1.5, C.glass);
  sideWindows(pb, [-1.5, 1.5], 1.8, -W / 2, 1.3, 1.5, C.glass);
  sideWindows(pb, [-1.5, 1.5], 4.4, -W / 2, 1.3, 1.5, C.glass);
  // Entrance with canopy.
  pb.block(0, 0, front + 0.04, 2.4, 2.5, 0.1, C.white);
  pb.block(-0.55, 0.05, front + 0.1, 1.0, 2.3, 0.06, C.glassLight);
  pb.block(0.55, 0.05, front + 0.1, 1.0, 2.3, 0.06, C.glassLight);
  pb.block(0, 2.6, front + 0.7, 3.4, 0.22, 1.4, C.red);
  pb.block(-1.5, 0, front + 1.25, 0.15, 2.6, 0.15, C.grey);
  pb.block(1.5, 0, front + 1.25, 0.15, 2.6, 0.15, C.grey);
  pb.block(0, H + 0.3, front - 0.15, 6.4, 1.3, 0.12, C.white);
  atlas.quad('hospital', 0, H + 0.95, front - 0.08, 6.2, 1.1);
  boxCollider(cols, pb, 0, 0, W / 2, D / 2);
}

function police(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const mainW = W - 5.2;
  const mx = -W / 2 + mainW / 2;
  const H = 4.6;
  pb.block(mx, 0, 0, mainW, H, D, C.white);
  pb.block(mx, 0, 0, mainW + 0.06, 0.45, D + 0.06, C.navy);
  pb.block(mx, H, 0, mainW + 0.3, 0.35, D + 0.3, C.blue);
  atlas.quad('parkingRoof', mx - 1.5, H + 0.37, 0, 3.6, 3.6, 0, true);
  const front = D / 2;
  windows(pb, spread(mx - mainW / 2 + 1.1, mx + mainW / 2 - 1.1, 5, (x) => Math.abs(x - mx) < 0.8), 1.6, front, 1.1, 1.3, C.glass);
  windows(pb, spread(mx - mainW / 2 + 1.1, mx + mainW / 2 - 1.1, 5), 3.0, front, 1.1, 1.0, C.glass);
  windows(pb, spread(mx - mainW / 2 + 1.1, mx + mainW / 2 - 1.1, 5), 1.9, -front, 1.1, 1.3, C.glass, true);
  pb.block(mx, 0, front + 0.05, 1.4, 2.3, 0.1, C.navy);
  pb.block(mx, 0.1, front + 0.1, 1.1, 2.0, 0.06, C.glassLight);
  pb.block(mx, H - 1.0, front + 0.08, 5.2, 0.95, 0.1, C.white);
  atlas.quad('police', mx, H - 0.53, front + 0.15, 4.8, 0.85);
  boxCollider(cols, pb, mx, 0, mainW / 2, D / 2);
  // Open garage with blue roof; a police car is parked inside.
  const gx = W / 2 - 2.6;
  const gh = 3.4;
  pb.block(gx - 2.45, 0, 0, 0.3, gh, D, C.offWhite);
  pb.block(gx + 2.45, 0, 0, 0.3, gh, D, C.offWhite);
  pb.block(gx, 0, -D / 2 + 0.15, 5.2, gh, 0.3, C.offWhite);
  pb.block(gx, gh, 0, 5.4, 0.3, D + 0.2, C.blue);
  pb.block(gx, 0.01, 0, 4.6, 0.04, D - 0.3, '#30343a');
  pb.block(gx, gh - 0.6, front, 5.2, 0.6, 0.12, C.navy);
  boxCollider(cols, pb, gx - 2.45, 0, 0.15, D / 2);
  boxCollider(cols, pb, gx + 2.45, 0, 0.15, D / 2);
  boxCollider(cols, pb, gx, -D / 2 + 0.15, 2.6, 0.15);
}

function fireStation(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const H = 4.8;
  const garageW = 5.6;
  const mainW = W - garageW;
  const mx = -W / 2 + mainW / 2;
  const gx = W / 2 - garageW / 2;
  const front = D / 2;
  pb.block(mx, 0, 0, mainW, H, D, C.red);
  pb.block(gx - garageW / 2 + 0.2, 0, 0, 0.4, H, D, C.red);
  pb.block(gx + garageW / 2 - 0.2, 0, 0, 0.4, H, D, C.red);
  pb.block(gx, 0, -D / 2 + 0.2, garageW, H, 0.4, C.red);
  pb.block(gx, 3.6, front - 0.2, garageW, H - 3.6, 0.4, C.red);
  pb.block(gx, 0.01, 0, garageW - 0.8, 0.04, D - 0.4, '#30343a');
  pb.block(0, H, 0, W + 0.3, 0.3, D + 0.3, C.darkGrey);
  pb.block(0, H - 1.2, front + 0.06, W, 1.0, 0.12, C.blue);
  atlas.quad('fire', 0, H - 0.7, front + 0.13, Math.min(W - 0.6, 8.6), 0.9);
  windows(pb, [mx - mainW / 2 + 1.1, mx + mainW / 2 - 1.1], 1.7, front, 1.1, 1.3, C.glass);
  windows(pb, spread(mx - mainW / 2 + 1.1, mx + mainW / 2 - 1.1, 3), 1.9, -front, 1.1, 1.3, C.glass, true);
  pb.block(mx, 0, front + 0.06, 1.3, 2.4, 0.1, C.navy);
  // Siren lamp and a little bell above the door.
  pb.sphere(mx, 2.75, front + 0.25, 0.25, C.yellow);
  boxCollider(cols, pb, mx, 0, mainW / 2, D / 2);
  boxCollider(cols, pb, gx - garageW / 2 + 0.2, 0, 0.2, D / 2);
  boxCollider(cols, pb, gx + garageW / 2 - 0.2, 0, 0.2, D / 2);
  boxCollider(cols, pb, gx, -D / 2 + 0.2, garageW / 2, 0.2);
}

function townHall(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const H = 4.8;
  const front = D / 2;
  const towerW = 2.6;
  const coreW = W - towerW * 2 + 0.6;
  pb.block(0, 0, 0, coreW, H, D, C.yellow);
  pb.block(0, H, 0, coreW + 0.3, 0.35, D + 0.3, C.red);
  pb.pyramid(0, H + 0.35, 0, coreW - 0.4, 1.4, D - 0.6, C.darkRed);
  // Central gable with clock and flag.
  pb.block(0, 0, front + 0.3, 3.6, H + 1.2, 0.6, C.yellow);
  pb.gable(0, H + 1.2, front + 0.3, 0.6, 1.4, 3.8, C.red, Math.PI / 2);
  atlas.quad('clock', 0, H + 0.4, front + 0.62, 1.2, 1.2);
  pb.cylinder(0, H + 2.5, front + 0.3, 0.05, 0.05, 1.8, C.darkGrey, 6);
  pb.box(0.45, H + 4.0, front + 0.3, 0.8, 0.5, 0.04, C.blue);
  // Corner towers with tall pointed roofs.
  const tz = front - towerW / 2;
  for (const s of [-1, 1]) {
    const tx = s * (W / 2 - towerW / 2);
    pb.block(tx, 0, tz, towerW, H + 1.6, towerW, C.yellow);
    pb.block(tx, H + 1.6, tz, towerW + 0.3, 0.3, towerW + 0.3, C.red);
    pb.cone(tx, H + 1.9, tz, towerW * 0.78, 3.2, C.red, 4, Math.PI / 4);
    windows(pb, [tx], H - 0.3, front, 0.8, 1.2, C.glass);
    windows(pb, [tx], 1.8, front, 0.8, 1.4, C.glass);
    boxCollider(cols, pb, tx, tz, towerW / 2, towerW / 2);
  }
  // Arched windows (rectangle + round top) and the big blue door.
  for (const x of spread(-coreW / 2 + 1.2, coreW / 2 - 1.2, 6, (x) => Math.abs(x) < 2.2)) {
    for (const y of [1.6, 3.5]) {
      pb.box(x, y, front + 0.05, 0.9, 1.1, 0.08, C.glass);
      pb.cylinderZ(x, y + 0.55, front + 0.05, 0.45, 0.45, 0.08, C.glass, 12);
      pb.box(x, y - 0.65, front + 0.12, 1.1, 0.12, 0.2, C.red);
    }
  }
  pb.box(0, 1.2, front + 0.62, 1.6, 2.4, 0.06, C.blue);
  pb.cylinderZ(0, 2.4, front + 0.62, 0.8, 0.8, 0.06, C.blue, 16);
  pb.block(0, 0, front + 1.0, 3.0, 0.2, 0.8, C.orange);
  boxCollider(cols, pb, 0, 0, coreW / 2, D / 2);
  boxCollider(cols, pb, 0, front + 0.5, 1.9, 0.6);
}

function house(pb: PartBuilder, cols: TiledColliders, W: number, D: number): void {
  const H = 3.0;
  const front = D / 2;
  pb.block(0, 0, 0, W, H, D, C.offWhite);
  pb.block(0, 0, 0, W + 0.06, 0.8, D + 0.06, '#38418a');
  pb.gable(0, H, 0, W + 0.5, 2.4, D + 0.6, C.red);
  pb.block(W / 2 - 1.4, H, -0.6, 0.6, 2.4, 0.6, C.darkRed);
  for (const x of spread(-W / 2 + 1.1, W / 2 - 1.1, 5)) {
    pb.box(x, 1.7, front + 0.05, 0.8, 1.0, 0.08, C.glass);
    pb.cylinderZ(x, 2.2, front + 0.05, 0.4, 0.4, 0.08, C.glass, 10);
    pb.box(x, 1.7, -front - 0.05, 0.8, 1.0, 0.08, C.glass);
  }
  boxCollider(cols, pb, 0, 0, W / 2, D / 2);
}

function chapel(pb: PartBuilder, cols: TiledColliders, W: number, D: number): void {
  const H = 3.6;
  const front = D / 2;
  const bodyW = W - 1.6;
  pb.block(-0.8, 0, 0, bodyW, H, D, C.white);
  pb.gable(-0.8, H, 0, D + 0.4, 3.2, bodyW + 0.4, C.red, Math.PI / 2);
  pb.box(-0.8, 1.2, front + 0.05, 1.3, 2.4, 0.08, C.yellow);
  pb.cylinderZ(-0.8, 2.4, front + 0.05, 0.65, 0.65, 0.08, C.yellow, 14);
  pb.cylinderZ(-0.8, H + 1.1, front + 0.25, 0.4, 0.4, 0.08, C.glass, 14);
  sideWindows(pb, [-1.3, 0.6], 2.0, -0.8 - bodyW / 2, 0.7, 1.4, C.glass);
  // Bell tower.
  const tx = W / 2 - 1.0;
  pb.block(tx, 0, front - 1.0, 1.8, 6.4, 1.8, C.white);
  pb.cone(tx, 6.4, front - 1.0, 1.35, 2.8, C.red, 4, Math.PI / 4);
  pb.box(tx, 5.4, front - 0.08, 0.6, 0.9, 0.06, C.black);
  boxCollider(cols, pb, 0, 0, W / 2, D / 2);
}

function garage(pb: PartBuilder, cols: TiledColliders, W: number, D: number): void {
  // Car showroom/garage: yellow frame, big blue glass front, blue roof lights.
  const H = 4.2;
  const front = D / 2;
  const bodyW = W - 3.2;
  const bx = -1.6;
  pb.block(bx, 0, 0, bodyW, H, D, C.yellow);
  pb.block(bx, H, 0, bodyW + 0.3, 0.3, D + 0.3, '#e0b21e');
  for (const x of spread(bx - bodyW / 2 + 1.8, bx + bodyW / 2 - 1.8, 4)) {
    pb.add(new THREE.BoxGeometry(2.4, 0.08, 1.6), C.blue, local(x, H + 0.6, -0.4).multiply(new THREE.Matrix4().makeRotationX(0.45)));
  }
  for (const x of spread(bx - bodyW / 2 + 1.0, bx + bodyW / 2 - 1.0, 6)) {
    pb.box(x, 2.0, front + 0.05, 1.7, 3.0, 0.08, C.glass);
    pb.box(x, 2.0, front + 0.1, 0.12, 3.0, 0.08, C.yellow);
  }
  pb.block(bx, 3.7, front + 0.08, bodyW, 0.25, 0.12, C.navy);
  // Drive-through car wash alongside the showroom.
  const ax = W / 2 - 1.5;
  pb.block(ax, 0, 0, 2.9, 0.06, 4.8, C.grey);
  for (const z of [-1.5, 1.5]) {
    const arch = new THREE.TorusGeometry(1.25, 0.16, 8, 20, Math.PI);
    arch.scale(1, 1.8, 1);
    pb.add(arch, C.red, local(ax, 0.7, z));
    for (const side of [-1, 1]) {
      pb.cylinder(ax + side * 1.25, 0.06, z, 0.16, 0.16, 0.64, C.red, 8);
      circleCollider(cols, pb, ax + side * 1.25, z, 0.16);
    }
  }
  for (const side of [-1, 1]) {
    pb.cylinder(ax + side * 1.08, 0.15, 0, 0.13, 0.13, 1.6, C.blue, 12);
    for (let y = 0.25; y < 1.7; y += 0.2) {
      pb.cylinder(ax + side * 1.08, y, 0, 0.18, 0.18, 0.09, '#5d8ff0', 12);
    }
    circleCollider(cols, pb, ax + side * 1.08, 0, 0.18);
  }
  pb.box(ax, 0.07, 0, 1.7, 0.015, 3.5, '#76b9df');
  boxCollider(cols, pb, bx, 0, bodyW / 2, D / 2);
  // Yellow pump island in front.
  pb.block(-1.8, 0, front + 1.9, 5.6, 0.12, 1.4, C.yellow);
}

function postOffice(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const H = 3.4;
  const front = D / 2;
  pb.block(0, 0, 0, W, H, D, C.yellow);
  pb.gable(0, H, 0, W + 0.4, 1.8, D + 0.5, C.red);
  // Front cross-gable carrying the envelope emblem.
  pb.block(0, 0, front + 0.2, 3.8, H, 0.4, C.yellow);
  pb.gable(0, H, front - 0.4, 1.8, 2.0, 4.3, C.red, Math.PI / 2);
  pb.add(triangle(3.6, 1.7), C.yellow, local(0, H, front + 0.52));
  atlas.quad('envelope', 0, H + 0.6, front + 0.55, 1.3, 0.9);
  pb.box(0, 0.95, front + 0.43, 1.1, 1.9, 0.06, C.blue);
  pb.cylinderZ(0, 1.9, front + 0.43, 0.55, 0.55, 0.06, C.blue, 14);
  for (const x of [-W / 2 + 1.3, -W / 2 + 3.0, W / 2 - 3.0, W / 2 - 1.3]) {
    pb.box(x, 1.5, front + 0.05, 1.0, 1.2, 0.08, C.glass);
    pb.cylinderZ(x, 2.1, front + 0.05, 0.5, 0.5, 0.08, C.glass, 12);
    // Red awnings over the windows.
    pb.add(new THREE.BoxGeometry(1.3, 0.08, 0.6), C.red, local(x, 2.75, front + 0.3).multiply(new THREE.Matrix4().makeRotationX(0.5)));
  }
  pb.block(0, H - 0.75, front + 0.44, 3.4, 0.6, 0.06, C.blue);
  atlas.quad('post', 0, H - 0.45, front + 0.48, 3.2, 0.55);
  boxCollider(cols, pb, 0, 0.2, W / 2, D / 2 + 0.2);
}

function terminal(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  const H = 4.0;
  const front = D / 2;
  pb.block(0, 0, 0, W, H, D, C.glass);
  for (const y of [0, 1.9, H - 0.2]) pb.block(0, y, 0, W + 0.08, 0.25, D + 0.08, C.white);
  for (const x of spread(-W / 2, W / 2, 9)) {
    pb.block(x, 0, front + 0.02, 0.15, H, 0.08, C.white);
    pb.block(x, 0, -front - 0.02, 0.15, H, 0.08, C.white);
  }
  pb.block(0, H, 0, W + 0.3, 0.3, D + 0.3, C.red);
  pb.block(0, H + 0.3, front - 0.3, 6.0, 1.3, 0.15, C.white);
  atlas.quad('airport', 0, H + 0.95, front - 0.2, 5.8, 1.1);
  // Antenna mast.
  pb.cylinder(2.5, H + 0.3, -1.0, 0.06, 0.06, 3.0, C.darkGrey, 6);
  for (const y of [H + 1.5, H + 2.4]) pb.box(2.5, y, -1.0, 1.2, 0.06, 0.06, C.darkGrey);
  boxCollider(cols, pb, 0, 0, W / 2, D / 2);
}

function controlTower(pb: PartBuilder, cols: TiledColliders, W: number): void {
  const r = W / 2;
  pb.cylinder(0, 0, 0, r * 0.55, r * 0.7, 7.5, C.offWhite, 16);
  pb.cylinder(0, 7.5, 0, r * 1.1, r * 0.75, 0.5, C.white, 16);
  pb.cylinder(0, 8.0, 0, r * 1.05, r * 1.05, 1.4, C.glass, 16);
  pb.cylinder(0, 9.4, 0, r * 1.15, r * 1.15, 0.25, C.white, 16);
  pb.sphere(0, 9.65, 0, r * 0.9, C.red, 1, 0.75, 1, 2);
  pb.box(0, 9.9, 0, r * 1.85, 0.25, 0.3, C.white);
  pb.cylinder(0, 10.2, 0, 0.04, 0.04, 1.4, C.darkGrey, 6);
  circleCollider(cols, pb, 0, 0, r * 0.75);
}

function busShelter(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  pb.block(0, 0, -D / 2 + 0.1, W, 2.4, 0.15, C.white);
  pb.block(-W / 2 + 0.08, 0, 0, 0.15, 2.4, D, C.white);
  pb.block(W / 2 - 0.08, 0, 0, 0.15, 2.4, D, C.white);
  pb.block(0, 2.4, 0, W + 0.3, 0.25, D + 0.3, C.red);
  pb.block(0, 0.5, -D / 2 + 0.45, W - 0.6, 0.12, 0.5, C.trunk);
  pb.cylinder(W / 2 + 0.6, 0, D / 2, 0.05, 0.05, 2.6, C.grey, 6);
  atlas.quad('busSign', W / 2 + 0.6, 2.7, D / 2 + 0.06, 0.7, 0.7);
  atlas.quad('busSign', W / 2 + 0.6, 2.7, D / 2 - 0.06, 0.7, 0.7, Math.PI);
  boxCollider(cols, pb, 0, -D / 2 + 0.1, W / 2, 0.1);
  boxCollider(cols, pb, -W / 2 + 0.08, 0, 0.08, D / 2);
  boxCollider(cols, pb, W / 2 - 0.08, 0, 0.08, D / 2);
}

function shop(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, W: number, D: number): void {
  // Small market stall with a striped awning, like the one on the second carpet photo.
  const H = 3.0;
  const front = D / 2;
  pb.block(0, 0, 0, W, H, D, C.offWhite);
  pb.block(0, H, 0, W + 0.2, 0.3, D + 0.2, C.red);
  pb.box(0, 1.2, front + 0.05, 1.0, 2.2, 0.08, C.darkRed);
  for (const x of [-W / 2 + 1.3, W / 2 - 1.3]) pb.box(x, 1.6, front + 0.05, 1.6, 1.3, 0.08, C.glass);
  const aw = new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.45);
  atlas.setOrigin(pb.getOrigin().multiply(local(0, 2.75, front + 0.6)).multiply(aw));
  atlas.quad('awning', 0, 0, 0, W - 0.2, 1.3);
  boxCollider(cols, pb, 0, 0, W / 2, D / 2);
}

/** Flat triangle facing +z (used to close gable ends). */
function triangle(w: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------

function buildProp(pb: PartBuilder, atlas: SignAtlas, cols: TiledColliders, p: Prop): void {
  switch (p.kind) {
    case 'fountain': {
      pb.cylinder(0, 0, 0, 2.7, 2.8, 0.7, C.red, 24);
      pb.cylinder(0, 0, 0, 2.4, 2.4, 0.72, '#3d8ef0', 24);
      pb.cylinder(0, 0, 0, 0.35, 0.45, 1.6, C.white, 10);
      pb.cylinder(0, 1.6, 0, 1.0, 0.4, 0.35, C.blue, 16);
      pb.cylinder(0, 1.62, 0, 0.85, 0.85, 0.35, '#5aa6ff', 16);
      const water = '#b9e4ff';
      pb.cylinder(0, 1.97, 0, 0.08, 0.16, 2.15, water, 10);
      pb.sphere(0, 4.12, 0, 0.18, water);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        const stream = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(dx * 0.25, 1.97, dz * 0.25),
          new THREE.Vector3(dx * 1.1, 4.3, dz * 1.1),
          new THREE.Vector3(dx * 2.1, 0.74, dz * 2.1),
        );
        pb.add(new THREE.TubeGeometry(stream, 20, 0.065, 6, false), water);
      }
      return;
    }
    case 'flowerbed': {
      pb.cylinder(0, 0, 0, 1.9, 1.95, 0.3, C.yellow, 24);
      pb.cylinder(0, 0, 0, 1.65, 1.65, 0.34, '#2f7a2c', 24);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        pb.sphere(Math.cos(a) * 1.0, 0.45, Math.sin(a) * 1.0, 0.35, '#2a6e2a');
        pb.sphere(Math.cos(a + 0.4) * 1.0, 0.7, Math.sin(a + 0.4) * 1.0, 0.12, i % 2 ? C.white : C.red);
      }
      pb.sphere(0, 0.6, 0, 0.45, '#3b8a33');
      circleCollider(cols, pb, 0, 0, 1.95);
      return;
    }
    case 'plane':
      return plane(pb, cols);
    case 'ambulance':
      vehicle(pb, { length: 3.8, width: 1.7, height: 1.9, body: C.white, stripe: C.red, cabin: 'van', lights: C.blue });
      return boxCollider(cols, pb, 0, 0, 0.85, 1.9);
    case 'policeCar':
      vehicle(pb, { length: 3.3, width: 1.6, height: 1.35, body: C.blue, stripe: C.white, cabin: 'car', lights: C.blue, roof: C.white });
      return boxCollider(cols, pb, 0, 0, 0.8, 1.65);
    case 'fireTruck':
      fireTruck(pb);
      return boxCollider(cols, pb, 0, 0, 1.0, 2.6);
    case 'parkedCar':
      vehicle(pb, { length: 3.1, width: 1.55, height: 1.3, body: p.color ?? C.red, cabin: 'car' });
      return boxCollider(cols, pb, 0, 0, 0.78, 1.55);
    case 'pump':
      pb.block(0, 0.12, 0, 0.6, 1.4, 0.45, C.red);
      pb.block(0, 1.52, 0, 0.7, 0.2, 0.55, C.yellow);
      pb.box(0, 1.1, 0.24, 0.4, 0.3, 0.04, C.white);
      pb.box(0.34, 0.8, 0, 0.08, 0.6, 0.08, C.black);
      return circleCollider(cols, pb, 0, 0, 0.4);
    case 'mailbox':
      pb.cylinder(0, 0, 0, 0.07, 0.07, 0.9, C.darkGrey, 6);
      pb.block(0, 0.9, 0, 0.6, 0.7, 0.4, C.red);
      pb.box(0, 1.35, 0.21, 0.4, 0.06, 0.02, C.black);
      return circleCollider(cols, pb, 0, 0, 0.35);
    case 'parkingSign':
      pb.cylinder(0, 0, 0, 0.025, 0.025, 1.9, C.grey, 8);
      pb.box(0, 2.3, 0, 0.9, 0.9, 0.04, C.white);
      atlas.quad('parking', 0, 2.3, 0.025, 0.85, 0.85);
      atlas.quad('parking', 0, 2.3, -0.025, 0.85, 0.85, Math.PI);
      return circleCollider(cols, pb, 0, 0, 0.08);
    case 'bench':
      pb.block(0, 0.45, 0, 1.8, 0.1, 0.5, C.trunk);
      pb.block(0, 0.6, -0.25, 1.8, 0.45, 0.08, C.trunk);
      for (const x of [-0.75, 0.75]) pb.block(x, 0, 0, 0.1, 0.45, 0.45, C.darkGrey);
      return boxCollider(cols, pb, 0, 0, 0.9, 0.3);
  }
}

interface VehicleStyle {
  length: number;
  width: number;
  height: number;
  body: string;
  cabin: 'car' | 'van';
  stripe?: string;
  lights?: string;
  roof?: string;
}

/** Simple toy-like vehicle facing +z. */
export function vehicle(pb: PartBuilder, v: VehicleStyle): void {
  const L = v.length;
  const Wd = v.width;
  const wheelR = 0.34;
  const bodyY = wheelR * 0.9;
  const lowerH = v.cabin === 'van' ? v.height - bodyY - 0.05 : 0.55;
  pb.block(0, bodyY, 0, Wd, lowerH, L, v.body);
  if (v.stripe) pb.box(0, bodyY + lowerH * 0.45, 0, Wd + 0.02, 0.16, L * 0.8, v.stripe);
  if (v.cabin === 'car') {
    const cabinL = L * 0.5;
    const cabinH = v.height - bodyY - lowerH;
    pb.block(0, bodyY + lowerH, -L * 0.06, Wd * 0.88, cabinH, cabinL, v.roof ?? v.body);
    const windowY = bodyY + lowerH + cabinH * 0.55;
    const windowH = cabinH * 0.5;
    const windowX = Wd * 0.44 + 0.01;
    const windowZ = -L * 0.06;
    pb.box(-windowX, windowY, windowZ, 0.025, windowH, cabinL * 0.62, '#203760');
    pb.box(windowX, windowY, windowZ, 0.025, windowH, cabinL * 0.62, '#203760');
    pb.box(0, windowY, windowZ + cabinL / 2 + 0.01, Wd * 0.55, windowH, 0.025, '#203760');
    pb.box(0, windowY, windowZ - cabinL / 2 - 0.01, Wd * 0.55, windowH, 0.025, '#203760');
  } else {
    pb.block(0, bodyY + lowerH * 0.45, L / 2 + 0.02, Wd * 0.9, lowerH * 0.42, 0.06, '#203760');
    for (const s of [-1, 1]) pb.block(s * (Wd / 2 + 0.01), bodyY + lowerH * 0.5, L / 2 - 0.6, 0.04, lowerH * 0.35, 0.8, '#203760');
  }
  if (v.lights) {
    const top = v.cabin === 'car' ? v.height : bodyY + lowerH;
    pb.block(0, top, v.cabin === 'car' ? -L * 0.06 : L * 0.3, Wd * 0.5, 0.16, 0.25, v.lights);
  }
  for (const s of [-1, 1]) {
    pb.box(s * Wd * 0.32, bodyY + 0.3, L / 2 + 0.01, 0.3, 0.16, 0.04, '#fff7c2');
    pb.box(s * Wd * 0.32, bodyY + 0.3, -L / 2 - 0.01, 0.3, 0.16, 0.04, '#e0242a');
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pb.cylinderX(sx * (Wd / 2 - 0.12), wheelR, sz * L * 0.32, wheelR, 0.28, C.black, 12);
    }
  }
}

function fireTruck(pb: PartBuilder): void {
  const L = 5.2;
  const Wd = 2.0;
  pb.block(0, 0.32, -0.6, Wd, 1.5, L - 1.4, C.red);
  pb.block(0, 0.32, L / 2 - 0.7, Wd, 2.0, 1.4, C.red);
  pb.block(0, 1.3, L / 2 + 0.01, Wd * 0.85, 0.7, 0.04, '#203760');
  for (const side of [-1, 1]) {
    pb.block(side * (Wd / 2 + 0.02), 1.3, L / 2 - 0.7, 0.04, 0.7, 1.0, '#203760');
  }
  pb.block(0, 2.32, L / 2 - 0.7, 0.9, 0.16, 0.3, C.blue);
  pb.box(0, 1.0, -0.6, Wd + 0.02, 0.14, L - 1.6, C.white);
  // Ladder.
  for (const s of [-1, 1]) pb.box(s * 0.45, 2.0, -0.6, 0.08, 0.08, L - 1.0, C.grey);
  for (let z = -2.8; z <= 1.6; z += 0.4) pb.box(0, 2.0, z, 0.9, 0.06, 0.06, C.grey);
  for (const sx of [-1, 1]) for (const z of [-1.8, -0.9, 1.7]) pb.cylinderX(sx * (Wd / 2 - 0.12), 0.4, z, 0.4, 0.3, C.black, 12);
}

function plane(pb: PartBuilder, cols: TiledColliders): void {
  // Local +z is the nose. The carpet shows a red airliner with white wings.
  pb.cylinderZ(0, 1.8, 0, 0.75, 0.75, 7.0, C.red, 16);
  pb.sphere(0, 1.8, 3.5, 0.75, C.red, 1, 1, 1.4, 2);
  pb.add(new THREE.ConeGeometry(0.75, 2.2, 16), C.red, local(0, 1.95, -4.6).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 - 0.12)));
  pb.box(0, 2.15, 3.5, 0.9, 0.3, 0.8, '#203760');
  for (let z = -2.6; z <= 2.6; z += 0.6) {
    for (const s of [-1, 1]) pb.box(s * 0.74, 2.05, z, 0.04, 0.22, 0.3, C.white);
  }
  // Wings and engines.
  pb.box(0, 1.35, 0.2, 8.4, 0.14, 1.6, C.white);
  for (const s of [-1, 1]) {
    pb.cylinderZ(s * 2.4, 0.95, 0.6, 0.38, 0.32, 1.5, C.offWhite, 12);
    pb.cylinderZ(s * 2.4, 0.95, 1.36, 0.28, 0.28, 0.04, C.black, 12);
    pb.box(s * 4.6, 1.35, 0.2, 0.8, 0.14, 1.6, C.red);
  }
  pb.box(0, 2.3, -5.0, 3.6, 0.1, 1.0, C.white);
  pb.box(0, 3.0, -5.1, 0.12, 1.6, 1.2, C.white);
  pb.box(0, 3.5, -5.15, 0.14, 0.4, 1.0, C.red);
  // Landing gear.
  pb.cylinder(0, 0, 2.6, 0.06, 0.06, 1.1, C.darkGrey, 6);
  pb.cylinderX(0, 0.25, 2.6, 0.25, 0.2, C.black, 10);
  for (const s of [-1, 1]) {
    pb.cylinder(s * 1.0, 0, 0, 0.07, 0.07, 1.1, C.darkGrey, 6);
    pb.cylinderX(s * 1.0, 0.28, 0, 0.28, 0.25, C.black, 10);
  }
  boxCollider(cols, pb, 0, -0.5, 0.8, 4.6);
  boxCollider(cols, pb, 0, 0.2, 5.0, 0.8);
}

function tree(pb: PartBuilder, scale: number, green: string, rand: () => number): void {
  pb.cylinder(0, 0, 0, 0.16 * scale, 0.22 * scale, 2.0 * scale, C.trunk, 7);
  pb.sphere(0, 2.6 * scale, 0, 1.2 * scale, green, 1, 0.95, 1, 1);
  pb.sphere(0.55 * scale, 2.2 * scale, 0.3 * scale, 0.75 * scale, green, 1, 1, 1, 1);
  if (rand() > 0.4) pb.sphere(-0.5 * scale, 2.4 * scale, -0.35 * scale, 0.7 * scale, green, 1, 1, 1, 1);
}
