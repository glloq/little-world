/** AUD-V2 — AudioEventRouter: turns gameplay facts into semantic sound events.
 * Inputs are business states (movement mode, surface, space, weather…) and explicit gameplay events,
 * never mesh changes. Pure and client-local: a future server only needs to send event IDs + params. */
import {sanitizeContext,type Activity,type Place,type SoundContext,type Surface,type TimeOfDay,type Weather} from './context.ts';
type V3={x:number;y:number;z:number};
export type PlayerMotion='ground'|'air'|'glide'|'swim'|'dive'|'climb'|'roll';
export interface AudioFrame {
 nowMs:number;
 player:{position:V3;velocity:V3;mode:PlayerMotion;aboard:boolean;boatSpeed?:number;space?:{zoneId:string;levelId:string}|null;surface?:Surface};
 world:{time:TimeOfDay;weather:Weather;wet?:boolean;biome?:string;place?:Place;nearWater:boolean;activity?:Activity;submerged?:boolean;wind?:number};
}
export interface RoutedSound {eventId:string;context:SoundContext;position?:V3;source:'player'|'world'|'ui';}
export interface StateLoop {key:string;eventId:string;gain:number;bus:'sfx'|'ambience';}
const horizontal=(v:V3)=>Math.hypot(v.x,v.z);
const impact=(speed:number)=>speed<5?'light':speed<10?'medium':'heavy';

