/**
 * MiniGameVisualEffects (doc 107 §évolution graphique): ONE pooled, low-poly effect system
 * shared by every mini-game view of a host. Presentation only: it never reads or writes a
 * score, a rule or the physics; views translate simulation contacts and session events into
 * calls here. Per kind: one InstancedMesh (fixed capacity, shared geometry and material),
 * live particles packed at the front of typed arrays (swap-remove), no allocation per
 * particle, no requestAnimationFrame: `update(dt)` is called by the game's render step.
 * Impact chips are NOT re-implemented: `chips` forwards to the game's existing pooled
 * `createImpactEffects` (src/hamster/impact-effects.ts) when the host provides it.
 */
import * as THREE from 'three';
import {flatQuad,flatRing,flatStar} from './geometry.ts';

export type FxKind='ring'|'puff'|'star'|'confetti'|'trail';
export const FX_KINDS:readonly FxKind[]=['ring','puff','star','confetti','trail'];
/** Chip colours of the shared impact chips (`IMPACT_COLORS` keys). */
export type FxChipKind='wood'|'stone'|'soil'|'crystal'|'iron'|'water'|'leaf';
/** Graphic tier read from the game's single quality controller (PresentationBudget). */
export type FxTier='low'|'medium'|'high';
export interface FxQuality {
  /** Impact effects: 0 = rings only on strong hits, 1 = rings + chips, 2 = + small puffs. */impacts:0|1|2;
  trails:boolean;
  /** Multiplier of success bursts (stars, confetti). */burst:number;
  /** Cartoon squash & stretch of balls on strong impacts. */squash:boolean;
  /** Rolling dust behind fast balls. */dust:boolean;
  /** Theme decoration detail (0 essential, 1 standard, 2 detailed) and animated decorations. */decor:0|1|2;animated:0|1|2;
}
export const FX_QUALITY:Readonly<Record<FxTier,FxQuality>>={
  low:{impacts:0,trails:false,burst:.35,squash:false,dust:false,decor:0,animated:0},
  medium:{impacts:1,trails:true,burst:.7,squash:true,dust:true,decor:1,animated:1},
  high:{impacts:2,trails:true,burst:1,squash:true,dust:true,decor:2,animated:2},
};
/** Default pool sizes (instances per kind). */
export const FX_CAPACITY:Readonly<Record<FxKind,number>>={ring:24,puff:48,star:32,confetti:96,trail:72};
export {minigameFxTier} from './tier.ts';

interface Pool {mesh:THREE.InstancedMesh;n:number;cap:number;
  px:Float32Array;py:Float32Array;pz:Float32Array;vx:Float32Array;vy:Float32Array;vz:Float32Array;
  age:Float32Array;life:Float32Array;size:Float32Array;spin:Float32Array;ax:Float32Array;az:Float32Array;
  r:Float32Array;g:Float32Array;b:Float32Array;}
/** Per kind: gravity (m/s²), linear drag (1/s), and the scale curve over the life t ∈ [0,1]. */
const MOTION:Record<FxKind,{gravity:number;drag:number;scale:(t:number)=>number}>={
  ring:{gravity:0,drag:0,scale:t=>.3+t*1.7},
  puff:{gravity:-.6,drag:3,scale:t=>t<.25?t/.25:1-(t-.25)/.75*.9},
  star:{gravity:2.5,drag:1.2,scale:t=>t<.15?t/.15:1-t*t},
  confetti:{gravity:3.2,drag:2.2,scale:t=>t<.85?1:(1-t)/.15},
  trail:{gravity:0,drag:0,scale:t=>1-t},
};
let shared:{geometry:Record<FxKind,THREE.BufferGeometry>;basic:THREE.MeshBasicMaterial;ring:THREE.MeshBasicMaterial;lambert:THREE.MeshLambertMaterial}|null=null;
function resources(){
  if(shared)return shared;
  shared={geometry:{
    ring:flatRing(.82,1,14),
    puff:new THREE.IcosahedronGeometry(1,0),
    star:flatStar(5,.42),
    confetti:flatQuad(1,.6),
    trail:new THREE.IcosahedronGeometry(1,0),
  },
  basic:new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}),
  ring:new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}),
  lambert:new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true})};
  return shared;
}
const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scl=new THREE.Vector3(),axis=new THREE.Vector3(),col=new THREE.Color();
/** Deterministic cheap random (presentation only; never shared with the simulation). */
let seed=0x2f6b1d;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const SUCCESS_COLORS=[0xf2c94c,0xeb5757,0x56ccf2,0x6fcf97,0xbb6bd9,0xf2994a];

