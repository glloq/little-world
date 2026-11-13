import type {CompiledWater} from './profile.ts';
/** Joined cross-sections: one height across each river width, no gaps at bends. */
export function waterRibbonData(water:CompiledWater){
 const positions:number[]=[],indices:number[]=[];
 const p=water.points;
 for(let i=0;i<p.length;i++){
  const before=p[Math.max(0,i-1)],after=p[Math.min(p.length-1,i+1)];
  const dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1;
  for(const side of [-1,1])positions.push(p[i].x+side*dz/len*water.width/2,p[i].level+.04,p[i].z-side*dx/len*water.width/2);
  if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 }
 return {positions,indices};
}
