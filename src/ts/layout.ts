// Layout of a single carpet tile, traced from images/carpet1.jpg.
// Coordinates are in "carpet pixels": x grows to the east (right), y grows to the south (down),
// exactly like the source image. The tile repeats seamlessly in both directions, so coordinates
// outside [0, TILE_W) x [0, TILE_H) are valid and simply wrap around.

export const TILE_W = 1140;
export const TILE_H = 555;
/** World units per carpet pixel. */
export const WORLD_SCALE = 0.1;
export const ROAD_WIDTH = 44;

export type Point = [number, number];

export interface Road {
  id: string;
  points: Point[];
  width?: number;
  dashed?: boolean;
}

export interface Roundabout {
  x: number;
  y: number;
  outer: number;
  island: number;
  centre: 'fountain' | 'dot';
}

export interface Crosswalk {
  road: string;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParkingLot extends Rect {
  /** 'h' = stall rows along the top and bottom edges, 'v' = a single row of stalls stacked vertically. */
  rows: 'h' | 'v';
}

export type BuildingKind =
  | 'hospital'
  | 'police'
  | 'fireStation'
  | 'townHall'
  | 'house'
  | 'chapel'
  | 'garage'
  | 'postOffice'
  | 'terminal'
  | 'tower'
  | 'busShelter'
  | 'shop';

export interface Building {
  kind: BuildingKind;
  x: number;
  y: number;
  /** Footprint size in carpet pixels (width along x, depth along y). */
  w: number;
  d: number;
}

export type PropKind =
  | 'fountain'
  | 'flowerbed'
  | 'plane'
  | 'ambulance'
  | 'policeCar'
  | 'fireTruck'
  | 'parkedCar'
  | 'pump'
  | 'mailbox'
  | 'parkingSign'
  | 'bench';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Heading in radians: 0 = facing south (+y), PI/2 = facing east (+x). */
  rot?: number;
  color?: string;
}

export const roads: Road[] = [
  { id: 'A', points: [[-295, 15], [-215, 42], [-100, 72], [0, 90], [100, 90], [185, 90], [260, 74], [400, 64], [540, 62], [680, 58], [770, 42], [845, 15]] },
  { id: 'HE', points: [[965, 245], [1060, 245], [1140, 245], [1180, 250]] },
  { id: 'V1', points: [[965, 245], [985, 330], [990, 430]] },
  { id: 'SE', points: [[845, 15], [870, 100], [930, 190], [965, 245]] },
  { id: 'NE', points: [[845, 570], [910, 520], [960, 470], [990, 430]] },
  { id: 'NW', points: [[575, 440], [650, 470], [740, 515], [800, 545], [845, 570]] },
  { id: 'B', points: [[-150, 430], [-60, 450], [0, 455], [185, 455], [250, 440], [330, 425], [450, 425], [520, 430], [575, 440]] },
  { id: 'RAN', points: [[185, 90], [185, 0], [185, -100]] },
  { id: 'S1', points: [[185, 90], [190, 170], [215, 245], [270, 300], [320, 370], [330, 425]] },
  { id: 'C', points: [[215, 245], [300, 240], [450, 238], [590, 240], [700, 250], [850, 250], [965, 245]] },
  { id: 'N1', points: [[540, 62], [545, 150], [590, 240]] },
  { id: 'V2', points: [[590, 240], [595, 340], [575, 440]] },
  { id: 'LOT', points: [[595, 336], [545, 336]], width: 36, dashed: false },
];

export const roundabouts: Roundabout[] = [
  { x: 185, y: 90, outer: 52, island: 15, centre: 'dot' },
  { x: 845, y: 15, outer: 78, island: 36, centre: 'fountain' },
];

/** Points where dashed centre lines are interrupted. */
export const junctions: Point[] = [
  [965, 245], [330, 425], [590, 240], [540, 62], [575, 440], [990, 430], [185, 455], [215, 245], [595, 336],
];

export const crosswalks: Crosswalk[] = [
  { road: 'A', x: 255, y: 76 },
  { road: 'A', x: 735, y: 50 },
  { road: 'A', x: -190, y: 50 },
  { road: 'RAN', x: 185, y: 22 },
  { road: 'S1', x: 191, y: 160 },
  { road: 'N1', x: 543, y: 135 },
  { road: 'C', x: 630, y: 242 },
  { road: 'C', x: 420, y: 238 },
  { road: 'SE', x: 900, y: 150 },
  { road: 'HE', x: 1010, y: 245 },
  { road: 'V1', x: 983, y: 300 },
  { road: 'B', x: -110, y: 440 },
  { road: 'NE', x: 935, y: 495 },
  { road: 'NW', x: 700, y: 495 },
  { road: 'B', x: 275, y: 436 },
  { road: 'V2', x: 594, y: 300 },
];

