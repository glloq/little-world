import {archipelagoField,compilePolygon} from '../geography/archipelago.ts';
import {settlementTerrain} from '../settlements/terrain.ts';
/** Generate real N1 source geometry/sockets at world creation using the existing N1 survey. */
import type {ProjectDocument,EntityDefinitionV3} from './types.ts';
import {terrainAccessContext} from './terrain-access.ts';
import {planPortN1,authoredPortLayout,type PortN1Layout} from '../archipelago/port-n1-plan.ts';
import {portN1CollisionBodies} from '../archipelago/port-n1-collisions.ts';
import {PORT_ASSETS} from '../archipelago/port-assets.ts';
import {dockGridLayout} from '../structures/dock-layout.ts';
import {putEntity,putPath} from './source.ts';
import {chunkAt} from './schema.ts';
import {yawQuaternion} from './transforms.ts';
export function generateBirthPort(p:ProjectDocument):PortN1Layout|null{
 if(p.world.terrain?.kind!=='archipelago')return null;
 const c=terrainAccessContext(p),reserved=settlementTerrain(p),bounds=p.world.bounds,coast=archipelagoField({width:bounds.maxX-bounds.minX,length:bounds.maxZ-bounds.minZ,seed:p.world.seed,seaLevel:c.seaLevel},p.world.terrain.archipelago).coast,candidates:{x:number;z:number;score:number}[]=[];
 for(const land of p.world.terrain.archipelago.landmasses)for(let i=0;i<land.outline.length;i++){const q=land.outline[i],a=land.outline[(i+1)%land.outline.length],dx=a.x-q.x,dz=a.z-q.z,length=Math.hypot(dx,dz)||1;
  for(const side of [-1,1])for(const distance of (p.world.generation?.islandStyle?.calderaShape==='dominant'?[8,16,26,...Array.from({length:23},(_,i)=>32+i)]:[8,16,26,38,52])){const x=q.x-dz/length*side*distance,z=q.z+dx/length*side*distance,h=c.height(x,z);if(x<bounds.minX+8||x>bounds.maxX-8||z<bounds.minZ+8||z>bounds.maxZ-8||h<.25||h>2||c.wet(x,z))continue;const spread=Math.abs(c.height(x+2,z)-c.height(x-2,z))+Math.abs(c.height(x,z+2)-c.height(x,z-2));candidates.push({x,z,score:spread*(p.world.generation?.islandStyle?.calderaShape==='dominant'?.1:10)+Math.abs(h-(p.world.generation?.islandStyle?.calderaShape==='dominant'?.3:.8))});}}
 const primary=p.world.generation?.islandStyle?.calderaShape==='dominant'?compilePolygon(p.world.terrain.archipelago.landmasses[0].outline):null;
 candidates.sort((a,b)=>a.score-b.score||a.x-b.x||a.z-b.z);let port:PortN1Layout|null=null,bestLots=-1;const wantsVillage=p.world.generation?.welcomeVillage&&p.world.generation.welcomeVillage!=='none';
 for(const origin of candidates.filter(q=>!primary||primary(q.x,q.z)>=0).slice(0,384)){const proposal=planPortN1({origin,width:bounds.maxX-bounds.minX,length:bounds.maxZ-bounds.minZ,seaLevel:c.seaLevel,height:c.height,depth:(x,z)=>Math.max(0,c.seaLevel-c.height(x,z)),maxDistance:0,dockCells:[3,5,8,12,16,24,32],maxShoreHeight:2,accept:site=>(!primary||primary(site.stand.x,site.stand.z)>=0)&&coast(site.boat.x,site.boat.z)<0&&!reserved.wet(site.stand.x,site.stand.z)&&!reserved.wet(site.trade.x,site.trade.z)&&Array.from({length:site.dockCells*2+1},(_,i)=>({x:site.shore.x+Math.sin(site.heading)*i,z:site.shore.z+Math.cos(site.heading)*i})).every(q=>c.height(q.x,q.z)<=site.dockBaseY+1.2)});if(!proposal)continue;let lots=0;if(wantsVillage){const co=Math.cos(proposal.heading),si=Math.sin(proposal.heading);for(const distance of [35,60,95])for(const side of [-25,0,25]){const x=proposal.shore.x+side*co-distance*si,z=proposal.shore.z-side*si-distance*co,heights=[[-4,-4],[-4,4],[4,-4],[4,4]].map(([dx,dz])=>c.height(x+dx,z+dz));if(Math.min(...heights)>1.1&&Math.max(...heights)-Math.min(...heights)<.35&&!c.wet(x,z))lots++;}}if(lots>bestLots){bestLots=lots;port=proposal;}if(!wantsVillage||lots>=6)break;}
 if(!port)return null;
 for(const asset of PORT_ASSETS)p.assets[asset.id]=structuredClone(asset);
 const plan=port,co=Math.cos(plan.heading),si=Math.sin(plan.heading),local=(x:number,z:number)=>({x:plan.shore.x+x*co+z*si,z:plan.shore.z-x*si+z*co});
 let shoreward=local(0,-10);for(const distance of [10,16,24,36,50,70,100,125,160]){const q=local(0,-distance);if(c.height(q.x,q.z)>c.seaLevel+1.3&&!c.wet(q.x,q.z)){shoreward=q;break;}}plan.landAccess={...shoreward,y:c.height(shoreward.x,shoreward.z)};
 const add=(id:string,name:string,point:{x:number;z:number},y:number,asset?:string,rotation=plan.heading,extra:EntityDefinitionV3['components']={})=>{putEntity(p,{id:'composition-port-'+id,name,kind:'prop',ownerChunkId:chunkAt(p.world,point.x,point.z),components:{Transform:{type:'Transform',position:{...point,y:y-c.height(point.x,point.z)},rotation:yawQuaternion(rotation),scale:{x:1,y:1,z:1}},...(asset?{Visual:{type:'Visual',assetId:asset}}:{}),...extra}});};
 add('n1','Port maritime N1',plan.stand,plan.stand.y,'maritime.stand-n1',plan.heading,{State:{type:'State',initial:{portN1Authored:true,portN1Anchor:true,portShoreX:plan.shore.x,portShoreZ:plan.shore.z,portN1Layout:JSON.stringify(plan)}}});
 const grid=dockGridLayout(Array.from({length:plan.dockCells},(_,gz)=>({gx:0,gz})));
 for(const [i,q]of grid.tiles.entries())add('tile-'+i,'Quai maritime',local(q.x,q.z+1),plan.dockBaseY,'maritime.dock-tile');
 for(const [i,q]of grid.posts.entries())add('post-'+i,'Poteau du quai',local(q.x,q.z+1),plan.dockBaseY,'maritime.dock-post');
 add('bollard','Amarrage',local(.52,plan.dockCells*2-.5),plan.dockBaseY+1,'maritime.dock-bollard');
 for(const [i,body]of portN1CollisionBodies(plan).entries())add('collision-'+i,'Support et collision du port',body.position,body.position.y,undefined,0,{Collider:{type:'Collider',shape:'box',size:body.size,layer:'solid'}});
 putPath(p,{id:'composition-port-approach',points:[shoreward,{x:plan.trade.x,z:plan.trade.z},{x:plan.shore.x,z:plan.shore.z}],width:1.8,kind:'dirt'});
 return plan;
}

