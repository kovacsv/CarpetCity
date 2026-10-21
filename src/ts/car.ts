import * as THREE from 'three';
import { PartBuilder } from './builder';
import type { TiledColliders } from './collision';
import { Surface } from './tileMap';
import type { InputState } from './input';

export interface DrivingWorld {
  colliders: TiledColliders;
  /** Surface under a world position. */
  surfaceAt(x: number, z: number): Surface;
}

const MAX_SPEED = 24;
const MAX_REVERSE = 7;
const ACCELERATION = 11;
const BRAKE = 28;
const ROLLING_DRAG = 2.2;
const AIR_DRAG = 0.012;
const WHEELBASE = 2.2;
const MAX_STEER = 0.6;
const WHEEL_RADIUS = 0.36;
const BODY_RADIUS = 0.82;
const CIRCLE_OFFSET = 0.85;

const SURFACE_GRIP: Record<Surface, { maxSpeed: number; drag: number }> = {
  [Surface.Road]: { maxSpeed: 1, drag: 0 },
  [Surface.Grass]: { maxSpeed: 0.55, drag: 3.5 },
  [Surface.Water]: { maxSpeed: 0.3, drag: 9 },
};

export class Car {
  readonly object = new THREE.Group();
  x = 0;
  z = 0;
  /** Heading: 0 = facing +z (south on the carpet), PI/2 = facing +x (east). */
  yaw = 0;
  speed = 0;
  steer = 0;
  odometer = 0;
  surface: Surface = Surface.Road;
  /** Strength of the last impact, used for camera shake. */
  impact = 0;

  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Object3D[] = [];
  private readonly frontPivots: THREE.Object3D[] = [];
  private wheelSpin = 0;
  private pitch = 0;
  private roll = 0;
  private lastSpeed = 0;

  constructor() {
    this.object.add(this.body);
    this.buildModel();
  }

