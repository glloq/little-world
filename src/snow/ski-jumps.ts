import {gateCrossing,type RaceDefinition,type RaceGate,type RacePoint} from '../gameplay/races.ts';
import type {Player} from '../player.ts';

export function alpineJumpGates(race:RaceDefinition):RaceGate[]{
  const indices=[...new Set([1/5,3/5].map(f=>Math.round(f*(race.gates.length-1))))];
  return indices.filter(i=>i>0&&i<race.gates.length-1).map(i=>race.gates[i]);
}

function crossedSkiJump(jumps:readonly RaceGate[],previous:RacePoint,position:RacePoint,speed:number){
  return speed>=6&&jumps.some(gate=>gateCrossing(gate,previous,position)!==null);
}

export function launchSkiJump(player:Player,jumps:readonly RaceGate[],previous:RacePoint){
  if(player.mode!=='snow'||!jumps.length||!crossedSkiJump(jumps,previous,player.position,
    Math.hypot(player.velocity.x,player.velocity.z)))return false;
  player.mode='air';player.snowAirborne=true;player.glideReady=false;
  player.jumpOrigin='run';player.jumpSeq=(player.jumpSeq??0)+1;
  // Kick relative to the incoming descent so a faster rider still lands before the next gate.
  player.position.y+=.10;
  player.velocity.y=Math.min(0,player.velocity.y)+4.2;
  return true;
}
