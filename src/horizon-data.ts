/** Pure horizon data (no Three.js): grid, far plane and block geometry, identical on the main
 * thread and in a geography worker. */
import {terrainHeight,isLegacyTerrain} from './terrain.ts';
import {surfaceColor} from './geography/surface.ts';
import {LinearColor} from './render/linear-color.ts';
import {packColorArray,packNormalArray} from './render/pack.ts';
export interface HorizonGrid {spacing:number;blockCells:number;columns:number;rows:number}
export interface HorizonBounds {width:number;length:number;seaLevel:number}
export const SEA_COLOR=0x6aa9b3;
/** Target ≤ ~32k horizon vertices whatever the project size (measured budget, not a contract).
 * Spacing is the render tile size times a power of two, so horizon cells never straddle tiles. */
export function horizonGrid(width:number,length:number,tileSize=64):HorizonGrid{
  const raw=Math.sqrt(width*length/32768);let spacing=tileSize;
  while(spacing>8&&spacing/2>=raw)spacing/=2;
  while(spacing<raw)spacing*=2;
  const blockCells=32;
  return {spacing,blockCells,columns:Math.ceil(width/(spacing*blockCells)),rows:Math.ceil(length/(spacing*blockCells))};
}
/** Far clipping plane large enough for the project diagonal plus an ocean margin. */
export function horizonFar(width:number,length:number):number{
  return Math.min(20000,Math.max(750,Math.hypot(width,length)+2500));
}
type Bounds=HorizonBounds;
/** Pure geometry of one block; shared edges sample identical points, so blocks never crack. */
export function horizonBlockData(bounds:Bounds,grid:HorizonGrid,column:number,row:number,height=terrainHeight,legacy=isLegacyTerrain()){
  const step=grid.spacing,minX=-bounds.width/2+column*grid.blockCells*step,minZ=-bounds.length/2+row*grid.blockCells*step;
  const cellsX=Math.max(1,Math.min(grid.blockCells,Math.ceil((bounds.width/2-minX)/step))),cellsZ=Math.max(1,Math.min(grid.blockCells,Math.ceil((bounds.length/2-minZ)/step)));
  const clampX=(x:number)=>Math.min(bounds.width/2,Math.max(-bounds.width/2,x)),clampZ=(z:number)=>Math.min(bounds.length/2,Math.max(-bounds.length/2,z));
  const w=cellsX+3,heights=new Float32Array(w*(cellsZ+3));
  for(let j=0;j<cellsZ+3;j++)for(let i=0;i<w;i++)heights[j*w+i]=height(clampX(minX+(i-1)*step),clampZ(minZ+(j-1)*step));
  const count=(cellsX+1)*(cellsZ+1),positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new LinearColor(),surfaceNormal={x:0,y:1,z:0};
  let k=0;
  for(let j=0;j<=cellsZ;j++)for(let i=0;i<=cellsX;i++,k++){
    const x=clampX(minX+i*step),z=clampZ(minZ+j*step),c=(j+1)*w+i+1,h=heights[c];
    const sea=!legacy&&h<bounds.seaLevel,y=sea?bounds.seaLevel:h;
    let nx=0,nz=0;if(!sea){nx=(heights[c-1]-heights[c+1])/(2*step);nz=(heights[c-w]-heights[c+w])/(2*step);}
    const n=Math.hypot(nx,1,nz),o=k*3;normals[o]=nx/n;normals[o+1]=1/n;normals[o+2]=nz/n;positions[o]=x;positions[o+1]=y;positions[o+2]=z;
    if(sea)color.setHex(SEA_COLOR);else {
      surfaceColor(x,z,h,Math.max(Math.abs(heights[c+1]-h),Math.abs(heights[c+w]-h))*2/step,color,legacy||height!==terrainHeight?undefined:surfaceNormal);
      if(!legacy&&height===terrainHeight){normals[o]=surfaceNormal.x;normals[o+1]=surfaceNormal.y;normals[o+2]=surfaceNormal.z;}
    }
    colors[o]=color.r;colors[o+1]=color.g;colors[o+2]=color.b;
  }
  const index=count>65535?new Uint32Array(cellsX*cellsZ*6):new Uint16Array(cellsX*cellsZ*6);let t=0;
  for(let j=0;j<cellsZ;j++)for(let i=0;i<cellsX;i++){const a=j*(cellsX+1)+i,b=a+1,d=a+cellsX+1;index[t]=a;index[t+1]=d;index[t+2]=b;index[t+3]=b;index[t+4]=d;index[t+5]=d+1;t+=6;}
  return {positions,normals,colors,index,minX,minZ,cellsX,cellsZ,maxX:clampX(minX+cellsX*step),maxZ:clampZ(minZ+cellsZ*step)};
}
/** One vertex of the global horizon lattice (lattice indices i, j from the project corner),
 * computed with exactly the formulas of horizonBlockData: detailed tiles use it as the
 * shape they morph from/to, so a tile blends into the horizon without a visible jump. */
