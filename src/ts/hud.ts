import { WORLD_SCALE } from './layout';
import type { Car } from './car';
import { Surface, type TileMap } from './tileMap';

/** Speed shown on the HUD: one world unit is roughly 1.4 m at toy-car scale. */
const KMH_PER_UNIT = 1.4 * 3.6;
/** Carpet pixels visible across the minimap. */
const MINIMAP_SPAN = 420;

export class Hud {
  private readonly speedEl: HTMLElement;
  private readonly odoEl: HTMLElement;
  private readonly surfaceEl: HTMLElement;
  private readonly mini: HTMLCanvasElement;
  private readonly miniCtx: CanvasRenderingContext2D;
  private readonly pattern: CanvasPattern;
  private readonly miniScale: number;

  constructor(map: TileMap) {
    this.speedEl = byId('speed-value');
    this.odoEl = byId('odometer');
    this.surfaceEl = byId('surface');
    this.mini = byId('minimap') as HTMLCanvasElement;
    const ctx = this.mini.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.miniCtx = ctx;
    const pattern = ctx.createPattern(map.miniCanvas, 'repeat');
    if (!pattern) throw new Error('Could not create minimap pattern');
    this.pattern = pattern;
    // Size of one carpet pixel in the minimap source canvas.
    this.miniScale = map.miniCanvas.width / (map.canvas.width / map.scale);
  }

  update(car: Car): void {
    this.speedEl.textContent = String(Math.round(Math.abs(car.speed) * KMH_PER_UNIT));
    this.odoEl.textContent = `${((car.odometer * 1.4) / 1000).toFixed(2)} km`;
    const surface = car.surface === Surface.Water ? 'Splashing through the lake!' : car.surface === Surface.Grass ? 'Off-road' : '';
    if (this.surfaceEl.textContent !== surface) this.surfaceEl.textContent = surface;
    this.drawMinimap(car);
  }

  private drawMinimap(car: Car): void {
    const ctx = this.miniCtx;
    const size = this.mini.width;
    const zoom = size / MINIMAP_SPAN; // canvas px per carpet px
    const cx = car.x / WORLD_SCALE;
    const cy = car.z / WORLD_SCALE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    // Map carpet coordinates so the car sits in the centre; the pattern repeats like the world.
    const k = zoom / this.miniScale;
    ctx.setTransform(k, 0, 0, k, size / 2 - cx * zoom, size / 2 - cy * zoom);
    ctx.fillStyle = this.pattern;
    const x0 = (cx - MINIMAP_SPAN) * this.miniScale;
    const y0 = (cy - MINIMAP_SPAN) * this.miniScale;
    ctx.fillRect(x0, y0, MINIMAP_SPAN * 2 * this.miniScale, MINIMAP_SPAN * 2 * this.miniScale);
    ctx.restore();

    // Car marker.
    ctx.setTransform(1, 0, 0, 1, size / 2, size / 2);
    ctx.rotate(Math.atan2(car.forwardZ, car.forwardX));
    ctx.fillStyle = '#ff2a2a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, 6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