/** Revalidate actual saved geometry, not only the original survey result. */
export function validateBirthPort(p:ProjectDocument){
 const entities=Object.values(p.chunks).flatMap(c=>Object.values(c.entities)),root=entities.find(e=>e.id==='composition-port-n1'),out:{severity:'ERROR';code:string;message:string}[]=[];
 if(!root){if(p.world.generation?.maritimePort)out.push({severity:'ERROR',code:'MARITIME_PORT_MISSING',message:'Le port maritime demandé est absent du projet.'});return out;}
 const port=authoredPortLayout([{initialState:root.components.State?.initial}]);if(!port){out.push({severity:'ERROR',code:'MARITIME_PORT_SOURCE',message:'Données du port maritime invalides.'});return out;}
 const c=terrainAccessContext(p),co=Math.cos(port.heading),si=Math.sin(port.heading),local=(x:number,z:number)=>({x:port.shore.x+x*co+z*si,z:port.shore.z-x*si+z*co});
 const check=(id:string,q:{x:number;z:number},y:number,asset?:string)=>{const e=entities.find(e=>e.id==='composition-port-'+id),t=e?.components.Transform;if(!t||Math.abs(t.scale.x-1)+Math.abs(t.scale.y-1)+Math.abs(t.scale.z-1)>.001||Math.abs(t.rotation.x)+Math.abs(t.rotation.z)>.001||Math.abs(Math.atan2(Math.sin(2*Math.atan2(t.rotation.y,t.rotation.w)-(asset?port.heading:0)),Math.cos(2*Math.atan2(t.rotation.y,t.rotation.w)-(asset?port.heading:0))))>.001||Math.hypot(t.position.x-q.x,t.position.z-q.z)>.03||Math.abs(c.height(t.position.x,t.position.z)+t.position.y-y)>.05||asset&&e?.components.Visual?.assetId!==asset)out.push({severity:'ERROR',code:'MARITIME_PORT_CHANGED',message:'Port déplacé, incomplet ou terrain modifié : recalculer le port ('+id+').'});};
 check('n1',port.stand,port.stand.y,'maritime.stand-n1');
 for(let i=0;i<port.dockCells;i++)check('tile-'+i,local(0,1+2*i),port.dockBaseY,'maritime.dock-tile');
 for(const [i,b]of portN1CollisionBodies(port).entries()){check('collision-'+i,b.position,b.position.y);const e=entities.find(e=>e.id==='composition-port-collision-'+i);if(!e?.components.Collider||e.components.Collider.layer!=='solid'||e.components.Collider.shape!=='box'||Math.abs(e.components.Collider.size.x-b.size.x)+Math.abs(e.components.Collider.size.y-b.size.y)+Math.abs(e.components.Collider.size.z-b.size.z)>.02)out.push({severity:'ERROR',code:'MARITIME_PORT_COLLISION',message:'Collision du quai ou du commerce absente ou modifiée.'});}
 if([port.boat,port.boarding,port.trade].some(q=>q.x<p.world.bounds.minX+2||q.x>p.world.bounds.maxX-2||q.z<p.world.bounds.minZ+2||q.z>p.world.bounds.maxZ-2))out.push({severity:'ERROR',code:'MARITIME_PORT_BOUNDARY',message:'Un accès maritime sort de la carte.'});
 const approach=p.libraries.paths['composition-port-approach'];if(!approach||port.landAccess&&Math.hypot(approach.points[0].x-port.landAccess.x,approach.points[0].z-port.landAccess.z)>.03)out.push({severity:'ERROR',code:'MARITIME_PORT_ACCESS',message:'L’accès terrestre du port est absent ou déconnecté.'});
 if(c.height(port.boat.x,port.boat.z)>c.seaLevel-1.3||c.wet(port.trade.x,port.trade.z))out.push({severity:'ERROR',code:'MARITIME_PORT_WATER',message:'Accostage trop peu profond ou commerce inondé.'});
 return out;
}
