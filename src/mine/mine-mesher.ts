/** MINE-4 — geometry of one 32 × 32 chunk of one level, derived from the grid only.
 * Organic look (G4): floors/ceilings per open cell and walls per exposed cell face split in
 * WALL_ROWS rows, every vertex displaced by a pure function of its grid position and of the
 * open/rock state around it. Shared vertices (wall/floor/ceiling seams, chunk borders) are
 * therefore displaced identically: no cracks, and a border excavation still rebuilds the two
 * chunks consistently. Displacements always go INTO the rock (walls bulge outward, ceilings form
 * a vault), never into the walkable space: collisions stay the exact cell bounds.
 * Flat-shaded quads, vertex colours by material with a small deterministic speckle. Pure arrays. */
import {MINE_CHUNK,MINE_MATERIALS} from './mine-data.ts';
import type {MineState} from './mine-state.ts';
import {mineHubLayout,mineHubRoofRise,mineShaftOpening} from './mine-hub.ts';
import {mineCrackStage,mineCrackStrokeCount,MINE_CRACK_STROKES,mineCrackColor} from './mine-cracks.ts';

export interface ChunkGeometry {positions:Float32Array;normals:Float32Array;colors:Float32Array;index:Uint32Array;quads:number}
/** Vertical subdivision of walls (bottom, belly, shoulder, ceiling seam). */
export const WALL_ROWS=[0,.35,.72,1] as const;
/** Maximal displacement into the rock (m): walls at mid height, ceiling vault. */
export const MINE_RELIEF={wall:.55,vault:.55,floor:.05} as const;
const hash=(x:number,y:number,z:number)=>{const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s);};
/** Continuous world-space macro shape: identical at a shared chunk border.
 * Uses only the authored cell/world coordinates and level, no per-frame noise. */
