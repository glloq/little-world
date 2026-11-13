/** MINE-4 — geometry of one 32 × 32 chunk of one level, derived from the grid only:
 * floors and ceilings of open cells (merged in runs along X), walls only where an open cell
 * touches rock (merged in runs of the same material). Neighbours across chunk borders are read
 * from the state, so a border excavation rebuilds the two chunks consistently. Pure arrays. */
import {MINE_CHUNK,MINE_MATERIALS} from './mine-data.ts';
import type {MineState} from './mine-state.ts';

export interface ChunkGeometry {positions:Float32Array;normals:Float32Array;colors:Float32Array;index:Uint32Array;quads:number}
const shade=(hex:number,f:number,out:number[])=>{out[0]=((hex>>16)&255)/255*f;out[1]=((hex>>8)&255)/255*f;out[2]=(hex&255)/255*f;};
export function mineChunkGeometry(state:MineState,level:number,cx:number,cz:number):ChunkGeometry{
  const p:number[]=[],n:number[]=[],c:number[]=[],idx:number[]=[],col=[0,0,0],L=state.grid.levels[level],y0=L.floorY,y1=L.floorY+L.height;
  const x0=cx*MINE_CHUNK,z0=cz*MINE_CHUNK,open=(x:number,z:number)=>state.isOpen(level,x,z);
  const quad=(a:number[],b:number[],cc:number[],d:number[],normal:number[],color:number[])=>{const base=p.length/3;p.push(...a,...b,...cc,...d);for(let i=0;i<4;i++){n.push(...normal);c.push(...color);}idx.push(base,base+1,base+2,base,base+2,base+3);};
  for(let lz=0;lz<MINE_CHUNK;lz++){
    const z=z0+lz;
    // Floors / ceilings: runs of open cells along X.
    for(let lx=0;lx<MINE_CHUNK;){const x=x0+lx;if(!open(x,z)){lx++;continue;}let end=lx+1;while(end<MINE_CHUNK&&open(x0+end,z))end++;const xa=x,xb=x0+end;
      shade(0x6d5844,1,col);quad([xa,y0,z],[xa,y0,z+1],[xb,y0,z+1],[xb,y0,z],[0,1,0],[...col]);
      shade(0x4a443f,1,col);quad([xa,y1,z],[xb,y1,z],[xb,y1,z+1],[xa,y1,z+1],[0,-1,0],[...col]);lx=end;}
    // Walls facing -Z / +Z: open cell whose neighbour row is rock, runs of the same material.
    for(const [dz,face,normal] of [[-1,z,[0,0,1]],[1,z+1,[0,0,-1]]] as const){
      for(let lx=0;lx<MINE_CHUNK;){const x=x0+lx;if(!open(x,z)||open(x,z+dz)){lx++;continue;}const m=state.material(level,x,z+dz);let end=lx+1;while(end<MINE_CHUNK&&open(x0+end,z)&&!open(x0+end,z+dz)&&state.material(level,x0+end,z+dz)===m)end++;
        shade(MINE_MATERIALS[m].color,.92,col);const xa=x,xb=x0+end;
        if(dz<0)quad([xa,y0,face],[xb,y0,face],[xb,y1,face],[xa,y1,face],[...normal],[...col]);else quad([xb,y0,face],[xa,y0,face],[xa,y1,face],[xb,y1,face],[...normal],[...col]);lx=end;}
    }
  }
  for(let lx=0;lx<MINE_CHUNK;lx++){
    const x=x0+lx;
    for(const [dx,face,normal] of [[-1,x,[1,0,0]],[1,x+1,[-1,0,0]]] as const){
      for(let lz=0;lz<MINE_CHUNK;){const z=z0+lz;if(!open(x,z)||open(x+dx,z)){lz++;continue;}const m=state.material(level,x+dx,z);let end=lz+1;while(end<MINE_CHUNK&&open(x,z0+end)&&!open(x+dx,z0+end)&&state.material(level,x+dx,z0+end)===m)end++;
        shade(MINE_MATERIALS[m].color,.8,col);const za=z,zb=z0+end;
        if(dx<0)quad([face,y0,zb],[face,y0,za],[face,y1,za],[face,y1,zb],[...normal],[...col]);else quad([face,y0,za],[face,y0,zb],[face,y1,zb],[face,y1,za],[...normal],[...col]);lz=end;}
    }
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),colors:new Float32Array(c),index:new Uint32Array(idx),quads:idx.length/6};
}