  private buildModel(): void {
    const red = '#e5262b';
    const glass = '#1d2f55';
    const pb = new PartBuilder();
    pb.block(0, 0.28, 0, 1.72, 0.52, 3.5, red);
    pb.block(0, 0.8, 0.95, 1.6, 0.08, 1.45, red);
    pb.block(0, 0.8, -0.3, 1.48, 0.55, 1.75, red);
    pb.box(-0.75, 1.08, -0.3, 0.02, 0.34, 1.1, glass);
    pb.box(0.75, 1.08, -0.3, 0.02, 0.34, 1.1, glass);
    pb.box(0, 1.08, 0.59, 1.0, 0.34, 0.02, glass);
    pb.box(0, 1.08, -1.19, 0.95, 0.34, 0.02, glass);
    pb.block(0, 1.35, -0.3, 1.42, 0.06, 1.6, '#c81d22');
    // White racing stripes.
    for (const s of [-0.18, 0.18]) {
      pb.block(s, 0.885, 0.95, 0.18, 0.012, 1.45, '#ffffff');
      pb.block(s, 1.415, -0.3, 0.18, 0.012, 1.6, '#ffffff');
      pb.block(s, 0.8, -1.45, 0.18, 0.012, 0.6, '#ffffff');
    }
    pb.block(0, 0.22, 1.76, 1.78, 0.28, 0.14, '#2b2d31');
    pb.block(0, 0.22, -1.76, 1.78, 0.28, 0.14, '#2b2d31');
    for (const s of [-1, 1]) {
      pb.box(s * 0.58, 0.62, 1.76, 0.36, 0.16, 0.04, '#fff6c8');
      pb.box(s * 0.58, 0.62, -1.76, 0.36, 0.14, 0.04, '#ff2a2a');
      pb.box(s * 0.82, 1.0, 0.45, 0.12, 0.1, 0.22, red);
    }
    // Small rear spoiler.
    pb.block(0, 1.02, -1.6, 1.6, 0.06, 0.32, '#2b2d31');
    for (const s of [-0.6, 0.6]) pb.block(s, 0.8, -1.6, 0.08, 0.22, 0.12, '#2b2d31');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const bodyMesh = new THREE.Mesh(pb.build(), mat);
    bodyMesh.castShadow = true;
    this.body.add(bodyMesh);

    const wb = new PartBuilder();
    wb.cylinderX(0, 0, 0, WHEEL_RADIUS, 0.3, '#1b1c1f', 16);
    wb.cylinderX(0, 0, 0, WHEEL_RADIUS * 0.55, 0.32, '#c9ccd2', 10);
    wb.box(0, 0, 0, 0.33, WHEEL_RADIUS * 1.1, 0.12, '#8a8f98');
    const wheelGeo = wb.build();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pivot = new THREE.Object3D();
        pivot.position.set(sx * 0.8, WHEEL_RADIUS, sz * 1.15);
        const wheel = new THREE.Mesh(wheelGeo, mat);
        wheel.castShadow = true;
        pivot.add(wheel);
        this.object.add(pivot);
        this.wheels.push(wheel);
        if (sz > 0) this.frontPivots.push(pivot);
      }
    }
  }

  get forwardX(): number {
    return Math.sin(this.yaw);
  }

  get forwardZ(): number {
    return Math.cos(this.yaw);
  }

  place(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.syncObject();
  }

  update(dt: number, input: InputState, world: DrivingWorld): void {
    this.surface = world.surfaceAt(this.x, this.z);
    const grip = SURFACE_GRIP[this.surface];
    const maxSpeed = MAX_SPEED * grip.maxSpeed;

    // Throttle, brake and reverse.
    const throttle = input.forward ? 1 : 0;
    const reverse = input.backward ? 1 : 0;
    if (throttle && this.speed >= -0.5) {
      this.speed += ACCELERATION * dt * Math.max(0, 1 - this.speed / maxSpeed) * 1.4;
    } else if (throttle) {
      this.speed = Math.min(0, this.speed + BRAKE * dt);
    }
    if (reverse && this.speed > 0.5) {
      this.speed = Math.max(0, this.speed - BRAKE * dt);
    } else if (reverse) {
      this.speed = Math.max(-MAX_REVERSE * grip.maxSpeed, this.speed - ACCELERATION * 0.6 * dt);
    }
    if (!throttle && !reverse) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), ROLLING_DRAG * dt);
    }
    // Surface and air drag; anything above the surface limit bleeds off quickly.
    const drag = grip.drag + AIR_DRAG * Math.abs(this.speed);
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), drag * dt);
    if (this.speed > maxSpeed) this.speed = Math.max(maxSpeed, this.speed - 18 * dt);

    // Steering gets gentler at speed so the car stays controllable.
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerLimit = MAX_STEER / (1 + Math.abs(this.speed) / 14);
    const target = steerInput * steerLimit;
    this.steer += (target - this.steer) * Math.min(1, dt * 9);
    const yawRate = (this.speed * Math.tan(this.steer)) / WHEELBASE;
    this.yaw += yawRate * dt;

    const dx = this.forwardX * this.speed * dt;
    const dz = this.forwardZ * this.speed * dt;
    this.x += dx;
    this.z += dz;
    this.odometer += Math.hypot(dx, dz);

    this.resolveCollisions(world.colliders);

    // Visual details: wheel spin, steering, body pitch and roll.
    this.wheelSpin += (this.speed * dt) / WHEEL_RADIUS;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = this.steer;
    const accel = (this.speed - this.lastSpeed) / Math.max(dt, 1e-4);
    this.lastSpeed = this.speed;
    this.pitch += (THREE.MathUtils.clamp(-accel * 0.004, -0.06, 0.06) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (THREE.MathUtils.clamp(yawRate * this.speed * 0.006, -0.08, 0.08) - this.roll) * Math.min(1, dt * 6);
    this.impact = Math.max(0, this.impact - dt * 3);
    this.syncObject();
  }

  private resolveCollisions(colliders: TiledColliders): void {
    for (let iter = 0; iter < 4; iter++) {
      let hit = false;
      for (const offset of [CIRCLE_OFFSET, -CIRCLE_OFFSET]) {
        const cx = this.x + this.forwardX * offset;
        const cz = this.z + this.forwardZ * offset;
        const c = colliders.collideCircle(cx, cz, BODY_RADIUS);
        if (!c) continue;
        hit = true;
        this.x += c.nx * c.depth;
        this.z += c.nz * c.depth;
        // Velocity component into the obstacle.
        const into = (this.forwardX * c.nx + this.forwardZ * c.nz) * this.speed;
        if (into < 0) {
          const headOn = Math.abs(this.forwardX * c.nx + this.forwardZ * c.nz);
          if (headOn > 0.6) {
            this.impact = Math.max(this.impact, Math.min(1, Math.abs(this.speed) / 15));
            this.speed = -this.speed * 0.25;
          } else {
            this.speed *= 1 - 0.6 * headOn;
          }
        }
      }
      if (!hit) break;
    }
  }

  private syncObject(): void {
    this.object.position.set(this.x, 0, this.z);
    this.object.rotation.y = this.yaw;
    this.body.rotation.set(this.pitch, 0, this.roll);
  }
}
