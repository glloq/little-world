/** World Production V1 — the ten reusable landscape presets (WP-4).
 * A preset is code that turns an instance (footprint + seed + a few parameters) into
 * RE-EDITABLE authoring data: relief shapes of the archipelago generator, mask corrections,
 * water bodies (WATER contracts), paths, entities of the asset registry, activity zones and a
 * soft dressing region. Never baked geometry, never thousands of positions: vegetation stays
 * procedural (biotope profiles + seed + cell). Pure and deterministic. */
import type {ReliefFeature,PointXZ} from '../geography/archipelago.ts';
import type {MaskLayerId} from '../geography/layers.ts';
import type {WaterBody,PathDefinition} from '../world-data.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {BiotopeId} from './asset-usage.ts';
import type {LandscapeRegion} from './biotopes.ts';
import type {LandscapeInstanceV1,LandscapeParams,LandscapePresetId} from './landscape-schema.ts';
import {fbm,hash2} from '../geography/noise.ts';
import {traceDownhill} from './hydro-trace.ts';
import {ECONOMY_ITEMS,COIN} from '../gameplay/economy.ts';
import {MINE_ITEMS} from '../mine/mine-data.ts';
import {FARM_ITEMS} from '../farm/farm-data.ts';

export interface ParamDef {key:string;label:string;kind:'number'|'boolean';min?:number;max?:number;step?:number;default:number|boolean}
export interface Frame {cx:number;cz:number;width:number;length:number;rotation:number;seed:number;
  toWorld(u:number,v:number):PointXZ;toLocal(x:number,z:number):{u:number;v:number}}
export interface ContentEnv extends Frame {
  /** Relief AFTER this landscape's own shapes (other sources included). */
  height(x:number,z:number):number;seaLevel:number;
  /** Water surface at a point (sea, rivers, lakes) or null. */
  water(x:number,z:number):number|null;
  inWorld(x:number,z:number):boolean;
  /** Final id of a local key of this instance (dialogue → objective references). */
  ref(key:string):string;
  /** Seeded uniform 0..1 per integer key. */
  rand(key:number):number;
}
export interface MaskRule {layer:MaskLayerId;code:string;test:(u:number,v:number,x:number,z:number)=>boolean}
/** `rotation` = yaw (rad) of the model; `y` = offset above the terrain (V3 Transform convention). */
export interface PlannedEntity {key:string;name:string;assetId:string;x:number;z:number;rotation:number;scale?:number;scale3?:[number,number,number];y?:number;
  /** Logical state (e.g. `shop: 'mine'` for a counter). */state?:Record<string,string|number|boolean>;
  /** Interactable object (E): prompt, range and interaction keys of this instance; persisted state fields. */
  interact?:{prompt:string;range:number;interactionKeys:string[];persist:string[]};
  /** An inhabitant (NPC) instead of a model: routine, dialogues (keys of this instance). */
  character?:{species:import('../studio-core/types.ts').CharacterSpecies;appearance:import('../character-style.ts').Appearance;behaviorKey:string;dialogueKeys:string[];speed:number;radius:number}}
export interface LandscapeContent {
  /** Gameplay library entries (key = local key, or '@id' for a shared global id such as an item). */
  libraries?:Partial<Record<'behaviors'|'dialogues'|'objectives'|'items'|'interactions',{key:string;value:Record<string,unknown>}[]>>;
  masks:MaskRule[];water:(Omit<WaterBody,'id'>&{key:string})[];paths:(Omit<PathDefinition,'id'>&{key:string})[];entities:PlannedEntity[];zones:(Omit<ActivityZoneV3,'id'>&{key:string})[];diagnostics:string[]}
export interface LandscapePreset {
  id:LandscapePresetId;version:number;label:string;description:string;profile:BiotopeId;
  defaultSize:[number,number];params:ParamDef[];
  /** Produced data, listed for the Studio library and the documentation. */
  produces:string[];
  relief(f:Frame,p:LandscapeParams,heightBefore:(x:number,z:number)=>number,seaLevel:number):(ReliefFeature&{key:string})[];
  regions(f:Frame,p:LandscapeParams):Omit<LandscapeRegion,'id'>[];
  content(env:ContentEnv,p:LandscapeParams):LandscapeContent;
}
export function frameOf(i:Pick<LandscapeInstanceV1,'center'|'width'|'length'|'rotation'|'seed'>):Frame{
  const c=Math.cos(i.rotation),s=Math.sin(i.rotation);
  return {cx:i.center.x,cz:i.center.z,width:i.width,length:i.length,rotation:i.rotation,seed:i.seed>>>0,
    toWorld:(u,v)=>({x:Math.round((i.center.x+u*c-v*s)*10)/10,z:Math.round((i.center.z+u*s+v*c)*10)/10}),
    toLocal:(x,z)=>{const dx=x-i.center.x,dz=z-i.center.z;return {u:dx*c+dz*s,v:-dx*s+dz*c};}};
}
const num=(p:LandscapeParams,k:string,d:number)=>typeof p[k]==='number'?p[k] as number:d;
const bool=(p:LandscapeParams,k:string,d:boolean)=>typeof p[k]==='boolean'?p[k] as boolean:d;
const r1=(v:number)=>Math.round(v*10)/10;
const noise=(f:Frame,salt:number,x:number,z:number,scale=40)=>fbm((f.seed^salt)>>>0,x/scale,z/scale,2);
/** Ellipse membership with an organic (noisy) border; 1 inside, < 0 outside. */
const blob=(f:Frame,salt:number,u:number,v:number,a:number,b:number,x:number,z:number,wobble=.18)=>1-Math.hypot(u/a,v/b)+wobble*noise(f,salt,x,z,Math.max(18,Math.min(a,b)*.6));
/** Smooth meander polyline along v (n points), lateral amplitude `amp`. */
function meander(f:Frame,n:number,amp:number,phase:number,v0=-f.length/2,v1=f.length/2,u0=0):PointXZ[]{
  return Array.from({length:n},(_,i)=>{const t=i/(n-1),v=v0+(v1-v0)*t,u=u0+amp*Math.sin(t*Math.PI*2*.9+phase)+amp*.25*hash2(f.seed^0x51,i,7);return f.toWorld(u,v);});
}
const P=(p:LandscapePreset)=>p;
/** Watercourse from the higher end of an axis, traced down the real relief to the sea, a water
 * body or a pit (never drawn uphill). Null when the course is too short to be a stream. */
function course(env:ContentEnv,axis:PointXZ[],minLength=120,corridorM=40){
  const a=axis[0],b=axis.at(-1)!,up=env.height(a.x,a.z)>=env.height(b.x,b.z),ordered=up?axis:[...axis].reverse();
  // 1. The valley floor: steepest descent kept inside a corridor around the carved axis.
  {const src=ordered[0],dst=ordered.at(-1)!,t=traceDownhill(src,{height:env.height,seaLevel:env.seaLevel,water:env.water,inWorld:env.inWorld,heading:Math.atan2(dst.z-src.z,dst.x-src.x),maxLengthM:4000,corridor:{axis:ordered,halfWidthM:Math.max(30,corridorM)}});
    if(t.lengthM>=minLength&&t.points.length>=3&&t.drop>=4)return t;}
  // 2. Otherwise follow the steepest descent of the relief from the high end.
  const src=ordered[0],dst=ordered.at(-1)!,t=traceDownhill(src,{height:env.height,seaLevel:env.seaLevel,water:env.water,inWorld:env.inWorld,heading:Math.atan2(dst.z-src.z,dst.x-src.x),maxLengthM:4000});
  return t.lengthM>=minLength&&t.points.length>=3?t:null;
}
/** Pond centres of a marsh basin (local u, v, radius): same list for relief and content. */
function pondSpots(f:Frame,p:LandscapeParams){const R=Math.min(f.width,f.length)*.48,rand=(k:number)=>(hash2(f.seed,k,0x5eed)+1)/2;
  return Array.from({length:Math.round(num(p,'ponds',2))},(_,i)=>{const a=rand(90+i)*6.283,d=R*(.15+.3*rand(100+i));return {u:Math.cos(a)*d,v:Math.sin(a)*d,r:8+rand(110+i)*10};});}
const sizeParams=(density:number):ParamDef[]=>[{key:'density',label:'Densité de végétation',kind:'number',min:.3,max:1.6,step:.05,default:density}];
/** Pick up to `count` building spots on gentle, dry ground inside a ring (deterministic). */
function spots(env:ContentEnv,count:number,ringMin:number,ringMax:number,minGap:number,salt:number,maxSlope=.18):PointXZ[]{
  const out:PointXZ[]=[];
  for(let k=0;k<count*24&&out.length<count;k++){
    const a=env.rand(salt+k*2)*Math.PI*2,r=ringMin+(ringMax-ringMin)*Math.sqrt(env.rand(salt+k*2+1)),p=env.toWorld(Math.cos(a)*r,Math.sin(a)*r);
    if(!env.inWorld(p.x,p.z)||env.water(p.x,p.z)!==null)continue;
    const h=env.height(p.x,p.z),sl=Math.max(Math.abs(env.height(p.x+3,p.z)-h),Math.abs(env.height(p.x,p.z+3)-h))/3;
    if(sl>maxSlope||h<env.seaLevel+1.5)continue;if(out.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<minGap))continue;out.push(p);
  }
  return out;
}
/** Segmented enclosure (fence / wall / hedge modules every 2 m) along a polyline. Optional
 * `corner` module on inner vertices, `gate` module at the `gapAt` position (else a gap), `end`
 * modules on both sides of skipped modules (broken walls). */
function enclosure(prefix:string,assetId:string,name:string,points:PointXZ[],skipEvery=0,gapAt=-1,extra:{corner?:string;gate?:string;end?:string}={}):PlannedEntity[]{
  const out:PlannedEntity[]=[];let n=0;
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.round(len/2)),rot=-Math.atan2(b.z-a.z,b.x-a.x);
    if(extra.corner&&i>0)out.push({key:`${prefix}-c${i}`,name:`${name} (angle ${i})`,assetId:extra.corner,x:r1(a.x),z:r1(a.z),rotation:rot});
    for(let s=0;s<steps;s++){n++;const t=(s+.5)/steps,x=r1(a.x+(b.x-a.x)*t),z=r1(a.z+(b.z-a.z)*t);
      if(n===gapAt){if(extra.gate)out.push({key:`${prefix}-gate`,name:`${name} — portillon`,assetId:extra.gate,x,z,rotation:rot});continue;}
      if(skipEvery&&n%skipEvery===0){if(extra.end&&s+1<steps){const t2=(s+1.5)/steps;out.push({key:`${prefix}-e${n}`,name:`${name} — extrémité ${n}`,assetId:extra.end,x:r1(a.x+(b.x-a.x)*t2),z:r1(a.z+(b.z-a.z)*t2),rotation:rot});s++;n++;}continue;}
      out.push({key:`${prefix}-${n}`,name:`${name} ${n}`,assetId,x,z,rotation:rot});}}
  return out;
}
/** Bridge across a watercourse between points i and i+1: perpendicular to the flow, stretched
 * along its span if needed, deck anchors on the lower bank (offset above the carved bed). */
