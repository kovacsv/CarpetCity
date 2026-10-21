import * as THREE from 'three';
import { TILE_W, TILE_H, WORLD_SCALE as S } from './layout';
import { buildTileMap, type TileMap } from './tileMap';
import { buildWorldTile, type WorldTile } from './world';
import { Car } from './car';
import { Input } from './input';
import { ChaseCamera } from './cameraController';
import { Hud } from './hud';
import { wrapDelta } from './geometry';

const TW = TILE_W * S;
const TH = TILE_H * S;
/** Tiles kept around the car in each direction (x, z); enough to reach the fog distance. */
const GRID_X = 2;
const GRID_Z = 4;
const FOG_NEAR = 90;
const FOG_FAR = 210;
const SKY = new THREE.Color('#a8d8ff');
const START = { x: 400, y: 64, yaw: Math.PI / 2 };

function setStatus(text: string): void {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
}

/** Lets the browser paint (e.g. the loading screen) before continuing with heavy work. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, FOG_FAR + 40);

  setStatus('Weaving the carpet…');
  await nextFrame();
  const textureScale = renderer.capabilities.maxTextureSize >= 4096 ? 3 : 1.75;
  const map = buildTileMap(textureScale);

  setStatus('Building the town…');
  await nextFrame();
  const tile = buildWorldTile(map);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  scene.add(createGround(map, maxAniso));
  const tiles = createTileGrid(tile, maxAniso);
  scene.add(tiles.group);

  // Lighting: soft sky fill plus a sun that follows the car so shadows stay crisp.
  scene.add(new THREE.HemisphereLight('#e6f4ff', '#6f8f4a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55;
  sc.right = 55;
  sc.top = 55;
  sc.bottom = -55;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(-35, 70, 25);

  const car = new Car();
  scene.add(car.object);
  const world = {
    colliders: tile.colliders,
    surfaceAt: (x: number, z: number) => map.surfaceAt(x / S, z / S),
  };
  const respawn = () => snapToRoad(car, map);
  car.place(START.x * S, START.y * S, START.yaw);
  respawn();

  const input = new Input(renderer.domElement);
  const chase = new ChaseCamera(camera);
  const hud = new Hud(map);

  input.onAction('KeyR', respawn);
  input.onAction('KeyC', () => chase.reset());
  input.onAction('KeyV', () => chase.toggleOverhead());
  input.onAction('KeyH', () => document.body.classList.toggle('hide-help'));
  input.onAction('KeyM', () => document.body.classList.toggle('hide-minimap'));
  setupFullscreen(input);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const overlay = document.getElementById('start-overlay');
  const startButton = document.getElementById('start-button');
  const begin = () => {
    overlay?.classList.add('hidden');
    document.body.classList.add('playing');
    renderer.domElement.focus();
  };
  startButton?.addEventListener('click', begin);
  const startKeys = ['Enter', 'Escape', 'KeyW', 'ArrowUp'];
  window.addEventListener('keydown', (e) => {
    if (overlay && !overlay.classList.contains('hidden') && startKeys.includes(e.code)) begin();
  });
  document.getElementById('loading')?.classList.add('hidden');
  overlay?.classList.remove('hidden');

  const timer = new THREE.Timer();
  timer.connect(document);
  let accumulator = 0;
  const STEP = 1 / 120;
  const frame = (dt: number) => {
    accumulator += dt;
    while (accumulator >= STEP) {
      car.update(STEP, input, world);
      accumulator -= STEP;
    }
    tiles.update(car.x, car.z);
    groundFollow(scene, car.x, car.z);
    chase.update(dt, car, input, tile);

    // Snap the sun to whole units to avoid shadow shimmering while driving.
    const sx = Math.round(car.x);
    const sz = Math.round(car.z);
    sun.position.set(sx + sunOffset.x, sunOffset.y, sz + sunOffset.z);
    sun.target.position.set(sx, 0, sz);

    hud.update(car);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    frame(Math.min(timer.getDelta(), 0.1));
  });

  if (new URLSearchParams(location.search).has('debug')) {
    // Hooks for inspecting the generated world from the browser console; `step` advances frames manually.
    const step = (frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) frame(dt);
    };
    Object.assign(window, { carpet: { map, tile, car, chase, camera, renderer, scene, input, step } });
  }
}

// Older iPadOS Safari exposes only the prefixed API; iPhone Safari supports neither.
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Toggles fullscreen with F or the touch toolbar button; hides the button when unsupported. */
function setupFullscreen(input: Input): void {
  const doc = document as WebkitDocument;
  const root = document.documentElement as WebkitElement;
  const button = document.querySelector<HTMLButtonElement>('[data-action="KeyF"]');
  if (!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) {
    button?.remove();
    return;
  }
  const isFullscreen = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
  input.onAction('KeyF', () => {
    try {
      if (isFullscreen()) {
        if (doc.exitFullscreen) doc.exitFullscreen().catch(() => undefined);
        else doc.webkitExitFullscreen?.();
      } else if (root.requestFullscreen) {
        root.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
      } else {
        root.webkitRequestFullscreen?.();
      }
    } catch {
      /* Fullscreen can be refused, e.g. inside iframes without permission. */
    }
  });
  const sync = () => button?.setAttribute('aria-pressed', String(isFullscreen()));
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}

