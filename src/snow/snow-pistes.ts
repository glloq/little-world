/** Pure slope scouting/validation for an authored ski island. Never modifies published terrain. */
export interface SkiPoint {x:number;z:number}
export interface PisteReport {
  ok:boolean; lengthM:number; dropM:number; maxGrade:number;
  maxCrossGrade:number; diagnostics:string[];
}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function validatePiste(points:readonly SkiPoint[],widthM:number,
  height:(x:number,z:number)=>number,
  options:{maxGrade?:number;maxCrossGrade?:number;minDrop?:number}={}):PisteReport{
  const diagnostics:string[]=[];let lengthM=0,maxGrade=0,maxCrossGrade=0,dropM=0;
  if(points.length<2||points.length>400||!Number.isFinite(widthM)||widthM<4||widthM>100||
     points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))
    return {ok:false,lengthM:0,dropM:0,maxGrade:0,maxCrossGrade:0,diagnostics:['Tracé ou largeur invalide']};
  const h0=height(points[0].x,points[0].z),last=points[points.length-1];
  dropM=h0-height(last.x,last.z);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.z-a.z);
    if(d<.5){diagnostics.push('Points trop proches');continue;}
    lengthM+=d;const nx=-(b.z-a.z)/d,nz=(b.x-a.x)/d;
    const steps=Math.ceil(d/2);
    for(let j=0;j<=steps;j++){
      const t=j/steps,x=lerp(a.x,b.x,t),z=lerp(a.z,b.z,t);
      const along=Math.min(1,2/d);
      const hx=lerp(x,b.x,along),hz=lerp(z,b.z,along);
      const grade=Math.abs((height(hx,hz)-height(x,z))/Math.max(.001,Math.hypot(hx-x,hz-z)));
      const side=(height(x+nx*widthM*.5,z+nz*widthM*.5)-height(x-nx*widthM*.5,z-nz*widthM*.5))/widthM;
      maxGrade=Math.max(maxGrade,grade);maxCrossGrade=Math.max(maxCrossGrade,Math.abs(side));
    }
  }
  if(dropM<(options.minDrop??25))diagnostics.push('Dénivelé insuffisant');
  if(maxGrade>(options.maxGrade??.7))diagnostics.push('Pente locale trop forte');
  if(maxCrossGrade>(options.maxCrossGrade??.3))diagnostics.push('Dévers trop important');
  return {ok:diagnostics.length===0,lengthM,dropM,maxGrade,maxCrossGrade,diagnostics};
}
/** Deterministic seed of a short downhill demonstration. Rejects cliffs and flat maps. */
export function findDemoPiste(height:(x:number,z:number)=>number,
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number},seaLevel=0):SkiPoint[]|null{
  const candidates:{x:number;z:number;h:number}[]=[];
  const nx=24,nz=24;
  for(let iz=2;iz<nz-2;iz++)for(let ix=2;ix<nx-2;ix++){
    const x=lerp(bounds.minX,bounds.maxX,ix/(nx-1)),z=lerp(bounds.minZ,bounds.maxZ,iz/(nz-1));
    const h=height(x,z);
    if(h>seaLevel+90)candidates.push({x,z,h});
  }
  candidates.sort((a,b)=>b.h-a.h);
  for(const start of candidates.slice(0,24)){
    const path:SkiPoint[]=[{x:start.x,z:start.z}];
    let x=start.x,z=start.z;
    for(let i=0;i<65;i++){
      const e=3,gx=(height(x+e,z)-height(x-e,z))/(2*e),gz=(height(x,z+e)-height(x,z-e))/(2*e),grade=Math.hypot(gx,gz);
      if(grade<.07||grade>.85)break;
      const nextX=x-6*gx/grade,nextZ=z-6*gz/grade;
      if(nextX<bounds.minX+25||nextX>bounds.maxX-25||nextZ<bounds.minZ+25||nextZ>bounds.maxZ-25||height(nextX,nextZ)<seaLevel+10)break;
      x=nextX;z=nextZ;path.push({x,z});
      if(start.h-height(x,z)>95)break;
    }
    if(path.length>=22){const check=validatePiste(path,7,height,{maxGrade:.9,maxCrossGrade:.45,minDrop:35});if(check.ok)return path;}
  }
  return null;
}
