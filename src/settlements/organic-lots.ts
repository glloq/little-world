import {networkPattern} from './neighborhood-network.ts';
import {isCorridor,corridorLots} from './corridor.ts';
import type {PathDefinition} from '../world-data.ts';
/** Small bounded search around each shared street, scored with the final native heightfield. */
import type { SettlementRecipe } from './schema.ts';
import type { PointXZ } from '../geography/archipelago.ts';
import type { GroundRouteContext } from '../paths/terrain-route.ts';
import { inspectGroundSegment } from '../paths/terrain-route.ts';
import type { WorldCollisionQuery } from '../physics/collision-world.ts';
import { housePoint, HOUSE } from './habitat.ts';
import { yawQuaternion } from '../studio-core/transforms.ts';
import type { TransformComponent } from '../studio-core/types.ts';
import { layoutDimensions,sectorWeight,layoutAngle, layoutRandom, nearestOnRoad } from './layout.ts';
export function fitOrganicLot(r: SettlementRecipe, slot: number, _points: PointXZ[], c: GroundRouteContext, query: WorldCollisionQuery, roads:PathDefinition[]):{t:TransformComponent;pos:PointXZ;junction:PointXZ;score:number}|null {
    const d=layoutDimensions(r),perGroup=Math.ceil(r.targetBuildings/d.lanes),lane=Math.floor(slot/perGroup),local=slot%perGroup,count=Math.min(perGroup,r.targetBuildings-lane*perGroup),sector=Math.PI*2/d.lanes,angleStart=layoutAngle(r,lane),baseAngle=angleStart+sector*(.12+layoutRandom(r,'house-angle-'+slot)*.76),u=Math.max(.02,Math.min(.99,(local+.5+(layoutRandom(r,'radial-jitter-'+slot)-.5)*.65)/count)),baseRadius=25+Math.sqrt(u)*Math.max(5,d.outer-25),adjust=r.layout?.adjustments?.find(a=>a.slot===slot),module=r.layout?.modules?.find(m=>m.lane===lane);
    let best:{t:TransformComponent;pos:PointXZ;junction:PointXZ;score:number}|null=null;
    const radial=adjust?[0]:[0,4,-4,8,-8,12,-12,17,-17,22,-22,26,-26],angles=adjust?[0]:[0,-.12,.12,-.25,.25,-.4,.4,-.6,.6,-.8,.8];
    const nearest=(q:PointXZ,checkClearance=false)=>{
        let closest:ReturnType<typeof nearestOnRoad>=null;
        for(const road of roads){
            const hit=nearestOnRoad(q,road.points);
            if(!hit)continue;
            if(checkClearance&&hit.distance<Math.max(6,road.width/2*Math.SQRT2+4.8))return null;
            if(!closest||hit.distance<closest.distance)closest=hit;
        }
        return closest;
    };
    const baseline=(isCorridor(r)||networkPattern(r))&&adjust?fitOrganicLot({...r,layout:{...r.layout!,adjustments:r.layout!.adjustments!.filter(a=>a.slot!==slot)}},slot,_points,c,query,roads):null;
    const networkCount=Math.ceil(r.targetBuildings/d.lanes);
    const candidates=networkPattern(r)?(adjust?(baseline?[{pos:{x:baseline.pos.x+adjust.dx,z:baseline.pos.z+adjust.dz},cost:0}]:[]):corridorLots({...r,seed:(r.seed+lane*2654435761)>>>0,targetBuildings:networkCount,layout:{...r.layout!,adjustments:[]}},slot%networkCount,_points)):isCorridor(r)?(adjust?(baseline?[{pos:{x:baseline.pos.x+adjust.dx,z:baseline.pos.z+adjust.dz},cost:0}]:[]):corridorLots(r,slot,_points)):angles.flatMap(turn=>radial.flatMap(delta=>{if(baseAngle+turn<angleStart+.04||baseAngle+turn>angleStart+sector-.04)return [];const a=baseAngle+turn,radius=baseRadius+delta;if(radius<24||radius>d.outer)return [];const weight=sectorWeight(radius/(d.outer+2));return [{pos:{x:r.center.x+Math.cos(a)*radius+(module?.dx??0)*weight+(adjust?.dx??0),z:r.center.z+Math.sin(a)*radius+(module?.dz??0)*weight+(adjust?.dz??0)},cost:Math.abs(turn)*2+Math.abs(delta)*.08}];}));
    for(const {pos,cost} of candidates){
        if(best&&cost>=best.score)continue;
        if(Math.hypot(pos.x-r.center.x,pos.z-r.center.z)>r.radius-5)continue;
        const near=nearest(pos,true);
        if(!near)continue;
        const run=Math.hypot(pos.x-near.point.x,pos.z-near.point.z)||1,normal={x:(pos.x-near.point.x)/run,z:(pos.z-near.point.z)/run};
        const yaw = Math.atan2(normal.x, normal.z), t: TransformComponent = { type: 'Transform', position: { ...pos, y: 0 }, rotation: yawQuaternion(yaw), scale: { x: 1, y: 1, z: 1 } }, samples = [[-3.4, -3.9], [0, -3.9], [3.4, -3.9], [-3.4, 0], [0, 0], [3.4, 0], [-3.4, 3.9], [0, 3.9], [3.4, 3.9]].map(([x, z]) => housePoint(t, x, 0, z)), heights = samples.map(q => c.height(q.x, q.z)), low = Math.min(...heights), floor = Math.max(...heights), variation = floor - low;
            if (samples.some(q => q.x < c.bounds.minX + 1 || q.x > c.bounds.maxX - 1 || q.z < c.bounds.minZ + 1 || q.z > c.bounds.maxZ - 1 || c.wet(q.x, q.z)) || low <= c.seaLevel + 1 || variation > .35)
                continue;
            if (query.intersectsVolume({ minX: Math.min(...samples.map(q => q.x)) - .3, maxX: Math.max(...samples.map(q => q.x)) + .3, minZ: Math.min(...samples.map(q => q.z)) - .3, maxZ: Math.max(...samples.map(q => q.z)) + .3, minY: floor + .15, maxY: floor + 5.7 }))
                continue;
            t.position.y = floor - c.height(pos.x, pos.z);
            const entry = housePoint(t, 0, 0, -HOUSE.depth / 2 - 1.1), junction=nearest(entry)?.point;
            if (!junction || !inspectGroundSegment(entry, junction, c, { maxSlope: .35, widthM: 1.8 }).valid)
                continue;
            const move = query.sweep({ x: entry.x, y: c.height(entry.x, entry.z), z: entry.z }, { x: junction.x, y: c.height(junction.x, junction.z), z: junction.z }, .9, 1.8);
            if (move.blockedX || move.blockedZ || move.pushed || Math.hypot(move.position.x - junction.x, move.position.z - junction.z) > .05)
                continue;
            const score = variation * 40 + cost;
            if (!best || score < best.score)
                best = { t, pos, junction, score };
        }
    return best;
}