export interface HorizonVertex {y:number;r:number;g:number;b:number;nx:number;ny:number;nz:number}
export function horizonVertexAt(bounds:Bounds,step:number,i:number,j:number,out:HorizonVertex,height=terrainHeight,legacy=isLegacyTerrain()):HorizonVertex{
  const clampX=(x:number)=>Math.min(bounds.width/2,Math.max(-bounds.width/2,x)),clampZ=(z:number)=>Math.min(bounds.length/2,Math.max(-bounds.length/2,z));
  const ox=-bounds.width/2,oz=-bounds.length/2,x=clampX(ox+i*step),z=clampZ(oz+j*step),h=height(x,z);
  const sea=!legacy&&h<bounds.seaLevel;out.y=sea?bounds.seaLevel:h;
  let nx=0,nz=0;
  const east=height(clampX(ox+(i+1)*step),z),south=height(x,clampZ(oz+(j+1)*step));
  if(!sea){nx=(height(clampX(ox+(i-1)*step),z)-east)/(2*step);nz=(height(x,clampZ(oz+(j-1)*step))-south)/(2*step);}
  const n=Math.hypot(nx,1,nz);out.nx=nx/n;out.ny=1/n;out.nz=nz/n;
  const color=new LinearColor();
  if(sea)color.setHex(SEA_COLOR);else{
    const surfaceNormal={x:0,y:1,z:0};
    surfaceColor(x,z,h,Math.max(Math.abs(east-h),Math.abs(south-h))*2/step,color,legacy||height!==terrainHeight?undefined:surfaceNormal);
    if(!legacy&&height===terrainHeight){out.nx=surfaceNormal.x;out.ny=surfaceNormal.y;out.nz=surfaceNormal.z;}
  }
  out.r=color.r;out.g=color.g;out.b=color.b;
  return out;
}
/** Horizon surface (height, colour, normal) at any (x, z), interpolated on the same two
 * triangles per cell as the horizon index (diagonal from (i+1, j) to (i, j+1)). */
export function createHorizonSampler(bounds:Bounds,step:number,height=terrainHeight,legacy=isLegacyTerrain()){
  const cache=new Map<number,HorizonVertex>(),columns=Math.ceil(bounds.width/step)+2;
  const vertex=(i:number,j:number)=>{const k=j*columns+i;let v=cache.get(k);if(!v){v=horizonVertexAt(bounds,step,i,j,{y:0,r:0,g:0,b:0,nx:0,ny:1,nz:0},height,legacy);cache.set(k,v);}return v;};
  const ox=-bounds.width/2,oz=-bounds.length/2;
  return (x:number,z:number,out:HorizonVertex):HorizonVertex=>{
    const i=Math.max(0,Math.min(Math.ceil(bounds.width/step)-1,Math.floor((x-ox)/step))),j=Math.max(0,Math.min(Math.ceil(bounds.length/step)-1,Math.floor((z-oz)/step)));
    const x0=ox+i*step,z0=oz+j*step,x1=Math.min(bounds.width/2,x0+step),z1=Math.min(bounds.length/2,z0+step);
    const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0))),v=Math.max(0,Math.min(1,(z-z0)/(z1-z0)));
    const b=vertex(i+1,j),d=vertex(i,j+1);let p:HorizonVertex,wp:number,wb:number,wd:number;
    if(u+v<=1){p=vertex(i,j);wb=u;wd=v;wp=1-u-v;}else{p=vertex(i+1,j+1);wb=1-v;wd=1-u;wp=u+v-1;}
    for(const k of ['y','r','g','b','nx','ny','nz'] as const)out[k]=p[k]*wp+b[k]*wb+d[k]*wd;
    return out;
  };
}
/** Cells of a block whose render tile is displayed in detail are simply not indexed:
 * no hidden triangle is rasterised, no fragment is discarded. Horizon cells are
 * tile-aligned, so the visible horizon starts exactly where detailed tiles stop. */
export function visibleHorizonIndex(full:ArrayLike<number>,cellsX:number,cellsZ:number,covered:(i:number,j:number)=>boolean,out:Uint16Array|Uint32Array):number{
  let count=0;
  for(let j=0;j<cellsZ;j++)for(let i=0;i<cellsX;i++){
    if(covered(i,j))continue;const at=(j*cellsX+i)*6;
    for(let k=0;k<6;k++)out[count++]=full[at+k];
  }
  return count;
}
/** Block ready for the GPU: normals/colours packed, float arrays dropped. */
export interface PackedHorizonBlock {positions:Float32Array;normals:Int16Array;colors:Uint16Array;index:Uint16Array|Uint32Array;minX:number;minZ:number;cellsX:number;cellsZ:number;maxX:number;maxZ:number}
export function packedHorizonBlock(bounds:HorizonBounds,grid:HorizonGrid,column:number,row:number):PackedHorizonBlock{
  const d=horizonBlockData(bounds,grid,column,row);
  return {positions:d.positions,normals:packNormalArray(d.normals),colors:packColorArray(d.colors),index:d.index,minX:d.minX,minZ:d.minZ,cellsX:d.cellsX,cellsZ:d.cellsZ,maxX:d.maxX,maxZ:d.maxZ};
}
