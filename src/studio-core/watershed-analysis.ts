/** Bounded D8 drainage analysis on the existing height function.
 * Authoring-only, deterministic, no terrain mutation and no runtime GPU cost. */
import type {PointXZ} from '../geography/archipelago.ts';
export interface WatershedBasin {outlet:PointXZ;areaM2:number;cells:number;kind:'sea'|'pit'|'border'}
export interface WatershedResult {resolution:number;stepM:number;basins:WatershedBasin[];sampled:number;warnings:string[]}
export function analyzeWatersheds(
 bounds:{minX:number;maxX:number;minZ:number;maxZ:number},
 height:(x:number,z:number)=>number,seaLevel:number,
 options:{stepM?:number;maxCells?:number;minAreaM2?:number}={}
):WatershedResult{
 const {minX,maxX,minZ,maxZ}=bounds,w=maxX-minX,d=maxZ-minZ;
 if(!(w>0&&d>0&&Number.isFinite(w+d+seaLevel)))throw Error('Emprise hydrologique invalide');
 const cap=Math.min(16384,Math.max(256,Math.floor(options.maxCells??4096)));
 const minStep=Math.max(2,options.stepM??20,Math.sqrt(w*d/cap));
 const nx=Math.max(2,Math.ceil(w/minStep)),nz=Math.max(2,Math.ceil(d/minStep));
 // Adapt dimensions together so a very elongated world cannot exceed the cap.
 const factor=Math.max(1,Math.sqrt(nx*nz/cap));
 const cols=Math.max(2,Math.floor(nx/factor)),rows=Math.max(2,Math.floor(nz/factor));
 const sx=w/cols,sz=d/rows,n=cols*rows;
 const heights=new Float64Array(n),next=new Int32Array(n),area=new Int32Array(n);
 const coordinate=(i:number):PointXZ=>({x:minX+((i%cols)+.5)*sx,z:minZ+(Math.floor(i/cols)+.5)*sz});
 for(let i=0;i<n;i++){const p=coordinate(i),y=height(p.x,p.z);if(!Number.isFinite(y))throw Error('Altitude hydrologique non finie');heights[i]=y;next[i]=-1;area[i]=1;}
 const dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
 const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>heights[b]-heights[a]||a-b);
 for(let i=0;i<n;i++){
  if(heights[i]<=seaLevel)continue;
  const x=i%cols,z=Math.floor(i/cols);
  let best=-1,bestSlope=0;
  for(const [dx,dz] of dirs){const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=cols||zz>=rows)continue;
   const j=zz*cols+xx,slope=(heights[i]-heights[j])/Math.hypot(dx*sx,dz*sz);
   if(slope>bestSlope+1e-10){best=j;bestSlope=slope;}
  }
  next[i]=best;
 }
 for(const i of order)if(next[i]>=0)area[next[i]]+=area[i];
 const outlets:WatershedBasin[]=[];
 for(let i=0;i<n;i++){
  if(next[i]>=0)continue;
  const x=i%cols,z=Math.floor(i/cols);
  const kind=heights[i]<=seaLevel?'sea':x===0||z===0||x===cols-1||z===rows-1?'border':'pit';
  const a=area[i]*sx*sz;
  if(a>=Math.max(0,options.minAreaM2??0))outlets.push({outlet:coordinate(i),areaM2:Math.round(a),cells:area[i],kind});
 }
 outlets.sort((a,b)=>b.areaM2-a.areaM2||a.outlet.x-b.outlet.x||a.outlet.z-b.outlet.z);
 return {resolution:n,stepM:Math.max(sx,sz),basins:outlets.slice(0,32),sampled:n,
   warnings:[...(outlets.some(o=>o.kind==='pit')?['Cuvettes détectées : lacs ou corrections manuelles peuvent être nécessaires']:[]),
     'Analyse D8 approximative : relief discrétisé, pas de génération de lac automatique']};
}
