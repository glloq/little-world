/** Runtime of mines and farm plots (logic only, no rendering). The player expresses an
 * intention (dig the wall in front, plant/water/harvest this plot); the local authority
 * validates it against the state, the world clock and the inventory, applies it atomically and
 * notifies the renderers. A future server would replace this authority, not the contracts. */
import type {ClimateHistory} from '../environment/climate.ts';
import type {WorldCollisionQuery,MovementSpace,Point3} from '../physics/collision-world.ts';
import type {PlayableActivities} from './activities.ts';
import {MINE_MATERIALS,insidePolygon,type MineZone} from '../mine/mine-data.ts';
import {MineGrid,MineState,DIG_REACH,type MineSaveState} from '../mine/mine-state.ts';
import {mineHitsPerResult,type StrikeAccuracy} from '../mine/mine-rhythm.ts';
import {mineHubLayout,mineHubCounterId,mineRequiredExcavations,mineLevelUnlocked} from '../mine/mine-hub.ts';
import {mineSpaceProvider,mineTransitions} from '../mine/mine-collision.ts';
import {CROPS,type FarmZone} from '../farm/farm-data.ts';
import {pickPower} from './economy.ts';
import {newPlotState,evaluate,act,publicView,type FarmPlotState} from '../farm/farm-sim.ts';

export type ActivityChange={kind:'mine';mineId:string;level:number;chunks:string[]}|{kind:'farm';plotId:string};
export interface MineTarget {mineId:string;level:number;ix:number;iz:number;material:number}
interface Deps {grant(changes:{itemId:string;quantity:number}[]):boolean;
  /** Carried item test (tools: pickaxe power). Absent = bare hands. */has?(itemId:string):boolean;
  /** Seed packet item of a crop when the game economy defines it (sowing then consumes one,
   * a harvest returns one). Absent or null = free sowing (worlds without economy). */seedItem?(cropId:string):string|null;time():number;climate:ClimateHistory;collision:WorldCollisionQuery;ground(x:number,z:number):number;water(x:number,z:number):number|null}

