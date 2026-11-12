import * as THREE from 'three';
import { WORLD_LENGTH, WORLD_WIDTH, mulberry32, riverLevel, riverX, terrainHeight, waterSurface, smoothstep } from './terrain';

export type AssetId = 'nature.pine' | 'nature.oak' | 'nature.rock' | 'architecture.cottage' | 'props.crate' | 'props.lantern';
export interface Placement { id: string; assetId: AssetId; x: number; z: number; rotation: number; }
export interface WorldConfig { seed: number; density: number; }
export interface WorldView {
  root: THREE.Group;
  terrain: THREE.Mesh;
  wheel: THREE.Group;
  millPosition: THREE.Vector3;
  objects: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
}
const mat = (color: number, opts?: THREE.MeshLambertMaterialParameters) =>
  new THREE.MeshLambertMaterial({ color, ...opts });
const foliage = [0x6f9d69, 0x8bb879, 0x668e63, 0xa6bd80, 0x659a75];
const stone = mat(0x9ca69a);
const wood = mat(0x946d4e);
const paleWood = mat(0xd9bc8f);
const darkWood = mat(0x6b5644);
const cream = mat(0xf3ddb2);
const roof = mat(0xb46e57);
const roofLight = mat(0xc88866);
const windowMat = mat(0x7c9fa4);
const deepGreen = mat(0x587c5a);

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D,
  x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(parent: THREE.Object3D, color: THREE.Material, w: number, h: number, d: number,
  x: number, y: number, z: number): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y, z);
}
function cylinder(parent: THREE.Object3D, color: THREE.Material, r1: number, r2: number, h: number,
  x: number, y: number, z: number, edges = 7): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(r1, r2, h, edges), color, parent, x, y, z);
}
function roofHouse(parent: THREE.Object3D, w: number, d: number, h: number): void {
  const side = Math.hypot(w / 2 + 1, 3.0);
  const left = box(parent, roof, side, .38, d + 1.6, -w / 4, h + 1.55, 0);
  left.rotation.z = .52;
  const right = box(parent, roofLight, side, .38, d + 1.6, w / 4, h + 1.55, 0);
  right.rotation.z = -.52;
}

function cottage(parent: THREE.Object3D, scale = 1): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  box(g, cream, 9, 6.5, 8, 0, 3.25, 0);
  box(g, paleWood, 9.4, .4, 8.4, 0, .35, 0);
  roofHouse(g, 9, 8, 6.5);
  box(g, darkWood, 1.8, 3.6, .15, 0, 1.8, 4.1);
  box(g, windowMat, 1.7, 1.9, .15, -2.8, 3.7, 4.09);
  box(g, windowMat, 1.7, 1.9, .15, 2.8, 3.7, 4.09);
  box(g, wood, .6, 3.9, .7, 3.25, 9.3, -1.5);
  box(g, stone, 1.5, 1.3, 1.5, 3.25, 11.7, -1.5);
  g.scale.setScalar(scale);
  return g;
}
function waterwheel(parent: THREE.Object3D): THREE.Group {
  const spin = new THREE.Group();
  const side = new THREE.Group();
  spin.add(side);
  side.rotation.y = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(3.1, .33, 5, 14), wood, side, 0, 0, 0);
  ring.rotation.z = Math.PI / 14;
  for (let i = 0; i < 10; i++) {
    const spoke = box(side, darkWood, .24, 6.15, .3, 0, 0, 0);
    spoke.rotation.z = (i / 10) * Math.PI;
  }
  cylinder(side, wood, .5, .5, 1, 0, 0, 0, 9).rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const paddle = box(side, paleWood, 1.05, .35, 1.15, Math.sin(a) * 3.1, Math.cos(a) * 3.1, 0);
    paddle.rotation.z = -a;
  }
  parent.add(spin);
  return spin;
}

