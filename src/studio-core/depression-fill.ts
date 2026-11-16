/** Priority-flood depression analysis for authoring (not a water simulation).
 * A minimax spill elevation per grid cell is derived by flood-filling from the
 * world boundary and sea. Memory O(cells), CPU O(cells log cells).
 * Never mutates a terrain, an authoring source or the runtime WATER network. */
import type {PointXZ} from '../geography/archipelago.ts';
export interface DepressionCandidate {
 outlet:PointXZ;spillLevelM:number;bottomM:number;depthM:number;
 /** Optional route from the high spill crest to a definitely lower downstream cell. */
 spillway?:{crest:PointXZ;downstream:PointXZ;dropM:number;distanceM:number};
 areaM2:number;cells:number;kind:'pit';
}
export interface DepressionAnalysis {
 sampled:number;stepM:number;depressions:DepressionCandidate[];warnings:string[];
}
type GridBounds={minX:number;maxX:number;minZ:number;maxZ:number};
type Node={index:number;level:number};
class MinHeap {
 private nodes:Node[]=[];
 get length(){return this.nodes.length;}
 push(value:Node):void{
  const h=this.nodes;let i=h.length;h.push(value);
  while(i){const p=(i-1)>>1,n=h[p];if(n.level<value.level||n.level===value.level&&n.index<=value.index)break;
   h[i]=n;i=p;}h[i]=value;
 }
 pop():Node {
  const h=this.nodes,top=h[0],last=h.pop()!;
  if(h.length){let i=0;while(true){let left=i*2+1;if(left>=h.length)break;
    const right=left+1,j=right<h.length&&(h[right].level<h[left].level||
      h[right].level===h[left].level&&h[right].index<h[left].index)?right:left;
    const child=h[j];if(child.level>last.level||child.level===last.level&&child.index>=last.index)break;
    h[i]=child;i=j;
   }h[i]=last;
  }
  return top;
 }
}
const DIRS=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
export function analyzeDepressions(
 bounds:GridBounds,height:(x:number,z:number)=>number,seaLevel:number,
 options:{maxCells?:number;stepM?:number;minDepthM?:number;minAreaM2?:number;maxResults?:number}={}
):DepressionAnalysis {
 const {minX,minZ,maxX,maxZ}=bounds,width=maxX-minX,depth=maxZ-minZ;
 if(!(width>0&&depth>0&&Number.isFinite(width+depth+seaLevel)))throw Error('Emprise de dépressions invalide');
 const cap=Math.min(16384,Math.max(256,Math.floor(options.maxCells??4096)));
 const step=Math.max(2,options.stepM??16,Math.sqrt(width*depth/cap));
 let nx=Math.max(2,Math.ceil(width/step)),nz=Math.max(2,Math.ceil(depth/step));
 const factor=Math.max(1,Math.sqrt(nx*nz/cap));
 nx=Math.max(2,Math.floor(nx/factor));nz=Math.max(2,Math.floor(nz/factor));
 while(nx*nz>cap){if(nx>=nz&&nx>2)nx--;else if(nz>2)nz--;else break;}
 const n=nx*nz,dx=width/nx,dz=depth/nz,coordinate=(i:number):PointXZ=>({
   x:minX+(i%nx+.5)*dx,z:minZ+(Math.floor(i/nx)+.5)*dz
 });
 const terrain=new Float64Array(n),filled=new Float64Array(n);
 const seen=new Uint8Array(n),queue=new MinHeap(),parent=new Int32Array(n).fill(-1);
 for(let i=0;i<n;i++){
  const p=coordinate(i),y=height(p.x,p.z);
  if(!Number.isFinite(y))throw Error('Relief non fini durant le calcul des cuvettes');
  terrain[i]=y;
 }
 // Priority-flood from every boundary and every sea cell. A future filled level
 // is the lowest possible pass height on a route to an outlet.
 for(let i=0;i<n;i++){
  const x=i%nx,z=Math.floor(i/nx);
  if(x===0||z===0||x===nx-1||z===nz-1||terrain[i]<=seaLevel){
   seen[i]=1;filled[i]=Math.max(terrain[i],seaLevel);queue.push({index:i,level:filled[i]});
  }
 }
 while(queue.length){
  const {index,level}=queue.pop(),x=index%nx,z=Math.floor(index/nx);
  for(const [ox,oz] of DIRS){
   const xx=x+ox,zz=z+oz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;
   const i=zz*nx+xx;if(seen[i])continue;
   seen[i]=1;parent[i]=index;filled[i]=Math.max(level,terrain[i]);
   queue.push({index:i,level:filled[i]});
  }
 }
 // Group contiguous submerged cells at the same spill elevation. A group is
 // a physical depression candidate; false short D8 paths are not lakes.
 const handled=new Uint8Array(n),minDepth=Math.max(.1,options.minDepthM??1.5),
   minArea=Math.max(0,options.minAreaM2??0);
 const depressions:DepressionCandidate[]=[];
 for(let i=0;i<n;i++){
  if(handled[i]||terrain[i]<=seaLevel||filled[i]-terrain[i]<minDepth)continue;
  const spill=filled[i],stack=[i];handled[i]=1;
  let bottom=terrain[i],low=i,count=0;
  while(stack.length){
   const j=stack.pop()!,x=j%nx,z=Math.floor(j/nx);count++;
   if(terrain[j]<bottom||(terrain[j]===bottom&&j<low)){bottom=terrain[j];low=j;}
   for(const [ox,oz] of DIRS){
    const xx=x+ox,zz=z+oz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;
    const k=zz*nx+xx;
    if(handled[k]||terrain[k]<=seaLevel||filled[k]-terrain[k]<minDepth||Math.abs(filled[k]-spill)>.001)continue;
    handled[k]=1;stack.push(k);
   }
  }
  const area=count*dx*dz;
  if(area<minArea)continue;
  // Follow the priority-flood predecessor chain OUT of the depression to identify
  // the natural overflow crest. A river must start downstream of this crest,
  // never climb from the basin bottom across the lake shore.
  let cursor=low,crest=-1,downstream=-1,travel=0;
  for(let walked=0;walked<n&&parent[cursor]>=0;walked++){
   const next=parent[cursor],a=coordinate(cursor),b=coordinate(next);
   travel+=Math.hypot(a.x-b.x,a.z-b.z);
   if(terrain[cursor]>=spill-.35&&crest<0)crest=cursor;
   if(crest>=0&&terrain[next]<spill-.75){downstream=next;break;}
   cursor=next;
  }
  const spillway=crest>=0&&downstream>=0&&terrain[crest]-terrain[downstream]>.75
    ?{crest:coordinate(crest),downstream:coordinate(downstream),
      dropM:+(terrain[crest]-terrain[downstream]).toFixed(2),distanceM:Math.round(travel)}
    :undefined;
  depressions.push({outlet:coordinate(low),spillLevelM:+spill.toFixed(3),bottomM:+bottom.toFixed(3),
    depthM:+(spill-bottom).toFixed(3),areaM2:Math.round(area),cells:count,kind:'pit',
    ...(spillway?{spillway}:{})});
 }
 depressions.sort((a,b)=>b.areaM2-a.areaM2||b.depthM-a.depthM||a.outlet.x-b.outlet.x||a.outlet.z-b.outlet.z);
 const limit=Math.min(32,Math.max(1,Math.floor(options.maxResults??12)));
 return {sampled:n,stepM:Math.max(dx,dz),depressions:depressions.slice(0,limit),
   warnings:['Niveaux de débordement approchés sur une grille : affiner les berges en 3D avant publication']};
}
