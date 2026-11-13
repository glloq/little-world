/** MINE-5 — collision adapter (SpaceProvider) and transitions of a mine, read straight from the
 * occupancy grid: no collider object per cell, correct at any LOD or culling state. */
import type {SpaceProvider,TransitionVolume,Bounds} from '../physics/collision-world.ts';
import type {MineState} from './mine-state.ts';

export function mineSpaceProvider(state:MineState):SpaceProvider{
  const grid=state.grid;
  return {
    floor:id=>grid.levels[grid.levelIndex(id)]?.floorY??0,
    column(id,x,z){const l=grid.levelIndex(id);if(l<0)return null;const ix=Math.floor(x),iz=Math.floor(z);if(!state.isOpen(l,ix,iz))return null;const level=grid.levels[l];return {floorY:level.floorY,ceilingY:level.floorY+level.height};},
    solids(id,minX,maxX,minZ,maxZ,out:Bounds[]){const l=grid.levelIndex(id);if(l<0)return;for(let ix=Math.floor(minX);ix<=Math.floor(maxX);ix++)for(let iz=Math.floor(minZ);iz<=Math.floor(maxZ);iz++)if(!state.isOpen(l,ix,iz))out.push({minX:ix,maxX:ix+1,minZ:iz,maxZ:iz+1,minY:-1e5,maxY:1e5});},
  };
}
/** Entrance portal (surface ↔ top level) and stairs (level ↔ level below). Each arrival lies
 * outside the reverse trigger, so a crossing never bounces back. `ground` = exterior relief. */
export function mineTransitions(state:MineState,ground:(x:number,z:number)=>number):TransitionVolume[]{
  const grid=state.grid,mine=grid.zone.mine,id=grid.zone.id,out:TransitionVolume[]=[],top=grid.levels[0];
  const e=mine.entrance,hx=Math.sin(e.heading),hz=Math.cos(e.heading),gy=ground(e.x,e.z),cell=(x:number,z:number)=>({minX:Math.floor(x),maxX:Math.floor(x)+1,minZ:Math.floor(z),maxZ:Math.floor(z)+1});
  const inside={x:Math.floor(e.x+hx*3)+.5,z:Math.floor(e.z+hz*3)+.5},outside={x:e.x-hx*3,z:e.z-hz*3};
  out.push({id:`mine:${id}:enter`,label:'Entrer dans la mine',from:null,to:{zoneId:id,levelId:top.id},minX:e.x-1,maxX:e.x+1,minZ:e.z-1,maxZ:e.z+1,minY:gy-3,maxY:gy+4,arrival:{x:inside.x,y:top.floorY,z:inside.z}});
  out.push({id:`mine:${id}:exit`,label:'Sortir de la mine',from:{zoneId:id,levelId:top.id},to:null,...cell(e.x,e.z),minY:top.floorY-.5,maxY:top.floorY+top.height,arrival:{x:outside.x,y:ground(outside.x,outside.z),z:outside.z}});
  for(const c of mine.connectors){
    const upper=grid.levels[grid.levelIndex(c.upper)],lower=grid.levels[grid.levelIndex(c.lower)],cx=Math.floor(c.x)+.5,cz=Math.floor(c.z)+.5;
    out.push({id:`mine:${id}:${c.id}:down`,label:'Descendre',from:{zoneId:id,levelId:upper.id},to:{zoneId:id,levelId:lower.id},...cell(c.x,c.z),minY:upper.floorY-.5,maxY:upper.floorY+upper.height,arrival:{x:cx,y:lower.floorY,z:cz+2}});
    out.push({id:`mine:${id}:${c.id}:up`,label:'Monter',from:{zoneId:id,levelId:lower.id},to:{zoneId:id,levelId:upper.id},...cell(c.x,c.z),minY:lower.floorY-.5,maxY:lower.floorY+lower.height,arrival:{x:cx,y:upper.floorY,z:cz-2}});
  }
  return out;
}