function createTerrain(root: THREE.Group): THREE.Mesh {
  const stepsX = 100, stepsZ = 260;
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const c = new THREE.Color();
  for (let iz = 0; iz <= stepsZ; iz++) {
    const z = (iz / stepsZ - .5) * WORLD_LENGTH;
    for (let ix = 0; ix <= stepsX; ix++) {
      const x = (ix / stepsX - .5) * WORLD_WIDTH;
      const h = terrainHeight(x, z);
      vertices.push(x, h, z);
      const nearRiver = Math.abs(x - riverX(z)) < 17;
      const coast = smoothstep(165, 236, z);
      const slope = Math.abs(terrainHeight(x + 2, z) - h);
      if (coast > .65 && h < 2) c.setHex(0xa5b7a0);
      else if (nearRiver) c.setHex(0xb9c997);
      else if (h > 37 && slope > 1.6) c.setHex(0x9baca1);
      else if (h > 58) c.setHex(0xb6bbae);
      else if (h > 30) c.setHex(0x8fa78a);
      else c.setHex(0x89ad7b);
      const variation = .92 + .07 * Math.sin(ix * .55 + iz * .38) + .035 * Math.sin(ix * 2 + iz);
      c.multiplyScalar(variation);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let iz = 0; iz < stepsZ; iz++) for (let ix = 0; ix < stepsX; ix++) {
    const a = iz * (stepsX + 1) + ix, b = a + 1, c1 = a + stepsX + 1, d = c1 + 1;
    indices.push(a, c1, b, b, c1, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const terrain = mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), root, 0, 0, 0);
  terrain.name = 'Terrain';
  return terrain;
}
function createRiver(root: THREE.Group): void {
  const pos: number[] = [], indices: number[] = [];
  const count = 270;
  for (let i = 0; i <= count; i++) {
    const z = -283 + (i / count) * 480;
    const x = riverX(z), y = riverLevel(z) + .04;
    const w = 6.2 + Math.sin(z * .036) * .45;
    pos.push(x - w, y, z, x + w, y, z);
    if (i < count) {
      const p = 2 * i;
      indices.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const river = mesh(geo, new THREE.MeshLambertMaterial({
    color: 0x70b7bd, transparent: true, opacity: .83, side: THREE.DoubleSide,
    depthWrite: false
  }), root, 0, 0, 0);
  river.renderOrder = 1;
  const sea = mesh(new THREE.PlaneGeometry(220, 122), new THREE.MeshLambertMaterial({
    color: 0x70b4ba, transparent: true, opacity: .79, side: THREE.DoubleSide, depthWrite: false
  }), root, 0, .075, 240);
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 1;
}
function createTrail(root: THREE.Group): void {
  const pos: number[] = [], index: number[] = [];
  const n = 165;
  for (let i = 0; i <= n; i++) {
    const z = -265 + i / n * 450;
    const x = riverX(z) - 22;
    const width = 1.8;
    pos.push(x-width, terrainHeight(x-width,z)+.18, z, x+width, terrainHeight(x+width,z)+.18, z);
    if (i < n) {
      const a = 2*i; index.push(a, a+2, a+1, a+1, a+2, a+3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  mesh(geo, new THREE.MeshLambertMaterial({color:0xd3bd94,side:THREE.DoubleSide}),root,0,0,0);
}
function createForest(root: THREE.Group, seed: number, density: number): void {
  const rand = mulberry32(seed + 1743);
  const max = Math.round(360 * density);
  const pines: {x:number;y:number;z:number;s:number;hue:number}[] = [];
  const oaks: typeof pines = [];
  const rocks: typeof pines = [];
  for (let i = 0; i < max * 2 && pines.length + oaks.length < max; i++) {
    const x = (rand() - .5) * 183, z = -278 + rand() * 465;
    const y = terrainHeight(x,z);
    if (z > 170 || Math.abs(x - riverX(z)) < 17 || y < riverLevel(z) + .8) continue;
    if (Math.abs(z + 56) < 26 && Math.abs(x - (riverX(-56) - 23)) < 25) continue;
    if (Math.abs(z - 100) < 35 && Math.abs(x - (riverX(100) - 25)) < 29) continue;
    const item = {x,y,z,s:.73+rand()*1.0,hue:Math.floor(rand()*foliage.length)};
    (rand() > .40 ? pines : oaks).push(item);
  }
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const trunkGeo = new THREE.CylinderGeometry(.33,.45,3,6);
  const canopyGeo = new THREE.ConeGeometry(2.55,6.7,7);
  const oakGeo = new THREE.IcosahedronGeometry(2.65,0);
  function instances(items: typeof pines, geo: THREE.BufferGeometry, color: number, yOffset: number, sx:number, sy:number, sz:number, varyColors=false): void {
    const m = new THREE.InstancedMesh(geo,mat(color),items.length);
    for (let i=0;i<items.length;i++){
      const a=items[i];p.set(a.x,a.y+yOffset*a.s,a.z);s.set(a.s*sx,a.s*sy,a.s*sz);mat4.compose(p,q,s);m.setMatrixAt(i,mat4);
      if(varyColors)m.setColorAt(i,new THREE.Color(foliage[a.hue]));
    }
    m.instanceMatrix.needsUpdate=true;
    root.add(m);
  }
  instances(pines,trunkGeo,0x7b6046,1.5,1,1,1);
  instances(pines,canopyGeo,0xffffff,5.1,1,1,1,true);
  instances(oaks,trunkGeo,0x7b6046,1.35,1,1,1);
  instances(oaks,oakGeo,0xffffff,4.3,1.08,.85,1.08,true);
  for(let i=0;i<155;i++){
    const x=(rand()-.5)*190,z=(rand()-.5)*535,y=terrainHeight(x,z);
    if(waterSurface(x,z)!==null || y<-1)continue;
    rocks.push({x,y,z,s:.35+rand()*1.5,hue:Math.floor(rand()*foliage.length)});
  }
  const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8,0),stone,rocks.length);
  for(let i=0;i<rocks.length;i++){
    const a=rocks[i];p.set(a.x,a.y+.2*a.s,a.z);s.set(a.s,a.s*.6,a.s*.85);q.setFromAxisAngle(new THREE.Vector3(0,1,0),rand()*6);mat4.compose(p,q,s);rock.setMatrixAt(i,mat4);
  }
  rock.instanceMatrix.needsUpdate = true;root.add(rock);
}

export function createAsset(id: AssetId): THREE.Group {
  const g = new THREE.Group();
  if (id === 'nature.pine') {
    cylinder(g, wood,.24,.34,2.4,0,1.2,0);
    cylinder(g,deepGreen,0,2.0,5.8,0,4.3,0,8);
    cylinder(g,mat(0x82a874),0,1.45,3.8,0,5.5,0,8);
  } else if (id === 'nature.oak') {
    cylinder(g,wood,.28,.39,2.9,0,1.45,0);
    mesh(new THREE.IcosahedronGeometry(2.5,0),mat(0x81aa71),g,0,4.0,0);
    mesh(new THREE.IcosahedronGeometry(1.8,0),mat(0xa6c38b),g,.9,5.1,.2);
  } else if (id === 'nature.rock') {
    const r=mesh(new THREE.IcosahedronGeometry(2,0),stone,g,0,.95,0);
    r.scale.set(1.1,.55,.8);r.rotation.y=.45;
  } else if (id === 'architecture.cottage') {
    cottage(g,.75);
  } else if (id === 'props.crate') {
    box(g,wood,2,2,2,0,1,0);
    box(g,darkWood,2.12,.18,2.12,0,1.8,0);
    box(g,darkWood,.19,2.1,2.1,-.8,1,0);
    box(g,darkWood,.19,2.1,2.1,.8,1,0);
  } else if (id === 'props.lantern') {
    cylinder(g,darkWood,.13,.16,3.7,0,1.85,0);
    box(g,mat(0xffd687),.85,1,.85,0,3.7,0);
    box(g,darkWood,1.1,.25,1.1,0,4.4,0);
    mesh(new THREE.ConeGeometry(.7,.62,4),roof,g,0,4.85,0);
  }
  return g;
}

function createVillage(root: THREE.Group): { wheel: THREE.Group; millPosition: THREE.Vector3 } {
  const z=-57, x=riverX(z)-24;
  const millPosition = new THREE.Vector3(x,terrainHeight(x,z),z);
  const mill=new THREE.Group();mill.position.copy(millPosition);
  root.add(mill);
  box(mill,cream,12,8,11,0,4,0);
  box(mill,wood,12.7,.65,11.8,0,.33,0);
  roofHouse(mill,12,11,8);
  box(mill,darkWood,2.4,4,.35,0,2,5.65);
  box(mill,windowMat,1.9,2.1,.2,-3.3,5.0,5.6);
  box(mill,windowMat,1.9,2.1,.2,3.3,5.0,5.6);
  const wheel=waterwheel(mill);
  wheel.position.set(8.8,3.55,.3);
  cylinder(mill,stone,.85,1.1,1.2,8.8,.6,.3);
  const cottages = [
    [riverX(70)-31,70, .93, .21],
    [riverX(94)-30,94,.82,-.4],
    [riverX(118)-29,118,1.05,.36]
  ];
  for(const [hx,hz,scale,rotation] of cottages) {
    const h=cottage(root,scale);
    h.position.set(hx,terrainHeight(hx,hz),hz);
    h.rotation.y=rotation;
  }
  // Wooden dock and a simple moored fishing boat.
  const dock=new THREE.Group();dock.position.set(-25,0,213);root.add(dock);
  for(let i=0;i<10;i++)box(dock,paleWood,9,.34,1.52,0,1.05,i*2.3-8);
  for(const x1 of [-3.75,3.75])for(const z1 of [-7,12])cylinder(dock,wood,.34,.42,4,x1,.1,z1);
  const boat=new THREE.Group();boat.position.set(-12,-.15,229);root.add(boat);
  const hull=mesh(new THREE.SphereGeometry(3,9,5),wood,boat,0,0,0);hull.scale.set(.7,.4,2.1);
  box(boat,paleWood,3.9,.22,10.5,0,.7,0);
  cylinder(boat,darkWood,.12,.13,7,0,4.1,.4);
  mesh(new THREE.PlaneGeometry(4.1,5.8),new THREE.MeshLambertMaterial({color:0xf3ddb2,side:THREE.DoubleSide}),boat,2.1,4.25,.4);
  const lantern=createAsset('props.lantern');lantern.position.set(-29,1,205);root.add(lantern);
  return {wheel,millPosition};
}

export function buildWorld(config: WorldConfig): WorldView {
  const root=new THREE.Group();root.name='LittleWorld';
  const terrain=createTerrain(root);
  createRiver(root);
  createTrail(root);
  createForest(root,config.seed,config.density);
  const {wheel,millPosition}=createVillage(root);
  const objects=new THREE.Group();objects.name='PlacedAssets';root.add(objects);
  return {
    root,terrain,wheel,millPosition,objects,
    update(dt:number){ wheel.rotation.x -= dt * .33; },
    dispose(){
      root.traverse(o=>{
        const m=o as THREE.Mesh;
        if(m.geometry)m.geometry.dispose();
        if(m.material)for(const material of (Array.isArray(m.material)?m.material:[m.material]))material.dispose();
      });
      root.removeFromParent();
    }
  };
}

export function addPlacement(world: WorldView, placement: Placement): THREE.Group {
  const a=createAsset(placement.assetId);
  a.position.set(placement.x,terrainHeight(placement.x,placement.z),placement.z);
  a.rotation.y=placement.rotation;
  a.userData.placementId=placement.id;
  world.objects.add(a);
  return a;
}

export function configureScene(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0xcce6e2);
  scene.fog=new THREE.Fog(0xcce6e2,190,570);
  scene.add(new THREE.HemisphereLight(0xfaf7e9,0x678c7c,2.15));
  const sun=new THREE.DirectionalLight(0xffeed3,2.35);
  sun.position.set(-130,185,-120);scene.add(sun);
  const fill=new THREE.DirectionalLight(0xd8f0ff,.65);
  fill.position.set(100,70,190);scene.add(fill);
}
