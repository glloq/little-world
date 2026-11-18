/** Three opt-in demonstration courses, generated from a snapped player pose.
 * Snapping gives the identical geometry/layoutKey when replayed from the same area.
 * These are practice courses, never comparable global multiplayer records. */
import {validateRace,type RaceBounds,type RaceDefinition,type RaceKind,type RacePoint,type RaceGate} from './races.ts';
export const DEMO_RACES=[
  {id:'flight',name:'Anneaux des falaises',description:'Cinq anneaux aériens. Déployer le planeur avant de commencer.'},
  {id:'roll',name:'Descente des noisettes',description:'Cinq arches en roulade. Utiliser les courbes du terrain.'},
  {id:'mixed',name:'Du sol aux nuages',description:'Deux portes au sol puis trois anneaux en vol.'},
] as const;
export type DemoRaceId=typeof DEMO_RACES[number]['id'];
export function makeDemoRace(id:DemoRaceId,position:RacePoint,heading:number,
  terrain:(x:number,z:number)=>number,bounds:RaceBounds,worldId:string):RaceDefinition|null{
  if(!DEMO_RACES.some(d=>d.id===id)||!Number.isFinite(heading)||!Number.isFinite(position.x)||
     !Number.isFinite(position.y)||!Number.isFinite(position.z))return null;
  // Stable local templates: start locations are snapped to 5 m, heading to 15 degrees.
  const snap=(n:number,v:number)=>Math.round(v/n)*n;
  const origin={x:snap(5,position.x),y:snap(5,position.y),z:snap(5,position.z)};
  const az=snap(Math.PI/12,heading),dx=Math.sin(az),dz=Math.cos(az),rx=dz,rz=-dx;
  const flight=id==='flight',roll=id==='roll';
  const separations=flight?[55,110,165,220,275]:roll?[22,44,66,88,110]:[22,44,78,114,150];
  const gates:RaceGate[]=separations.map((d,i)=>{
    const lateral=flight?(i%2===0?8:-8):roll?(i%2===0?3:-3):(i<2?2:(i%2===0?5:-5));
    const x=origin.x+dx*d+rx*lateral,z=origin.z+dz*d+rz*lateral;
    const ground=terrain(x,z),air=flight||(id==='mixed'&&i>=2);
    const y=air?Math.max(ground+7,origin.y+(flight?3+i%3*3:6+i)):ground+1.1;
    const gate:RaceGate={id:'gate-'+(i+1),center:{x,y,z},normal:{x:dx,y:0,z:dz},
      shape:air?'circle':'rectangle',width:air?(flight?18:14):9,height:air?(flight?18:14):4.8,
      allowedModes:air?['glide']:['roll','air']};
    return gate;
  });
  // Only instantiate a course when the complete corridor is inside the world.
  if(gates.some(g=>g.center.x<bounds.minX+15||g.center.x>bounds.maxX-15||
                   g.center.z<bounds.minZ+15||g.center.z>bounds.maxZ-15||
                   !Number.isFinite(g.center.y)))return null;
  const name=DEMO_RACES.find(d=>d.id===id)!.name;
  const definition:RaceDefinition={
    id:'demo-'+id,name,version:1,worldId,
    layoutKey:[id,origin.x,origin.y,origin.z,Math.round(az*10000)].join(':'),
    kind:id as RaceKind,classification:'practice',gates,maxTicks:30*(flight?120:roll?90:120)
  };
  return validateRace(definition,bounds);
}
