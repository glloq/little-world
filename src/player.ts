import type {WorldCollisionQuery,MovementSpace} from './physics/collision-world.ts';
import * as THREE from 'three';
import {
  clamp,
  getTerrainConfig,
  insideWorld,
  terrainHeight,
  waterSurface,
} from './terrain.ts';

export type MotionMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive';
export interface Controls {
  forward: number;
  right: number;
  run: boolean;
  jumpPressed: boolean;
  spaceHeld: boolean;
  dive: boolean;
  cameraYaw: number;
}
export interface Player {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mode: MotionMode;
  oxygen: number;
  glideReady: boolean;
  space?:MovementSpace;
}
export const MAX_OXYGEN = 90;
export function spawnPlayer(): Player {
  const x = -24,
    z = -183;
  return {
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.02, z),
    velocity: new THREE.Vector3(),
    mode: 'ground',
    oxygen: MAX_OXYGEN,
    glideReady: false,
  };
}

export function simulatePlayer(p: Player, keys: Controls, dt: number,collision?:WorldCollisionQuery): void {
  const { position: pos, velocity: v } = p;
  const oldMode = p.mode;
  const len = Math.hypot(keys.forward, keys.right);
  const forward = len > 0 ? keys.forward / Math.max(1, len) : 0;
  const right = len > 0 ? keys.right / Math.max(1, len) : 0;
  const sx = Math.sin(keys.cameraYaw),
    cz = Math.cos(keys.cameraYaw);
  // Camera looks toward +Z at yaw=0: screen-right is world -X.
  const dx = forward * sx - right * cz;
  const dz = forward * cz + right * sx;
  const atWater = collision?collision.waterAt(pos,p.space):waterSurface(pos.x, pos.z);
  const ground = collision?collision.surfaceAt(pos,p.space).floorY:terrainHeight(pos.x, pos.z);
  const deepEnough = atWater !== null && atWater - ground > 0.62;
  const inWater = deepEnough && pos.y <= atWater + 0.42;
  if (inWater) {
    if (oldMode !== 'swim' && oldMode !== 'dive') {
      p.mode = 'swim';
      v.y = 0;
      pos.y = Math.min(pos.y, atWater + 0.12);
    }
    const speed = keys.run ? 5.0 : 3.15;
    const smoothing = Math.min(1, dt * 6);
    v.x += (dx * speed - v.x) * smoothing;
    v.z += (dz * speed - v.z) * smoothing;
    let vyTarget = 0;
    if (keys.dive) vyTarget = -3.2;
    else if (keys.spaceHeld || p.oxygen <= 0) vyTarget = 3.75;
    else if (pos.y >= atWater - 0.3) vyTarget = 1.2;
    v.y += (vyTarget - v.y) * Math.min(1, dt * 5);
    pos.y += v.y * dt;
    const floor = ground + 0.45;
    pos.y = clamp(pos.y, floor, atWater + 0.12);
    p.mode = pos.y < atWater - 0.55 ? 'dive' : 'swim';
    if (p.mode === 'dive') p.oxygen = Math.max(0, p.oxygen - dt);
    else p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 9);
    p.glideReady = false;
  } else {
    if (oldMode === 'swim' || oldMode === 'dive') {
      p.mode = 'air';
      v.y = Math.max(0, v.y);
    }
    const grounded = pos.y <= ground + 0.06 && v.y <= 0;
    if (grounded) {
      p.mode = 'ground';
      pos.y = ground;
      v.y = 0;
      p.glideReady = false;
      if (keys.jumpPressed) {
        p.mode = 'air';
        v.y = 7.1;
        p.glideReady = true;
      }
    } else if (p.mode === 'ground') {
      p.mode = 'air';
      p.glideReady = true;
    }
    if (p.mode === 'air' || p.mode === 'glide') {
      if (keys.jumpPressed && p.glideReady && oldMode !== 'ground') {
        p.mode = p.mode === 'glide' ? 'air' : 'glide';
      }
      if (p.mode === 'glide') {
        const forwardSpeed = 10.4,
          a = Math.min(1, dt * 2.1);
        v.x += (dx * forwardSpeed - v.x) * a;
        v.z += (dz * forwardSpeed - v.z) * a;
        v.y = Math.max(-2.8, v.y - 5.0 * dt);
        v.y = Math.min(v.y, 2.8);
      } else {
        v.y -= 17.2 * dt;
        const speed = keys.run ? 7.2 : 5.2;
        const a = Math.min(1, dt * 1.9);
        v.x += (dx * speed - v.x) * a;
        v.z += (dz * speed - v.z) * a;
      }
      pos.y += v.y * dt;
      const nextGround = collision?collision.surfaceAt(pos,p.space).floorY:terrainHeight(pos.x, pos.z);
      if (pos.y <= nextGround && v.y <= 0) {
        pos.y = nextGround;
        v.y = 0;
        p.mode = 'ground';
        p.glideReady = false;
      }
    } else {
      const speed = keys.run ? 8.7 : 4.65;
      const a = Math.min(1, dt * 10);
      v.x += (dx * speed - v.x) * a;
      v.z += (dz * speed - v.z) * a;
    }
    p.oxygen = Math.min(MAX_OXYGEN, p.oxygen + dt * 14);
  }
  const from=collision?{x:pos.x,y:pos.y,z:pos.z}:null;
  pos.x += v.x * dt;
  pos.z += v.z * dt;
  if(collision&&from){const moved=collision.move(from,pos);pos.x=moved.position.x;pos.z=moved.position.z;if(moved.blockedX)v.x=0;if(moved.blockedZ)v.z=0;}
  if (!insideWorld(pos.x, pos.z)) {
    const bounds = getTerrainConfig();
    pos.x = clamp(pos.x, -bounds.width / 2 + 3, bounds.width / 2 - 3);
    pos.z = clamp(pos.z, -bounds.length / 2 + 12, bounds.length / 2 - 14);
    v.x *= 0.2;
    v.z *= 0.2;
  }
  const surface=collision?.surfaceAt(pos,p.space);
  const newGround = surface?.floorY??terrainHeight(pos.x, pos.z);
  if(surface?.ceilingY!==null&&surface?.ceilingY!==undefined&&pos.y+1.8>surface.ceilingY){pos.y=surface.ceilingY-1.8;v.y=Math.min(0,v.y);p.mode='air';}
  if (p.mode === 'ground') pos.y = Math.max(pos.y, newGround);
  if ((p.mode === 'air' || p.mode === 'glide') && pos.y < newGround) {
    pos.y = newGround;
    v.y = 0;
    p.mode = 'ground';
    p.glideReady = false;
  }
  // Water is evaluated after horizontal motion as well, to avoid passing through the banks.
  const newWater = collision?collision.waterAt(pos,p.space):waterSurface(pos.x, pos.z);
  if (
    newWater !== null &&
    newWater - newGround > 0.62 &&
    pos.y <= newWater + 0.25 &&
    p.mode !== 'swim' &&
    p.mode !== 'dive'
  ) {
    p.mode = 'swim';
    v.y = 0;
    pos.y = newWater + 0.08;
    p.glideReady = false;
  }
}
