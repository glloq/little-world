/**
 * Static, themed field of a ball mini-game (doc 107 §évolution graphique): floors with their
 * platform sides and access ramps, markings, walls in the theme's border style, goal nets,
 * decoration, flags and score boards — all painted into one vertex-coloured mesh (plus one
 * transparent mesh for nets). Built once per loaded instance, from the SAME data as the
 * physics (floor regions, static boxes). Animated parts are returned as anchors.
 */
import {MINIGAME_VARIANTS,type FloorMaterial} from '../catalog.ts';
import {areaToWorld,type MiniGameElementV1} from '../schema.ts';
import {themeForGround,type MiniGameBorder,type MiniGamePropId,type MiniGameThemeId} from '../themes.ts';
import {MINIGAME_THEMES,type MiniGameTheme} from '../theme-palettes.ts';
import type {MiniGameFxTier,MiniGameViewContext} from '../types.ts';
import type {StaticBox} from './ball-physics.ts';
import {shapeOffset,type FloorRegion} from './floors.ts';
import type {BallGame} from './kit.ts';
import {Painter,shade,type V3} from '../fx/painter.ts';
import {emptyAnchors,paintBorder,paintProp,type PropAnchors} from '../fx/props.ts';
import {paintScoreboard,type ScoreboardPlacement} from '../fx/scoreboard.ts';

export const FLAG_COLORS=[0xe2453c,0xf2c94c,0x3f7fd8,0x9b51e0,0xf2994a,0x27ae60];
/** Floor palette: two alternating tones (stripes / planks) and the platform side. */
const FLOOR:Record<FloorMaterial,{a:number;b:number;side:number;stripe:number;across:boolean}>={
  pitch:{a:0x4f9a3e,b:0x5aa847,side:0x6b4f33,stripe:2,across:false},
  lane:{a:0xdcb784,b:0xd0a873,side:0x5b3d26,stripe:.12,across:true},
  gutter:{a:0x4a4f57,b:0x50555e,side:0x3a3e44,stripe:9,across:false},
  green:{a:0x46b553,b:0x3ea64b,side:0x7a5536,stripe:.5,across:false},
  sand:{a:0xe2cf9b,b:0xd9c48d,side:0xb89f6a,stripe:9,across:false},
};
/** Dust colour of a floor (balls rolling or bouncing on it). */
export const floorDust=(m:FloorMaterial|undefined,theme:MiniGameTheme)=>m==='sand'?shade(theme.floor?.sand?.[0]??FLOOR.sand.a,1.05):m==='pitch'?0xb7c48a:m==='green'?0xa8d08d:0xe8dcc6;
const WHITE=0xf8f6ee;
/** Resolved presentation choices of an instance. */
export interface FieldLook {themeId:MiniGameThemeId;theme:MiniGameTheme;border:MiniGameBorder;tier:MiniGameFxTier;
  /** Decoration level after the graphic tier: 0 essential, 1 standard, 2 detailed. */decor:0|1|2;flags:boolean;scoreboard:boolean;effects:boolean;bright:boolean;}
export function resolveLook(game:BallGame,ctx:MiniGameViewContext):FieldLook{
  const style=game.def.style??{},tier=ctx.tier?.()??'high',a=game.def.area;
  const themeId=style.theme&&style.theme!=='auto'?style.theme:themeForGround(ctx.ground?.(a.x,a.z)?.biome,ctx.ground?.(a.x,a.z)?.material);
  const theme=MINIGAME_THEMES[themeId],want=style.decor==='none'?0:style.decor==='full'?2:1,cap=tier==='low'?0:tier==='medium'?1:2;
  return {themeId,theme,border:style.border??theme.border,tier,decor:Math.min(want,cap) as 0|1|2,flags:style.flags!==false,scoreboard:style.scoreboard!==false,effects:style.effects!==false,bright:style.balls==='bright'};
}
/** Highest walking / deck height at a world point (decoration stands on ramps and decks). */
const standAt=(game:BallGame,x:number,z:number)=>Math.max(game.env.height(x,z),game.floors.walk(x,z)??-Infinity);