/** The airport apron in the west field, clear of the nearby road junction. */
export const apron: Rect = { x: -65, y: 226, w: 205, h: 74 };

/** Closed outline of the lake (it wraps across the west/east tile border). */
export const lake: Point[] = [
  [-40, 332], [-20, 307], [40, 305], [110, 302], [178, 316], [198, 345], [160, 372], [70, 370], [0, 378], [-35, 362],
];

/** Closed outline of the yellow footpath around the hospital. */
export const yellowPath: Point[] = [
  [640, 300], [760, 288], [900, 292], [940, 330], [938, 410], [905, 450], [790, 456], [690, 446], [646, 420], [632, 360],
];

export const busPad: Rect = { x: 20, y: 22, w: 130, h: 38 };

export const parkingLots: ParkingLot[] = [
  { x: 365, y: 284, w: 180, h: 104, rows: 'h' },
  { x: 236, y: 132, w: 36, h: 72, rows: 'v' },
  { x: 570, y: 90, w: 34, h: 48, rows: 'v' },
];

export const buildings: Building[] = [
  { kind: 'terminal', x: 60, y: 168, w: 100, d: 48 },
  { kind: 'tower', x: -7, y: 160, w: 26, d: 26 },
  { kind: 'busShelter', x: 60, y: 2, w: 40, d: 20 },
  { kind: 'house', x: 341, y: 166, w: 122, d: 52 },
  { kind: 'chapel', x: 428, y: 160, w: 56, d: 60 },
  { kind: 'townHall', x: 680, y: 150, w: 150, d: 66 },
  { kind: 'police', x: 1030, y: 160, w: 136, d: 62 },
  { kind: 'hospital', x: 790, y: 385, w: 200, d: 72 },
  { kind: 'garage', x: 330, y: 515, w: 160, d: 56 },
  { kind: 'postOffice', x: 540, y: 515, w: 108, d: 52 },
  { kind: 'fireStation', x: 1065, y: 528, w: 128, d: 56 },
  { kind: 'shop', x: 1052, y: 330, w: 62, d: 36 },
];

export const props: Prop[] = [
  { kind: 'fountain', x: 845, y: 15 },
  { kind: 'flowerbed', x: 830, y: 185 },
  { kind: 'plane', x: 60, y: 262, rot: Math.PI / 2 },
  { kind: 'ambulance', x: 905, y: 405, rot: 0 },
  { kind: 'policeCar', x: 1072, y: 175, rot: 0 },
  { kind: 'fireTruck', x: 1100, y: 572, rot: 0 },
  { kind: 'parkedCar', x: 385, y: 566, rot: Math.PI / 2, color: '#d7262e' },
  { kind: 'parkedCar', x: 413, y: 301, rot: Math.atan2(-12, 34), color: '#2a62c9' },
  { kind: 'parkedCar', x: 469, y: 371, rot: Math.PI + Math.atan2(12, 34), color: '#f1c40f' },
  { kind: 'parkedCar', x: 254, y: 144, rot: Math.PI / 2, color: '#ffffff' },
  { kind: 'pump', x: 300, y: 563 },
  { kind: 'pump', x: 335, y: 563 },
  { kind: 'mailbox', x: 622, y: 528 },
  { kind: 'parkingSign', x: 555, y: 315 },
  { kind: 'parkingSign', x: 228, y: 125 },
  { kind: 'parkingSign', x: 612, y: 100 },
  { kind: 'bench', x: 780, y: 466, rot: Math.PI },
  { kind: 'bench', x: 120, y: 14, rot: Math.PI },
];

/** Hand-placed trees (carpet pixels). More are scattered procedurally into free grass. */
export const trees: Point[] = [
  [130, 383], [255, 375], [60, 420], [125, 205], [245, 112], [480, 100], [470, 205], [775, 150], [792, 178], [768, 198],
  [630, 300], [925, 370], [650, 430], [1110, 120], [930, 85], [1120, 285], [1000, 300], [25, 515], [100, 505], [125, 525],
  [440, 545], [610, 470], [720, 560], [1000, 480], [540, 280], [360, 400], [240, 520], [470, 470], [880, 210], [1110, 405],
];
