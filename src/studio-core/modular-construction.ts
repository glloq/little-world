/** Modular constructions compiled into ordinary V3 entities.
 * Kit geometry is authored along local X; Y is up. No hidden procedural mesh state. */
import {linePattern,type XZ} from './placement-patterns.ts';
export interface ModulePose {x:number;z:number;yaw:number;scaleX:number;lift:number}
const distance=(a:XZ,b:XZ)=>Math.hypot(a.x-b.x,a.z-b.z);
export function wallModules(points:readonly XZ[],moduleLength:number,limit=120):ModulePose[]{
  if(!Number.isFinite(moduleLength)||moduleLength<.5||moduleLength>20)throw Error('Longueur du module invalide');
  if(points.length<2||points.length>50)throw Error('Mur : 2 à 50 points');
  const length=points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);
  // Place the center of each module, retaining the same spacing at corners.
  if(length<moduleLength*.6)throw Error('Mur trop court pour le module');
  const count=Math.max(1,Math.ceil(length/moduleLength));
  if(count>limit)throw Error('Mur trop long : diviser le tracé en plusieurs sections');
  const stride=length/count;
  // One sampling pass for the entire spline (previously rebuilt on every module).
  // This is important when a wall reaches the 120-element transaction cap.
  const samples=linePattern(points,stride,limit+1);
  return samples.slice(0,count).map((p,i)=>{
    const next=samples[Math.min(count,i+1)];
    const yaw=next?Math.atan2(next.z-p.z,next.x-p.x):p.yaw;
    return {x:(p.x+(next?.x??p.x))/2,z:(p.z+(next?.z??p.z))/2,yaw,scaleX:stride/moduleLength,lift:0};
  });
}
export interface BridgePlan {pose:ModulePose;span:number;bankHeight:number;warnings:string[]}
/** Single bridge model spans bank to bank; center deck lifted above the water.
 * This is an authoring fit check, NOT proof of walkability. */
export function bridgePlan(start:XZ,end:XZ,moduleLength:number,height:(x:number,z:number)=>number,
 waterDepth:(x:number,z:number)=>number,clearance=1):BridgePlan{
  const span=distance(start,end);
  if(!Number.isFinite(span)||span<2||span>30)throw Error('Pont : deux rives distantes de 2 à 30 m');
  if(!Number.isFinite(moduleLength)||moduleLength<=.5)throw Error('Pont : dimension du modèle incorrecte');
  const scaleX=span/moduleLength;
  if(scaleX<.6||scaleX>2.5)throw Error('Pont trop étiré : choisir un modèle plus adapté aux deux rives');
  const bank1=height(start.x,start.z),bank2=height(end.x,end.z);
  if(Math.abs(bank1-bank2)>3)throw Error('Pont : différence d’altitude entre les rives supérieure à 3 m');
  const center={x:(start.x+end.x)/2,z:(start.z+end.z)/2};
  const wet=[.25,.5,.75].map(t=>waterDepth(start.x+(end.x-start.x)*t,start.z+(end.z-start.z)*t));
  if(!wet.some(x=>x>.1))throw Error('Pont : aucune surface d’eau détectée sous le tablier');
  const bankHeight=Math.max(bank1,bank2),lift=Math.max(0,bankHeight+clearance-height(center.x,center.z));
  const warnings:string[]=[];
  if(wet.some(x=>x<=.1))warnings.push('Une partie de la travée traverse un terrain sec');
  if(Math.abs(bank1-bank2)>1)warnings.push('Rives à niveaux différents : vérifier les rampes d’accès');
  return {pose:{...center,yaw:Math.atan2(end.z-start.z,end.x-start.x),scaleX,lift},span,bankHeight,warnings};
}