function paintFloor(pt:Painter,game:BallGame,r:FloorRegion,theme:MiniGameTheme){
  const base=FLOOR[r.material],tint=theme.floor?.[r.material as 'pitch'],pal={...base,a:tint?.[0]??base.a,b:tint?.[1]??base.b};
  const hw=r.halfWidth,hl=r.halfLength,shaped=r.shape!=='flat';
  const su=pal.across?pal.stripe:shaped&&r.shape==='bank'?.4:Math.min(1,hw),sv=shaped?.25:Math.min(1,pal.stripe,hl);
  const nu=Math.max(1,Math.ceil(2*hw/su)),nv=Math.max(1,Math.ceil(2*hl/sv));
  const at=(u:number,v:number,dy=0):V3=>{
    const ax=r.x+u*r.cos+v*r.sin,az=r.z-u*r.sin+v*r.cos,w=areaToWorld(game.def.area,ax,az);
    return [w.x,r.level-r.drop+shapeOffset(r.shape,r.slope,u,v,hw,hl)+dy,w.z];
  };
  const U=(i:number)=>-hw+2*hw*i/nu,V=(j:number)=>-hl+2*hl*j/nv;
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
    const band=pal.across?i:Math.floor((V(j)+hl+1e-6)/pal.stripe);
    pt.quad(at(U(i),V(j)),at(U(i+1),V(j)),at(U(i+1),V(j+1)),at(U(i),V(j+1)),band%2?pal.b:pal.a);
  }
  // Platform sides, down to 1 m under the deck (buried where the relief is higher).
  const down=-1,side=r.material==='gutter'?pal.side:theme.side;
  for(let i=0;i<nu;i++){pt.quad(at(U(i+1),-hl,down),at(U(i),-hl,down),at(U(i),-hl),at(U(i+1),-hl),side);pt.quad(at(U(i),hl,down),at(U(i+1),hl,down),at(U(i+1),hl),at(U(i),hl),side);}
  for(let j=0;j<nv;j++){pt.quad(at(-hw,V(j),down),at(-hw,V(j+1),down),at(-hw,V(j+1)),at(-hw,V(j)),side);pt.quad(at(hw,V(j+1),down),at(hw,V(j),down),at(hw,V(j)),at(hw,V(j+1)),side);}
  // Access ramps (the hamster's walking surface around the deck), where the deck stands
  // above the relief. Same formula as Floors.walk along the edge normal.
  const bank=r.material==='sand'?shade(pal.a,.92):theme.bank,A=game.floors.apron;
  const out=(u:number,v:number,nu:number,nv:number):V3=>{
    const e=at(u,v),ax=r.x+(u+nu*A)*r.cos+(v+nv*A)*r.sin,az=r.z-(u+nu*A)*r.sin+(v+nv*A)*r.cos,w=areaToWorld(game.def.area,ax,az);
    return [w.x,Math.min(e[1],game.floors.ground(w.x,w.z)+.02),w.z];
  };
  const ramp=(u0:number,v0:number,u1:number,v1:number,nu:number,nv:number)=>{
    const a=at(u0,v0),b=at(u1,v1),c=out(u1,v1,nu,nv),d=out(u0,v0,nu,nv);
    if(a[1]-d[1]<.04&&b[1]-c[1]<.04)return;pt.quad(a,d,c,b,bank);
  };
  for(let i=0;i<nu;i++){ramp(U(i),-hl,U(i+1),-hl,0,-1);ramp(U(i+1),hl,U(i),hl,0,1);}
  for(let j=0;j<nv;j++){ramp(-hw,V(j+1),-hw,V(j),-1,0);ramp(hw,V(j),hw,V(j+1),1,0);}
}
/** Flat mark on the deck (area frame): a thin strip from a to b. */
function strip(pt:Painter,game:BallGame,a:{x:number;z:number},b:{x:number;z:number},width:number,hex:number,lift=.012){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;
  const w=(x:number,z:number):V3=>{const p=areaToWorld(game.def.area,x,z);return [p.x,game.env.height(p.x,p.z)+lift,p.z];};
  pt.quad(w(a.x-nx,a.z-nz),w(a.x+nx,a.z+nz),w(b.x+nx,b.z+nz),w(b.x-nx,b.z-nz),hex);
}
function ringMark(pt:Painter,game:BallGame,cx:number,cz:number,radius:number,width:number,hex:number,n=24){
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2;strip(pt,game,{x:cx+Math.cos(a)*radius,z:cz+Math.sin(a)*radius},{x:cx+Math.cos(b)*radius,z:cz+Math.sin(b)*radius},width,hex);}
}
function disc(pt:Painter,game:BallGame,cx:number,cz:number,radius:number,hex:number,lift=.014,n=10){
  const w=(x:number,z:number):V3=>{const p=areaToWorld(game.def.area,x,z);return [p.x,game.env.height(p.x,p.z)+lift,p.z];};
  const c=w(cx,cz);for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2;pt.tri(c,w(cx+Math.cos(b)*radius,cz+Math.sin(b)*radius),w(cx+Math.cos(a)*radius,cz+Math.sin(a)*radius),hex);}
}
/** Upright box at an area point (goal posts, flag poles, board legs). */
function pole(pt:Painter,game:BallGame,x:number,z:number,w:number,h:number,hex:number,base?:number){
  const p=areaToWorld(game.def.area,x,z),y=base??game.env.height(p.x,p.z),hd=game.def.area.heading;
  pt.box({cx:p.x,cz:p.z,hx:w/2,hz:w/2,minY:y,maxY:y+h,cos:Math.cos(hd),sin:Math.sin(hd),restitution:0},hex);
}
function arrow(game:BallGame,x:number,z:number):[V3,V3,V3,number]{
  const w=(ax:number,az:number):V3=>{const p=areaToWorld(game.def.area,ax,az);return [p.x,game.env.height(p.x,p.z)+.012,p.z];};
  return [w(x-.06,z),w(x+.06,z),w(x,z+.22),0x7a5230];
}
function markings(pt:Painter,game:BallGame,look:FieldLook,anchors:PropAnchors){
  const def=game.def,{halfWidth:hw,halfLength:hl}=def.area,el=(k:MiniGameElementV1['kind'])=>def.elements.filter(e=>e.kind===k);
  switch(def.variant){
    case 'football':{
      const i=.25,line=(x0:number,z0:number,x1:number,z1:number)=>strip(pt,game,{x:x0,z:z0},{x:x1,z:z1},.09,WHITE);
      line(-hw+i,-hl+i,hw-i,-hl+i);line(hw-i,-hl+i,hw-i,hl-i);line(hw-i,hl-i,-hw+i,hl-i);line(-hw+i,hl-i,-hw+i,-hl+i);line(-hw+i,0,hw-i,0);
      ringMark(pt,game,0,0,Math.min(2.5,hw*.35),.09,WHITE);disc(pt,game,0,0,.12,WHITE);
      for(const g of el('goal')){
        const s=Math.sign(g.z)||1,w=(g.width??4)/2+1.2,d=2,z=s*(hl-i),h=g.height??1.6,gw=(g.width??4)/2;
        line(g.x-w,z-s*d,g.x+w,z-s*d);line(g.x-w,z,g.x-w,z-s*d);line(g.x+w,z,g.x+w,z-s*d);disc(pt,game,g.x,z-s*3.2,.1,WHITE);
        const team=def.teams?.find(t=>t.id===g.teamId)?.color??WHITE;
        for(const side of [-1,1])pole(pt,game,g.x+side*gw,g.z,.12,h,WHITE);
        // Crossbar stripes in the team colour and the goal-mouth mat.
        strip(pt,game,{x:g.x-gw,z:g.z+s*.3},{x:g.x+gw,z:g.z+s*.3},.5,team,.02);
      }
      // Corner flags inside the pitch (the classic corner marks).
      if(look.flags)for(const [cx,cz] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=areaToWorld(def.area,cx*(hw-.35),cz*(hl-.35)),y=game.env.height(p.x,p.z);
        pt.prism(p.x,y,p.z,.025,.02,1.1,5,WHITE);anchors.flags.push({x:p.x,y:y+1.1,z:p.z,yaw:def.area.heading,color:look.theme.flags[0],size:.7});}
      break;
    }
    case 'bowling':{
      const tee=el('tee')[0],lw=hw-.35;
      strip(pt,game,{x:-lw,z:tee.z+1},{x:lw,z:tee.z+1},.05,0x2b2b2b);
      for(let k=-2;k<=2;k++){const x=k*lw/3,z=tee.z+4;pt.tri(...arrow(game,x,z));}
      for(let k=-3;k<=3;k++)disc(pt,game,k*lw/4,tee.z+2,.03,0x5b3d26,.013,5); // Approach dots.
      for(const pin of el('pin'))disc(pt,game,pin.x,pin.z,.09,0x9c7b52);
      disc(pt,game,tee.x,tee.z,.08,0x2b2b2b);
      // Pin deck back: a dark pit wall drawn over the far wall line.
      strip(pt,game,{x:-hw,z:hl-.15},{x:hw,z:hl-.15},.3,0x2b2b2b,.013);
      break;
    }
    case 'minigolf':{
      const holes=el('hole'),tees=el('tee');
      holes.forEach((h,k)=>{
        const stage=h.stage??k,flag=FLAG_COLORS[stage%FLAG_COLORS.length];
        disc(pt,game,h.x,h.z,.15,0x161412,.016,12);ringMark(pt,game,h.x,h.z,.16,.025,WHITE,12);
        const p=areaToWorld(def.area,h.x+.1,h.z),y=game.env.height(p.x,p.z);
        pt.prism(p.x,y,p.z,.015,.012,1.1,4,WHITE);anchors.flags.push({x:p.x,y:y+1.1,z:p.z,yaw:def.area.heading,color:flag,size:.55});
      });
      for(const t of tees){
        const lane=def.elements.find(e=>e.kind==='lane'&&e.stage===t.stage),yaw=lane?.yaw??0,c=Math.cos(yaw),s=Math.sin(yaw);
        const half=(u:number,v:number)=>({x:t.x+u*c+v*s,z:t.z-u*s+v*c});
        strip(pt,game,half(-.55,0),half(.55,0),.5,0x2f8a3c,.013);
        disc(pt,game,t.x,t.z,.05,WHITE,.016,8);
        // Hole number as pips on the tee mat (1…9) and a numbered post beside the lane.
        const k=t.stage??0,col=FLAG_COLORS[k%FLAG_COLORS.length];
        for(let n=0;n<=k;n++){const p=half(-.45+n*.12,-.15);disc(pt,game,p.x,p.z,.035,col,.017,6);}
        if(lane){const sp=half(-((lane.width??1.6)/2+.45),-.2),w=areaToWorld(def.area,sp.x,sp.z),y=standAt(game,w.x,w.z);
          pt.prism(w.x,y,w.z,.04,.04,.75,5,0x5b3d26);
          for(let n=0;n<=k;n++)pt.block(w.x,y+.78+n*.09,w.z,.18,.06,.06,def.area.heading+yaw,col,WHITE);}
      }
      break;
    }
    default:{ // Throwing games: a white throw line and the stand of each board.
      const tee=el('tee')[0];strip(pt,game,{x:-.8,z:tee.z+.25},{x:.8,z:tee.z+.25},.07,WHITE);
      for(let k=-3;k<=3;k++)disc(pt,game,k*.25,tee.z+.25,.02,0x2b2b2b,.014,4);
      for(const e of el('target'))if(MINIGAME_VARIANTS[def.variant].visual?.board){
        const half=(e.width??1.2)/2;for(const side of [-1,1])pole(pt,game,e.x+side*half*.7,e.z+.08,.08,(e.height??1)-half+.05,0x5b3d26);
        pole(pt,game,e.x,e.z+.4,.06,(e.height??1)-.1,0x5b3d26); // Rear strut.
      }
    }
  }
}
const CHIP_BY_BORDER:Record<MiniGameBorder,'wood'|'stone'|'water'>={boards:'wood',wood:'wood',logs:'wood',rope:'wood',stone:'stone',snowbank:'water',basalt:'stone',planks:'wood'};
/** Chip colour of a contact against a static box (shared impact chips). */
export function chipFor(game:BallGame,look:FieldLook,b:StaticBox|undefined):'wood'|'stone'|'iron'|'water'|null{
  switch(b?.tag??'obstacle'){
    case 'wall':return CHIP_BY_BORDER[look.border];
    case 'post':return 'iron';
    case 'net':return null;
    case 'obstacle':return MINIGAME_VARIANTS[game.def.variant].family==='target'?'wood':'stone';
    default:return 'wood';
  }
}
function boxColor(game:BallGame,b:StaticBox){
  switch(b.tag??'obstacle'){
    case 'obstacle':return MINIGAME_VARIANTS[game.def.variant].family==='target'?0xc0392b:0xb9ae98; // Table cloth / stone block.
    case 'net':case 'post':return 0xffffff;
    case 'bumper':return 0xf2c94c;
    case 'board':return 0x6b4a2f;
    default:return 0xb9ae98;
  }
}
/** Paints one box the ball collides with (walls in the border style). */
export function paintBox(pt:Painter,nets:Painter,game:BallGame,look:FieldLook,b:StaticBox){
  if(b.tag==='prop')return; // Drawn by its decor element.
  if(b.tag==='wall')return paintBorder(pt,b,look.border,look.theme);
  if(b.tag==='net')return nets.box(b,0xffffff);
  if(b.tag==='obstacle'&&MINIGAME_VARIANTS[game.def.variant].family==='target'){ // Checked table cloth down to the ground.
    const n=6,w=2*b.hx,hd=b.hz*2;for(let k=0;k<n;k++){const u=-b.hx+w*(k+.5)/n;pt.box({...b,cx:b.cx+u*b.cos,cz:b.cz-u*b.sin,hx:w/n/2,hz:hd/2},k%2?0xc0392b:0xf8f4e8);}
    return;
  }
  pt.box(b,boxColor(game,b),b.tag==='bumper'?0xffe08a:undefined);
}
/** Automatic decoration around the field and theme flags (deterministic per instance id). */
function decorate(pt:Painter,game:BallGame,look:FieldLook,anchors:PropAnchors){
  const def=game.def,{halfWidth:hw,halfLength:hl,heading}=def.area,d=game.floors.apron+.9;
  let h=2166136261;for(const ch of def.id)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  const pick=(k:number)=>look.theme.decor[(h+k*2654435761>>>0)%look.theme.decor.length];
  const place=(id:MiniGamePropId,lx:number,lz:number,localYaw:number,size=1)=>{const p=areaToWorld(def.area,lx,lz);paintProp(pt,id,p.x,standAt(game,p.x,p.z),p.z,heading+localYaw,look.theme,anchors,size);};
  if(look.flags){
    // Pennants at the four outer corners; a garland along the far side.
    for(const [cx,cz] of [[-1,-1],[1,-1],[1,1],[-1,1]])place('flag',cx*(hw+d*.6),cz*(hl+d*.6),0);
    if(look.decor>=1)place('bunting',0,hl+d,0,Math.min(1.6,hw/2));
  }
  if(look.decor===0)return;
  const spacing=look.decor===2?3.2:6.5,gates=def.variant==='football';let k=0;
  for(const side of [-1,1]){
    for(let z=-hl+spacing/2;z<=hl-spacing/2+1e-6;z+=spacing){if(gates&&Math.abs(z)<2.2)continue;place(pick(k++),side*(hw+d),z,side<0?Math.PI/2:-Math.PI/2);}
    for(let x=-hw+spacing/2;x<=hw-spacing/2+1e-6;x+=spacing){if(Math.abs(x)<3&&(def.variant==='football'||side>0))continue;place(pick(k++),x,side*(hl+d),side<0?0:Math.PI);}
  }
}
/** Score boards: authored elements, else one automatic board beside the field. */
export function scoreboardPlacements(game:BallGame,look:FieldLook):ScoreboardPlacement[]{
  if(!look.scoreboard)return [];
  const def=game.def,{halfWidth:hw,halfLength:hl,heading}=def.area,authored=def.elements.filter(e=>e.kind==='scoreboard');
  const make=(lx:number,lz:number,localYaw:number,kind:'wood'|'stone')=>{const p=areaToWorld(def.area,lx,lz);return {x:p.x,y:standAt(game,p.x,p.z),z:p.z,yaw:heading+localYaw,kind};};
  if(authored.length)return authored.map(e=>make(e.x,e.z,e.yaw??0,(e.prop==='stone'||e.prop==='wood')?e.prop:look.theme.scoreboard));
  // Facing the field (+v towards the centre), on the left side, away from the gates.
  return [make(-hw-game.floors.apron-1.2,def.variant==='football'?hl*.5:-hl*.3,Math.PI/2,look.theme.scoreboard)];
}
export interface PaintedField {solid:Painter;nets:Painter;anchors:PropAnchors;boards:ScoreboardPlacement[];
  /** Where the activity name sign stands (approach side), facing outwards. */sign:{x:number;y:number;z:number;yaw:number}}