/** Ground plane carrying the painted carpet; it hops by whole tiles to stay under the car. */
function createGround(map: TileMap, maxAniso: number): THREE.Mesh {
  const tex = new THREE.CanvasTexture(map.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  tex.repeat.set(GRID_X * 2 + 1, GRID_Z * 2 + 1);

  const material = new THREE.MeshLambertMaterial({ map: tex, bumpMap: createPileTexture(), bumpScale: 1.2 });
  material.bumpMap!.repeat.set((GRID_X * 2 + 1) * 40, (GRID_Z * 2 + 1) * 20);
  const geo = new THREE.PlaneGeometry(TW * (GRID_X * 2 + 1), TH * (GRID_Z * 2 + 1));
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, material);
  ground.name = 'ground';
  ground.receiveShadow = true;
  return ground;
}

function groundFollow(scene: THREE.Scene, x: number, z: number): void {
  const ground = scene.getObjectByName('ground');
  if (!ground) return;
  ground.position.set((Math.floor(x / TW) + 0.5) * TW, 0, (Math.floor(z / TH) + 0.5) * TH);
}

/** Tiny tileable noise used as a bump map so the ground looks like carpet pile. */
function createPileTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let seed = 99;
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 110 + ((seed >>> 24) % 100);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface TileGrid {
  group: THREE.Group;
  update(x: number, z: number): void;
}

/** A grid of tile instances sharing the same geometry, re-centred on the car every frame. */
function createTileGrid(tile: WorldTile, maxAniso: number): TileGrid {
  const group = new THREE.Group();
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const signMat = new THREE.MeshLambertMaterial({
    map: tile.atlas.createTexture(maxAniso),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const cells: { obj: THREE.Group; i: number; j: number }[] = [];

  for (let i = -GRID_X; i <= GRID_X; i++) {
    for (let j = -GRID_Z; j <= GRID_Z; j++) {
      const obj = new THREE.Group();
      const statics = new THREE.Mesh(tile.staticGeometry, staticMat);
      statics.castShadow = true;
      statics.receiveShadow = true;
      const signs = new THREE.Mesh(tile.signGeometry, signMat);
      signs.receiveShadow = true;
      obj.add(statics, signs);
      group.add(obj);
      cells.push({ obj, i, j });
    }
  }

  return {
    group,
    update(x, z) {
      const bx = Math.floor(x / TW);
      const bz = Math.floor(z / TH);
      for (const c of cells) c.obj.position.set((bx + c.i) * TW, 0, (bz + c.j) * TH);
    },
  };
}

/** Puts the car on the right-hand lane of the nearest road, keeping roughly its heading. */
function snapToRoad(car: Car, map: TileMap): void {
  const px = car.x / S;
  const py = car.z / S;
  let best = { d: Infinity, dx: 0, dy: 0, angle: 0 };
  for (const road of map.roads) {
    if (!road.dashed) continue;
    const line = road.line;
    for (let i = 0; i < line.length; i++) {
      const dx = wrapDelta(line[i][0], px, TILE_W);
      const dy = wrapDelta(line[i][1], py, TILE_H);
      const d = dx * dx + dy * dy;
      if (d < best.d) {
        const a = line[Math.max(0, i - 1)];
        const b = line[Math.min(line.length - 1, i + 1)];
        best = { d, dx, dy, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      }
    }
  }
  // Road direction in carpet space -> car yaw (forward = (sin yaw, cos yaw)).
  let yaw = Math.atan2(Math.cos(best.angle), Math.sin(best.angle));
  if (Math.cos(yaw - car.yaw) < 0) yaw += Math.PI;
  const rightX = -Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  const lane = 11 * S;
  car.place(car.x + best.dx * S + rightX * lane, car.z + best.dy * S + rightZ * lane, yaw);
}

main().catch((err) => {
  console.error(err);
  setStatus(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
});
