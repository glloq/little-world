/**
 * Low-poly ball and target skins (doc 107 §balles): compact geometries with per-face vertex
 * colours, shared by every instance of a page. The instance colour multiplies them (player
 * colour in mini-golf, team colour…), so one InstancedMesh draws all balls of a field.
 */
import * as THREE from 'three';
import {lathe} from './geometry.ts';

export type BallSkin='football'|'bowling'|'golf'|'beanbag'|'dart';
const cache=new Map<string,THREE.BufferGeometry>();
/** Icosphere with one grey level per face chosen by `tone(centroid)` (unit sphere). */
function toned(detail:number,tone:(x:number,y:number,z:number)=>number){
  const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i+=3){
    const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,l=Math.hypot(x,y,z)||1,t=tone(x/l,y/l,z/l);
    for(let k=0;k<3;k++)c.set([t,t,t],(i+k)*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.computeVertexNormals();return g;
}
const ICO=(()=>{const g=new THREE.IcosahedronGeometry(1,0),p=g.attributes.position,out:[number,number,number][]=[];
  for(let i=0;i<p.count;i++){const v:[number,number,number]=[p.getX(i),p.getY(i),p.getZ(i)];const l=Math.hypot(...v);v[0]/=l;v[1]/=l;v[2]/=l;if(!out.some(o=>Math.hypot(o[0]-v[0],o[1]-v[1],o[2]-v[2])<1e-3))out.push(v);}
  g.dispose();return out;})();
const near=(x:number,y:number,z:number,pts:readonly [number,number,number][],r:number)=>pts.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<r);
const HOLES:[number,number,number][]=[[0,.94,.33],[.22,.9,.37],[-.1,.86,.5]];
export function ballGeometry(skin:BallSkin):THREE.BufferGeometry{
  let g=cache.get(skin);if(g)return g;
  switch(skin){
    // Dark pentagons around the 12 icosahedron vertices: a classic football at 80 faces.
    case 'football':g=toned(1,(x,y,z)=>near(x,y,z,ICO,.42)?.16:1);break;
    // Three finger holes and a darker band: readable spin on a heavy ball.
    case 'bowling':g=toned(2,(x,y,z)=>near(x,y,z,HOLES,.16)?.12:Math.abs(y)<.12?.78:1);break;
    // Alternating light facets read as dimples.
    case 'golf':g=toned(1,(x,y,z)=>(Math.round((x+y+z)*3)%2)?.86:1);break;
    // Bean bag: two cloth halves and a stitched seam.
    case 'beanbag':g=toned(0,(_x,y)=>Math.abs(y)<.25?.55:y>0?1:.8);break;
    // High-contrast projectile: dark equator, bright poles.
    case 'dart':g=toned(1,(_x,y)=>Math.abs(y)<.3?.18:1);break;
  }
  cache.set(skin,g);return g;
}
/** Bowling pin: lathe with a red neck stripe (instance colour multiplies it). */
export function pinGeometry():THREE.BufferGeometry{
  let g=cache.get('pin');if(g)return g;
  g=lathe([[0,0],[.08,0],[.12,.12],[.12,.2],[.07,.32],[.05,.36],[.055,.4],[.07,.45],[.05,.5],[0,.52]],7,y=>y>.35&&y<.42?[.85,.2,.18]:[1,1,1]);
  cache.set('pin',g);return g;
}
/** Can: silver rims, a coloured body (instance colour) and a light label band. */
export function canGeometry():THREE.BufferGeometry{
  let g=cache.get('can');if(g)return g;
  g=new THREE.CylinderGeometry(.12,.12,.24,8,3).toNonIndexed();const p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i+=3){const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,t=Math.abs(y)>.115?[.75,.75,.78]:Math.abs(y)<.04?[1.4,1.4,1.4]:[1,1,1];for(let k=0;k<3;k++)c.set(t,(i+k)*3);}
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.computeVertexNormals();cache.set('can',g);return g;
}