export function paintField(game:BallGame,look:FieldLook):PaintedField{
  const pt=new Painter(),nets=new Painter(),anchors=emptyAnchors(),def=game.def;
  for(const r of game.floors.regions)paintFloor(pt,game,r,look.theme);
  markings(pt,game,look,anchors);
  for(const b of game.baseBoxes)paintBox(pt,nets,game,look,b);
  decorate(pt,game,look,anchors);
  for(const e of def.elements)if(e.kind==='decor'&&e.prop){const p=areaToWorld(def.area,e.x,e.z);paintProp(pt,e.prop as MiniGamePropId,p.x,standAt(game,p.x,p.z),p.z,def.area.heading+(e.yaw??0),look.theme,anchors);}
  const boards=scoreboardPlacements(game,look);for(const b of boards)paintScoreboard(pt,b,look.theme);
  // Name sign at the approach side (near end), on two posts.
  const {halfLength:hl,heading}=def.area,sp=areaToWorld(def.area,0,-hl-game.floors.apron-1.1),sy=standAt(game,sp.x,sp.z),c=Math.cos(heading),s=Math.sin(heading);
  for(const u of [-.95,.95])pt.prism(sp.x+u*c,sy,sp.z-u*s,.05,.05,1.35,5,0x5b3d26);
  pt.block(sp.x,sy+1.02,sp.z,2.1,.55,.06,heading,look.theme.scoreboard==='stone'?0x8f8a80:0x9a6b3c,look.theme.cap);
  return {solid:pt,nets,anchors,boards,sign:{x:sp.x-s*.04,y:sy+1.3,z:sp.z-c*.04,yaw:heading+Math.PI}};
}
