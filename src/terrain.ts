/** Geometry contract (meters): X = valley width, Z = sea direction, Y = up. */
export const WORLD_WIDTH = 200;
export const WORLD_LENGTH = 600;
export const SEA_LEVEL = 0;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function riverX(z: number): number {
  return 9 * Math.sin(z * .018) + 3.5 * Math.sin(z * .046);
}
export function riverLevel(z: number): number {
  return Math.max(SEA_LEVEL, (190 - z) * .027);
}
export function terrainHeight(x: number, z: number): number {
  const d = Math.abs(x - riverX(z));
  const ridge = Math.pow(Math.max(0, (d - 13) / 78), 1.7) * 54;
  const roughness = (1.0 + smoothstep(12, 60, d) * 3.0) *
    (Math.sin(x * .10 + z * .031) * Math.sin(z * .057 - x * .036) * .42 +
    Math.sin(z * .021 + x * .17) * .21);
  const shore = riverLevel(z) + 1.15 + ridge + roughness;
  const channel = riverLevel(z) - 2.45 + .03 * d;
  const inland = lerp(channel, shore, smoothstep(5.4, 13.8, d));
  // The flat sea floor gradually takes over at the open coast.
  const seabed = -1.9 - Math.max(0, z - 208) * .049 + .02 * Math.abs(x);
  return lerp(inland, seabed, smoothstep(175, 246, z));
}
export function waterSurface(x: number, z: number): number | null {
  if (z >= 190 && z <= 300 && x >= -105 && x <= 105) return SEA_LEVEL;
  if (z < -290 || z > 205) return null;
  return Math.abs(x - riverX(z)) <= 6.8 ? riverLevel(z) : null;
}
/** Underwater visuals depend on the CAMERA, never on the player's swim state. */
export function cameraSubmerged(x:number,y:number,z:number):boolean {
  const surface=waterSurface(x,z);
  return surface!==null && y<surface-.1;
}
export function waterDepth(x: number, z: number): number {
  const surface = waterSurface(x, z);
  return surface === null ? 0 : Math.max(0, surface - terrainHeight(x, z));
}
export function insideWorld(x: number, z: number): boolean {
  return x >= -97 && x <= 97 && z >= -288 && z <= 286;
}
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
