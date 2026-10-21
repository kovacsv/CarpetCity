import {
  TILE_W, TILE_H, ROAD_WIDTH, roads, roundabouts, junctions, crosswalks, apron, lake, yellowPath, busPad,
  parkingLots, buildings, props, trees as handTrees, type Point, type Rect,
} from './layout';
import { sampleSpline, nearestOnPolyline, createRandom, mod, fullDashes, distToPolyline } from './geometry';

export const COLORS = {
  grass: '#5cb03e',
  grassDark: '#2f6a2b',
  bush: '#2e6d2e',
  road: '#5a5e67',
  roadEdge: '#3a3d43',
  apron: '#46526a',
  dash: '#f4f4f0',
  water: '#2b6fd6',
  waterEdge: '#7ab6f2',
  path: '#f1cf27',
  pathEdge: '#c9a414',
  pad: '#f5d020',
  padText: '#e5702a',
};

export const enum Surface {
  Grass = 0,
  Road = 1,
  Water = 2,
}

export interface SampledRoad {
  id: string;
  line: Point[];
  width: number;
  dashed: boolean;
}

export interface Bush {
  x: number;
  y: number;
  r: number;
}

export interface TileMap {
  roads: SampledRoad[];
  trees: Point[];
  bushes: Bush[];
  /** Painted carpet texture (high resolution). */
  canvas: HTMLCanvasElement;
  /** Small copy of the carpet used for the minimap. */
  miniCanvas: HTMLCanvasElement;
  /** Pixels per carpet pixel in `canvas`. */
  scale: number;
  surfaceAt(x: number, y: number): Surface;
}

const WRAP_OFFSETS: Point[] = [];
for (const ox of [-TILE_W, 0, TILE_W]) for (const oy of [-TILE_H, 0, TILE_H]) WRAP_OFFSETS.push([ox, oy]);