export class MiniGameVisualEffects {
  readonly group=new THREE.Group();
  quality:FxQuality=FX_QUALITY.medium;
  /** Shared impact chips of the game (absent in Studio previews and Node tests). */
  chips:((x:number,y:number,z:number,kind:FxChipKind,count:number)=>void)|null=null;
  private pools:Record<FxKind,Pool>;
  private disposed=false;
  constructor(parent:THREE.Object3D,capacity:Partial<Record<FxKind,number>>={}){
    const res=resources();this.group.name='MiniGameEffects';parent.add(this.group);
    const make=(kind:FxKind):Pool=>{
      const cap=Math.max(1,Math.min(512,capacity[kind]??FX_CAPACITY[kind]));
      const material=kind==='ring'?res.ring:kind==='puff'?res.lambert:res.basic;
      const mesh=new THREE.InstancedMesh(res.geometry[kind],material,cap);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.name='fx:'+kind;
mesh.setColorAt(0,col.setHex(0xffffff));mesh.renderOrder=kind==='ring'?3:1;
      this.group.add(mesh);const f=()=>new Float32Array(cap);
      return {mesh,n:0,cap,px:f(),py:f(),pz:f(),vx:f(),vy:f(),vz:f(),age:f(),life:f(),size:f(),spin:f(),ax:f(),az:f(),r:f(),g:f(),b:f()};
    };
    this.pools=Object.fromEntries(FX_KINDS.map(k=>[k,make(k)])) as Record<FxKind,Pool>;
  }
  setTier(tier:FxTier){this.quality=FX_QUALITY[tier];}
  /** One particle (no allocation). Silently dropped when the pool is full: effects are
   * cosmetic and never queue. */
  spawn(kind:FxKind,x:number,y:number,z:number,vx:number,vy:number,vz:number,size:number,life:number,color:number){
    if(this.disposed)return;const p=this.pools[kind];if(p.n>=p.cap)return;const i=p.n++;
    p.px[i]=x;p.py[i]=y;p.pz[i]=z;p.vx[i]=vx;p.vy[i]=vy;p.vz[i]=vz;p.age[i]=0;p.life[i]=Math.max(.05,life);p.size[i]=size;
    p.spin[i]=(rnd()-.5)*12;const a=rnd()*Math.PI*2;p.ax[i]=Math.cos(a);p.az[i]=Math.sin(a);
    col.setHex(color);p.r[i]=col.r;p.g[i]=col.g;p.b[i]=col.b;
  }
  /** Contact feedback scaled by its closing speed (m/s): weak contacts give nothing. */
  impact(x:number,y:number,z:number,speed:number,chip:FxChipKind|null=null){
    if(speed<1.2)return;const Q=this.quality,k=Math.min(1,(speed-1.2)/8);
    if(speed>=2.5||Q.impacts>0)this.spawn('ring',x,y,z,0,0,0,.12+k*.35,.22+k*.12,0xffffff);
    if(Q.impacts>=1&&speed>=3&&chip&&this.chips)this.chips(x,y,z,chip,2+Math.round(k*4*(Q.impacts===2?1.5:1)));
    if(Q.impacts===2&&speed>=5)this.spawn('puff',x,y,z,0,.4,0,.08+k*.12,.35,0xf4f1ea);
  }
  /** Low-poly dust puffs (rolling or bouncing on loose ground), tinted like the floor. */
  dust(x:number,y:number,z:number,color:number,amount=1){
    const n=Math.max(1,Math.round(amount*(this.quality.impacts===2?2:1)));
    for(let j=0;j<n;j++){const a=rnd()*Math.PI*2,s=.3+rnd()*.6;this.spawn('puff',x+Math.cos(a)*.08,y,z+Math.sin(a)*.08,Math.cos(a)*s,.25+rnd()*.35,Math.sin(a)*s,.06+rnd()*.07,.45+rnd()*.3,color);}
  }
  /** Short-lived trail mark behind a fast projectile. */
  trail(x:number,y:number,z:number,size:number,color:number){if(this.quality.trails)this.spawn('trail',x,y,z,0,0,0,size,.22,color);}
  /** Success burst proportional to the event: 1 small (target hit), 2 goal / hole / strike,
   * 3 victory or record. Stars rise, confetti falls; a ring marks the spot. */
  success(x:number,y:number,z:number,level:1|2|3,colors:readonly number[]=SUCCESS_COLORS){
    const b=this.quality.burst,stars=Math.round([0,4,8,12][level]*b),conf=Math.round([0,0,18,40][level]*b);
    this.spawn('ring',x,y+.05,z,0,0,0,.5+level*.3,.5,colors[0]);
    for(let j=0;j<stars;j++){const a=j/Math.max(1,stars)*Math.PI*2+rnd()*.4,s=1.2+rnd()*1.5*level;this.spawn('star',x,y+.3,z,Math.cos(a)*s*.6,2+rnd()*2*level,Math.sin(a)*s*.6,.1+rnd()*.06,.7+rnd()*.4,colors[j%colors.length]);}
    for(let j=0;j<conf;j++){const a=rnd()*Math.PI*2,s=.5+rnd()*2.5;this.spawn('confetti',x,y+.8+rnd()*.6,z,Math.cos(a)*s,3+rnd()*3,Math.sin(a)*s,.06+rnd()*.04,1.4+rnd()*.9,colors[j%colors.length]);}
  }
  update(dt:number){
    if(this.disposed)return;const step=Math.max(0,Math.min(.1,dt));
    for(const kind of FX_KINDS){
      const p=this.pools[kind];if(!p.n&&!p.mesh.visible)continue;
      const m=MOTION[kind],drag=Math.max(0,1-m.drag*step);
      for(let i=0;i<p.n;){
        p.age[i]+=step;
        if(p.age[i]>=p.life[i]){this.kill(p,i);continue;} // Swap-remove: index i now holds the last one.
        p.vy[i]-=m.gravity*step;p.vx[i]*=drag;p.vy[i]*=drag;p.vz[i]*=drag;
        p.px[i]+=p.vx[i]*step;p.py[i]+=p.vy[i]*step;p.pz[i]+=p.vz[i]*step;
        const t=p.age[i]/p.life[i],s=p.size[i]*m.scale(t);
        pos.set(p.px[i],p.py[i],p.pz[i]);
        if(kind==='ring')q.identity();else{axis.set(p.ax[i],.4,p.az[i]).normalize();q.setFromAxisAngle(axis,p.spin[i]*p.age[i]);}
        scl.setScalar(Math.max(1e-4,s));m4.compose(pos,q,scl);p.mesh.setMatrixAt(i,m4);
        col.setRGB(p.r[i],p.g[i],p.b[i]);p.mesh.setColorAt(i,col);i++;
      }
      p.mesh.count=p.n;p.mesh.visible=p.n>0;
      if(p.n){p.mesh.instanceMatrix.needsUpdate=true;if(p.mesh.instanceColor)p.mesh.instanceColor.needsUpdate=true;}
    }
  }
  private kill(p:Pool,i:number){
    const last=--p.n;if(i===last)return;
    for(const a of [p.px,p.py,p.pz,p.vx,p.vy,p.vz,p.age,p.life,p.size,p.spin,p.ax,p.az,p.r,p.g,p.b])a[i]=a[last];
  }
  /** Live particles per kind (tests, metrics). */
  stats(){return Object.fromEntries(FX_KINDS.map(k=>[k,this.pools[k].n])) as Record<FxKind,number>;}
  get live(){let n=0;for(const k of FX_KINDS)n+=this.pools[k].n;return n;}
  /** Drop every live particle (activity released, island change). */
  clear(){for(const k of FX_KINDS){const p=this.pools[k];p.n=0;p.mesh.count=0;p.mesh.visible=false;}}
  dispose(){if(this.disposed)return;this.disposed=true;for(const k of FX_KINDS)this.pools[k].mesh.dispose();this.group.removeFromParent();this.group.clear();}
}