function bridgeOver(env:ContentEnv,pts:PointXZ[],i:number,width:number,depth:number,asset:{id:string;span:number;anchorY:number},key:string,name:string):PlannedEntity{
  const a=pts[i],b=pts[i+1],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,dl=Math.hypot(b.x-a.x,b.z-a.z)||1,px=-(b.z-a.z)/dl,pz=(b.x-a.x)/dl;
  const stretch=Math.max(1,(width+3)/asset.span),reach=Math.max(asset.span/2*stretch,width/2+2);
  const bank=Math.min(env.height(mx+px*reach,mz+pz*reach),env.height(mx-px*reach,mz-pz*reach)),bed=env.height(mx,mz)-.35-depth;
  return {key,name,assetId:asset.id,x:r1(mx),z:r1(mz),rotation:Math.atan2(-pz,px),scale3:[r1(stretch*100)/100,1,1],y:r1(Math.max(0,bank-asset.anchorY-bed))};
}
const empty=():LandscapeContent=>({masks:[],water:[],paths:[],entities:[],zones:[],diagnostics:[]});

const NATURE_PRESETS={
  'forest-valley':P({id:'forest-valley',version:1,label:'Vallée forestière',description:'Vallée creusée, forêt dense, clairières, sous-bois humide, ruisseau facultatif et rochers.',profile:'temperate-forest',defaultSize:[420,700],
    params:[...sizeParams(1.15),{key:'depth',label:'Profondeur de vallée (m)',kind:'number',min:3,max:60,step:1,default:14},{key:'clearings',label:'Clairières',kind:'number',min:0,max:5,step:1,default:3},{key:'stream',label:'Ruisseau',kind:'boolean',default:true}],
    produces:['relief : vallée','masques : forêt, clairières, humidité de fond','eau : ruisseau (profil relief)','région d’habillage forêt'],
    relief:(f,p)=>[{key:'valley',id:'',kind:'valley',points:meander(f,5,f.width*.08,f.seed%7),widthM:r1(f.width*.38),depthM:num(p,'depth',14)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.22),profile:'temperate-forest',density:num(p,'density',1.15)}],
    content:(env,p)=>{const c=empty(),clear=Math.round(num(p,'clearings',3)),axis=meander(env,5,env.width*.08,env.seed%7);
      const centres=Array.from({length:clear},(_,i)=>({u:(env.rand(10+i)-.5)*env.width*.55,v:(i+.5)/Math.max(1,clear)*env.length-env.length/2,r:18+env.rand(20+i)*22}));
      c.masks.push({layer:'biome',code:'f',test:(u,v,x,z)=>blob(env,0x11,u,v,env.width*.48,env.length*.48,x,z)>0&&!centres.some(k=>Math.hypot(u-k.u,v-k.v)<k.r*(1+.25*noise(env,0x12,x,z,15)))});
      c.masks.push({layer:'biome',code:'m',test:(u,v,x,z)=>centres.some(k=>Math.hypot(u-k.u,v-k.v)<k.r*(1+.25*noise(env,0x12,x,z,15)))});
      c.masks.push({layer:'moisture',code:'7',test:u=>Math.abs(u)<env.width*.09});
      if(bool(p,'stream',true)){const t=course(env,axis);if(t){c.water.push({key:'stream',points:t.points,width:4,level:0,depth:.8,profile:{mode:'terrain',offset:-.3}});
        // Footbridge (wooden arch) on the middle of the stream.
        const mid=Math.max(0,Math.min(t.points.length-2,Math.floor(t.points.length/3)));c.entities.push(bridgeOver(env,t.points,mid,4,.8,{id:'structure.bridge_wooden_arch',span:5.6,anchorY:.86},'footbridge','Passerelle du ruisseau'));}
        else c.diagnostics.push('Ruisseau : pente insuffisante depuis le haut de la vallée, non créé.');}
      return c;}}),
  'river-bend':P({id:'river-bend',version:1,label:'Méandre de rivière',description:'Rivière sinueuse dans un lit creusé, berges humides, galets, arbres riverains, poches de marais, pont facultatif.',profile:'humid-valley',defaultSize:[360,600],
    params:[...sizeParams(1.1),{key:'riverWidth',label:'Largeur de rivière (m)',kind:'number',min:3,max:24,step:1,default:6},{key:'sinuosity',label:'Sinuosité',kind:'number',min:0,max:1,step:.05,default:.6},{key:'bridge',label:'Pont',kind:'boolean',default:true}],
    produces:['relief : lit de rivière','eau : rivière (profil relief)','masques : berges humides, poches de marais','entité : pont (registre)','région ripisylve'],
    relief:(f,p)=>[{key:'bed',id:'',kind:'valley',points:meander(f,7,f.width*.28*num(p,'sinuosity',.6),f.seed%5),widthM:r1(Math.max(30,num(p,'riverWidth',6)*4)),depthM:4}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.2),profile:'humid-valley',density:num(p,'density',1.1)}],
    content:(env,p)=>{const c=empty(),w=num(p,'riverWidth',6),pts=meander(env,7,env.width*.28*num(p,'sinuosity',.6),env.seed%5);
      const traced=course(env,pts);if(!traced){c.diagnostics.push('Rivière : aucun écoulement descendant depuis l’emprise, non créée.');return c;}
      const centreIndex=traced.points.reduce((m,q,i,a)=>Math.hypot(q.x-env.cx,q.z-env.cz)<Math.hypot(a[m].x-env.cx,a[m].z-env.cz)?i:m,1);
      pts.splice(0,pts.length,...traced.points);
      c.water.push({key:'river',points:pts,width:w,level:0,depth:Math.min(3,.8+w*.12),profile:{mode:'terrain',offset:-.35}});
      const near=(x:number,z:number,d:number)=>{for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<d)return true;}return false;};
      c.masks.push({layer:'moisture',code:'8',test:(_u,_v,x,z)=>near(x,z,w/2+16)});
      c.masks.push({layer:'biome',code:'w',test:(_u,_v,x,z)=>near(x,z,w/2+28)&&!near(x,z,w/2+6)&&noise(env,0x21,x,z,30)>.28});
      if(bool(p,'bridge',true)){
        // Stone bridge across the river between points 3 and 4, stretched along its span when
        // the river is wider, deck anchors set on the lower bank (offset above the carved bed).
        const ci=Math.max(1,Math.min(pts.length-2,centreIndex)),a=pts[ci],b=pts[ci+1],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,dl=Math.hypot(b.x-a.x,b.z-a.z)||1,px=-(b.z-a.z)/dl,pz=(b.x-a.x)/dl;
        const span=w+3,stretch=Math.max(1,span/8.3),reach=Math.max(4.15*stretch,w/2+2);
        const bank=Math.min(env.height(mx+px*reach,mz+pz*reach),env.height(mx-px*reach,mz-pz*reach)),depth=Math.min(3,.8+w*.12),bed=env.height(mx,mz)-.35-depth;
        c.entities.push({key:'bridge',name:'Pont du méandre',assetId:'structure.bridge_stone',x:r1(mx),z:r1(mz),rotation:Math.atan2(-pz,px),scale3:[r1(stretch*100)/100,1,1],y:r1(Math.max(0,bank-1.64-bed))});
        if(stretch>1.6)c.diagnostics.push('Pont étiré au-delà de 1,6× : préférer une rivière plus étroite au passage.');
      }
      return c;}}),
  'rocky-cliff':P({id:'rocky-cliff',version:1,label:'Falaise rocheuse',description:'Escarpement rocheux, strates et roche apparente, éboulis au pied, végétation éparse.',profile:'heath',defaultSize:[480,260],
    params:[...sizeParams(.7),{key:'height',label:'Hauteur de falaise (m)',kind:'number',min:8,max:120,step:1,default:38}],
    produces:['relief : crête raide','masques : roche sur l’escarpement, éboulis au pied','région lande rocheuse'],
    relief:(f,p)=>[{key:'scarp',id:'',kind:'ridge',points:[f.toWorld(-f.width*.45,f.length*.05),f.toWorld(0,f.length*.12),f.toWorld(f.width*.45,f.length*.02)],widthM:r1(Math.max(24,num(p,'height',38)*1.1)),heightM:num(p,'height',38)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.25),profile:'heath',density:num(p,'density',.7)}],
    content:(env,p)=>{const c=empty(),h=num(p,'height',38),band=Math.max(24,h*1.1);
      c.masks.push({layer:'geology',code:'r',test:(u,v,x,z)=>Math.abs(v-env.length*.07)<band*.55+6*noise(env,0x31,x,z,20)&&Math.abs(u)<env.width*.47});
      c.masks.push({layer:'geology',code:'g',test:(u,v,x,z)=>v<env.length*.07-band*.55&&v>env.length*.07-band*1.15+8*noise(env,0x32,x,z,25)&&Math.abs(u)<env.width*.45});
      return c;}}),
  'sandy-beach':P({id:'sandy-beach',version:1,label:'Plage de sable',description:'Plage large ou crique, sable sec et humide (rivage), petites dunes et végétation côtière ; palmiers seulement sur option.',profile:'sandy-coast',defaultSize:[420,200],
    params:[...sizeParams(1),{key:'dunes',label:'Largeur des dunes (m)',kind:'number',min:0,max:80,step:2,default:34},{key:'palms',label:'Palmiers (climat chaud)',kind:'boolean',default:false}],
    produces:['relief : abaissement de la bande côtière (crique/plage) quand la côte est en falaise','masques : sable (géologie), littoral, dunes','région littoral (palmiers sur option)','diagnostic si l’emprise ne touche pas la mer'],
    relief:(f,_p,height,sea)=>{
      // Find the shoreline along the footprint axis; on a cliffy coast, lower the coastal band
      // (a trough along the shore) so that a real beach can exist. Underwater stays underwater.
      let vc:number|null=null,side=1;const L=f.length;
      for(let v=-L/2;v<L/2;v+=4){const a=f.toWorld(0,v),b=f.toWorld(0,v+4),ha=height(a.x,a.z),hb=height(b.x,b.z);if((ha<sea)!==(hb<sea)){vc=v+2;side=hb>=sea?1:-1;break;}}
      if(vc===null)return [];
      const inland=f.toWorld(0,vc+side*L*.35),depth=Math.min(40,height(inland.x,inland.z)-sea-3);
      if(depth<1.5)return [];
      // Basins (not valleys: valleys fade out near the coast) spaced along the shore.
      const n=Math.max(1,Math.min(3,Math.round(f.width/300))),R=Math.max(L*.55,f.width/n*.62);
      return Array.from({length:n},(_,i)=>({key:'cove-'+(i+1),id:'',kind:'basin' as const,...f.toWorld((i+.5)/n*f.width-f.width/2,vc!+side*L*.04),radiusM:r1(R),depthM:r1(depth)}));
    },
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.2),profile:'sandy-coast',density:num(p,'density',1),...(bool(p,'palms',false)?{palms:true}:{})}],
    content:(env,p)=>{const c=empty(),dunes=num(p,'dunes',34);let sea=0;
      for(let k=0;k<24;k++){const q=env.toWorld((env.rand(k)-.5)*env.width,(env.rand(k+40)-.5)*env.length);if(env.height(q.x,q.z)<env.seaLevel)sea++;}
      if(!sea)c.diagnostics.push('Plage : aucune mer dans l’emprise — placer le preset sur le rivage.');
      const beach=(x:number,z:number)=>{const h=env.height(x,z)-env.seaLevel;return h>-.5&&h<3.2+dunes*.06;};
      c.masks.push({layer:'geology',code:'a',test:(u,v,x,z)=>blob(env,0x41,u,v,env.width*.5,env.length*.5,x,z,.1)>0&&beach(x,z)});
      c.masks.push({layer:'biome',code:'c',test:(u,v,x,z)=>blob(env,0x41,u,v,env.width*.5,env.length*.5,x,z,.1)>0&&beach(x,z)});
      return c;}}),
  'marsh-basin':P({id:'marsh-basin',version:1,label:'Bassin marécageux',description:'Dépression, étangs, roselières, sol détrempé et îlots de terrain praticable.',profile:'marsh',defaultSize:[360,320],
    params:[...sizeParams(1),{key:'ponds',label:'Étangs',kind:'number',min:0,max:4,step:1,default:2},{key:'depth',label:'Profondeur du bassin (m)',kind:'number',min:1,max:10,step:.5,default:3}],
    produces:['relief : cuvette','eau : étangs (lacs à niveau constant)','masques : marais, humidité 9, îlots praticables','région marais'],
    relief:(f,p)=>[{key:'basin',id:'',kind:'basin',x:f.cx,z:f.cz,radiusM:r1(Math.min(f.width,f.length)*.48),depthM:num(p,'depth',3)},
      ...pondSpots(f,p).map((q,i)=>({key:'pond-'+(i+1),id:'',kind:'basin' as const,...f.toWorld(q.u,q.v),radiusM:r1(q.r*1.7),depthM:2.8}))],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.22),profile:'marsh',density:num(p,'density',1)}],
    content:(env,p)=>{const c=empty(),R=Math.min(env.width,env.length)*.48,islets=Array.from({length:3},(_,i)=>({u:(env.rand(60+i)-.5)*R,v:(env.rand(70+i)-.5)*R,r:10+env.rand(80+i)*10}));
      const isle=(u:number,v:number)=>islets.some(k=>Math.hypot(u-k.u,v-k.v)<k.r);
      c.masks.push({layer:'biome',code:'w',test:(u,v,x,z)=>blob(env,0x51,u,v,R,R,x,z)>0&&!isle(u,v)});
      c.masks.push({layer:'moisture',code:'9',test:(u,v,x,z)=>blob(env,0x51,u,v,R*.85,R*.85,x,z)>0&&!isle(u,v)});
      c.masks.push({layer:'moisture',code:'5',test:(u,v)=>isle(u,v)});
      for(const [i,{u,v,r}]of pondSpots(env,p).entries()){
        const outline=Array.from({length:9},(_,k)=>{const t=k/9*6.283,rr=r*(1+.22*Math.sin(t*3+i));return env.toWorld(u+Math.cos(t)*rr,v+Math.sin(t)*rr*.8);});
        const ground=Math.min(...outline.map(q=>env.height(q.x,q.z))),centre=env.height(env.toWorld(u,v).x,env.toWorld(u,v).z);
        if(ground-centre<.4){c.diagnostics.push(`Étang ${i+1} : cuvette trop plate, étang non créé.`);continue;}
        c.water.push({key:'pond-'+(i+1),kind:'lake',points:outline,width:4,level:r1(ground-.25),depth:.5});
      }
      return c;}}),
  'mountain-pass':P({id:'mountain-pass',version:1,label:'Col de montagne',description:'Deux épaulements reliés par une crête, col praticable, versants rocheux et sentier.',profile:'mountain',defaultSize:[700,520],
    params:[...sizeParams(.8),{key:'height',label:'Hauteur des sommets (m)',kind:'number',min:30,max:600,step:5,default:150},{key:'trail',label:'Sentier',kind:'boolean',default:true}],
    produces:['relief : deux massifs + crête (col)','masques : éboulis sur les crêtes','chemin : sentier du col','région montagne'],
    relief:(f,p)=>{const h=num(p,'height',150);return [
      {key:'peak-w',id:'',kind:'mountain',...f.toWorld(-f.width*.3,0),radiusM:r1(f.width*.28),heightM:h,roughness:.55},
      {key:'peak-e',id:'',kind:'mountain',...f.toWorld(f.width*.3,0),radiusM:r1(f.width*.26),heightM:r1(h*.85),roughness:.55},
      {key:'saddle',id:'',kind:'ridge',points:[f.toWorld(-f.width*.3,0),f.toWorld(0,0),f.toWorld(f.width*.3,0)],widthM:r1(f.length*.18),heightM:r1(h*.35)}];},
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.25),profile:'mountain',density:num(p,'density',.8)}],
    content:(env,p)=>{const c=empty();
      c.masks.push({layer:'geology',code:'g',test:(u,v,x,z)=>Math.abs(v)<env.length*.07+6*noise(env,0x61,x,z,20)&&Math.abs(u)>env.width*.08&&Math.abs(u)<env.width*.42});
      if(bool(p,'trail',true))c.paths.push({key:'trail',points:[env.toWorld(env.width*.02,-env.length*.48),env.toWorld(-env.width*.04,-env.length*.2),env.toWorld(0,0),env.toWorld(env.width*.05,env.length*.22),env.toWorld(0,env.length*.48)],width:2,kind:'trail',smooth:true});
      return c;}}),
  'waterfall-gorge':P({id:'waterfall-gorge',version:1,label:'Gorge et cascade',description:'Gorge rocheuse entaillant une marche du relief, cascade explicite (niveaux haut/bas WATER), bassin inférieur, rochers humides.',profile:'humid-valley',defaultSize:[260,520],
    params:[...sizeParams(1),{key:'drop',label:'Hauteur de la marche (m)',kind:'number',min:4,max:60,step:1,default:16},{key:'pool',label:'Bassin inférieur',kind:'boolean',default:true}],
    produces:['relief : marche + gorge','eau : rivière avec cascade (top/bottom) et bassin (lac)','masques : roche des parois, humidité','région vallée humide'],
    relief:(f,p,height,sea)=>{const d=num(p,'drop',16),low=f.toWorld(0,-f.length*.2),base=height(low.x,low.z)-sea;return [
      // Upper half raised to (downstream ground + drop): an abrupt step the gorge cuts through.
      {key:'step',id:'',kind:'plateau',polygon:[f.toWorld(-f.width*.5,f.length*.02),f.toWorld(f.width*.5,f.length*.02),f.toWorld(f.width*.5,f.length*.5),f.toWorld(-f.width*.5,f.length*.5)],heightM:r1(Math.max(1,base+d)),edgeM:2},
      {key:'gorge',id:'',kind:'valley',points:[f.toWorld(0,f.length*.5),f.toWorld(f.width*.03,f.length*.1),f.toWorld(-f.width*.02,-f.length*.2),f.toWorld(0,-f.length*.5)],widthM:r1(Math.max(18,f.width*.16)),depthM:r1(d*.35)},
      ...(bool(p,'pool',true)?[{key:'pool',id:'',kind:'basin' as const,...f.toWorld(-f.width*.02,-f.length*.2),radiusM:r1(Math.max(14,f.width*.11)),depthM:2.5}]:[])];},
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.2),profile:'humid-valley',density:num(p,'density',1)}],
    content:(env,p)=>{const c=empty(),d=num(p,'drop',16);
      // Densified gorge axis; the waterfall sits exactly where the relief steps down most.
      const axis=[env.toWorld(0,env.length*.46),env.toWorld(env.width*.03,env.length*.12),env.toWorld(-env.width*.02,-env.length*.2),env.toWorld(0,-env.length*.42)];
      const pts:PointXZ[]=[];for(let i=0;i<axis.length-1;i++)for(let k=0;k<5;k++){const t=k/5;pts.push({x:r1(axis[i].x+(axis[i+1].x-axis[i].x)*t),z:r1(axis[i].z+(axis[i+1].z-axis[i].z)*t)});}pts.push(axis.at(-1)!);
      // The source is the highest point of the upper reach: never draw a river climbing a slope.
      const h=pts.map(q=>env.height(q.x,q.z));const peak=h.slice(0,Math.ceil(h.length/2)).reduce((m,v,i,a)=>v>a[m]?i:m,0);pts.splice(0,peak);h.splice(0,peak);
      let at=0,best=0;for(let i=0;i<pts.length-2;i++){const drop=h[i]-h[i+1];if(drop>best){best=drop;at=i;}}
      // Refine the steepest segment at 1 m: points just above and just below the step, so that
      // the explicit fall sits on the step itself (WATER: no relief crossed after the fall).
      {const a=pts[at],b=pts[at+1],len=Math.hypot(b.x-a.x,b.z-a.z),q=(t:number)=>({x:r1(a.x+(b.x-a.x)*t),z:r1(a.z+(b.z-a.z)*t)}),y=(t:number)=>{const o=q(t);return env.height(o.x,o.z);};
        const n=Math.max(8,Math.round(len*4));let tb=0,db=-Infinity;for(let k=1;k<=n;k++){const d=y((k-1)/n)-y(k/n);if(d>db){db=d;tb=(k-.5)/n;}}
        // Walk out from the steepest place until the ground flattens: top lip and foot of the step.
        const e=.25/len;let t0=tb,t1=tb;
        while(t0>e&&y(t0-e)-y(t0)>.3)t0-=e;while(t1<1-e&&y(t1)-y(t1+e)>.3)t1+=e;t0=Math.max(.002,t0-e);t1=Math.min(.998,t1+e);
        const A=q(Math.max(.002,t0)),B=q(Math.min(.998,t1));pts.splice(at+1,0,A,B);h.splice(at+1,0,env.height(A.x,A.z),env.height(B.x,B.z));at++;}
      // Below the fall the water follows the real relief down to the sea, a lake or a pit.
      {const B=pts[at+1],last=pts.at(-1)!,down=traceDownhill(B,{height:env.height,seaLevel:env.seaLevel,water:env.water,inWorld:env.inWorld,heading:Math.atan2(last.z-B.z,last.x-B.x),maxLengthM:4000,maxPoints:90-(at+2)});
        pts.splice(at+2,pts.length,...down.points.slice(1));h.splice(at+2,h.length,...down.points.slice(1).map(q=>env.height(q.x,q.z)));}
      const top=r1(h[at]-1),bottom=r1(Math.min(h[at+1]-.35,top-1));
      if(best>=1.5&&Math.hypot(pts[at+1].x-pts[at].x,pts[at+1].z-pts[at].z)<=2.8)c.water.push({key:'falls-river',points:pts,width:5,level:0,depth:1,profile:{mode:'terrain',offset:-.35},falls:[{at,top,bottom}]});
      else{c.diagnostics.push('Cascade : aucune marche du relief sur le tracé — rivière sans cascade créée.');c.water.push({key:'falls-river',points:pts,width:5,level:0,depth:1,profile:{mode:'terrain',offset:-.35}});}
      if(bool(p,'pool',true)){const q=env.toWorld(-env.width*.02,-env.length*.2),r=Math.max(9,env.width*.06),outline=Array.from({length:10},(_,k)=>{const t=k/10*6.283;return env.toWorld(-env.width*.02+Math.cos(t)*r,-env.length*.2+Math.sin(t)*r*1.3);});
        const ground=Math.min(...outline.map(o=>env.height(o.x,o.z)));if(ground-env.height(q.x,q.z)>.4)c.water.push({key:'pool',kind:'lake',points:outline,width:4,level:r1(ground-.2),depth:.6});else c.diagnostics.push('Bassin inférieur : fond trop plat, bassin non créé.');}
      c.masks.push({layer:'geology',code:'r',test:(u,v,x,z)=>Math.abs(u)>env.width*.05&&Math.abs(u)<env.width*.16+4*noise(env,0x71,x,z,12)&&v>-env.length*.3&&v<env.length*.15});
      c.masks.push({layer:'moisture',code:'8',test:u=>Math.abs(u)<env.width*.2});
      void d;return c;}}),
  'volcanic-field':P({id:'volcanic-field',version:1,label:'Champ volcanique',description:'Basalte, cendres, coulées anciennes allongées, roches sombres, végétation rare, petit cône facultatif.',profile:'volcanic',defaultSize:[600,600],
    params:[...sizeParams(.6),{key:'flows',label:'Coulées anciennes',kind:'number',min:1,max:6,step:1,default:3},{key:'cone',label:'Petit cône de scories',kind:'boolean',default:false}],
    produces:['masques : basalte, cendre, coulées','relief : cône facultatif','région volcanique'],
    relief:(f,p)=>bool(p,'cone',false)?[{key:'cone',id:'',kind:'volcano',...f.toWorld(0,-f.length*.2),radiusM:r1(Math.min(f.width,f.length)*.18),heightM:r1(Math.min(f.width,f.length)*.05),craterRadiusM:r1(Math.min(f.width,f.length)*.03),craterDepthM:r1(Math.min(f.width,f.length)*.01)}]:[],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.2),profile:'volcanic',density:num(p,'density',.6)}],
    content:(env,p)=>{const c=empty(),flows=Array.from({length:Math.round(num(p,'flows',3))},(_,i)=>({u:(env.rand(130+i)-.5)*env.width*.6,w:12+env.rand(140+i)*16,bend:(env.rand(150+i)-.5)*.6}));
      const inFlow=(u:number,v:number,x:number,z:number)=>flows.some(fl=>Math.abs(u-fl.u-v*fl.bend)<fl.w*(1+.4*noise(env,0x81,x,z,18)));
      c.masks.push({layer:'geology',code:'b',test:(u,v,x,z)=>blob(env,0x82,u,v,env.width*.5,env.length*.5,x,z)>0&&inFlow(u,v,x,z)});
      c.masks.push({layer:'geology',code:'h',test:(u,v,x,z)=>blob(env,0x82,u,v,env.width*.45,env.length*.45,x,z)>.15&&!inFlow(u,v,x,z)&&noise(env,0x83,x,z,50)>.05});
      c.masks.push({layer:'biome',code:'v',test:(u,v,x,z)=>blob(env,0x82,u,v,env.width*.5,env.length*.5,x,z)>.05});
      return c;}}),
  'ancient-ruins':P({id:'ancient-ruins',version:1,label:'Ruines anciennes',description:'Terrain aplani, murets effondrés et moussus, pierres tombées, végétation envahissante, sentier d’accès.',profile:'temperate-forest',defaultSize:[160,160],
    params:[...sizeParams(.6),{key:'walls',label:'Enceintes en ruine',kind:'number',min:1,max:4,step:1,default:2},{key:'trail',label:'Sentier d’accès',kind:'boolean',default:true}],
    produces:['relief : replat','entités : murets irréguliers/moussus, pierres (registre)','chemin : sentier','masque : prairie au centre','région ruines (arbres morts, sous-bois)'],
    relief:(f,_p,height)=>[{key:'terrace',id:'',kind:'plateau',polygon:Array.from({length:8},(_,k)=>{const t=k/8*6.283;return f.toWorld(Math.cos(t)*f.width*.32,Math.sin(t)*f.length*.32);}),heightM:r1(Math.max(1,height(f.cx,f.cz))),edgeM:r1(Math.min(f.width,f.length)*.15)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.3),profile:'temperate-forest',density:num(p,'density',.6),ruins:true}],
    content:(env,p)=>{const c=empty(),n=Math.round(num(p,'walls',2));
      for(let i=0;i<n;i++){const u0=(env.rand(200+i)-.5)*env.width*.3,v0=(env.rand(210+i)-.5)*env.length*.3,a=4+env.rand(220+i)*5,b=4+env.rand(230+i)*4;
        const corners=[env.toWorld(u0-a,v0-b),env.toWorld(u0+a,v0-b),env.toWorld(u0+a,v0+b),env.toWorld(u0-a,v0+b),env.toWorld(u0-a,v0-b)];
        c.entities.push(...enclosure(`wall${i+1}`,i%2?'structure.wall_moss':'structure.wall_irregular',`Muret en ruine ${i+1}`,corners,3+i,5,{corner:'structure.wall_corner',end:'structure.wall_end'}));}
      for(let k=0;k<7;k++){const q=env.toWorld((env.rand(240+k)-.5)*env.width*.45,(env.rand(250+k)-.5)*env.length*.45);c.entities.push({key:'stone-'+(k+1),name:'Pierre tombée '+(k+1),assetId:'nature.stump_mossy',x:q.x,z:q.z,rotation:env.rand(260+k)*6.28,scale:r1(.8+env.rand(270+k)*.4)});}
      c.masks.push({layer:'biome',code:'m',test:(u,v,x,z)=>blob(env,0x91,u,v,env.width*.22,env.length*.22,x,z)>0});
      if(bool(p,'trail',true))c.paths.push({key:'trail',points:[env.toWorld(0,0),env.toWorld(env.width*.15,-env.length*.25),env.toWorld(env.width*.05,-env.length*.49)],width:1.6,kind:'trail',smooth:true});
      return c;}}),
  'village-clearing':P({id:'village-clearing',version:1,label:'Clairière de village',description:'Replat dégagé, maisons du registre, place, chemins, clôtures et haies, verger ; champ et moulin facultatifs.',profile:'prairie',defaultSize:[300,300],
    params:[...sizeParams(.45),{key:'houses',label:'Maisons',kind:'number',min:1,max:10,step:1,default:5},{key:'fields',label:'Parcelle agricole',kind:'boolean',default:true},{key:'windmill',label:'Moulin à vent',kind:'boolean',default:true},{key:'orchard',label:'Verger',kind:'boolean',default:true},{key:'quests',label:'Quêtes',kind:'boolean',default:true}],
    produces:['relief : replat','masques : village, humidité modérée','entités : maisons, moulin, clôtures, haies (registre)','chemins : place et accès','zone : parcelle agricole (AGRI)','régions : prairie claire, verger'],
    relief:(f,_p,height)=>[{key:'terrace',id:'',kind:'plateau',polygon:Array.from({length:10},(_,k)=>{const t=k/10*6.283;return f.toWorld(Math.cos(t)*f.width*.36,Math.sin(t)*f.length*.36);}),heightM:r1(Math.max(1.5,height(f.cx,f.cz))),edgeM:r1(Math.min(f.width,f.length)*.14)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.2),profile:'prairie',density:num(p,'density',.45)},
      ...(bool(p,'orchard',true)?[{x:f.toWorld(-f.width*.3,f.length*.28).x,z:f.toWorld(-f.width*.3,f.length*.28).z,width:r1(f.width*.26),length:r1(f.length*.2),rotation:f.rotation,edgeM:8,density:1.3,orchard:true}]:[])],
    content:(env,p)=>{const c=empty(),R=Math.min(env.width,env.length)*.36;
      c.masks.push({layer:'biome',code:'g',test:(u,v,x,z)=>blob(env,0xa1,u,v,R*.8,R*.8,x,z,.12)>0});
      const houses=spots(env,Math.round(num(p,'houses',5)),R*.22,R*.62,16,300);
      const square=env.toWorld(0,0);
      // Houses face the square (model front = -Z).
      houses.forEach((q,i)=>c.entities.push({key:'house-'+(i+1),name:'Maison '+(i+1),assetId:i%3===2?'architecture.wooden_cabin':'architecture.stone_house',x:q.x,z:q.z,rotation:Math.atan2(-(square.x-q.x),-(square.z-q.z))}));
      if(houses.length<Math.round(num(p,'houses',5)))c.diagnostics.push(`Village : ${houses.length} emplacement(s) plat(s) trouvé(s) sur ${Math.round(num(p,'houses',5))}.`);
      // Front garden of the first house: picket fence with a gate facing the square.
      if(houses[0]){const q=houses[0],d=Math.hypot(square.x-q.x,square.z-q.z)||1,fx=(square.x-q.x)/d,fz=(square.z-q.z)/d,px=-fz,pz=fx,g=(a:number,b:number)=>({x:r1(q.x+fx*a+px*b),z:r1(q.z+fz*a+pz*b)});
        c.entities.push(...enclosure('garden','structure.fence_picket','Jardin',[g(5,-6),g(11,-6),g(11,6),g(5,6)],0,4,{gate:'structure.fence_gate',corner:'structure.post_square'}));}
      for(const [i,q]of houses.entries())c.paths.push({key:'lane-'+(i+1),points:[square,q],width:2.2,kind:'dirt'});
      c.paths.push({key:'access',points:[square,env.toWorld(0,-env.length*.3),env.toWorld(env.width*.04,-env.length*.49)],width:3,kind:'dirt',smooth:true});
      if(bool(p,'windmill',true)){const m=spots(env,1,R*.75,R*.95,20,400,.12)[0];if(m)c.entities.push({key:'windmill',name:'Moulin à vent',assetId:'architecture.windmill_stone',x:m.x,z:m.z,rotation:env.rand(410)*6.28});}
      // Garden hedge and pasture fence around the orchard corner.
      const o=(u:number,v:number)=>env.toWorld(u,v);
      if(bool(p,'orchard',true))c.entities.push(...enclosure('hedge','nature.hedge_low','Haie du verger',[o(-env.width*.43,env.length*.18),o(-env.width*.17,env.length*.18),o(-env.width*.17,env.length*.38)],0,4));
      if(bool(p,'fields',true)){
        // Small enclosed plots (game-sized) instead of one large field: hedge and dry-stone wall.
        enclosedField(env,c,'field','Potager du village',env.width*.26,-env.length*.05,18,13,'hedge');
        enclosedField(env,c,'field-2','Champ du village',env.width*.27,env.length*.16,16,12,'wall');
      }
      // Farm counter and a farmer with a small quest (orchard fruits).
      counter(c,'farm-counter','farm','structure.market_stall','Comptoir agricole',o(env.width*.12,-env.length*.12),env.rotation);
      if(bool(p,'quests',true)&&houses[1])questGiver(env,c,{key:'farmer',name:'Fermière Avoine',x:houses[1].x+3,z:houses[1].z+3,appearance:look(true,false,'scarf','joyful'),title:'Tarte aux pommes',greeting:'Le verger donne bien cette année !',ask:'Cueillez-moi 6 pommes au verger, j’ai une tarte à préparer.',itemId:'food:apple',itemLabel:'pommes',quantity:6,reward:{itemId:COIN,quantity:25,label:'25 pièces'},thanks:'Mmm, la tarte sera parfaite. Merci !'});
      return c;}}),
};

