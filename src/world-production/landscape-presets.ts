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

export interface ParamDef {key:string;label:string;kind:'number'|'boolean';min?:number;max?:number;step?:number;default:number|boolean}
export interface Frame {cx:number;cz:number;width:number;length:number;rotation:number;seed:number;
  toWorld(u:number,v:number):PointXZ;toLocal(x:number,z:number):{u:number;v:number}}
export interface ContentEnv extends Frame {
  /** Relief AFTER this landscape's own shapes (other sources included). */
  height(x:number,z:number):number;seaLevel:number;
  /** Water surface at a point (sea, rivers, lakes) or null. */
  water(x:number,z:number):number|null;
  inWorld(x:number,z:number):boolean;
  /** Seeded uniform 0..1 per integer key. */
  rand(key:number):number;
}
export interface MaskRule {layer:MaskLayerId;code:string;test:(u:number,v:number,x:number,z:number)=>boolean}
/** `rotation` = yaw (rad) of the model; `y` = offset above the terrain (V3 Transform convention). */
export interface PlannedEntity {key:string;name:string;assetId:string;x:number;z:number;rotation:number;scale?:number;scale3?:[number,number,number];y?:number}
export interface LandscapeContent {masks:MaskRule[];water:(Omit<WaterBody,'id'>&{key:string})[];paths:(Omit<PathDefinition,'id'>&{key:string})[];entities:PlannedEntity[];zones:(Omit<ActivityZoneV3,'id'>&{key:string})[];diagnostics:string[]}
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

export const LANDSCAPE_PRESETS:Record<LandscapePresetId,LandscapePreset>={
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
    params:[...sizeParams(.45),{key:'houses',label:'Maisons',kind:'number',min:1,max:10,step:1,default:5},{key:'fields',label:'Parcelle agricole',kind:'boolean',default:true},{key:'windmill',label:'Moulin à vent',kind:'boolean',default:true},{key:'orchard',label:'Verger',kind:'boolean',default:true}],
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
        const f0=env.width*.14,f1=env.width*.42,g0=-env.length*.12,g1=env.length*.12,poly=[o(f0,g0),o(f1,g0),o(f1,g1),o(f0,g1)];
        if(poly.every(q=>env.inWorld(q.x,q.z)&&env.water(q.x,q.z)===null)){c.zones.push({key:'field',kind:'farm-plot',name:'Champ du village',polygon:poly});c.entities.push(...enclosure('fence','structure.fence_pasture','Clôture du champ',[o(f0-2,g0-2),o(f1+2,g0-2),o(f1+2,g1+2),o(f0-2,g1+2),o(f0-2,g0-2)],0,3,{gate:'structure.fence_gate',corner:'structure.post_rustic'}));}
        else c.diagnostics.push('Parcelle agricole : emprise dans l’eau ou hors du monde, non créée.');
      }
      return c;}}),
};
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
