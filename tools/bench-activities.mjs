/** MINE / AGRI CPU benchmark (Node, no GPU). Mine: meshing time per 32×32 chunk, dig +
 * local remesh, save size after N digs. Farm: evaluation after 1 day / 30 days / 10 years of
 * absence, action latency. Water: network compilation of the B1 demonstration. p50/p95/p99.
 * Usage: node --expose-gc tools/bench-activities.mjs */
import {readFileSync} from 'node:fs';
import {MineGrid,MineState} from '../src/mine/mine-state.ts';
import {mineChunkGeometry} from '../src/mine/mine-mesher.ts';
import {createClimate,defaultEnvironment} from '../src/environment/climate.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';
import {newPlotState,evaluate,act} from '../src/farm/farm-sim.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {createTerrainSource} from '../src/terrain.ts';
const pct=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(3);};
const time=(fn,n)=>{const t=[];for(let i=0;i<n;i++){const a=performance.now();fn(i);t.push(performance.now()-a);}return {p50Ms:pct(t,.5),p95Ms:pct(t,.95),p99Ms:pct(t,.99)};};
const project=JSON.parse(readFileSync(new URL('../maps/b1-demo.project.json',import.meta.url),'utf8')),zone=project.libraries.zones['zone-mine'];
const state=new MineState(new MineGrid(zone)),{cx0,cx1,cz0,cz1}=state.grid.chunkRange(),chunks=[];for(let l=0;l<3;l++)for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++)chunks.push([l,cx,cz]);
const meshing=time(i=>{const [l,cx,cz]=chunks[i%chunks.length];mineChunkGeometry(state,l,cx,cz);},400);
// Dig along the level-3 gallery wall and remesh the touched chunks each time.
let n=0;const digs=time(()=>{for(let iz=state.grid.minZ;iz<state.grid.minZ+state.grid.depth;iz++)for(let ix=state.grid.minX;ix<state.grid.minX+state.grid.width;ix++){if(state.isOpen(2,ix,iz)||!state.grid.inZone(ix,iz))continue;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(state.isOpen(2,ix+dx,iz+dz)){const r=state.dig({requestId:'b'+n++,levelId:'level-3',ix,iz,from:{x:ix+dx+.5,y:state.grid.levels[2].floorY,z:iz+dz+.5}},()=>true);if(r.ok){for(const k of r.chunks){const [cx,cz]=k.split(',').map(Number);mineChunkGeometry(state,2,cx,cz);}return;}}}},300);
const save=JSON.stringify(state.serialize());
const climate=createClimate(defaultEnvironment(1284)),settings=defaultFarmSettings([{x:0,z:0},{x:10,z:0},{x:10,z:10}]),DAY=climate.definition.dayLengthSeconds;
const absence=days=>time(()=>{const s=newPlotState('p',settings);act(s,settings,climate,{requestId:'p',type:'plant',cropId:'wheat',time:0},()=>true);evaluate(s,settings,climate,days*DAY);},days>1000?5:50);
const ground=createTerrainSource({seed:project.world.seed,density:project.world.density,seaLevel:project.world.seaLevel,width:project.world.bounds.maxX-project.world.bounds.minX,length:project.world.bounds.maxZ-project.world.bounds.minZ,terrain:project.world.terrain},[]);
const water=time(()=>compileWaterNetwork(Object.values(project.libraries.water),ground,project.world.seaLevel),20);
console.log(JSON.stringify({mine:{chunks:chunks.length,meshPerChunk:meshing,digAndRemesh:{...digs,digs:n},saveBytesAfterDigs:save.length},farm:{absence1Day:absence(1),absence30Days:absence(30),absence10Years:absence(3650)},water:{networkCompileB1:water}},null,1));
