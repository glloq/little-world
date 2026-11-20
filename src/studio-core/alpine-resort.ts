/** Ski domain of an authored alpine island (planning grooms the relief as it goes): one base ("front de neige"), a gondola to
 * the summit, pistes of every difficulty traced on the real relief, their own chairlifts or
 * draglift, and groomed relief features. Everything is stored as editable source data. */
import type {SkiAreaV1} from '../snow/ski-area.ts';
import {validatePiste,type SkiPoint} from '../snow/snow-pistes.ts';
import {buildPisteGrid,distanceToPolyline,groomedProfile,PISTE_GRADES,polylineLength,routePiste,type LiftKind,type PisteDifficulty,type ResortEnv} from '../snow/resort-planner.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import type {ProjectDocument} from './types.ts';

export interface ResortPlan {summit:SkiPoint&{h:number};base:SkiPoint&{h:number};snowLineM:number;areas:SkiAreaV1[]}
interface Spec {id:string;name:string;difficulty:PisteDifficulty;widthM:number;start:SkiPoint;alternatives?:SkiPoint[];toBase:boolean;
  lift?:{kind:LiftKind;name:string}}
const round=(p:SkiPoint)=>({x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100});
const dirTo=(a:SkiPoint,b:SkiPoint)=>Math.atan2(b.x-a.x,b.z-a.z);
const along=(p:SkiPoint,heading:number,d:number)=>({x:p.x+Math.sin(heading)*d,z:p.z+Math.cos(heading)*d});