export class AudioEventRouter {
 private previous:AudioFrame|null=null;
 private stepFrom:{x:number;z:number}|null=null;
 private walked=0;
 private lastStep=-Infinity;
 private swimFrom:{x:number;z:number}|null=null;
 private lastStroke=-Infinity;
 private fall=0;
 private world:SoundContext={};
 /** Place hysteresis: a surface place must hold 800 ms before ambience/music follow it (no flicker at biome borders). */
 private place:{value?:Place;candidate?:Place;since:number}={since:0};
 readonly counters={emitted:0,steps:0,transitions:0};
 private readonly sink:(sound:RoutedSound)=>void;
 constructor(sink:(sound:RoutedSound)=>void){this.sink=sink;}
 /** Explicit gameplay event (interaction, mine, farm, mission, UI…). Never throws. */
 emit(eventId:string,params:{context?:SoundContext;position?:V3;source?:RoutedSound['source']}={}){
  if(typeof eventId!=='string'||!eventId)return;this.counters.emitted++;
  this.sink({eventId,context:{...this.world,...sanitizeContext(params.context)},position:params.position,source:params.source??'world'});
 }
 /** Shared context for music/ambience selection. */
 get context():SoundContext {return {...this.world};}
 /** Called every rendered frame (cheap). Footsteps are distance-based, so 20 or 30 FPS give the same cadence. */
 observe(frame:AudioFrame):StateLoop[] {
  const p=frame.player,w=frame.world,prev=this.previous?.player;
  const raw:Place|undefined=p.space?'mine':w.submerged?'underwater':w.place;
  if(raw!==this.place.candidate){this.place.candidate=raw;this.place.since=frame.nowMs;}
  if(raw==='mine'||raw==='underwater'||this.place.value==='mine'||this.place.value==='underwater'||frame.nowMs-this.place.since>=800||!this.previous)this.place.value=raw;
  const place=this.place.value;
  const activity:Activity=w.activity??(p.space?'mining':p.aboard?'sailing':'explore');
  this.world=sanitizeContext({time:w.time,weather:w.weather,wet:w.wet??(w.weather==='rain'||w.weather==='storm'),biome:w.biome,place,nearWater:w.nearWater,activity});
  const body=(extra:SoundContext)=>({...this.world,surface:p.surface,...extra});
  const player=(eventId:string,extra:SoundContext={})=>{this.counters.transitions++;this.emit(eventId,{context:body(extra),position:p.position,source:'player'});};
  if(prev){
   const was=prev.mode,now=p.mode,water=(m:PlayerMotion)=>m==='swim'||m==='dive';
   if(was==='air'||was==='glide')this.fall=Math.max(this.fall,-Math.min(0,prev.velocity.y));else this.fall=0;
   if(!prev.aboard&&p.aboard)player('boat.board',{surface:'wood'});else if(prev.aboard&&!p.aboard)player('boat.disembark',{surface:'wood'});
   else if(was!==now){
    if(was==='ground'&&now==='air'&&p.velocity.y>1.5)player('player.jump',{movement:'jump'});
    if(now==='glide'&&was!=='glide')player('player.glide.deploy',{movement:'glide'});
    if(was==='glide'&&now!=='glide'&&!water(now))player('player.glide.fold',{movement:'glide'});
    if((was==='air'||was==='glide')&&now==='ground')player('player.land',{movement:'land',intensity:was==='glide'?'light':impact(this.fall)});
    if(!water(was)&&water(now))player('water.enter',{surface:'water',intensity:impact(Math.max(this.fall,-Math.min(0,prev.velocity.y))),movement:'swim'});
    if(was==='swim'&&now==='dive')player('water.dive',{surface:'water',movement:'dive'});
    if(was==='dive'&&now==='swim')player('water.surface',{surface:'water',movement:'swim'});
    if(water(was)&&!water(now))player('water.exit',{surface:'water'});
   }
   const before=prev.space??null,after=p.space??null;
   if(!before&&after)player('mine.enter',{place:'mine'});else if(before&&!after)player('mine.exit',{place:'mine'});else if(before&&after&&before.levelId!==after.levelId)player('mine.level.change',{place:'mine',surface:'stone'});
  }
  // Footsteps — stride of 0.9 m (walk, ≥ 220 ms, as in V1) or 1.25 m (run, ≥ 200 ms). The travelled
  // distance is accumulated with its remainder, so the cadence does not depend on the frame rate.
  const speed=horizontal(p.velocity),moving=p.mode==='ground'&&!p.aboard&&(p.velocity.x**2+p.velocity.y**2+p.velocity.z**2)>.1,running=speed>4.2,stride=running?1.25:.9;
  if(moving&&this.stepFrom){this.walked+=Math.hypot(p.position.x-this.stepFrom.x,p.position.z-this.stepFrom.z);
   if(this.walked>stride&&frame.nowMs-this.lastStep>(running?200:220)){this.walked=Math.min(stride,this.walked-stride);this.lastStep=frame.nowMs;this.counters.steps++;
    this.emit('player.footstep',{context:body({movement:running?'run':'walk',intensity:running?'medium':'light'}),position:p.position,source:'player'});}}
  else this.walked=0;
  this.stepFrom={x:p.position.x,z:p.position.z};
  if(p.mode==='swim'&&!p.aboard){if(this.swimFrom&&Math.hypot(p.position.x-this.swimFrom.x,p.position.z-this.swimFrom.z)>1.6&&frame.nowMs-this.lastStroke>450){this.lastStroke=frame.nowMs;this.swimFrom={x:p.position.x,z:p.position.z};this.emit('water.swim',{context:body({surface:'water',movement:'swim'}),position:p.position,source:'player'});}else if(!this.swimFrom)this.swimFrom={x:p.position.x,z:p.position.z};}else this.swimFrom=null;
  this.previous={nowMs:frame.nowMs,player:{...p,position:{...p.position},velocity:{...p.velocity}},world:{...w}};
  const loops:StateLoop[]=[];
  if(p.mode==='glide')loops.push({key:'state:glide',eventId:'player.glide.wind',gain:Math.min(1,.35+speed/16),bus:'sfx'});
  if(p.mode==='roll'&&!p.aboard)loops.push({key:'state:roll',eventId:'player.roll.loop',gain:Math.min(1,.2+speed/12),bus:'sfx'});
  if(p.aboard&&(p.boatSpeed??0)>.4)loops.push({key:'state:boat',eventId:'boat.move',gain:Math.min(1,.3+(p.boatSpeed??0)/8),bus:'sfx'});
  return loops;
 }
 reset(){this.place={since:0};this.previous=null;this.stepFrom=null;this.walked=0;this.swimFrom=null;this.fall=0;}
}
