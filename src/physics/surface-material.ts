import type {GroundMaterial} from './motion.ts';
/** Stable 2 m source cells, not a history-dependent distance cache: replaying from a
 * checkpoint gives the same material even if a different cell was queried beforehand. */
export function createMaterialSampler(read:(x:number,z:number)=>string){
 let lastX=Infinity,lastZ=Infinity,value:GroundMaterial='grass';
 return (x:number,z:number):GroundMaterial=>{
  const cx=Math.floor(x/2),cz=Math.floor(z/2);
  if(cx!==lastX||cz!==lastZ){
   const m=read(cx*2+1,cz*2+1);lastX=cx;lastZ=cz;
   value=m==='snow'?'snow':m==='ice'?'ice':m==='mud'?'mud':m==='sand'?'sand':m==='wood'?'wood':m==='rock'||m==='basalt'||m==='gravel'||m==='pebbles'?'rock':'grass';
  }
  return value;
 };
}
