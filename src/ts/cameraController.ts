import * as THREE from 'three';
import type { Car } from './car';
import type { Input } from './input';
import type { TiledColliders } from './collision';

/** Obstacles the camera must not end up behind or inside. */
export interface CameraWorld {
  colliders: TiledColliders;
  foliage: TiledColliders;
}

const DEFAULT_PITCH = 0.3;
const DEFAULT_DISTANCE = 9;

/** Third-person chase camera that can be orbited around the car with the mouse. */
export class ChaseCamera {
  private yawOffset = 0;
  private pitch = DEFAULT_PITCH;
  private distance = DEFAULT_DISTANCE;
  private followYaw = 0;
  private currentDistance = DEFAULT_DISTANCE;
  private readonly target = new THREE.Vector3();
  private initialised = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  reset(): void {
    this.yawOffset = 0;
    this.pitch = DEFAULT_PITCH;
    this.distance = DEFAULT_DISTANCE;
  }

  /** Switches between the normal chase view and a high bird's-eye view. */
  toggleOverhead(): void {
    const overhead = this.pitch > 1.2 && this.distance > 30;
    this.yawOffset = 0;
    this.pitch = overhead ? DEFAULT_PITCH : 1.4;
    this.distance = overhead ? DEFAULT_DISTANCE : 40;
  }

  update(dt: number, car: Car, input: Input, world: CameraWorld): void {
    const look = input.consumeLook();
    this.yawOffset -= look.dx * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.003, 0.05, 1.45);
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + look.zoom * 0.1), 4, 40);

    if (!this.initialised) {
      this.followYaw = car.yaw;
      this.initialised = true;
    }
    // Follow the car's heading smoothly; when reversing keep looking forward.
    let diff = car.yaw - this.followYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.followYaw += diff * Math.min(1, dt * 3.5);

    // Once the player stops looking around, swing back behind the car while driving.
    const idle = performance.now() - input.lastLookTime > 1500;
    if (idle && Math.abs(car.speed) > 2) {
      const off = Math.atan2(Math.sin(this.yawOffset), Math.cos(this.yawOffset));
      this.yawOffset = off * Math.exp(-dt * 1.5);
    }

    const yaw = this.followYaw + this.yawOffset;
    this.target.set(car.x, 1.2, car.z);

    // Pull the camera in front of buildings that would block the view of the car...
    const dirX = -Math.sin(yaw) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(yaw) * Math.cos(this.pitch);
    const at = (s: number): [number, number, number] => [car.x + dirX * s, 1.8 + dirY * s, car.z + dirZ * s];
    let allowed = this.distance;
    for (let s = 1.5; s <= this.distance + 0.5; s += 0.35) {
      const [x, y, z] = at(s);
      if (world.colliders.occludes(x, y, z, 0.35, 1.2)) {
        allowed = Math.max(1.5, s - 0.6);
        break;
      }
    }
    // ...and out of tree crowns (trees in between are fine, they don't hide much).
    while (allowed > 1.5) {
      const [x, y, z] = at(allowed);
      if (!world.foliage.occludes(x, y, z, 0.5, 0.5)) break;
      allowed = Math.max(1.5, allowed - 0.35);
    }
    this.currentDistance = allowed < this.currentDistance
      ? allowed
      : this.currentDistance + (allowed - this.currentDistance) * Math.min(1, dt * 2.5);

    const d = this.currentDistance;
    const cam = this.camera.position;
    cam.set(car.x + dirX * d, 1.8 + dirY * d, car.z + dirZ * d);
    if (car.impact > 0) {
      const s = car.impact * 0.25;
      cam.x += (Math.random() - 0.5) * s;
      cam.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
  }
}
