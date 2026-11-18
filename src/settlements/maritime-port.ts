/** Reuse the main N1 survey. This reserves a dry connection; runtime owns the quay and cargo. */
import {planPortN1} from '../archipelago/port-n1-plan.ts';
import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord} from './schema.ts';
import type {GroundRouteContext} from '../paths/terrain-route.ts';
import {planGroundRoute} from '../paths/terrain-route.ts';
import type {PathDefinition} from '../world-data.ts';
import {nearestOnRoad} from './layout.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
export function settlementMaritimePort(p:ProjectDocument,r:SettlementRecipe,c:GroundRouteContext,paths:PathDefinition[],clear:(points:{x:number;z:number}[],width:number)=>boolean){
 const layout=planPortN1({origin:r.center,width:p.world.bounds.maxX-p.world.bounds.minX,length:p.world.bounds.maxZ-p.world.bounds.minZ,seaLevel:c.seaLevel,height:c.height,depth:(x,z)=>Math.max(0,c.seaLevel-c.height(x,z)),maxDistance:Math.min(r.radius,128),accept:site=>Math.hypot(site.trade.x-r.center.x,site.trade.z-r.center.z)<r.radius-8&&!c.wet(site.trade.x,site.trade.z)&&[-2,2].every(dx=>[-2,2].every(dz=>!c.wet(site.stand.x+dx,site.stand.z+dz)))&&clear([{x:site.stand.x-2,z:site.stand.z},{x:site.stand.x+2,z:site.stand.z}],4)});
 if(!layout)return null;
 const entry={x:layout.trade.x,z:layout.trade.z},near=paths.filter(p=>!p.supportId).map(path=>nearestOnRoad(entry,path.points)).filter(n=>n).sort((a,b)=>a!.distance-b!.distance)[0];if(!near)return null;
 const route=planGroundRoute(near.point,entry,c,{maxSlope:.35,widthM:2.2,maxCells:1024});if(!route.points.length||!clear(route.points,2.2))return null;
 const id=r.id+'-harbor',entity:EntityDefinitionV3={id,name:'Raccord au port maritime N1',kind:'prop',ownerChunkId:chunkAt(p.world,entry.x,entry.z),components:{Transform:{type:'Transform',position:{...entry,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},State:{type:'State',initial:{portN1Anchor:true,portShoreX:layout.shore.x,portShoreZ:layout.shore.z}}}};
 const record:AmenityRecord={id,role:'harbor',entry,entityHash:fingerprint(entity),locked:false};return {entity,record,path:{id:r.id+'-harbor-access',points:route.points,width:2.2,kind:'dirt'} as PathDefinition,layout};
}