// ======================= Settlements, inhabitants, quests and landmarks =======================
type Appearance=import('../character-style.ts').Appearance;
const look=(hat:boolean,backpack:boolean,neckwear:Appearance['neckwear'],emotion:Appearance['emotion']='happy'):Appearance=>({hat,backpack,neckwear,emotion});
const ITEM_DEFS:Record<string,Record<string,unknown>>=Object.fromEntries([...ECONOMY_ITEMS.map(({buy:_b,sell:_s,...i})=>i),...MINE_ITEMS,...FARM_ITEMS].map(i=>[i.id,i]));
/** Item definition shared by every instance (global id, never duplicated). */
function needItem(c:LandscapeContent,itemId:string){const lib=c.libraries!.items!;if(!lib.some(e=>e.key==='@'+itemId)&&ITEM_DEFS[itemId])lib.push({key:'@'+itemId,value:{...ITEM_DEFS[itemId]}});}
function libs(c:LandscapeContent){c.libraries??={behaviors:[],dialogues:[],objectives:[],items:[],interactions:[]};for(const k of ['behaviors','dialogues','objectives','items','interactions'] as const)c.libraries[k]??=[];return c.libraries as Required<NonNullable<LandscapeContent['libraries']>>;}
/** Hidden treasure: a chest opened once (E) that gives coins and optionally an item; the
 * `opened` state is persisted in the game save. Declarative interaction, no script. */
