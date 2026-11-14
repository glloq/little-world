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

export interface ChunkGeometry {positions:Float32Array;normals:Float32Array;colors:Float32Array;index:Uint32Array;quads:number}
/** Vertical subdivision of walls (bottom, belly, shoulder, ceiling seam). */
export const WALL_ROWS=[0,.35,.72,1] as const;
/** Maximal displacement into the rock (m): walls at mid height, ceiling vault. */
export const MINE_RELIEF={wall:.3,vault:.45,floor:.05} as const;
const hash=(x:number,y:number,z:number)=>{const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return s-Math.floor(s);};
export function mineChunkGeometry(state:MineState,level:number,cx:number,cz:number):ChunkGeometry{
  const p:number[]=[],n:number[]=[],c:number[]=[],idx:number[]=[],L=state.grid.levels[level],y0=L.floorY,h=L.height;
  const x0=cx*MINE_CHUNK,z0=cz*MINE_CHUNK,open=(x:number,z:number)=>state.isOpen(level,x,z);
  /** Displaced position of the grid vertex (x, row height t, z): depends only on (x,t,z) and the
   * four cells sharing the vertex column, so every quad touching it agrees. */
  const vertex=(x:number,t:number,z:number):[number,number,number]=>{
    let rx=0,rz=0,rock=0;
    for(const [ox,oz] of [[-1,-1],[0,-1],[-1,0],[0,0]] as const)if(!open(x+ox,z+oz)){rock++;rx+=ox+.5;rz+=oz+.5;}
    const k=hash(x,t*7+level*13,z),y=y0+t*h;
    if(rock===0){
      // Middle of the gallery: gentle floor undulation, highest point of the vault.
      return t===0?[x,y+(k-.5)*2*MINE_RELIEF.floor,z]:t===1?[x,y+MINE_RELIEF.vault*(.55+.45*k),z]:[x,y,z];
    }
    if(rock===4)return [x,y,z];
    const len=Math.hypot(rx,rz)||1,amp=t===0?.05+.06*k:t===1?.04*k:MINE_RELIEF.wall*(.45+.55*k);
    // Ceiling seam rises a little so the vault meets the walls with a rounded shoulder.
    return [x+rx/len*amp,t===1?y+.12*k:y,z+rz/len*amp];
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
    quad(vertex(x,0,z),vertex(x,0,z+1),vertex(x+1,0,z+1),vertex(x+1,0,z),0x6d5844,1,x*31+z);
    quad(vertex(x,1,z),vertex(x+1,1,z),vertex(x+1,1,z+1),vertex(x,1,z+1),0x4a443f,1,x*17+z);
    // Exposed faces toward rock: [neighbour dx, dz, the two bottom corners in winding order].
    for(const [dx,dz,ax,az,bx,bz] of [[0,-1,x,z,x+1,z],[0,1,x+1,z+1,x,z+1],[-1,0,x,z+1,x,z],[1,0,x+1,z,x+1,z+1]] as const){
      if(open(x+dx,z+dz))continue;const m=state.material(level,x+dx,z+dz),color=MINE_MATERIALS[m].color,f=dx===0?.92:.8;
      for(let r=0;r<WALL_ROWS.length-1;r++){const t0=WALL_ROWS[r],t1=WALL_ROWS[r+1];
        quad(vertex(ax,t0,az),vertex(bx,t0,bz),vertex(bx,t1,bz),vertex(ax,t1,az),color,f,(x+dx)*7+(z+dz)*13+r);}
    }
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),index:new Uint32Array(idx),quads:idx.length/6};
}
