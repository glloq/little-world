/** Static spatial index for author-owned race roadbeds. No per-frame allocations or 3D assets.
 * Used by the geography engine to suppress trees and rocks on physical race surfaces. */
import {centerline} from '../paths/path-geometry.ts';
import type {RaceTrack} from './race-track.ts';
const CELL=32,MAX_TRACKS=64,MAX_SEGMENTS=45000;
interface Segment {x:number;z:number;dx:number;dz:number;length2:number;radius2:number}
export function createRaceCorridorIndex(tracks:readonly RaceTrack[],clearance=2){
 if(tracks.length>MAX_TRACKS||!Number.isFinite(clearance)||clearance<0||clearance>8)
  throw Error('Coridors de pistes : limites invalides');
 const segments:Segment[]=[],cells=new Map<string,number[]>();
 for(const track of tracks){
  if(!track.points?.length)continue;
  const detailed=centerline({id:'race-corridor',kind:track.material,width:track.width,points:[...track.points],smooth:track.smooth});
  // 6 m corridor LOD is sufficient with 2 m clearance and avoids a per-world memory spike
  // when many long tracks are authored (geometry and physical sampling remain full resolution).
  const line=detailed.filter((_,i)=>i%3===0||i===detailed.length-1);
  const radius=track.width/2+clearance;
  for(let i=1;i<line.length;i++){
   if(segments.length>=MAX_SEGMENTS)throw Error('Trop de segments de pistes pour la végétation');
   const a=line[i-1],b=line[i],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
   if(len2<1e-8)continue;
   const idx=segments.push({x:a.x,z:a.z,dx,dz,length2:len2,radius2:radius*radius})-1;
   const minX=Math.floor((Math.min(a.x,b.x)-radius)/CELL),maxX=Math.floor((Math.max(a.x,b.x)+radius)/CELL),
         minZ=Math.floor((Math.min(a.z,b.z)-radius)/CELL),maxZ=Math.floor((Math.max(a.z,b.z)+radius)/CELL);
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const key=x+':'+z;const list=cells.get(key)??[];
    list.push(idx);cells.set(key,list);
   }
  }
 }
 return {
  segmentCount:segments.length,
  contains(x:number,z:number){
   if(!Number.isFinite(x)||!Number.isFinite(z))return false;
   const ids=cells.get(Math.floor(x/CELL)+':'+Math.floor(z/CELL));
   if(!ids)return false;
   for(const id of ids){
    const s=segments[id],u=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length2));
    const dx=x-(s.x+s.dx*u),dz=z-(s.z+s.dz*u);
    if(dx*dx+dz*dz<=s.radius2)return true;
   }
   return false;
  }
 };
}