function macroNoise(x:number,z:number,level:number,scale:number):number{
  const fx=x/scale,fz=z/scale,ix=Math.floor(fx),iz=Math.floor(fz);
  const tx=fx-ix,tz=fz-iz,ux=tx*tx*(3-2*tx),uz=tz*tz*(3-2*tz);
  const a=hash(ix,level*19,iz),b=hash(ix+1,level*19,iz),
    c=hash(ix,level*19,iz+1),d=hash(ix+1,level*19,iz+1);
  return (a+(b-a)*ux)*(1-uz)+(c+(d-c)*ux)*uz;
}
export function mineChunkGeometry(state:MineState,level:number,cx:number,cz:number):ChunkGeometry{
  const p:number[]=[],n:number[]=[],c:number[]=[],idx:number[]=[],L=state.grid.levels[level],y0=L.floorY,h=L.height;
  const hub=mineHubLayout(state.grid.zone,level);
  const x0=cx*MINE_CHUNK,z0=cz*MINE_CHUNK,open=(x:number,z:number)=>state.isOpen(level,x,z);
  /** Displaced position of the grid vertex (x, row height t, z): depends only on (x,t,z) and the
   * four cells sharing the vertex column, so every quad touching it agrees. */
  const vertexCache=new Map<string,[number,number,number]>();
  const vertex=(x:number,t:number,z:number):[number,number,number]=>{
    const key=x+','+t+','+z,old=vertexCache.get(key);if(old)return old;
    let rx=0,rz=0,rock=0;
    for(const [ox,oz] of [[-1,-1],[0,-1],[-1,0],[0,0]] as const)if(!open(x+ox,z+oz)){rock++;rx+=ox+.5;rz+=oz+.5;}
    const k=hash(x,t*7+level*13,z),rise=t===1?mineHubRoofRise(hub,x,z):0,y=y0+t*h+rise;
    let result:[number,number,number];
    if(rock===0){
      // Broad ceiling swell in gallery centres. Floor remains almost level for play.
      const wide=macroNoise(x,z,level,7.2);
      result=t===0?[x,y+(k-.5)*2*MINE_RELIEF.floor,z]:
        t===1?[x,y+MINE_RELIEF.vault*(.38+.35*wide+.27*k),z]:[x,y,z];
    }else if(rock===4)result=[x,y,z];
    else{
      // Two smooth rock scales: 7 m masses + 2.7 m fractured facets.
      // Displacement points strictly into solid rock; no collision narrowing.
      const wide=macroNoise(x,z,level,7.2),detail=macroNoise(x+31,z-11,level,2.7);
      const len=Math.hypot(rx,rz)||1,
        strength=.22+.49*wide+.29*detail,
        amp=t===0?.05+.06*k:t===1?.04*k:MINE_RELIEF.wall*strength;
      result=[x+rx/len*amp,t===1?y+.12*k:y,z+rz/len*amp];
    }
    vertexCache.set(key,result);
    return result;
  };
  const quad=(a:number[],b:number[],cc:number[],d:number[],color:number,f:number,seed:number)=>{
    const base=p.length/3;p.push(...a,...b,...cc,...d);
    // Flat normal of the (possibly non-planar) quad: cross product of its diagonals.
    const ux=cc[0]-a[0],uy=cc[1]-a[1],uz=cc[2]-a[2],vx=d[0]-b[0],vy=d[1]-b[1],vz=d[2]-b[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    const s=f*(.92+.16*hash(seed,a[1],b[0]+b[2])),r=((color>>16)&255)/255*s,g=((color>>8)&255)/255*s,bl=(color&255)/255*s;
    for(let i=0;i<4;i++){n.push(nx,ny,nz);c.push(r,g,bl);}
    idx.push(base,base+1,base+2,base,base+2,base+3);
  };
  for(let lz=0;lz<MINE_CHUNK;lz++)for(let lx=0;lx<MINE_CHUNK;lx++){
    const x=x0+lx,z=z0+lz;if(!open(x,z))continue;
    // Do not cap the lift: roof/floor openings make one shaft across all levels.
    // Interior floors remain controlled by the physical MineGrid; the elevator
    // platform covers the central gap while visual voids show above/below.
    if(!mineShaftOpening(hub,state.grid.levels.length,'floor',x,z))
      quad(vertex(x,0,z),vertex(x,0,z+1),vertex(x+1,0,z+1),vertex(x+1,0,z),0x6d5844,1,x*31+z);
    if(!mineShaftOpening(hub,state.grid.levels.length,'ceiling',x,z))
      quad(vertex(x,1,z),vertex(x+1,1,z),vertex(x+1,1,z+1),vertex(x,1,z+1),0x4a443f,1,x*17+z);
    // Exposed faces toward rock: [neighbour dx, dz, the two bottom corners in winding order].
    for(const [dx,dz,ax,az,bx,bz] of [[0,-1,x,z,x+1,z],[0,1,x+1,z+1,x,z+1],[-1,0,x,z+1,x,z],[1,0,x+1,z,x+1,z+1]] as const){
      if(open(x+dx,z+dz))continue;const m=state.material(level,x+dx,z+dz),color=MINE_MATERIALS[m].color,f=dx===0?.92:.8;
      for(let r=0;r<WALL_ROWS.length-1;r++){const t0=WALL_ROWS[r],t1=WALL_ROWS[r+1];
        quad(vertex(ax,t0,az),vertex(bx,t0,bz),vertex(bx,t1,bz),vertex(ax,t1,az),color,f,(x+dx)*7+(z+dz)*13+r);}
      // A damaged cell keeps every solid wall and collider intact. Thin, dark
      // crack ribbons are embedded into this SAME indexed chunk geometry:
      // no decals/textures, no new draw call per cell, and no dynamic lights.
      const stage=mineCrackStage(m,state.damageAt(level,x+dx,z+dz));
      if(stage){
        const point=(u:number,v:number):number[]=>{
          let row=0;
          while(row<WALL_ROWS.length-2&&v>WALL_ROWS[row+1])row++;
          const low=WALL_ROWS[row],high=WALL_ROWS[row+1],t=(v-low)/(high-low),
            a=vertex(ax,low,az),b=vertex(bx,low,bz),
            c=vertex(bx,high,bz),d=vertex(ax,high,az);
          // Bilinear interpolation onto the ORIGINAL low-poly wall surface.
          // A 2 cm offset towards the open cell prevents depth fighting.
          return [0,1,2].map(i=>(1-t)*((1-u)*a[i]+u*b[i])+
            t*((1-u)*d[i]+u*c[i])+(i===0?-dx*.022:i===2?-dz*.022:0));
        };
        const count=mineCrackStrokeCount(stage),shade=mineCrackColor(m);
        for(let stroke=0;stroke<count;stroke++){
          const [u0,v0,u1,v1]=MINE_CRACK_STROKES[stroke];
          const vx=u1-u0,vy=(v1-v0)*h,len=Math.hypot(vx,vy)||1,
            thickness=stage===1?.018:stage===2?.028:.043,
            du=-vy/len*thickness*.5,dv=vx/len*thickness*.5/h;
          quad(point(u0-du,v0-dv),point(u1-du,v1-dv),
            point(u1+du,v1+dv),point(u0+du,v0+dv),shade,1,
            (x+dx)*29+(z+dz)*31+stroke);
        }
        if(stage===3){
          // Two inset faceted chips on the last fracture tier. They are only
          // shaded marks on the existing wall, never loose collidable rocks.
          quad(point(.22,.23),point(.38,.27),point(.34,.37),point(.20,.34),
            shade,.83,(x+dx)*11+(z+dz)*17);
          quad(point(.62,.68),point(.77,.70),point(.73,.82),point(.59,.79),
            shade,.76,(x+dx)*13+(z+dz)*19);
        }
      }
    }
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),index:new Uint32Array(idx),quads:idx.length/6};
}