export function treasure(env:ContentEnv,c:LandscapeContent,key:string,q:PointXZ,rotation:number,coins:number,bonus?:{itemId:string;quantity:number;label:string}){
  const L=libs(c),id=env.ref(key),interactionKey=key+'-open';needItem(c,COIN);if(bonus)needItem(c,bonus.itemId);
  c.entities.push({key,name:'Coffre au trésor',assetId:'structure.chest',x:q.x,z:q.z,rotation,state:{opened:false},interact:{prompt:'Ouvrir le coffre',range:2.2,interactionKeys:[interactionKey],persist:['opened']}});
  L.interactions.push({key:interactionKey,value:{trigger:{type:'onInteract',entityId:id},condition:{type:'stateEquals',entityId:id,key:'opened',value:false},repeat:'once',persistent:true,
    sequence:[{type:'giveItem',itemId:COIN,quantity:coins},...(bonus?[{type:'giveItem',itemId:bonus.itemId,quantity:bonus.quantity}]:[]),{type:'setState',entityId:id,key:'opened',value:true},
      {type:'showText',text:`Trésor ! +${coins} pièces${bonus?` et ${bonus.label}`:''}.`}]}});
}
/** An inhabitant with a routine and a simple dialogue (greeting + optional lines). */
function inhabitant(env:ContentEnv,c:LandscapeContent,o:{key:string;name:string;x:number;z:number;appearance:Appearance;routine?:'idle'|'wander';radius?:number;greeting:string;topics?:[string,string][];species?:import('../studio-core/types.ts').CharacterSpecies}){
  const L=libs(c),dialogueKey=o.key+'-talk',behaviorKey=o.key+'-routine';
  L.behaviors.push({key:behaviorKey,value:{kind:o.routine??'wander'}});
  const topics=o.topics??[];
  L.dialogues.push({key:dialogueKey,value:{actorId:env.ref(o.key),start:'hello',lines:[{id:'hello',text:o.greeting,choices:[...topics.map(([q],i)=>({id:'t'+i,text:q,next:'topic-'+i})),{id:'bye',text:'Au revoir !'}]},...topics.map(([,a],i)=>({id:'topic-'+i,text:a,choices:[{text:'Merci.'}]}))]}});
  c.entities.push({key:o.key,name:o.name,assetId:'',x:o.x,z:o.z,rotation:0,character:{species:o.species??'squirrel',appearance:o.appearance,behaviorKey,dialogueKeys:[dialogueKey],speed:o.routine==='idle'?0:.9,radius:o.routine==='idle'?0:o.radius??10}});
}
/** A fetch quest held by an inhabitant: accept → bring N items → reward (coins or a tool). */
function questGiver(env:ContentEnv,c:LandscapeContent,o:{key:string;name:string;x:number;z:number;appearance:Appearance;title:string;greeting:string;ask:string;itemId:string;itemLabel:string;quantity:number;reward:{itemId:string;quantity:number;label:string};thanks:string;routine?:'idle'|'wander'}){
  const L=libs(c),O=env.ref(o.key+'-quest'),dialogueKey=o.key+'-quest-talk',behaviorKey=o.key+'-routine';
  needItem(c,o.itemId);needItem(c,o.reward.itemId);
  L.objectives.push({key:o.key+'-quest',value:{name:o.title,initialStatus:'locked',persistent:true,description:`${o.name} : rapporter ${o.quantity} × ${o.itemLabel}. Récompense : ${o.reward.label}.`}});
  L.behaviors.push({key:behaviorKey,value:{kind:o.routine??'idle'}});
  const has={type:'hasItem',itemId:o.itemId,quantity:o.quantity},is=(status:string)=>({type:'objectiveState',objectiveId:O,status});
  L.dialogues.push({key:dialogueKey,value:{actorId:env.ref(o.key),start:'hello',lines:[
    {id:'hello',text:o.greeting,choices:[
      {id:'ask',text:'Puis-je vous aider ?',gate:is('locked'),next:'ask'},
      {id:'give',text:`Voici ${o.quantity} × ${o.itemLabel}.`,gate:{type:'all',conditions:[is('active'),has]},actions:[{type:'takeItem',itemId:o.itemId,quantity:o.quantity},{type:'giveItem',itemId:o.reward.itemId,quantity:o.reward.quantity},{type:'setObjective',objectiveId:O,status:'complete'}],next:'thanks'},
      {id:'later',text:'Je cherche encore…',gate:{type:'all',conditions:[is('active'),{type:'not',condition:has}]},next:'reminder'},
      {id:'bye',text:'Au revoir !'}]},
    {id:'ask',text:o.ask,choices:[{id:'accept',text:'J’accepte.',actions:[{type:'setObjective',objectiveId:O,status:'active'}],next:'accepted'},{id:'refuse',text:'Pas maintenant.'}]},
    {id:'accepted',text:`Merci ! Rapportez-moi ${o.quantity} × ${o.itemLabel}. ${o.reward.label} vous attend.`,choices:[{text:'À bientôt.'}]},
    {id:'reminder',text:`Il me faut toujours ${o.quantity} × ${o.itemLabel}.`,choices:[{text:'J’y retourne.'}]},
    {id:'thanks',text:o.thanks,choices:[{text:'Avec plaisir !'}]}]}});
  c.entities.push({key:o.key,name:o.name,assetId:'',x:o.x,z:o.z,rotation:0,character:{species:'squirrel',appearance:o.appearance,behaviorKey,dialogueKeys:[dialogueKey],speed:o.routine==='wander'?.8:0,radius:o.routine==='wander'?6:0}});
}
/** A counter (shop) entity: model + logical `shop` kind read by the game. */
function counter(c:LandscapeContent,key:string,kind:string,assetId:string,name:string,q:PointXZ,rotation:number){c.entities.push({key,name,assetId,x:q.x,z:q.z,rotation,state:{shop:kind}});}
const prop=(c:LandscapeContent,key:string,name:string,assetId:string,q:PointXZ,rotation=0,scale?:number)=>c.entities.push({key,name,assetId,x:q.x,z:q.z,rotation,...(scale?{scale}:{})});
/** Small farm plot (AGRI zone) enclosed by hedges, fences or walls with a gate. */
function enclosedField(env:ContentEnv,c:LandscapeContent,key:string,name:string,u:number,v:number,w:number,l:number,style:'hedge'|'fence'|'wall'){
  const o=(a:number,b:number)=>env.toWorld(u+a,v+b),poly=[o(-w/2,-l/2),o(w/2,-l/2),o(w/2,l/2),o(-w/2,l/2)];
  if(!poly.every(q=>env.inWorld(q.x,q.z)&&env.water(q.x,q.z)===null)){c.diagnostics.push(`${name} : emprise dans l’eau, non créé.`);return;}
  c.zones.push({key,kind:'farm-plot',name,polygon:poly});
  const ring=[o(-w/2-1.5,-l/2-1.5),o(w/2+1.5,-l/2-1.5),o(w/2+1.5,l/2+1.5),o(-w/2-1.5,l/2+1.5),o(-w/2-1.5,-l/2-1.5)];
  const asset=style==='hedge'?'nature.hedge_dense':style==='wall'?'structure.wall_straight':'structure.fence_split_rail';
  c.entities.push(...enclosure(key+'-edge',asset,name+' — clôture',ring,0,2,{gate:'structure.fence_gate',corner:style==='wall'?'structure.wall_corner':'structure.post_rustic'}));
}
const townParams=(houses:number):ParamDef[]=>[...sizeParams(.4),{key:'houses',label:'Maisons',kind:'number',min:2,max:40,step:1,default:houses},{key:'quests',label:'Quêtes',kind:'boolean',default:true}];
const ring=(env:ContentEnv,n:number,r0:number,r1:number,gap:number,salt:number)=>spots(env,n,r0,r1,gap,salt,.22);
const SETTLEMENT_PRESETS={
  'castle-town':P({id:'castle-town',version:2,label:'Ville au château',description:'Ville fortifiée : donjon et murailles, cathédrale ou église, place du marché, auberge, maisons à colombages, habitants, comptoirs et quêtes ; champs clos hors les murs.',profile:'prairie',defaultSize:[520,520],
    params:[...townParams(12),{key:'cathedral',label:'Cathédrale (sinon église)',kind:'boolean',default:true}],
    produces:['relief : replat','entités : château, murailles, cathédrale/église, auberge, maisons, marché, fontaine, mobilier','habitants (PNJ) et dialogues','quêtes (objectifs) et récompenses','comptoirs : marché, auberge','2 champs clos (AGRI)','rues pavées'],
    relief:(f,_p,height)=>[{key:'terrace',id:'',kind:'plateau',polygon:Array.from({length:12},(_,k)=>{const t=k/12*6.283;return f.toWorld(Math.cos(t)*f.width*.4,Math.sin(t)*f.length*.4);}),heightM:r1(Math.max(2,height(f.cx,f.cz))),edgeM:r1(Math.min(f.width,f.length)*.12)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.18),profile:'prairie',density:num(p,'density',.4)}],
    content:(env,p)=>{const c=empty(),R=Math.min(env.width,env.length)*.4,o=(u:number,v:number)=>env.toWorld(u,v),rot=env.rotation;
      // Compact town (v2): its radius follows the number of houses, filled from the square
      // outward, enclosed by ramparts; the castle stands just outside the north wall.
      const max=Math.round(num(p,'houses',12)),T=Math.max(45,Math.min(R*.8,9.5*Math.sqrt(max))),W=T+12;
      c.masks.push({layer:'biome',code:'g',test:(u,v,x,z)=>blob(env,0xb1,u,v,W+30,W+30,x,z,.08)>0});
      const wall=(x0:number,z0:number,x1:number,z1:number,key:string)=>{const n=Math.max(1,Math.round(Math.hypot(x1-x0,z1-z0)/8)),a=o(x0,z0),b=o(x1,z1),yaw=-Math.atan2(b.z-a.z,b.x-a.x);for(let i=0;i<n;i++){const t=(i+.5)/n,q=o(x0+(x1-x0)*t,z0+(z1-z0)*t);c.entities.push({key:`${key}-${i}`,name:'Muraille',assetId:'structure.castle_wall',x:q.x,z:q.z,rotation:yaw,scale:Math.hypot(x1-x0,z1-z0)/n/8});}};
      // Castle: keep, square walls with corner towers, gate facing the town.
      const half=26,cz=W+half+4;prop(c,'keep','Donjon','architecture.castle_keep',o(0,cz),rot);
      for(const [a,b]of [[-1,-1],[1,-1],[1,1],[-1,1]])prop(c,`tower-${a}${b}`,'Tour de muraille','structure.castle_tower',o(a*half,cz+b*half),rot);
      wall(-half,cz+half,half,cz+half,'wall-n');wall(-half,cz-half,-half,cz+half,'wall-w');wall(half,cz-half,half,cz+half,'wall-e');
      wall(-half,cz-half,-12,cz-half,'wall-sw');wall(12,cz-half,half,cz-half,'wall-se');prop(c,'gate','Porte du château','structure.castle_gate',o(0,cz-half),rot);
      // Town ramparts: a ring of wall segments with towers, open where the four streets leave.
      const gaps=[0,Math.PI/2,Math.PI,Math.PI*1.5],seg=Math.max(16,Math.round(2*Math.PI*W/9));let towerN=0;
      for(let i=0;i<seg;i++){const t0=i/seg*2*Math.PI,t1=(i+1)/seg*2*Math.PI,tm=(t0+t1)/2;if(gaps.some(g=>Math.abs(Math.atan2(Math.sin(tm-g),Math.cos(tm-g)))*W<8))continue;
        wall(Math.cos(t0)*W,Math.sin(t0)*W,Math.cos(t1)*W,Math.sin(t1)*W,'rampart-'+i);if(i%5===0)prop(c,'rampart-tower-'+towerN++,'Tour des remparts','structure.castle_tower',o(Math.cos(t0)*W,Math.sin(t0)*W),rot);}
      prop(c,'town-gate','Porte de la ville','structure.castle_gate',o(0,-W),rot);
      // Religious landmark, square, market, inn.
      const cath=bool(p,'cathedral',true);prop(c,'temple',cath?'Cathédrale':'Église',cath?'architecture.cathedral':'architecture.church',o(-T*.58,6),rot+Math.PI/2);
      prop(c,'fountain','Fontaine de la place','structure.fountain',o(0,0));
      counter(c,'market','market','structure.market_stall','Étal du marché',o(9,7),rot+Math.PI);prop(c,'stall-2','Étal','structure.market_stall',o(-9,7),rot+Math.PI);prop(c,'stall-3','Étal','structure.market_stall',o(10,-7),rot);
      prop(c,'inn','Auberge du Gland d’Or','architecture.inn',o(T*.6,-2),rot-Math.PI/2);counter(c,'inn-counter','inn','structure.market_stall','Comptoir de l’auberge',o(T*.6-9,4),rot-Math.PI/2);
      prop(c,'well','Puits','structure.well',o(T*.3,-T*.45));for(const [i,q]of [o(-5,-6),o(5,6)].entries())prop(c,'bench-'+i,'Banc','structure.bench',q,rot+i*Math.PI);
      prop(c,'sign','Panneau','structure.signpost',o(5,-W-16),rot);prop(c,'barrels','Tonneaux','structure.barrel',o(T*.6-6,-7));prop(c,'crates','Caisses','structure.crate_stack',o(11,11));
      // Streets: main north–south axis (town gate → square → castle gate), east–west axis, an
      // inner ring lane and two diagonal lanes.
      const ringR=T*.62,ringPts:[number,number][]=Array.from({length:15},(_,k)=>[Math.cos(k/14*2*Math.PI)*ringR,Math.sin(k/14*2*Math.PI)*ringR]);
      const outer:[number,number][]=Array.from({length:19},(_,k)=>[Math.cos(k/18*2*Math.PI)*T*.92,Math.sin(k/18*2*Math.PI)*T*.92]);
      const streets:[number,number][][]=[[[0,-W-24],[0,0],[0,cz-half-2]],[[-W-12,0],[W+12,0]],ringPts,[[0,0],[ringR*.71,ringR*.71]],[[0,0],[-ringR*.71,-ringR*.71]],outer];
      streets.forEach((st,i)=>c.paths.push({key:'street-'+i,points:st.map(([u,v])=>o(u,v)),width:i<2?4:3,kind:'stone'}));
      for(let d=-W+10,i=0;d<W-6;d+=22,i++)if(Math.abs(d)>16)prop(c,'lamp-'+i,'Lanterne','structure.lamp_post',o(3.2,d));
      const reserved:[number,number,number][]=[[0,0,16],[-T*.58,6,24],[T*.6,-2,13],[T*.3,-T*.45,6],[0,-W,10]];
      // Candidate lots along every street (11 m apart, 8 m off the axis), nearest to the square first.
      const lots:{q:PointXZ;face:PointXZ;d:number}[]=[];
      for(const st of streets)for(let i=0;i<st.length-1;i++){const [u0,v0]=st[i],[u1,v1]=st[i+1],len=Math.hypot(u1-u0,v1-v0),du=(u1-u0)/len,dv=(v1-v0)/len;
        for(let d=6;d<len-4;d+=11)for(const side of [-1,1]){const u=u0+du*d-dv*side*8,v=v0+dv*d+du*side*8,r=Math.hypot(u,v);if(r>W-7||reserved.some(([ru,rv,rr])=>Math.hypot(u-ru,v-rv)<rr))continue;lots.push({q:o(u,v),face:o(u+dv*side*8,v-du*side*8),d:r});}}
      lots.sort((a,b)=>a.d-b.d);
      const placedHomes:PointXZ[]=[];let n=0;
      for(const lot of lots){if(n>=max)break;const q=lot.q;
        if(!env.inWorld(q.x,q.z)||env.water(q.x,q.z)!==null)continue;const h=env.height(q.x,q.z);if(Math.abs(env.height(q.x+4,q.z)-h)>1.6||Math.abs(env.height(q.x,q.z+4)-h)>1.6)continue;
        if(placedHomes.some(h2=>Math.hypot(h2.x-q.x,h2.z-q.z)<9))continue;const yaw=Math.atan2(-(lot.face.x-q.x),-(lot.face.z-q.z));
        prop(c,'house-'+n,'Maison','architecture.'+['house_timber','house_timber','stone_house','house_blue'][n%4],q,yaw);
        // Small yard props behind one house out of three (barrels, crates, a bench).
        if(n%3===1){const bx=q.x-(lot.face.x-q.x)*.55+Math.cos(yaw)*3,bz=q.z-(lot.face.z-q.z)*.55-Math.sin(yaw)*3;prop(c,'yard-'+n,'Cour','structure.'+['barrel','crate_stack','bench'][n%9===1?0:n%9===4?1:2],{x:bx,z:bz},yaw);}
        placedHomes.push(q);n++;}
      if(n<max)c.diagnostics.push(`Ville : ${n} maison(s) placée(s) sur ${max} (pente, eau ou place libre).`);
      // Inhabitants and quests.
      inhabitant(env,c,{key:'merchant',name:'Dame Noisette (marchande)',x:o(9,10).x,z:o(9,10).z,appearance:look(true,false,'scarf'),routine:'idle',greeting:'Bienvenue au marché ! J’achète fruits, champignons, fleurs et récoltes.',topics:[['Que vendez-vous ?','Des outils, des semences et du bois. Parlez au comptoir pour commercer.']]});
      inhabitant(env,c,{key:'guard',name:'Sire Écorce (garde)',x:o(4,cz-half-5).x,z:o(4,cz-half-5).z,appearance:look(true,false,'pendant','determined'),routine:'wander',radius:6,greeting:'Halte ! Le château est ouvert aux voyageurs honnêtes.',topics:[['Que voit-on des remparts ?','Par temps clair, on aperçoit la fumée du volcan au nord et les voiles du port au sud.']]});
      inhabitant(env,c,{key:'gatekeeper',name:'Gardienne Ronce',x:o(-5,-W-4).x,z:o(-5,-W-4).z,appearance:look(false,false,'pendant','determined'),routine:'idle',greeting:'Bienvenue en ville ! Le marché est tout droit, sur la place.',topics:[['Que faire ici ?','Commercer au marché, dormir à l’auberge, aider les habitants : ils ont souvent besoin d’un coup de patte.']]});
      inhabitant(env,c,{key:'priest',name:'Frère Gland',x:o(-T*.58+9,6).x,z:o(-T*.58+9,6).z,appearance:look(false,false,'pendant','curious'),routine:'idle',greeting:'La paix soit avec vous. Les vitraux racontent l’histoire de l’île.',topics:[['Une légende ?','On dit qu’un arbre immense veille sur la forêt de l’ouest depuis l’origine du monde.']]});
      for(const [i,[u,v]]of [[-T*.2,-T*.3],[T*.25,T*.05],[-T*.1,T*.2]].entries())inhabitant(env,c,{key:'citizen-'+i,name:['Pipa','Roux','Brindille'][i],x:o(u,v).x,z:o(u,v).z,appearance:look(i===1,i===0,i===2?'scarf':'none'),routine:'wander',radius:12,greeting:['Quelle belle journée pour flâner au marché !','Avez-vous vu la cathédrale ? Les tours dépassent la forêt !','On raconte qu’un poisson doré nage près du port…'][i]});
      if(bool(p,'quests',true)){
        questGiver(env,c,{key:'innkeeper',name:'Maître Faîne (aubergiste)',x:o(T*.6-6,7).x,z:o(T*.6-6,7).z,appearance:look(false,false,'scarf','joyful'),title:'Poissons pour l’auberge',greeting:'Bienvenue au Gland d’Or ! La soupe du jour manque de poisson…',ask:'Pourriez-vous me rapporter 5 poissons, n’importe lesquels ? Je vous paierai bien.',itemId:'fish:sardine',itemLabel:'sardines',quantity:5,reward:{itemId:COIN,quantity:45,label:'45 pièces'},thanks:'Merveilleux ! La soupe sera délicieuse. Voici votre dû.'});
        questGiver(env,c,{key:'carpenter',name:'Maître Aubier (charpentier)',x:o(-T*.3,-T*.55).x,z:o(-T*.3,-T*.55).z,appearance:look(true,true,'none','determined'),title:'Bois pour la charpente',greeting:'La toiture de la halle a besoin de poutres neuves.',ask:'Rapportez-moi 10 bûches. Une hache s’achète au comptoir du bûcheron ou au marché.',itemId:'wood:log',itemLabel:'bûches',quantity:10,reward:{itemId:COIN,quantity:60,label:'60 pièces'},thanks:'Du bon bois ! La halle tiendra cent ans.'});
        questGiver(env,c,{key:'herbalist',name:'Mélisse (herboriste)',x:o(T*.15,-T*.6).x,z:o(T*.15,-T*.6).z,appearance:look(false,true,'pendant','curious'),title:'Bouquet pour la fête',greeting:'La fête des moissons approche et la place manque de couleurs.',ask:'Cueillez-moi 6 bouquets de fleurs dans les prairies.',itemId:'forage:flower',itemLabel:'bouquets de fleurs',quantity:6,reward:{itemId:COIN,quantity:30,label:'30 pièces'},thanks:'Comme c’est joli ! Merci infiniment.'});
      }
      // Small enclosed fields outside the ramparts.
      enclosedField(env,c,'field-1','Champ clos ouest',-W-22,-T*.5,22,16,'hedge');enclosedField(env,c,'field-2','Champ clos est',W+22,-T*.45,20,14,'wall');
      return c;}}),
  'fishing-port':P({id:'fishing-port',version:2,label:'Port de pêche',description:'Village côtier : maisons de pêcheurs, cabanes sur pilotis, ponton, comptoir du port, pêcheurs et quêtes (dont la canne à pêche).',profile:'sandy-coast',defaultSize:[340,300],
    params:townParams(6),produces:['entités : maisons de pêcheurs, cabanes sur pilotis, ponton, tonneaux, lanternes','comptoir du port','habitants, quêtes (canne à pêche en récompense)','chemins'],
    relief:()=>[],regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:30,profile:'sandy-coast',density:num(p,'density',.4)}],
    content:(env,p)=>{const c=empty(),o=(u:number,v:number)=>env.toWorld(u,v);
      // Shoreline along v: first sea point from the land side (v = -L/2 is inland by convention).
      let shore:number|null=null;for(let v=-env.length/2;v<env.length/2;v+=3){const q=o(0,v);if(env.height(q.x,q.z)<env.seaLevel){shore=v;break;}}
      if(shore===null){c.diagnostics.push('Port : aucune mer dans l’emprise (orienter l’axe v vers la mer).');return c;}
      const homes=spots(env,Math.round(num(p,'houses',6)),12,Math.min(env.width,env.length)*.42,12,700,.25).filter(q=>env.toLocal(q.x,q.z).v<shore!-6);
      const centre=o(0,shore-14);homes.forEach((q,i)=>{prop(c,'house-'+i,'Maison de pêcheur','architecture.house_blue',q,Math.atan2(-(centre.x-q.x),-(centre.z-q.z)));c.paths.push({key:'lane-'+i,points:[centre,q],width:2,kind:'dirt'});});
      // Pier: dock tiles from the beach into the sea, deck above water.
      for(let i=0;i<10;i++){const q=o(0,shore-4+i*2),h=env.height(q.x,q.z);c.entities.push({key:'pier-'+i,name:'Ponton '+(i+1),assetId:'structure.dock_tile',x:q.x,z:q.z,rotation:env.rotation,y:Math.max(0,env.seaLevel-h+.2)});}
      for(const [i,u]of [-14,14].entries()){const q=o(u,shore-1);prop(c,'hut-'+i,'Cabane sur pilotis','structure.pier_hut',q,env.rotation+Math.PI);}
      counter(c,'port-counter','port','structure.counter_port','Comptoir du port',o(-7,shore-9),env.rotation+Math.PI);
      for(const [i,q]of [o(6,shore-8),o(-12,shore-14),o(9,shore-16)].entries())prop(c,'barrel-'+i,'Tonneau','structure.barrel',q);prop(c,'crates','Caisses','structure.crate_stack',o(4,shore-11));
      for(const [i,q]of [o(2,shore-3),o(0,shore+14)].entries())prop(c,'lamp-'+i,'Lanterne','structure.lamp_post',q);
      // Moored boats beside the pier, floating on the water (offset from the sea floor).
      for(const [i,[u,dv,asset,name]]of ([[-4,6,'boat.rowboat_wood','Barque'],[4,10,'boat.rowboat_wood','Barque'],[-5,15,'boat.sailboat_small','Voilier'],[6,18,'boat.sailboat_small','Voilier']] as const).entries()){
        let q=o(u,shore+dv),h=env.height(q.x,q.z);for(let d=dv;d<dv+40&&env.seaLevel-h<.8;d+=2){q=o(u,shore+d);h=env.height(q.x,q.z);}if(env.seaLevel-h<.8)continue;
        c.entities.push({key:'boat-'+i,name,assetId:asset,x:q.x,z:q.z,rotation:env.rotation+(i%2?.25:-.2),y:env.seaLevel-h-.12,...(asset==='boat.sailboat_small'?{scale:1.4}:{scale:1.2})});}
      c.paths.push({key:'harbour-road',points:[centre,o(0,-env.length/2)],width:3,kind:'dirt',smooth:true});
      inhabitant(env,c,{key:'harbourmaster',name:'Capitaine Nageoire',x:o(-9,shore-6).x,z:o(-9,shore-6).z,appearance:look(true,false,'scarf','joyful'),routine:'idle',greeting:'Ahoy ! Le comptoir achète tout ce qui nage.',topics:[['Où pêcher ?','Face à la mer depuis le ponton : sardines et maquereaux. Les truites préfèrent les rivières, les carpes les lacs.']]});
      if(bool(p,'quests',true)){
        questGiver(env,c,{key:'old-fisher',name:'Vieux Goujon',x:o(10,shore-10).x,z:o(10,shore-10).z,appearance:look(true,false,'none','tired'),title:'La canne du vieux Goujon',greeting:'Mes vieilles pattes ne tiennent plus la ligne…',ask:'Rapportez-moi 4 roseaux du marais pour mes paniers, et je vous donne ma vieille canne à pêche.',itemId:'forage:reed',itemLabel:'roseaux',quantity:4,reward:{itemId:'tool:fishing-rod',quantity:1,label:'Une canne à pêche'},thanks:'Prenez ma canne, et que la mer vous soit généreuse !'});
        questGiver(env,c,{key:'fishwife',name:'Ondine (poissonnière)',x:o(-14,shore-16).x,z:o(-14,shore-16).z,appearance:look(false,true,'pendant','happy'),title:'Maquereaux du marché',greeting:'Le marché de la ville réclame du poisson frais !',ask:'Pêchez-moi 3 maquereaux en mer, je vous paierai plus que le comptoir.',itemId:'fish:mackerel',itemLabel:'maquereaux',quantity:3,reward:{itemId:COIN,quantity:35,label:'35 pièces'},thanks:'Ils brillent encore ! Voici votre paiement.'});}
      return c;}}),
  'mountain-hamlet':P({id:'mountain-hamlet',version:1,label:'Hameau de montagne',description:'Hameau en palissade : cabanes, ferme, tour de guet, petit champ clos, berger et chasseur.',profile:'mountain',defaultSize:[220,220],
    params:townParams(4),produces:['relief : replat','entités : cabanes, ferme, tour de guet, palissade','champ clos (AGRI)','habitants et quête'],
    relief:(f,_p,height)=>[{key:'terrace',id:'',kind:'plateau',polygon:Array.from({length:10},(_,k)=>{const t=k/10*6.283;return f.toWorld(Math.cos(t)*f.width*.38,Math.sin(t)*f.length*.38);}),heightM:r1(Math.max(2,height(f.cx,f.cz))),edgeM:r1(Math.min(f.width,f.length)*.15)}],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:25,profile:'mountain',density:num(p,'density',.4)}],
    content:(env,p)=>{const c=empty(),R=Math.min(env.width,env.length)*.38,o=(u:number,v:number)=>env.toWorld(u,v),centre=o(0,0);
      const homes=ring(env,Math.round(num(p,'houses',4)),R*.25,R*.7,12,900);homes.forEach((q,i)=>{prop(c,'cabin-'+i,'Cabane','architecture.wooden_cabin',q,Math.atan2(-(centre.x-q.x),-(centre.z-q.z)));c.paths.push({key:'lane-'+i,points:[centre,q],width:2,kind:'trail'});});
      prop(c,'farm','Ferme','architecture.farmhouse',o(-R*.55,R*.3),env.rotation);prop(c,'tower','Tour de guet','architecture.watchtower',o(R*.6,R*.45));
      const pal=Array.from({length:17},(_,k)=>{const t=k/16*6.283;return o(Math.cos(t)*R*.95,Math.sin(t)*R*.95);});
      c.entities.push(...enclosure('palisade','structure.palisade','Palissade',pal,0,9).filter((_,i)=>i%1===0).map(e=>({...e,assetId:'structure.palisade'})));
      enclosedField(env,c,'field','Champ du hameau',-R*.15,-R*.55,16,12,'fence');prop(c,'well','Puits','structure.well',o(4,4));
      c.paths.push({key:'track',points:[centre,o(0,-R*1.3)],width:2,kind:'trail',smooth:true});
      inhabitant(env,c,{key:'hunter',name:'Pistache (chasseuse)',x:o(R*.5,R*.3).x,z:o(R*.5,R*.3).z,appearance:look(true,true,'none','determined'),routine:'wander',radius:10,greeting:'Du haut de la tour, on voit toute l’île.',topics:[['Des conseils ?','Les champignons aiment l’ombre humide des forêts de vallée. Les fleurs, les prairies ensoleillées.']]});
      if(bool(p,'quests',true))questGiver(env,c,{key:'shepherd',name:'Berger Chardon',x:o(-6,6).x,z:o(-6,6).z,appearance:look(true,false,'scarf','curious'),title:'Champignons du berger',greeting:'Mes brebis sont rentrées, mais mon garde-manger est vide.',ask:'Rapportez-moi 6 champignons de la forêt.',itemId:'forage:mushroom',itemLabel:'champignons',quantity:6,reward:{itemId:COIN,quantity:40,label:'40 pièces'},thanks:'Ça sent bon le sous-bois ! Merci, voyageur.'});
      return c;}}),
  'mine-camp':P({id:'mine-camp',version:1,label:'Camp minier',description:'Entrée de mine aménagée : zone MINE (galeries), entrée de grotte, comptoir de la mine (pioches, achat des minerais), mineur et quête.',profile:'mountain',defaultSize:[160,160],
    params:[...sizeParams(.5),{key:'levels',label:'Niveaux de mine',kind:'number',min:1,max:6,step:1,default:3},{key:'quests',label:'Quêtes',kind:'boolean',default:true}],
    produces:['zone : mine (MINE)','entités : entrée de grotte, comptoir de la mine, caisses, lanternes','mineur et quête (pioche d’acier)'],
    relief:()=>[],regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:20,profile:'mountain',density:num(p,'density',.5)}],
    content:(env,p)=>{const c=empty(),o=(u:number,v:number)=>env.toWorld(u,v);
      const poly=[o(-30,6),o(30,6),o(32,60),o(-28,62)];c.zones.push({key:'mine',kind:'mine',name:'Mine',polygon:poly,levels:Math.round(num(p,'levels',3))});
      prop(c,'cave','Entrée de la mine','landmark.cave_entrance',o(0,10),env.rotation);
      counter(c,'mine-counter','mine','structure.counter_mine','Comptoir de la mine',o(-9,-6),env.rotation);
      for(const [i,q]of [o(8,-4),o(-14,-2)].entries())prop(c,'crates-'+i,'Caisses','structure.crate_stack',q,i);for(const [i,q]of [o(-4,4),o(5,4)].entries())prop(c,'lamp-'+i,'Lanterne','structure.lamp_post',q);
      c.paths.push({key:'mine-road',points:[o(0,6),o(0,-env.length/2)],width:3,kind:'dirt',smooth:true});
      inhabitant(env,c,{key:'foreman',name:'Contremaître Silex',x:o(6,-8).x,z:o(6,-8).z,appearance:look(true,true,'none','determined'),routine:'idle',greeting:'La pioche fait tout ! À mains nues, la roche résiste longtemps.',topics:[['La mine ?','Terre, roche, roche dure, fer et cristal : plus c’est précieux, plus c’est dur. Il tombe parfois des éclats en creusant.']]});
      if(bool(p,'quests',true))questGiver(env,c,{key:'miner',name:'Mineuse Galène',x:o(-4,-10).x,z:o(-4,-10).z,appearance:look(true,false,'scarf','tired'),title:'Le fer de la forge',greeting:'La forge du château attend du minerai…',ask:'Rapportez-moi 5 minerais de fer et je vous offre ma pioche d’acier.',itemId:'mine:iron',itemLabel:'minerais de fer',quantity:5,reward:{itemId:'tool:pickaxe-steel',quantity:1,label:'Une pioche d’acier'},thanks:'Du beau fer ! Cette pioche est à vous, elle fend le cristal.'});
      return c;}}),
  'forest-camp':P({id:'forest-camp',version:1,label:'Camp de bûcherons',description:'Clairière de bûcherons : cabane, comptoir du bûcheron (haches, achat du bois, champignons, fleurs), bûcheron et quête.',profile:'temperate-forest',defaultSize:[160,160],
    params:[...sizeParams(.7),{key:'quests',label:'Quêtes',kind:'boolean',default:true}],produces:['entités : cabane, comptoir du bûcheron, souches, palissade','bûcheron et quête'],
    relief:()=>[],regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:30,profile:'temperate-forest',density:num(p,'density',.7)}],
    content:(env,p)=>{const c=empty(),o=(u:number,v:number)=>env.toWorld(u,v);
      c.masks.push({layer:'biome',code:'m',test:(u,v,x,z)=>blob(env,0xc1,u,v,22,22,x,z,.15)>0});
      prop(c,'cabin','Cabane du bûcheron','architecture.wooden_cabin',o(-10,8),env.rotation);counter(c,'forest-counter','forest','structure.counter_forest','Comptoir du bûcheron',o(6,-4),env.rotation);
      for(let i=0;i<4;i++)prop(c,'stump-'+i,'Souche','nature.stump_simple',o(-14+i*9,-12+(i%2)*5),i);prop(c,'logs','Troncs','nature.log_fallen',o(12,6),.6);
      c.paths.push({key:'camp-trail',points:[o(0,0),o(0,-env.length/2)],width:2,kind:'trail',smooth:true});
      if(bool(p,'quests',true))questGiver(env,c,{key:'woodcutter',name:'Bûcheron Frêne',x:o(2,-8).x,z:o(2,-8).z,appearance:look(true,true,'scarf','joyful'),title:'Le panier du bûcheron',greeting:'Une bonne hache et du respect pour les arbres : voilà le métier.',ask:'Ramassez-moi 3 champignons pour le repas, et je vous prête ma vieille hache.',itemId:'forage:mushroom',itemLabel:'champignons',quantity:3,reward:{itemId:'tool:axe',quantity:1,label:'Une hache'},thanks:'Merci ! Prenez la hache : abattez, mais laissez la forêt repousser.'});
      return c;}}),
  'landmark-site':P({id:'landmark-site',version:2,label:'Point de repère',description:'Lieu remarquable visible de loin : arbre-monde, cercle de pierres, obélisque, tour en ruine, arche rocheuse, tour de guet, chapelle ; blocs de pierre et ermite.',profile:'prairie',defaultSize:[120,120],
    params:[{key:'kind',label:'Repère (0 arbre-monde … 6 chapelle)',kind:'number',min:0,max:6,step:1,default:0},{key:'hermit',label:'Ermite',kind:'boolean',default:true},{key:'treasure',label:'Coffre caché derrière',kind:'boolean',default:true},...sizeParams(1)],produces:['entité repère','gros blocs de pierre','ermite et légende','coffre caché derrière le repère'],
    relief:()=>[],regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:20,density:num(p,'density',1)}],
    content:(env,p)=>{const c=empty(),o=(u:number,v:number)=>env.toWorld(u,v),k=Math.round(num(p,'kind',0));
      const kinds:[string,string,string][]=[['landmark.world_tree','Arbre-monde','On raconte que ses racines touchent le cœur du volcan.'],['landmark.standing_stones','Cercle des Anciens','Les pierres s’alignent sur le lever du soleil du premier jour d’été.'],['landmark.obelisk','Obélisque doré','Un message gravé indique la route des trois tours.'],['landmark.ruined_tower','Tour effondrée','Une ancienne vigie gardait ici la côte des pillards.'],['nature.rock_arch','Arche du Géant','Un géant de pierre aurait laissé sa trace en passant.'],['architecture.watchtower','Tour de guet','Du sommet, on compte toutes les tours de l’île.'],['architecture.church','Chapelle isolée','Les pèlerins s’y arrêtent avant de gravir le volcan.']];
      const [asset,name,lore]=kinds[Math.max(0,Math.min(6,k))];prop(c,'landmark',name,asset,o(0,0),env.rotation);
      for(let i=0;i<4;i++){const a=env.rand(1200+i)*6.283,d=18+env.rand(1300+i)*20;prop(c,'boulder-'+i,'Gros bloc','nature.'+(i%2?'boulder_large':'boulder_pile'),o(Math.cos(a)*d,Math.sin(a)*d),a,r1(.8+env.rand(1400+i)*.6));}
      c.paths.push({key:'path',points:[o(0,-8),o(0,-env.length/2)],width:1.8,kind:'trail',smooth:true});
      if(bool(p,'hermit',true))inhabitant(env,c,{key:'hermit',name:'Ermite Lichen',x:o(8,-10).x,z:o(8,-10).z,appearance:look(true,false,'pendant','curious'),routine:'wander',radius:5,greeting:`Vous voici devant : ${name}.`,topics:[['Une histoire ?',lore],['Un secret ?','Faites le tour du monument : ce qui se cache derrière ne se voit pas depuis le sentier.']]});
      // Hidden behind the landmark, on the side away from the trail (out of sight when arriving).
      if(bool(p,'treasure',true))treasure(env,c,'treasure',o(env.rand(1500)*6-3,14+env.rand(1501)*6),env.rotation+Math.PI,Math.round(20+env.rand(1502)*30));
      return c;}}),
  'woodland':P({id:'woodland',version:1,label:'Bois et clairière',description:'Bois dense (feuillus, conifères ou mixte) avec une clairière, souches et troncs, et un coffre caché au cœur du bois : remplit les prairies vides.',profile:'temperate-forest',defaultSize:[260,220],
    params:[{key:'kind',label:'Essences (0 feuillus, 1 vallée humide, 2 lande boisée)',kind:'number',min:0,max:2,step:1,default:0},{key:'treasure',label:'Coffre caché',kind:'boolean',default:true},...sizeParams(1.5)],
    produces:['région de biotope boisée (densité forte)','clairière','souches, troncs','coffre caché (interaction déclarative)'],
    relief:()=>[],
    regions:(f,p)=>[{x:f.cx,z:f.cz,width:f.width,length:f.length,rotation:f.rotation,edgeM:r1(Math.min(f.width,f.length)*.25),profile:(['temperate-forest','humid-valley','heath'] as const)[Math.max(0,Math.min(2,Math.round(num(p,'kind',0))))],density:num(p,'density',1.5)}],
    content:(env,p)=>{const c=empty(),o=(u:number,v:number)=>env.toWorld(u,v),cu=(env.rand(1600)-.5)*env.width*.3,cv=(env.rand(1601)-.5)*env.length*.3;
      // A small clearing off-centre (prairie), with stumps and a fallen trunk.
      const clearing=(u:number,v:number,x:number,z:number)=>blob(env,0xd1,u-cu,v-cv,16,13,x,z,.12)>0;
      c.masks.push({layer:'biome',code:'f',test:(u,v,x,z)=>!clearing(u,v,x,z)&&blob(env,0xd2,u,v,env.width*.42,env.length*.42,x,z,.18)>0});
      c.masks.push({layer:'biome',code:'m',test:clearing});
      for(let i=0;i<3;i++){const a=env.rand(1610+i)*6.283;prop(c,'stump-'+i,'Souche','nature.stump_simple',o(cu+Math.cos(a)*9,cv+Math.sin(a)*8),a);}
      prop(c,'log','Tronc couché','nature.log_fallen',o(cu-6,cv+4),env.rand(1620)*3);
      if(bool(p,'treasure',true))treasure(env,c,'treasure',o(cu+3,cv-2),env.rand(1621)*6,Math.round(15+env.rand(1622)*25));
      return c;}}),
};

export const LANDSCAPE_PRESETS:Record<LandscapePresetId,LandscapePreset>={...NATURE_PRESETS,...SETTLEMENT_PRESETS};
export const LANDSCAPE_PRESET_LIST=Object.values(LANDSCAPE_PRESETS);
export function defaultParams(id:LandscapePresetId):LandscapeParams{return Object.fromEntries(LANDSCAPE_PRESETS[id].params.map(p=>[p.key,p.default]));}
/** Clamp/complete parameters against the preset definition (unknown keys dropped). */
export function normalizeParams(id:LandscapePresetId,params:LandscapeParams):LandscapeParams{
  const out:LandscapeParams={};
  for(const d of LANDSCAPE_PRESETS[id].params){const v=params[d.key];
    if(d.kind==='boolean')out[d.key]=typeof v==='boolean'?v:d.default;
    else{const n=typeof v==='number'&&Number.isFinite(v)?v:d.default as number;out[d.key]=Math.min(d.max!,Math.max(d.min!,n));}}
  return out;
}
