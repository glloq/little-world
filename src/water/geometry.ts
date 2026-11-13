import {waterSections} from './profile.ts';
import type {CompiledWater} from './profile.ts';
/** Joined cross-sections: one height across each river width, no gaps at bends. */
export function waterRibbonData(water:CompiledWater){
 const positions:number[]=[],indices:number[]=[];
 const sections=waterSections(water);
 for(let i=0;i<sections.length;i++){
  for(const v of [sections[i].left,sections[i].right])positions.push(v.x,v.level+.04,v.z);
  if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 }
 return {positions,indices};
}
