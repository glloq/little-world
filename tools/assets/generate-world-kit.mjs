#!/usr/bin/env node
/** Little World — original low-poly "world kit" (landmarks, town buildings, counters, rocks,
 * conifers). Everything is generated here from simple primitives: project-original assets, no
 * third-party source, redistributable with the game (same licence as the repository).
 * Conventions of the merged asset lots: metres, Y-up, -Z front, pivot on the ground, COLOR_0
 * written as sRGB bytes, no texture, no material, LOD0 > LOD1 (> LOD2) triangles.
 * Writes public/models/world-kit/<id>/lodN.glb and assets/world-kit/manifest.json.
 * Usage: node tools/assets/generate-world-kit.mjs */
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../../',import.meta.url);
// ---------- palette (sRGB bytes) ----------
const C={stone:[198,190,174],stoneDark:[150,143,132],stoneWarm:[204,184,150],wood:[150,104,64],woodDark:[100,70,46],plaster:[238,228,206],roofRed:[178,92,70],roofBlue:[84,108,136],roofSlate:[90,94,106],roofThatch:[196,160,92],leaf:[86,138,70],leafDark:[58,104,56],leafLight:[128,170,84],bark:[112,80,54],rock:[132,127,120],rockDark:[98,94,92],rockMoss:[110,130,92],gold:[216,178,90],white:[240,236,226],red:[188,64,58],blue:[70,108,170],green:[70,132,80],black:[52,48,50],glass:[118,150,164],water:[86,132,160],sand:[214,196,150],iron:[86,86,92]};
// ---------- geometry assembly ----------
let rngState=1;const rng=()=>{rngState=(rngState*1664525+1013904223)>>>0;return rngState/4294967296;};
function M(pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){return new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale));}
class Kit{
  constructor(){this.parts=[];}
  add(geo,color,pos,rot,scale,jitter=0){const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(M(pos,rot,scale));this.parts.push({g,color,jitter});return this;}
  box(w,h,d,color,pos=[0,0,0],rot,jitter){return this.add(new THREE.BoxGeometry(w,h,d),color,[pos[0],pos[1]+h/2,pos[2]],rot,undefined,jitter);}
  cyl(rt,rb,h,seg,color,pos=[0,0,0],rot,jitter){return this.add(new THREE.CylinderGeometry(rt,rb,h,seg),color,[pos[0],pos[1]+h/2,pos[2]],rot,undefined,jitter);}
  cone(r,h,seg,color,pos=[0,0,0],rot){return this.add(new THREE.ConeGeometry(r,h,seg),color,[pos[0],pos[1]+h/2,pos[2]],rot);}
  /** Gable roof (triangular prism) along X. */
  gable(w,h,d,color,pos=[0,0,0],rotY=0){const s=new THREE.Shape();s.moveTo(-d/2,0);s.lineTo(d/2,0);s.lineTo(0,h);s.lineTo(-d/2,0);const g=new THREE.ExtrudeGeometry(s,{depth:w,bevelEnabled:false});g.translate(0,0,-w/2);g.rotateY(Math.PI/2);return this.add(g,color,pos,[0,rotY,0]);}
  /** Faceted rock: displaced icosahedron, organic but low-poly. */
  rock(r,detail,color,pos=[0,0,0],scale=[1,1,1],seed=1,flatBottom=true){
    rngState=seed>>>0||1;let g=new THREE.IcosahedronGeometry(r,detail);g.deleteAttribute('normal');g.deleteAttribute('uv');g=mergeVertices(g);const p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const k=.78+.42*rng();let y=p.getY(i)*k;if(flatBottom&&y<-r*.25)y=-r*.25;p.setXYZ(i,p.getX(i)*k,y,p.getZ(i)*k);}
    g.translate(0,r*.25,0);return this.add(g,color,pos,[0,rng()*6.28,0],scale,.08);}
  /** Crenellations around a rectangle (w × d) at height y. */
  crenels(w,d,y,size,color,step=1.6){for(let x=-w/2+size/2;x<=w/2-size/2+1e-6;x+=step){this.box(size,size,size,color,[x,y,-d/2+size/2]);this.box(size,size,size,color,[x,y,d/2-size/2]);}
    for(let z=-d/2+size/2+step;z<=d/2-size/2-step+1e-6;z+=step){this.box(size,size,size,color,[-w/2+size/2,y,z]);this.box(size,size,size,color,[w/2-size/2,y,z]);}return this;}
  ringCrenels(r,y,size,color,n){for(let i=0;i<n;i++){const a=i/n*Math.PI*2;this.box(size,size,size*.8,color,[Math.cos(a)*(r-size/2),y,Math.sin(a)*(r-size/2)],[0,-a,0]);}return this;}
  build(){
    const pos=[],col=[];for(const {g,color,jitter}of this.parts){const p=g.getAttribute('position');
      for(let i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));const j=jitter?1+(rng()-.5)*2*jitter:1;col.push(...color.map(c=>Math.max(0,Math.min(255,Math.round(c*j)))),255);}}
    // Index identical (position, colour) vertices: smaller files, same flat look.
    const key=new Map(),vp=[],vc=[],idx=[];for(let i=0;i<pos.length/3;i++){const k=pos.slice(i*3,i*3+3).map(v=>v.toFixed(4)).join(',')+'|'+col.slice(i*4,i*4+4).join(',');let v=key.get(k);if(v===undefined){v=vp.length/3;key.set(k,v);vp.push(pos[i*3],pos[i*3+1],pos[i*3+2]);vc.push(...col.slice(i*4,i*4+4));}idx.push(v);}
    return {positions:new Float32Array(vp),colors:new Uint8Array(vc),indices:vp.length/3>65535?new Uint32Array(idx):new Uint16Array(idx)};
  }
}
// ---------- GLB writer (POSITION + COLOR_0 + indices, one mesh) ----------
function glb(name,{positions,colors,indices}){
  const pad=n=>(n+3)&~3,posBytes=positions.byteLength,colBytes=colors.byteLength,idxBytes=indices.byteLength;
  const o1=0,o2=pad(posBytes),o3=o2+pad(colBytes),total=o3+pad(idxBytes),bin=new Uint8Array(total);
  bin.set(new Uint8Array(positions.buffer),o1);bin.set(colors,o2);bin.set(new Uint8Array(indices.buffer),o3);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],positions[i+a]);max[a]=Math.max(max[a],positions[i+a]);}
  const json={asset:{version:'2.0',generator:'little-world tools/assets/generate-world-kit.mjs'},scene:0,scenes:[{nodes:[0]}],nodes:[{name,mesh:0}],
    meshes:[{name,primitives:[{attributes:{POSITION:0,COLOR_0:1},indices:2,mode:4}]}],
    accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3',min,max},{bufferView:1,componentType:5121,normalized:true,count:colors.length/4,type:'VEC4'},{bufferView:2,componentType:indices instanceof Uint32Array?5125:5123,count:indices.length,type:'SCALAR'}],
    bufferViews:[{buffer:0,byteOffset:o1,byteLength:posBytes,target:34962},{buffer:0,byteOffset:o2,byteLength:colBytes,target:34962},{buffer:0,byteOffset:o3,byteLength:idxBytes,target:34963}],buffers:[{byteLength:total}]};
  let text=JSON.stringify(json);while(text.length%4)text+=' ';const jsonBytes=new TextEncoder().encode(text);
  const out=new Uint8Array(12+8+jsonBytes.length+8+total),dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,out.length,true);dv.setUint32(12,jsonBytes.length,true);dv.setUint32(16,0x4e4f534a,true);out.set(jsonBytes,20);
  dv.setUint32(20+jsonBytes.length,total,true);dv.setUint32(24+jsonBytes.length,0x004e4942,true);out.set(bin,28+jsonBytes.length);return out;
}
// ---------- models: build(detail) with detail 0 (near) … 2 (far silhouette) ----------
const seg=(d,a,b,c=b)=>[a,b,c][d];
function house(k,{w,d,h,wall,roof,roofH,timber=false,door=C.woodDark},detail){
  k.box(w,h,d,wall,[0,0,0]);k.gable(w+.5,roofH,d+.6,roof,[0,h,0]);
  if(detail<2){k.box(1.1,2,0.12,door,[0,0,-d/2-.05]);for(const x of [-w/3,w/3])k.box(.9,.9,.1,C.glass,[x,h*.45,-d/2-.05]);k.box(.7,1.6,.7,C.stoneDark,[w/3,h+roofH*.35,d/5]);}
  if(timber&&detail===0){for(const x of [-w/2+.1,-w/6,w/6,w/2-.1])k.box(.18,h,.1,C.woodDark,[x,0,-d/2-.06]);k.box(w,.18,.1,C.woodDark,[0,h*.5,-d/2-.06]);}
}
const MODELS={
  'architecture.inn':{label:'Auberge à colombages',group:'buildings',lods:3,build(k,d){house(k,{w:11,d:8,h:6.2,wall:C.plaster,roof:C.roofRed,roofH:4,timber:true},d);if(d<2){k.box(2.4,3.2,.15,C.woodDark,[4.2,0,-4.05]);k.box(.12,1.8,1.2,C.woodDark,[-5.9,3.6,-3]);k.box(.1,.9,1.1,C.gold,[-6,2.6,-3]);k.box(10,.3,1.6,C.woodDark,[0,3.1,-4.6]);}}},
  'architecture.house_timber':{label:'Maison à colombages',group:'buildings',lods:3,build(k,d){house(k,{w:7,d:6,h:5,wall:C.plaster,roof:C.roofRed,roofH:3.2,timber:true},d);}},
  'architecture.house_blue':{label:'Maison de pêcheur (toit bleu)',group:'buildings',lods:3,build(k,d){house(k,{w:6.5,d:5.5,h:4,wall:C.white,roof:C.roofBlue,roofH:2.8},d);if(d<2)k.box(1.6,1.2,1.2,C.wood,[2,0,-3.4]);}},
  'architecture.farmhouse':{label:'Ferme et grange',group:'buildings',lods:3,build(k,d){house(k,{w:9,d:7,h:4.5,wall:C.stoneWarm,roof:C.roofThatch,roofH:3.6},d);k.box(6,5,7,C.wood,[9,0,0]);k.gable(6.4,3,7.6,C.roofRed,[9,5,0]);if(d<2)k.box(3,3.6,.15,C.woodDark,[9,0,-3.55]);}},
  'architecture.watchtower':{label:'Tour de guet',group:'landmarks',lods:3,build(k,d){const s=seg(d,10,8,6);k.cyl(2.6,3,12,s,C.stone,[0,0,0],undefined,.05);k.cyl(3.3,3.1,1.2,s,C.stoneDark,[0,12,0]);if(d<2)k.ringCrenels(3.3,13.2,.8,C.stoneDark,seg(d,12,8));k.cone(3.6,4.5,s,C.roofSlate,[0,13.4,0]);if(d<2){k.box(1.2,2.2,.3,C.woodDark,[0,0,-2.9]);for(const y of [5,9])k.box(.5,1,.3,C.black,[0,y,-2.85]);}}},
  'architecture.castle_keep':{label:'Donjon de château',group:'landmarks',lods:3,build(k,d){k.box(12,18,12,C.stone,[0,0,0],undefined,.05);k.box(12.6,1,12.6,C.stoneDark,[0,18,0]);if(d<2)k.crenels(12.6,12.6,19,1,C.stoneDark,2);for(const [x,z]of [[-6,-6],[6,-6],[-6,6],[6,6]]){k.cyl(1.8,2,22,seg(d,8,6,5),C.stone,[x,0,z]);k.cone(2.3,4,seg(d,8,6,5),C.roofSlate,[x,22,z]);}if(d<2){k.box(3,4.5,.4,C.woodDark,[0,0,-6.1]);for(const y of [7,12,15])for(const x of [-3,3])k.box(.6,1.4,.3,C.black,[x,y,-6.05]);k.cyl(.08,.08,4,4,C.woodDark,[0,20,0]);k.box(1.6,1,.05,C.red,[.8,23,0]);}}},
  'structure.castle_wall':{label:'Muraille (8 m)',group:'landmarks',lods:2,build(k,d){k.box(8,7,2.4,C.stone,[0,0,0],undefined,.05);k.box(8,.6,2.8,C.stoneDark,[0,7,0]);if(d<1)for(let x=-3.5;x<=3.5;x+=1.75)k.box(.9,1,.6,C.stoneDark,[x,7.6,-1.1]);}},
  'structure.castle_tower':{label:'Tour de muraille',group:'landmarks',lods:2,build(k,d){const s=seg(d,10,6);k.cyl(3,3.3,10,s,C.stone,[0,0,0],undefined,.05);k.cyl(3.5,3.5,.8,s,C.stoneDark,[0,10,0]);if(d<1)k.ringCrenels(3.5,10.8,.9,C.stoneDark,10);}},
  'structure.castle_gate':{label:'Porte fortifiée',group:'landmarks',lods:2,build(k,d){for(const x of [-4.2,4.2]){k.box(3.4,10,4,C.stone,[x,0,0],undefined,.05);if(d<1)k.crenels(3.4,4,10,.8,C.stoneDark,1.3);}k.box(5,3.4,4,C.stone,[0,6.6,0]);if(d<1){k.box(5,6.6,.3,C.woodDark,[0,0,1.6]);k.box(5.6,.5,.5,C.iron,[0,6.4,-2]);}}},
  'architecture.church':{label:'Église',group:'landmarks',lods:3,build(k,d){k.box(9,7,16,C.stoneWarm,[0,0,1],undefined,.04);k.gable(16.6,4.5,9.6,C.roofSlate,[0,7,1],Math.PI/2);k.box(4.6,14,4.6,C.stoneWarm,[0,0,-8.6]);k.cone(3.4,9,4,C.roofSlate,[0,14,-8.6],[0,Math.PI/4,0]);if(d<2){k.box(1.8,3.2,.2,C.woodDark,[0,0,-11]);for(const z of [-3,2,7])for(const x of [-4.6,4.6])k.box(.2,2.6,1,C.glass,[x,2.4,z]);k.box(.25,1.6,.25,C.gold,[0,23,-8.6]);k.box(1,.25,.25,C.gold,[0,23.9,-8.6]);}}},
  'architecture.cathedral':{label:'Cathédrale',group:'landmarks',lods:3,build(k,d){k.box(14,13,30,C.stone,[0,0,2],undefined,.04);k.gable(30.6,8,14.6,C.roofSlate,[0,13,2],Math.PI/2);k.box(22,10,8,C.stone,[0,0,6]);k.gable(8.6,6,22.6,C.roofSlate,[0,10,6]);
    for(const x of [-5.5,5.5]){k.box(6,26,6,C.stone,[x,0,-15]);k.cone(4.2,12,seg(d,8,6,4),C.roofSlate,[x,26,-15]);}if(d<2){k.box(4,8,.4,C.woodDark,[0,0,-13.2]);k.cyl(2.2,2.2,.4,seg(d,12,8),C.glass,[0,14,-13.1],[Math.PI/2,0,0]);for(let z=-8;z<=14;z+=5.5)for(const x of [-7,7])k.box(.3,6,1.6,C.glass,[x,3,z]);}}},
  'landmark.world_tree':{label:'Arbre-monde',group:'landmarks',lods:3,build(k,d){const s=seg(d,10,8,6);k.cyl(2.2,4.2,18,s,C.bark,[0,0,0],undefined,.06);for(let i=0;i<5;i++){const a=i*1.26;k.cyl(.5,1.2,9,6,C.bark,[Math.cos(a)*3.5,13,Math.sin(a)*3.5],[Math.cos(a)*.7,0,-Math.sin(a)*.7]);}
    if(d<2)for(let i=0;i<6;i++){const a=i*1.05;k.cyl(.6,1.4,4,6,C.bark,[Math.cos(a)*4,0,Math.sin(a)*4],[Math.sin(a)*.6,0,-Math.cos(a)*.6]);}
    const crowns=d===2?[[0,24,0,11]]:[[0,22,0,10],[6,25,3,7],[-6,24,-3,7.5],[2,30,-4,7],[-3,29,5,6.5],[5,20,-6,6],[-6,20,6,6]];for(const [x,y,z,r]of crowns)k.rock(r,d===0?1:0,rng()<.5?C.leaf:C.leafDark,[x,y,z],[1,.8,1],Math.floor(r*97),false);}},
  'nature.conifer_tall':{label:'Conifère élancé',group:'trees',lods:2,usage:'tree',build(k,d){k.cyl(.2,.32,2.2,seg(d,6,4),C.bark,[0,0,0]);const layers=d===0?[[2.2,3,1.6],[1.8,2.8,3.6],[1.3,2.6,5.4],[.8,2.2,7]]:[[2,7.5,1.6]];for(const [r,h,y]of layers)k.cone(r,h,seg(d,7,5),C.leafDark,[0,y,0]);}},
  'nature.conifer_wide':{label:'Conifère trapu',group:'trees',lods:2,usage:'tree',build(k,d){k.cyl(.25,.38,1.6,seg(d,6,4),C.bark,[0,0,0]);const layers=d===0?[[2.8,2.6,1.2],[2.2,2.4,2.8],[1.5,2.2,4.3]]:[[2.6,5.6,1.2]];for(const [r,h,y]of layers)k.cone(r,h,seg(d,7,5),C.leaf,[0,y,0]);}},
  'nature.boulder_large':{label:'Gros bloc de pierre',group:'rocks',lods:2,build(k,d){k.rock(3,d===0?1:0,C.rock,[0,0,0],[1.2,.9,1],11);if(d===0)k.rock(1.2,0,C.rockMoss,[2.4,0,1.4],[1,.7,1],12);}},
  'nature.boulder_pile':{label:'Amas de blocs',group:'rocks',lods:2,build(k,d){k.rock(2.2,d===0?1:0,C.rock,[0,0,0],[1,.8,1],21);k.rock(1.6,0,C.rockDark,[2.6,0,.8],[1,.8,1],22);k.rock(1.3,0,C.rock,[-2,0,1.4],[1,.7,1],23);if(d===0)k.rock(1,0,C.rockMoss,[.4,1.8,.2],[1,.8,1],24);}},
  'nature.rock_spire':{label:'Aiguille rocheuse',group:'rocks',lods:2,build(k,d){k.rock(2.5,d===0?1:0,C.rockDark,[0,0,0],[1,3.2,1],31);k.rock(1.6,0,C.rock,[1.8,0,1],[1,1.6,1],32);}},
  'nature.rock_arch':{label:'Arche rocheuse',group:'rocks',lods:2,build(k,d){k.rock(2.4,d===0?1:0,C.rock,[-5,0,0],[1,2.6,1.2],41);k.rock(2.4,d===0?1:0,C.rock,[5,0,0],[1,2.6,1.2],42);k.rock(2.6,d===0?1:0,C.rockDark,[0,8.5,0],[2.6,.7,1.1],43,false);}},
  'nature.cliff_block':{label:'Module de falaise',group:'rocks',lods:2,build(k,d){k.rock(4,d===0?1:0,C.rock,[0,0,0],[1.4,2.4,.9],51);k.rock(2.6,0,C.rockDark,[3.5,0,1],[1,1.8,.9],52);if(d===0)k.rock(1.6,0,C.rockMoss,[-3.6,0,1.2],[1,1,.9],53);}},
  'landmark.cave_entrance':{label:'Entrée de grotte',group:'landmarks',lods:2,build(k,d){k.rock(5,d===0?1:0,C.rock,[0,0,2],[1.4,1,1.1],61);k.box(3,3.4,1,C.black,[0,0,-3.3]);k.rock(1.8,0,C.rockDark,[-2.6,0,-3],[1,1.5,1],62);k.rock(1.8,0,C.rockDark,[2.6,0,-3],[1,1.5,1],63);if(d===0)for(const x of [-1.6,1.6])k.box(.25,3.2,.25,C.woodDark,[x,0,-3.9]);}},
  'landmark.standing_stones':{label:'Cercle de pierres levées',group:'landmarks',lods:2,build(k,d){const n=d===0?9:6;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;k.box(1.1,3.4+((i*7)%3)*.5,.7,C.stoneDark,[Math.cos(a)*6,0,Math.sin(a)*6],[0,-a,((i%2)-.5)*.1],.06);}if(d===0){k.box(1.4,.8,3,C.stone,[0,0,0]);}}},
  'landmark.ruined_tower':{label:'Tour en ruine',group:'landmarks',lods:2,build(k,d){const s=seg(d,10,7);k.cyl(3,3.2,7,s,C.stoneWarm,[0,0,0],undefined,.06);k.cyl(3,3,3,s,C.stoneWarm,[0,7,0],[0,0,.18]);if(d===0){for(let i=0;i<6;i++)k.rock(.7,0,C.stoneDark,[Math.cos(i)*5,0,Math.sin(i*1.7)*5],[1,.6,1],70+i);k.box(1.2,2.2,.4,C.black,[0,0,-3]);}}},
  'landmark.obelisk':{label:'Obélisque',group:'landmarks',lods:2,build(k,d){k.box(3,1,3,C.stone,[0,0,0]);k.cyl(.6,1,9,4,C.stoneWarm,[0,1,0],[0,Math.PI/4,0]);k.cone(.8,1.2,4,C.gold,[0,10,0],[0,Math.PI/4,0]);}},
  'structure.market_stall':{label:'Comptoir du marché',group:'counters',lods:2,build(k,d){k.box(3.2,1,1.2,C.wood,[0,0,0]);for(const [x,z]of [[-1.5,-.5],[1.5,-.5],[-1.5,.5],[1.5,.5]])k.box(.12,2.4,.12,C.woodDark,[x,0,z]);k.gable(3.6,.7,1.8,C.red,[0,2.4,0]);if(d===0){for(let i=0;i<4;i++)k.box(.4,.3,.4,i%2?C.leafLight:C.gold,[-1.2+i*.8,1,0]);k.box(1,.6,.6,C.wood,[1.9,0,.9]);}}},
  'structure.counter_mine':{label:'Comptoir de la mine',group:'counters',lods:2,build(k,d){k.box(3,1.05,1.2,C.woodDark,[0,0,0]);for(const x of [-1.4,1.4])k.box(.16,2.6,.16,C.woodDark,[x,0,.5]);k.box(3.4,.18,1.6,C.roofSlate,[0,2.6,.2],[.12,0,0]);if(d===0){k.box(.9,.7,.9,C.wood,[1.9,0,.6]);k.rock(.35,0,C.iron,[-.8,1.05,0],[1,.7,1],81);k.rock(.3,0,C.glass,[.2,1.05,0],[1,.8,1],82);k.cyl(.04,.04,1.2,4,C.woodDark,[2,0,-.5],[0,0,.4]);k.box(.5,.12,.12,C.iron,[2.3,1.1,-.5]);}}},
  'structure.counter_forest':{label:'Comptoir du bûcheron',group:'counters',lods:2,build(k,d){k.box(3,1.05,1.2,C.wood,[0,0,0]);for(const x of [-1.4,1.4])k.box(.16,2.6,.16,C.woodDark,[x,0,.5]);k.gable(3.4,.8,1.8,C.green,[0,2.6,.2]);if(d===0)for(let i=0;i<3;i++)for(let j=0;j<3-i;j++)k.cyl(.22,.22,1.6,6,C.bark,[1.9+j*.46+i*.23,.22+i*.4,-.3],[0,0,Math.PI/2]);}},
  'structure.counter_port':{label:'Comptoir du port',group:'counters',lods:2,build(k,d){k.box(3,1.05,1.2,C.white,[0,0,0]);for(const x of [-1.4,1.4])k.box(.16,2.6,.16,C.woodDark,[x,0,.5]);k.gable(3.4,.7,1.8,C.blue,[0,2.6,.2]);if(d===0){k.box(.8,.5,.6,C.wood,[1.9,0,.5]);for(let i=0;i<3;i++)k.box(.5,.12,.18,C.glass,[-1+i*.6,1.05,0],[0,i*.4,0]);}}},
  'structure.well':{label:'Puits',group:'town',lods:2,build(k,d){k.cyl(1.1,1.2,1,seg(d,10,6),C.stone,[0,0,0]);k.cyl(.9,.9,.05,seg(d,10,6),C.water,[0,.9,0]);for(const x of [-1,1])k.box(.15,2.4,.15,C.woodDark,[x,0,0]);k.gable(2.6,.7,1.6,C.roofRed,[0,2.4,0]);}},
  'structure.lamp_post':{label:'Lanterne de rue',group:'town',lods:2,build(k,d){k.cyl(.08,.12,3.2,seg(d,6,4),C.iron,[0,0,0]);k.box(.45,.55,.45,C.gold,[0,3.2,0]);k.cone(.4,.35,4,C.iron,[0,3.75,0],[0,Math.PI/4,0]);}},
  'structure.signpost':{label:'Panneau indicateur',group:'town',lods:2,build(k,d){k.box(.18,2.6,.18,C.woodDark,[0,0,0]);k.box(1.4,.35,.08,C.wood,[.5,2,0],[0,0,.05]);if(d===0)k.box(1.2,.3,.08,C.wood,[-.4,1.5,0],[0,.6,-.05]);}},
  'structure.barrel':{label:'Tonneau',group:'town',lods:2,build(k,d){k.cyl(.42,.36,1,seg(d,8,6),C.wood,[0,0,0]);if(d===0)for(const y of [.2,.75])k.cyl(.44,.44,.06,8,C.iron,[0,y,0]);}},
  'structure.campfire':{label:'Feu de camp',group:'town',lods:2,build(k,d){const n=d?6:9;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;k.rock(.17,0,C.stoneDark,[Math.cos(a)*.62,0,Math.sin(a)*.62],[1,.7,1],31+i);}
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;k.cyl(.07,.08,.9,d?4:6,C.woodDark,[Math.cos(a)*.18,.02,Math.sin(a)*.18],[Math.cos(a+.6)*.9,0,Math.sin(a+.6)*.9]);}
    k.cone(.3,.75,d?4:6,[255,150,60],[0,.08,0]);k.cone(.17,.5,d?4:5,[255,214,110],[0,.12,0]);}},
  'structure.chest':{label:'Coffre au trésor',group:'town',lods:2,build(k,d){k.box(1.1,.6,.7,C.woodDark,[0,0,0]);k.cyl(.35,.35,1.1,seg(d,8,5),C.wood,[0,.6,0],[0,0,Math.PI/2]);if(d===0){for(const x of [-.4,.4])k.box(.08,.92,.74,C.iron,[x,0,0]);k.box(.16,.18,.06,C.gold??[226,165,79],[0,.5,-.37]);}}},
  'structure.crate_stack':{label:'Pile de caisses',group:'town',lods:2,build(k,d){k.box(1,1,1,C.wood,[0,0,0]);k.box(1,1,1,C.woodDark,[1.05,0,.1],[0,.2,0]);k.box(.9,.9,.9,C.wood,[.5,1,0],[0,-.3,0]);}},
  'structure.bench':{label:'Banc',group:'town',lods:2,build(k,d){k.box(1.8,.12,.5,C.wood,[0,.45,0]);for(const x of [-.75,.75])k.box(.12,.45,.45,C.woodDark,[x,0,0]);if(d===0)k.box(1.8,.4,.08,C.wood,[0,.6,.24]);}},
  'structure.fountain':{label:'Fontaine de place',group:'town',lods:2,build(k,d){k.cyl(2.4,2.6,.8,seg(d,12,8),C.stone,[0,0,0]);k.cyl(2.1,2.1,.05,seg(d,12,8),C.water,[0,.75,0]);k.cyl(.35,.5,2,seg(d,8,6),C.stoneWarm,[0,.8,0]);k.cyl(.9,.6,.4,seg(d,8,6),C.stone,[0,2.8,0]);}},
  'structure.palisade':{label:'Palissade (4 m)',group:'town',lods:2,build(k,d){const n=d===0?10:5;for(let i=0;i<n;i++){const x=-2+(i+.5)*4/n,h=2.6+((i*5)%3)*.15;k.cyl(.17,.2,h,d===0?6:4,C.wood,[x,0,0]);if(d===0)k.cone(.17,.35,6,C.woodDark,[x,h,0]);}k.box(4,.15,.1,C.woodDark,[0,1.6,-.2]);}},
  'structure.pier_hut':{label:'Cabane de pêcheur sur pilotis',group:'buildings',lods:2,build(k,d){for(const [x,z]of [[-2,-2],[2,-2],[-2,2],[2,2]])k.cyl(.15,.15,2,6,C.woodDark,[x,0,z]);k.box(5,.25,5,C.wood,[0,2,0]);k.box(3.6,2.6,3.2,C.wood,[0,2.25,.3]);k.gable(4,1.6,3.8,C.roofBlue,[0,4.85,.3]);if(d===0)k.box(1,1.8,.12,C.woodDark,[0,2.25,-1.35]);}},
};
async function main(){
  const manifest={schemaVersion:1,name:'Little World — world kit (landmarks, town, counters, rocks, conifers)',license:'project-original',origin:'Generated from primitives by tools/assets/generate-world-kit.mjs (no third-party source)',units:'m',up:'Y',forward:'-Z',textures:0,models:[]};
  for(const [id,m]of Object.entries(MODELS)){
    const dir=`public/models/world-kit/${id.split('.')[1]}`;await mkdir(new URL(dir,root),{recursive:true});const lods=[];
    for(let level=0;level<m.lods;level++){const k=new Kit();rngState=7;m.build(k,level);const data=k.build(),bytes=glb(id,data),path=`${dir}/lod${level}.glb`;await writeFile(new URL(path,root),bytes);
      lods.push({level,path,triangles:data.indices.length/3,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
    for(let i=1;i<lods.length;i++)if(lods[i].triangles>lods[i-1].triangles)throw Error('LOD order '+id);
    manifest.models.push({id,label:m.label,group:m.group,lods});
  }
  await mkdir(new URL('assets/world-kit',root),{recursive:true});
  await writeFile(new URL('assets/world-kit/manifest.json',root),JSON.stringify(manifest,null,1)+'\n');
  console.log(manifest.models.map(m=>`${m.id}: ${m.lods.map(l=>l.triangles).join('/')}`).join('\n'));
}
await main();