/** Runs `draw` once for each neighbouring tile offset so shapes crossing the tile border wrap seamlessly. */
function wrapped(ctx: CanvasRenderingContext2D, scale: number, draw: () => void): void {
  for (const [ox, oy] of WRAP_OFFSETS) {
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    draw();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function polyPath(ctx: CanvasRenderingContext2D, line: Point[], closed = false): void {
  ctx.beginPath();
  ctx.moveTo(line[0][0], line[0][1]);
  for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
  if (closed) ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2d(c: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('2D canvas is not supported');
  return ctx;
}

export function buildTileMap(textureScale: number): TileMap {
  const sampled: SampledRoad[] = roads.map((r) => ({
    id: r.id,
    line: sampleSpline(r.points, false, 3),
    width: r.width ?? ROAD_WIDTH,
    dashed: r.dashed ?? true,
  }));
  const lakeLine = sampleSpline(lake, true, 4);
  const pathLine = sampleSpline(yellowPath, true, 4);

  // --- Surface mask (1 px per carpet px): red = drivable road, blue = water. ---
  const surfaceCanvas = createCanvas(TILE_W, TILE_H);
  const sctx = get2d(surfaceCanvas, true);
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, TILE_W, TILE_H);
  wrapped(sctx, 1, () => {
    sctx.fillStyle = '#00f';
    polyPath(sctx, lakeLine, true);
    sctx.fill();
    sctx.strokeStyle = '#f00';
    sctx.fillStyle = '#f00';
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    for (const r of sampled) {
      sctx.lineWidth = r.width;
      polyPath(sctx, r.line);
      sctx.stroke();
    }
    sctx.fillStyle = '#000';
    roundRect(sctx, apron, 30);
    sctx.fill();
    for (const lot of parkingLots) sctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    for (const ra of roundabouts) {
      sctx.fillStyle = '#f00';
      sctx.beginPath();
      sctx.arc(ra.x, ra.y, ra.outer, 0, Math.PI * 2);
      sctx.fill();
      sctx.fillStyle = '#000';
      sctx.beginPath();
      sctx.arc(ra.x, ra.y, ra.island, 0, Math.PI * 2);
      sctx.fill();
    }
  });
  const surfaceData = sctx.getImageData(0, 0, TILE_W, TILE_H).data;
  const surfaceAt = (x: number, y: number): Surface => {
    const i = (Math.floor(mod(y, TILE_H)) * TILE_W + Math.floor(mod(x, TILE_W))) * 4;
    if (surfaceData[i] > 127) return Surface.Road;
    if (surfaceData[i + 2] > 127) return Surface.Water;
    return Surface.Grass;
  };

  // --- Occupancy mask used to scatter trees and bushes into empty grass. ---
  const occCanvas = createCanvas(TILE_W, TILE_H);
  const octx = get2d(occCanvas, true);
  octx.drawImage(surfaceCanvas, 0, 0);
  wrapped(octx, 1, () => {
    octx.fillStyle = '#fff';
    octx.strokeStyle = '#fff';
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    for (const r of sampled) {
      octx.lineWidth = r.width + 14;
      polyPath(octx, r.line);
      octx.stroke();
    }
    octx.lineWidth = 26;
    polyPath(octx, pathLine, true);
    octx.stroke();
    octx.lineWidth = 16;
    polyPath(octx, lakeLine, true);
    octx.stroke();
    for (const ra of roundabouts) {
      octx.beginPath();
      octx.arc(ra.x, ra.y, ra.outer + 8, 0, Math.PI * 2);
      octx.fill();
    }
    roundRect(octx, apron, 30);
    octx.fill();
    octx.fillRect(busPad.x - 6, busPad.y - 6, busPad.w + 12, busPad.h + 12);
    for (const lot of parkingLots) octx.fillRect(lot.x - 8, lot.y - 8, lot.w + 16, lot.h + 16);
    for (const b of buildings) octx.fillRect(b.x - b.w / 2 - 10, b.y - b.d / 2 - 14, b.w + 20, b.d + 34);
    for (const p of props) {
      const r = p.kind === 'plane' ? 70 : p.kind === 'fireTruck' ? 30 : 18;
      octx.beginPath();
      octx.arc(p.x, p.y, r, 0, Math.PI * 2);
      octx.fill();
    }
  });
  const occRgba = octx.getImageData(0, 0, TILE_W, TILE_H).data;
  const occ = new Uint8Array(TILE_W * TILE_H);
  for (let i = 0; i < occ.length; i++) {
    occ[i] = occRgba[i * 4] > 40 || occRgba[i * 4 + 1] > 40 || occRgba[i * 4 + 2] > 40 ? 1 : 0;
  }
  const occIndex = (x: number, y: number) => Math.floor(mod(y, TILE_H)) * TILE_W + Math.floor(mod(x, TILE_W));
  const isFree = (x: number, y: number, r: number): boolean => {
    const radius = Math.ceil(r);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r * r && occ[occIndex(x + dx, y + dy)]) return false;
      }
    }
    return true;
  };
  const markOccupied = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) occ[occIndex(x + dx, y + dy)] = 1;
      }
    }
  };

  const rand = createRandom(1987);
  const treeList: Point[] = [];
  for (const [x, y] of handTrees) {
    if (isFree(x, y, 16)) {
      treeList.push([x, y]);
      markOccupied(x, y, 18);
    }
  }
  for (let attempt = 0; attempt < 3000 && treeList.length < 75; attempt++) {
    const x = rand() * TILE_W;
    const y = rand() * TILE_H;
    if (isFree(x, y, 16)) {
      treeList.push([x, y]);
      markOccupied(x, y, 18);
    }
  }
  const bushes: Bush[] = [];
  for (let attempt = 0; attempt < 4000 && bushes.length < 170; attempt++) {
    const x = rand() * TILE_W;
    const y = rand() * TILE_H;
    const r = 5 + rand() * 5;
    if (isFree(x, y, r + 2)) {
      bushes.push({ x, y, r });
      markOccupied(x, y, r + 1);
    }
  }

  // --- The painted carpet texture. ---
  const k = textureScale;
  const canvas = createCanvas(Math.round(TILE_W * k), Math.round(TILE_H * k));
  const ctx = get2d(canvas, true);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  wrapped(ctx, k, () => {
    // Lake.
    ctx.lineJoin = 'round';
    polyPath(ctx, lakeLine, true);
    ctx.fillStyle = COLORS.water;
    ctx.fill();
    ctx.strokeStyle = COLORS.waterEdge;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (const [wx, wy] of [[30, 330], [110, 345], [-10, 355], [150, 330], [60, 356]] as Point[]) {
      ctx.beginPath();
      ctx.moveTo(wx - 12, wy);
      ctx.quadraticCurveTo(wx - 6, wy - 5, wx, wy);
      ctx.quadraticCurveTo(wx + 6, wy + 5, wx + 12, wy);
      ctx.stroke();
    }

    // Yellow footpath around the hospital.
    ctx.lineCap = 'round';
    polyPath(ctx, pathLine, true);
    ctx.strokeStyle = COLORS.pathEdge;
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 11;
    ctx.stroke();

    // Soft dark-green ground patches under trees, like the printed trees on the carpet.
    ctx.fillStyle = 'rgba(30,80,30,0.35)';
    for (const [tx, ty] of treeList) {
      ctx.beginPath();
      ctx.arc(tx, ty, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bus stop pad.
    roundRect(ctx, busPad, 6);
    ctx.fillStyle = COLORS.pad;
    ctx.fill();
    ctx.strokeStyle = '#8a6d10';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.padText;
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BUS', busPad.x + busPad.w / 2, busPad.y + busPad.h / 2 + 2);

    // Road edges, then road surfaces.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.roadEdge;
    ctx.fillStyle = COLORS.roadEdge;
    for (const r of sampled) {
      ctx.lineCap = r.id === 'LOT' ? 'square' : 'round';
      ctx.lineWidth = r.width + 5;
      polyPath(ctx, r.line);
      ctx.stroke();
    }
    roundRect(ctx, { x: apron.x - 2.5, y: apron.y - 2.5, w: apron.w + 5, h: apron.h + 5 }, 32);
    ctx.fill();
    for (const ra of roundabouts) {
      ctx.beginPath();
      ctx.arc(ra.x, ra.y, ra.outer + 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  wrapped(ctx, k, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.road;
    for (const r of sampled) {
      ctx.lineCap = r.id === 'LOT' ? 'square' : 'round';
      ctx.lineWidth = r.width;
      polyPath(ctx, r.line);
      ctx.stroke();
    }
    roundRect(ctx, apron, 30);
    ctx.fillStyle = COLORS.apron;
    ctx.fill();
    for (const lot of parkingLots) drawParkingLot(ctx, lot);
  });

  // Dashed centre lines.
  const dashExclusions = [
    ...roundabouts.map((ra) => ({ x: ra.x, y: ra.y, radius: ra.outer })),
    ...crosswalks.map((cw) => {
      const road = sampled.find((r) => r.id === cw.road);
      if (!road) throw new Error(`Unknown crosswalk road: ${cw.road}`);
      const { index } = nearestOnPolyline(road.line, cw.x, cw.y);
      const [x, y] = road.line[index];
      return { x, y, radius: 18 };
    }),
  ];
  const roadDashes = sampled.filter((r) => r.dashed).flatMap((r) => {
    // Keep through-road markings at T-junctions; only joining roads stop short.
    const endJunctions = junctions.filter(([x, y]) =>
      [r.line[0], r.line[r.line.length - 1]].some(([ex, ey]) =>
        WRAP_OFFSETS.some(([ox, oy]) => Math.hypot(ex - x - ox, ey - y - oy) < 1)));
    const exclusions = [
      ...dashExclusions,
      ...endJunctions.map(([x, y]) => ({ x, y, radius: ROAD_WIDTH / 2 })),
    ];
    return fullDashes(r.line, 13, 11).filter((dash) => !exclusions.some(({ x, y, radius }) =>
      WRAP_OFFSETS.some(([ox, oy]) => distToPolyline(x + ox, y + oy, dash) <= radius + 1.3)));
  })
    // Omit whole road dashes overlapping the airport, including its wrapped copy.
    .filter((dash) => {
      const minX = Math.min(...dash.map(([x]) => x)) - 1.3;
      const maxX = Math.max(...dash.map(([x]) => x)) + 1.3;
      const minY = Math.min(...dash.map(([, y]) => y)) - 1.3;
      const maxY = Math.max(...dash.map(([, y]) => y)) + 1.3;
      return !WRAP_OFFSETS.some(([ox, oy]) =>
        maxX >= apron.x + ox && minX <= apron.x + apron.w + ox &&
        maxY >= apron.y + oy && minY <= apron.y + apron.h + oy);
    })
    // Move each complete dash into the tile, including dashes on roads that cross its west edge.
    .map((dash) => {
      const centreX = (dash[0][0] + dash[dash.length - 1][0]) / 2;
      const shift = Math.floor(centreX / TILE_W) * TILE_W;
      return shift === 0 ? dash : dash.map(([x, y]): Point => [x - shift, y]);
    });
  wrapped(ctx, k, () => {
    ctx.save();
    ctx.strokeStyle = COLORS.dash;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'butt';
    for (const dash of roadDashes) {
      polyPath(ctx, dash);
      ctx.stroke();
    }
    ctx.restore();
  });

  wrapped(ctx, k, () => {
    // Roundabouts.
    for (const ra of roundabouts) {
      ctx.fillStyle = COLORS.road;
      ctx.beginPath();
      ctx.arc(ra.x, ra.y, ra.outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.dash;
      ctx.lineWidth = 2.6;
      ctx.setLineDash([11, 9]);
      ctx.beginPath();
      ctx.arc(ra.x, ra.y, (ra.outer + ra.island) / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.roadEdge;
      ctx.beginPath();
      ctx.arc(ra.x, ra.y, ra.island + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ra.centre === 'dot' ? COLORS.pad : COLORS.grass;
      ctx.beginPath();
      ctx.arc(ra.x, ra.y, ra.island, 0, Math.PI * 2);
      ctx.fill();
      if (ra.centre === 'dot') {
        ctx.fillStyle = '#1f2a10';
        ctx.beginPath();
        ctx.arc(ra.x - 4, ra.y - 3, 1.6, 0, Math.PI * 2);
        ctx.arc(ra.x + 4, ra.y - 3, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = COLORS.bush;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(ra.x + Math.cos(ang) * (ra.island - 7), ra.y + Math.sin(ang) * (ra.island - 7), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Crosswalks.
    ctx.fillStyle = COLORS.dash;
    for (const cw of crosswalks) {
      const road = sampled.find((r) => r.id === cw.road);
      if (!road) continue;
      const { index, angle } = nearestOnPolyline(road.line, cw.x, cw.y);
      const [cx, cy] = road.line[index];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      // Zebra bars run along the road and are spaced across its width.
      const half = Math.floor((road.width - 10) / 16);
      for (let i = -half; i <= half; i++) ctx.fillRect(-11, i * 8 - 2.5, 22, 5);
      ctx.restore();
    }

    // Apron lights and taxi line.
    ctx.fillStyle = '#ffd21c';
    const midY = apron.y + apron.h / 2;
    for (let x = apron.x + 25; x < apron.x + apron.w - 15; x += 14) {
      ctx.beginPath();
      ctx.arc(x, midY + 14, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4fa3ff';
    for (let x = apron.x + 20; x < apron.x + apron.w - 15; x += 12) {
      for (const y of [apron.y + 8, apron.y + apron.h - 8]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  addFabricNoise(ctx, canvas.width, canvas.height);

  const miniCanvas = createCanvas(Math.round(TILE_W / 2), Math.round(TILE_H / 2));
  const mctx = get2d(miniCanvas);
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(canvas, 0, 0, miniCanvas.width, miniCanvas.height);

  return { roads: sampled, trees: treeList, bushes, canvas, miniCanvas, scale: k, surfaceAt };
}

function drawParkingLot(ctx: CanvasRenderingContext2D, lot: (typeof parkingLots)[number]): void {
  ctx.fillStyle = COLORS.road;
  ctx.strokeStyle = COLORS.dash;
  ctx.lineWidth = 1.6;
  if (lot.rows === 'h') {
    const depth = 34;
    const skew = 12;
    const stall = 28;
    ctx.fillRect(lot.x, lot.y + depth, lot.w, lot.h - depth * 2);
    for (let x = lot.x; x + stall + skew <= lot.x + lot.w + 0.1; x += stall) {
      // Top row of angled stalls.
      ctx.beginPath();
      ctx.moveTo(x, lot.y + depth);
      ctx.lineTo(x + stall, lot.y + depth);
      ctx.lineTo(x + stall + skew, lot.y);
      ctx.lineTo(x + skew, lot.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Bottom row.
      ctx.beginPath();
      ctx.moveTo(x, lot.y + lot.h - depth);
      ctx.lineTo(x + stall, lot.y + lot.h - depth);
      ctx.lineTo(x + stall + skew, lot.y + lot.h);
      ctx.lineTo(x + skew, lot.y + lot.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeRect(lot.x, lot.y, lot.w, lot.h);
    const stallCount = Math.max(1, Math.floor(lot.h / 24));
    const stallWidth = lot.h / stallCount;
    for (let i = 1; i < stallCount; i++) {
      const y = lot.y + i * stallWidth;
      ctx.beginPath();
      ctx.moveTo(lot.x, y);
      ctx.lineTo(lot.x + lot.w, y);
      ctx.stroke();
    }
  }
}

/** Adds a subtle per-pixel speckle so the ground reads as carpet pile rather than flat paint. */
function addFabricNoise(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let seed = 12345;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 24) - 128) / 128;
    const v = n * 9;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
  ctx.putImageData(img, 0, 0);
}