export function createActivityRuntime(activities:PlayableActivities,deps:Deps){
  const mines=new Map<string,{zone:MineZone;state:MineState}>(),farms=new Map<string,{zone:FarmZone;state:FarmPlotState;crop:number}>();
  const listeners=new Set<(c:ActivityChange)=>void>(),notify=(c:ActivityChange)=>{for(const l of listeners)l(c);};
  let counter=0;const requestId=(k:string)=>`${k}:${Date.now().toString(36)}:${(counter++).toString(36)}`;
  function installMine(zone:MineZone,state:MineState){
    deps.collision.setSpaceProvider(zone.id,mineSpaceProvider(state));
    deps.collision.removeTransitions(`mine:${zone.id}:`);
    // Only exterior transitions remain automatic; the lift checks player permission.
    for(const t of mineTransitions(state,deps.ground))
      if(t.id.endsWith(':enter')||t.id.endsWith(':exit'))deps.collision.addTransition(t);
    mines.set(zone.id,{zone,state});
  }
  for(const zone of activities.mines)installMine(zone,new MineState(new MineGrid(zone)));
  for(const zone of activities.farms)farms.set(zone.id,{zone,state:newPlotState(zone.id,zone.farm),crop:0});

  /** Wall cell in front of the player (ray along `forward`, within reach). */
  function mineTarget(position:Point3,space:MovementSpace|undefined,forward:{x:number;z:number}):MineTarget|null{
    if(!space)return null;const m=mines.get(space.zoneId);if(!m)return null;const level=m.state.grid.levelIndex(space.levelId);if(level<0)return null;
    const len=Math.hypot(forward.x,forward.z)||1,fx=forward.x/len,fz=forward.z/len;
    for(let d=.3;d<=DIG_REACH;d+=.2){const ix=Math.floor(position.x+fx*d),iz=Math.floor(position.z+fz*d);if(m.state.isOpen(level,ix,iz))continue;return {mineId:m.zone.id,level,ix,iz,material:m.state.material(level,ix,iz)};}
    return null;
  }
  function dig(position:Point3,space:MovementSpace|undefined,forward:{x:number;z:number},quality:StrikeAccuracy='normal'):{ok:boolean;message:string;partial?:boolean;progress?:number;hits?:number;nextResult?:number}{
    const t=mineTarget(position,space,forward);if(!t||!space)return {ok:false,message:'Aucune paroi à portée'};
    const m=mines.get(t.mineId)!,tool=pickPower(id=>deps.has?.(id)??false);
    const r=m.state.strike({requestId:requestId('dig'),levelId:space.levelId,ix:t.ix,iz:t.iz,from:position},tool.power,reward=>deps.grant([reward]),quality);
    if(!r.ok)return {ok:false,message:r.reason};
    if('partial'in r)return {ok:true,partial:true,progress:r.progress,hits:r.hits,nextResult:r.nextResult,message:r.fragment?`+${r.fragment.quantity} ${nameOf(r.fragment.itemId)} (extraction)`:`${MINE_MATERIALS[r.material].name} : ${Math.round(r.progress*100)} % · récolte dans ${r.nextResult} coup(s)`};
    notify({kind:'mine',mineId:t.mineId,level:t.level,chunks:r.chunks});
    return {ok:true,message:r.reward?`+${r.reward.quantity} ${nameOf(r.reward.itemId)}`:`${MINE_MATERIALS[r.material].name} déblayée`};
  }
  /** Plot the player stands on or next to (surface only). */
  function farmNear(position:Point3,space?:MovementSpace){
    if(space)return null;for(const f of farms.values()){if(insidePolygon(f.zone.polygon,position.x,position.z)||f.zone.polygon.some((p,i)=>segmentDistance(position,p,f.zone.polygon[(i+1)%f.zone.polygon.length])<2))return f;}return null;
  }
  function waterAvailable(zone:FarmZone){
    if(zone.farm.irrigation)return true;
    const c={x:zone.polygon.reduce((s,p)=>s+p.x,0)/zone.polygon.length,z:zone.polygon.reduce((s,p)=>s+p.z,0)/zone.polygon.length};
    for(let r=0;r<=20;r+=4)for(let a=0;a<8;a++){const x=c.x+Math.cos(a*Math.PI/4)*r,z=c.z+Math.sin(a*Math.PI/4)*r;if(deps.water(x,z)!==null)return true;}return false;
  }
  function farmView(plotId:string){const f=farms.get(plotId);if(!f)return null;evaluate(f.state,f.zone.farm,deps.climate,deps.time());return {...publicView(f.state),zone:f.zone,selectedCrop:f.zone.farm.crops[f.crop%f.zone.farm.crops.length],water:waterAvailable(f.zone)};}
  /** Next sensible action on the plot (plant / water / harvest / clear). */
  function farmIntent(plotId:string){const v=farmView(plotId)!;if(v.stage==='empty')return {type:'plant' as const,label:`Semer : ${CROPS[v.selectedCrop].name}`};if(v.stage==='failed')return {type:'clear' as const,label:'Nettoyer la parcelle (culture desséchée)'};if(v.stage==='mature')return {type:'harvest' as const,label:`Récolter : ${CROPS[v.cropId!].name}`};return {type:'water' as const,label:`Arroser (${CROPS[v.cropId!].name}, ${Math.round(v.growth*100)} %, humidité ${Math.round(v.moisture*100)} %)`};}
  function farmAct(plotId:string):{ok:boolean;message:string}{
    const f=farms.get(plotId);if(!f)return {ok:false,message:'Parcelle inconnue'};const intent=farmIntent(plotId),cropId=f.zone.farm.crops[f.crop%f.zone.farm.crops.length];
    const missing=seedMissing(plotId);if(missing)return {ok:false,message:missing};
    // Harvest: the crop and one seed packet of the harvested crop, granted atomically.
    const harvested=f.state.crop?.cropId,bonus=intent.type==='harvest'&&harvested?deps.seedItem?.(harvested)??null:null;
    const r=act(f.state,f.zone.farm,deps.climate,{requestId:requestId('farm'),type:intent.type,cropId,time:deps.time(),waterAvailable:waterAvailable(f.zone)},reward=>deps.grant(bonus?[reward,{itemId:bonus,quantity:1}]:[reward])||!!bonus&&deps.grant([reward]));
    if(!r.ok)return {ok:false,message:r.reason};
    if(intent.type==='plant'){const seed=deps.seedItem?.(cropId);if(seed)deps.grant([{itemId:seed,quantity:-1}]);}
    notify({kind:'farm',plotId});
    return {ok:true,message:r.reward?`Récolte : +${r.reward.quantity} ${nameOf(r.reward.itemId)}`:intent.type==='plant'?'Semis effectué':intent.type==='water'?'Parcelle arrosée':'Parcelle nettoyée'};
  }
  /** Explicit crop choice among the plot's allowed profiles (validated here, not by the UI). */
  function selectCrop(plotId:string,cropId:string){const f=farms.get(plotId);if(!f)return null;const i=f.zone.farm.crops.indexOf(cropId);if(i<0)return null;f.crop=i;return CROPS[cropId].name;}
  function cycleCrop(plotId:string){const f=farms.get(plotId);if(!f)return null;f.crop=(f.crop+1)%f.zone.farm.crops.length;return CROPS[f.zone.farm.crops[f.crop]].name;}
  function serialize(){
    const mineOut:Record<string,MineSaveState>={},farmOut:Record<string,FarmPlotState>={};
    for(const [id,m]of mines){const s=m.state.serialize();if(Object.keys(s.levels).length)mineOut[id]=s;}
    for(const [id,f]of farms){evaluate(f.state,f.zone.farm,deps.climate,deps.time());farmOut[id]=structuredClone(f.state);}
    return {mines:mineOut,farms:farmOut};
  }
  function restore(save:{mines:Record<string,MineSaveState>;farms:Record<string,FarmPlotState>}):string[]{
    const warnings:string[]=[];
    for(const [id,m]of mines){const state=new MineState(m.state.grid);if(save.mines[id])warnings.push(...state.restore(save.mines[id]));installMine(m.zone,state);notify({kind:'mine',mineId:id,level:-1,chunks:[]});}
    for(const id of Object.keys(save.mines))if(!mines.has(id))warnings.push('Mine supprimée : '+id);
    for(const [id,f]of farms){f.state=save.farms[id]?structuredClone(save.farms[id]):newPlotState(id,f.zone.farm);notify({kind:'farm',plotId:id});}
    for(const id of Object.keys(save.farms))if(!farms.has(id))warnings.push('Parcelle supprimée : '+id);
    return warnings;
  }
  /** Third-person camera inside a gallery: shortened arm, stops before rock and under the ceiling. */
  function cameraInMine(target:{x:number;y:number;z:number},space:MovementSpace,yaw:number,pitch:number,distance:number){
    const m=mines.get(space.zoneId),level=m?.state.grid.levelIndex(space.levelId)??-1;if(!m||level<0)return null;const L=m.state.grid.levels[level];
    const dx=-Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=-Math.cos(yaw)*Math.cos(pitch),max=Math.min(distance,4.5),low=L.floorY+.4,high=L.floorY+L.height-.25;
    let best={x:target.x,y:Math.min(high,Math.max(low,target.y)),z:target.z};
    for(let d=.1;d<=max;d+=.1){const x=target.x+dx*d,z=target.z+dz*d,y=Math.min(high,Math.max(low,target.y+dy*d));if(!m.state.isOpen(level,Math.floor(x+Math.sign(dx)*.2),Math.floor(z+Math.sign(dz)*.2)))break;best={x,y,z};}
    return best;
  }
  /** UI preview of the wall in front: validated by the mine itself, nothing is written. */
  function digPreview(position:Point3,space:MovementSpace|undefined,forward:{x:number;z:number}){
    const t=mineTarget(position,space,forward);if(!t||!space)return null;const m=mines.get(t.mineId)!;
    const verdict=m.state.check({levelId:space.levelId,ix:t.ix,iz:t.iz,from:position});
    const info=MINE_MATERIALS[t.material],tool=pickPower(id=>deps.has?.(id)??false);
    return {target:t,materialName:info.name,reward:verdict.ok?verdict.reward:null,ok:verdict.ok,reason:verdict.ok?undefined:verdict.reason,progress:m.state.damageAt(t.level,t.ix,t.iz)/Math.max(1,info.hp),strikesLeft:Math.ceil((info.hp-m.state.damageAt(t.level,t.ix,t.iz))/tool.power),hitsToReward:mineHitsPerResult(t.material)-m.state.hitCountAt(t.level,t.ix,t.iz)%mineHitsPerResult(t.material),tool:tool.tool};
  }
  /** UI preview of the next plot action: the farm rules run on a copy of the state. */
  /** Sowing needs a seed packet of the selected crop when the economy defines seeds. */
  function seedMissing(plotId:string):string|null{
    const f=farms.get(plotId)!,cropId=f.zone.farm.crops[f.crop%f.zone.farm.crops.length],seed=deps.seedItem?.(cropId);
    if(!seed||farmIntent(plotId).type!=='plant'||deps.has?.(seed))return null;
    return `Il faut des semences de ${CROPS[cropId].name.toLowerCase()} (comptoir agricole ou marché)`;
  }
  function farmPreview(plotId:string){
    const f=farms.get(plotId);if(!f)return null;const intent=farmIntent(plotId),copy=structuredClone(f.state);
    const missing=seedMissing(plotId);if(missing)return {intent,ok:false,reason:missing};
    const r=act(copy,f.zone.farm,deps.climate,{requestId:'preview',type:intent.type,cropId:f.zone.farm.crops[f.crop%f.zone.farm.crops.length],time:deps.time(),waterAvailable:waterAvailable(f.zone)},()=>true);
    return {intent,ok:r.ok,reason:r.ok?undefined:r.reason};
  }
  /** One counter / staffed hub / lift on each floor; all share the same shaft in XZ. */
  function mineHubNear(position:Point3,space:MovementSpace|undefined,kind:'shop'|'lift'){
    if(!space)return null;const m=mines.get(space.zoneId);
    if(!m)return null;const level=m.state.grid.levelIndex(space.levelId);
    if(level<0)return null;const hub=mineHubLayout(m.zone,level);
    const shopD=Math.hypot(position.x-hub.counter.x,position.z-hub.counter.z);
    const liftD=Math.hypot(position.x-hub.shaft.x,position.z-hub.shaft.z);
    const heightOK=Math.abs(position.y-hub.floorY)<2.4;
    if(!heightOK||(kind==='shop'?shopD>2.6||shopD>liftD:liftD>2.1||liftD>=shopD))return null;
    return {...hub,counterId:mineHubCounterId(m.zone.id,hub.levelId)};
  }
  function mineLiftView(position:Point3,space:MovementSpace|undefined){
    if(!space)return null;const m=mines.get(space.zoneId);
    if(!m)return null;const index=m.state.grid.levelIndex(space.levelId);
    if(index<0)return null;const hub=mineHubLayout(m.zone,index);
    const dist=Math.min(Math.hypot(position.x-hub.counter.x,position.z-hub.counter.z),
      Math.hypot(position.x-hub.shaft.x,position.z-hub.shaft.z));
    if(dist>3.1||Math.abs(position.y-hub.floorY)>2.4)return null;
    const excavations=[...mines.values()].reduce((sum,mine)=>sum+mine.state.excavatedCount,0);
    return {mineId:m.zone.id,name:m.zone.name,currentLevel:hub.levelId,excavations,
      stops:m.zone.mine.levels.map((floor,i)=>({id:floor.id,name:floor.name,
        unlocked:mineLevelUnlocked(i,excavations),required:mineRequiredExcavations(i),current:i===index}))};
  }
  /** Authoritative solo command; future server must validate the same parameters.
   * Never accept an arbitrary position or arbitrary destination from a UI button. */
  function mineLiftTravel(position:Point3,space:MovementSpace|undefined,targetLevelId:string):
    {ok:true;position:Point3;space:MovementSpace;message:string}|{ok:false;reason:string}{
    const view=mineLiftView(position,space);
    if(!view||!space)return {ok:false,reason:'Approchez du comptoir ou du monte-charge'};
    const m=mines.get(view.mineId)!,index=m.state.grid.levelIndex(targetLevelId);
    if(index<0)return {ok:false,reason:'Étage inconnu'};
    if(index===m.state.grid.levelIndex(space.levelId))return {ok:false,reason:'Vous êtes déjà à cet étage'};
    if(!mineLevelUnlocked(index,view.excavations))return {ok:false,reason:'Il faut extraire '+mineRequiredExcavations(index)+' blocs pour accéder à cet étage'};
    const dest=mineHubLayout(m.zone,index),x=dest.shaft.x,z=dest.shaft.z;
    if(!m.state.isOpen(index,Math.floor(x),Math.floor(z)))return {ok:false,reason:'Plateforme de destination obstruée'};
    return {ok:true,space:{zoneId:space.zoneId,levelId:dest.levelId},
      position:{x,y:dest.floorY,z},message:'Monte-charge : '+m.zone.mine.levels[index].name};
  }
  /** Navigation guidance uses the new usable lift, not legacy invisible stair triggers. */
  function mineNavigation(position:Point3,space?:MovementSpace){
    if(!space)return null;const m=mines.get(space.zoneId);
    if(!m)return null;const level=m.state.grid.levelIndex(space.levelId);
    if(level<0)return null;
    const hub=mineHubLayout(m.zone,level);
    const dx=hub.shaft.x-position.x,dz=hub.shaft.z-position.z,
      liftDistance=Math.hypot(dx,dz);
    const e=m.zone.mine.entrance,x=e.x-position.x,z=e.z-position.z,
      exitDistance=Math.hypot(x,z);
    const out=level===0
      ?{label:'Sortie vers l’île (derrière le hall)',distance:exitDistance,angle:Math.atan2(x,z)}
      :{label:'Monte-charge vers le niveau 1',distance:liftDistance,angle:Math.atan2(dx,dz)};
    return {mineId:m.zone.id,mineName:m.zone.name,levelIndex:level,
      levelName:m.state.grid.levels[level].name,levelCount:m.state.grid.levels.length,
      passage:liftDistance<3?{label:'Monte-charge : choisir un étage',distance:liftDistance}:null,
      exit:out};
  }
  return {mines,farms,cameraInMine,mineTarget,digPreview,farmPreview,mineNavigation,mineHubNear,mineLiftView,mineLiftTravel,selectCrop,dig,farmNear,farmView,farmIntent,farmAct,cycleCrop,serialize,restore,subscribe(l:(c:ActivityChange)=>void){listeners.add(l);return ()=>listeners.delete(l);}};
}
export type ActivityRuntime=ReturnType<typeof createActivityRuntime>;
const NAMES:Record<string,string>={'mine:stone':'pierre','mine:iron':'minerai de fer','mine:crystal':'cristal','farm:wheat':'blé','farm:carrot':'carotte(s)','farm:pumpkin':'citrouille(s)'};
const nameOf=(id:string)=>NAMES[id]??id;
function segmentDistance(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number}){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