function resortEnv(project:ProjectDocument):ResortEnv&{seaLevel:number}{
  const env=projectRaceTerrainEnvironment(project);
  return {bounds:env.bounds,seaLevel:env.seaLevel,height:env.height,blocked:(x,z)=>{
    const h=env.height(x,z),w=env.water(x,z,h);
    return h<=env.seaLevel+3||w!==null&&w>h-.5||env.occupation(x,z)!=='none';
  }};
}
function slopeAround(env:ResortEnv,p:SkiPoint,r:number){
  let lo=Infinity,hi=-Infinity;
  for(const dx of [-r,0,r])for(const dz of [-r,0,r]){const h=env.height(p.x+dx,p.z+dz);lo=Math.min(lo,h);hi=Math.max(hi,h);}
  return (hi-lo)/(2*r);
}
function freeDisc(env:ResortEnv,p:SkiPoint,r:number){
  for(let a=0;a<8;a++)for(const d of [0,r/2,r])if(env.blocked(p.x+Math.sin(a*Math.PI/4)*d,p.z+Math.cos(a*Math.PI/4)*d))return false;
  return true;
}
export function planAlpineResort(project:ProjectDocument,options:{toward?:SkiPoint;shelfM:number}):ResortPlan{
  const env=resortEnv(project),b=env.bounds;
  let summit={x:0,z:0,h:-Infinity};
  for(let x=b.minX+60;x<b.maxX-60;x+=15)for(let z=b.minZ+60;z<b.maxZ-60;z+=15){const h=env.height(x,z);if(h>summit.h)summit={x,z,h};}
  // Base on the gentle shelf, on the side of the village, with room for the station.
  const toward=options.toward??{x:summit.x,z:summit.z+1};
  let base:(SkiPoint&{h:number;score:number})|null=null;
  for(let r=180;r<=900;r+=10)for(let a=0;a<360;a+=4){
    const p=along(summit,a*Math.PI/180,r),h=env.height(p.x,p.z);
    if(h<options.shelfM+6||h>options.shelfM+45)continue;
    const slope=slopeAround(env,p,12);if(slope>.2||!freeDisc(env,p,45))continue;
    const score=Math.hypot(p.x-toward.x,p.z-toward.z)/120+slope*8+Math.abs(h-options.shelfM-18)/10;
    if(!base||score<base.score)base={...p,h,score};
  }
  if(!base)throw Error('Station des Cimes : aucun replat de départ près du village.');
  const B=base,baseDir=dirTo(summit,B);
  // Summit station of the gondola: below the steep cap, on the base side, where a red run
  // can leave toward the base.
  let top:(SkiPoint&{h:number})|null=null;
  for(let r=60;r<=320;r+=10)for(let a=-30;a<=30;a+=5){
    const p=along(summit,baseDir+a*Math.PI/180,r),h=env.height(p.x,p.z),q=along(p,dirTo(p,B),25);
    if((h-env.height(q.x,q.z))/25>.5||!freeDisc(env,p,12)||slopeAround(env,p,8)>.7)continue;
    if(!top||h>top.h)top={...p,h};
  }
  if(!top)throw Error('Station des Cimes : aucun site de gare sommitale.');
  if((globalThis as {RESORT_DEBUG?:boolean}).RESORT_DEBUG)console.log('base',B,'top',top,'summit',summit);
  const T=top,deg=Math.PI/180,near=(d:number,offset:number)=>along(T,baseDir+offset*deg,d);
  const ring=(offset:number,r=110)=>along(summit,baseDir+offset*deg,r);
  const specs:Spec[]=[
    {id:'composition-alpine',name:'Le Grand Couloir',difficulty:'red',widthM:16,start:near(18,0),toBase:true,
      lift:{kind:'gondola',name:'Télécabine des Cimes'}},
    {id:'alpine:directe',name:'La Directe',difficulty:'black',widthM:14,start:near(42,75),toBase:true},
    {id:'alpine:levant',name:'Le Levant',difficulty:'red',widthM:16,start:ring(75),toBase:false,lift:{kind:'chairlift',name:'Télésiège du Levant'}},
    {id:'alpine:couchant',name:'Le Couchant',difficulty:'blue',widthM:18,start:ring(-75),toBase:false,lift:{kind:'chairlift',name:'Télésiège du Couchant'}},
    {id:'alpine:face-cachee',name:'La Face cachée',difficulty:'black',widthM:14,start:ring(130),toBase:false,lift:{kind:'chairlift',name:'Télésiège de la Face cachée'}},
    {id:'alpine:combe',name:'La Combe aux Lièvres',difficulty:'blue',widthM:18,start:ring(-135),toBase:false,lift:{kind:'chairlift',name:'Télésiège de la Combe'}},
    {id:'alpine:crete-sud',name:'La Crête du Sud',difficulty:'red',widthM:16,start:ring(185),toBase:false,lift:{kind:'chairlift',name:'Télésiège de la Crête'}},
    {id:'alpine:marmottes',name:'Les Marmottes',difficulty:'blue',widthM:18,start:near(42,-75),alternatives:[near(60,-110),near(45,100),near(70,140)],toBase:true},
  ];
  const areas:SkiAreaV1[]=[],traced:SkiPoint[][]=[],snowLine=Math.round(B.h-22);
  const terrain=project.world.terrain;if(terrain?.kind!=='archipelago')throw Error('Station des Cimes : relief insulaire requis.');
  const features=terrain.archipelago.features,sea=env.seaLevel;
  let grid=buildPisteGrid(env,{minX:summit.x-1000,maxX:summit.x+1000,minZ:summit.z-1000,maxZ:summit.z+1000});
  let current=env;
  const goal={x:B.x,z:B.z,radiusM:40};
  /** Grooms the run into the relief and keeps it only if every accepted run stays within its
   * difficulty once the relief is updated (overlapping starts or finishes can conflict). */
  const accept=(spec:Spec,points:SkiPoint[],liftLine?:SkiPoint[])=>{
    const area:SkiAreaV1={version:1,id:spec.id,name:spec.name,points:points.map(round),widthM:spec.widthM,snowLineM:snowLine,equipment:'skis',
      lift:!!spec.lift&&!!liftLine,difficulty:spec.difficulty,...(spec.lift&&liftLine?{liftKind:spec.lift.kind,liftName:spec.lift.name,liftPath:liftLine.map(round)}:{})};
    const levels=groomedProfile(area.points,current.height,10);
    features.push({id:'piste:'+area.id,kind:'piste',points:area.points.map(p=>({...p})),levels:levels.map(v=>Math.round((v-sea)*100)/100),widthM:area.widthM+4,edgeM:10});
    const next=resortEnv(project);
    const ok=[...areas,area].every(a=>{const r=validatePiste(a.points,a.widthM,next.height,{maxGrade:PISTE_GRADES[a.difficulty!].max+.12,maxCrossGrade:.3,minDrop:15});if(!r.ok&&(globalThis as {RESORT_DEBUG?:boolean}).RESORT_DEBUG)console.log('reject',area.id,'breaks',a.id,r.diagnostics,r.maxGrade.toFixed(2),r.maxCrossGrade.toFixed(2));return r.ok;});
    if(!ok){features.pop();return false;}
    areas.push(area);traced.push(area.points);current=next;
    grid=buildPisteGrid(current,{minX:summit.x-1000,maxX:summit.x+1000,minZ:summit.z-1000,maxZ:summit.z+1000});
    return true;
  };
  for(const spec of specs){
    for(const start of [spec.start,...spec.alternatives??[]]){
      const points=routePiste(grid,start,{difficulty:spec.difficulty,widthM:spec.widthM,goal:spec.toBase?goal:undefined,stopAltitude:B.h+2,avoid:traced});
      if(!points)continue;
      let line:SkiPoint[]|undefined;
      if(spec.lift){
        const end=points[points.length-1],side=dirTo(end,points[0])+90*deg;
        const from=spec.toBase?along(B,dirTo(B,T)+90*deg,14):along(end,side,12),to=spec.toBase?along(T,baseDir+90*deg,8):along(points[0],side,10);
        if(current.blocked(from.x,from.z)||current.blocked(to.x,to.z))continue;
        line=[from,to];
      }
      if(accept(spec,points,line))break;
    }
  }
  // Beginners: the gentlest free slope near the base, served by a draglift.
  const candidates:(SkiPoint&{d:number})[]=[];
  for(let x=B.x-700;x<=B.x+700;x+=40)for(let z=B.z-700;z<=B.z+700;z+=40){
    const h=current.height(x,z),d=Math.hypot(x-B.x,z-B.z);
    if(d<700&&h>snowLine+30&&h<snowLine+110&&freeDisc(current,{x,z},14)&&!traced.some(t=>distanceToPolyline(t,x,z)<40))candidates.push({x,z,d});
  }
  candidates.sort((a,b)=>a.d-b.d);
  for(const start of candidates.slice(0,40)){
    const startH=current.height(start.x,start.z);
    const points=routePiste(grid,start,{difficulty:'green',widthM:20,stopAltitude:startH-24,avoid:traced,maxLengthM:500});
    if(!points||polylineLength(points)<140)continue;
    const end=points[points.length-1],side=dirTo(end,points[0])+90*deg,from=along(end,side,12),to=along(points[0],side,12);
    if(current.blocked(from.x,from.z)||current.blocked(to.x,to.z))continue;
    if(accept({id:'alpine:jardin',name:'Le Jardin des Neiges',difficulty:'green',widthM:20,start,toBase:false,lift:{kind:'draglift',name:'Téléski du Jardin'}},points,[from,to]))break;
  }
  if(!areas.some(a=>a.id==='composition-alpine'))throw Error('Station des Cimes : piste principale introuvable.');
  return {summit,base:{x:B.x,z:B.z,h:B.h},snowLineM:snowLine,areas};
}
