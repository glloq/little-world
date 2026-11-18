/** Isolated contextual settlement fixtures; never staged as public maps. */
import {flatSettlementProject} from './settlement-fixture.mjs';
import {putWater} from '../src/studio-core/source.ts';
import {newSettlement} from '../src/settlements/schema.ts';
import {DEFAULT_SETTLEMENT_LAYOUT} from '../src/settlements/layout.ts';
export function contextualSettlementFixture(pattern){
 const project=flatSettlementProject();let center={x:0,z:0};
 if(pattern==='mountain'){
  const a=project.world.terrain.archipelago;a.landmasses[0].lowlandHeightM=80;a.landmasses[0].shoreHeightM=80;
  a.features.push({id:'gentle-flank',kind:'hill',x:0,z:-240,radiusM:330,heightM:6,roughness:0},{id:'summit',kind:'mountain',x:0,z:-260,radiusM:100,heightM:100,roughness:0});
 }
 if(pattern==='river')putWater(project,{id:'river',points:[{x:-300,z:-5},{x:-150,z:-60},{x:0,z:-35},{x:150,z:-65},{x:300,z:-10}],width:12,level:12,depth:2});
 if(pattern==='fishing')center={x:0,z:295};
 const recipe={...newSettlement(project.world,'context-'+pattern,center),form:'village',radius:150,targetBuildings:20,services:true,activity:pattern==='fishing'?'fishing':'mixed',layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern,poi:'activity'}};
 return {project,recipe};
}
