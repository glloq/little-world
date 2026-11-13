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
  const count=(cellsX+1)*(cellsZ+1),positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new LinearColor();
  let k=0;
  for(let j=0;j<=cellsZ;j++)for(let i=0;i<=cellsX;i++,k++){
    const x=clampX(minX+i*step),z=clampZ(minZ+j*step),c=(j+1)*w+i+1,h=heights[c];
    const sea=!legacy&&h<bounds.seaLevel,y=sea?bounds.seaLevel:h;
    let nx=0,nz=0;if(!sea){nx=(heights[c-1]-heights[c+1])/(2*step);nz=(heights[c-w]-heights[c+w])/(2*step);}
    const n=Math.hypot(nx,1,nz),o=k*3;normals[o]=nx/n;normals[o+1]=1/n;normals[o+2]=nz/n;positions[o]=x;positions[o+1]=y;positions[o+2]=z;
    if(sea)color.setHex(SEA_COLOR);else surfaceColor(x,z,h,Math.max(Math.abs(heights[c+1]-h),Math.abs(heights[c+w]-h))*2/step,color);
    colors[o]=color.r;colors[o+1]=color.g;colors[o+2]=color.b;
  }
  const index=count>65535?new Uint32Array(cellsX*cellsZ*6):new Uint16Array(cellsX*cellsZ*6);let t=0;
  for(let j=0;j<cellsZ;j++)for(let i=0;i<cellsX;i++){const a=j*(cellsX+1)+i,b=a+1,d=a+cellsX+1;index[t]=a;index[t+1]=d;index[t+2]=b;index[t+3]=b;index[t+4]=d;index[t+5]=d+1;t+=6;}
  return {positions,normals,colors,index,minX,minZ,cellsX,cellsZ,maxX:clampX(minX+cellsX*step),maxZ:clampZ(minZ+cellsZ*step)};
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
