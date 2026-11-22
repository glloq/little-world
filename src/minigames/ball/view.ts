/**
 * Low-poly presentation of ball mini-games (separate chunk, browser only). Reads the
 * simulation, never writes it (doc 107 §évolution graphique):
 *  - static themed field (field.ts): ONE vertex-coloured mesh + one transparent net mesh;
 *  - balls: per-variant skins, rolling spin computed from the displacement, blob shadows,
 *    cartoon squash on strong impacts — all in one InstancedMesh each;
 *  - pins / cans: wobble on light hits, animated fall once counted down;
 *  - contacts of the last physics step and session events drive the shared effect pool
 *    (impact rings, chips, dust, trails, success bursts) and semantic sounds;
 *  - score boards (7-segment instances), waving flags and windmill sails while the field is
 *    in use, the activity name sign while the player is around.
 * Nothing here runs for an activity that is not loaded; animations only run while needed.
 */
import * as THREE from 'three';
import {MINIGAME_VARIANTS} from '../catalog.ts';
import {areaToWorld} from '../schema.ts';
import type {MiniGameEvent,MiniGameSessionState} from '../session.ts';
import type {MiniGameAimLine,MiniGameEffectsLike,MiniGameEnvironment,MiniGameFieldState,MiniGameSimulation,MiniGameSoundId,MiniGameView,MiniGameViewContext,MiniGameViewFactory} from '../types.ts';
import {HIT,type StaticBox} from './ball-physics.ts';
import {ballGameOf,ballWorldOf} from './simulation.ts';
import type {BallGame} from './kit.ts';
import {chipFor,floorDust,paintBox,paintField,resolveLook,type FieldLook} from './field.ts';
import {Painter} from '../fx/painter.ts';
import {ballGeometry,canGeometry,pinGeometry,type BallSkin} from '../fx/balls.ts';
import {ScoreboardDigits} from '../fx/scoreboard.ts';
import {MiniGameVisualEffects} from '../fx/effects.ts';
import {flatQuad} from '../fx/geometry.ts';

interface SharedResources {unlit:THREE.Material;shadow:THREE.BufferGeometry;shadowMaterial:THREE.Material;
  skin:THREE.Material;painted:THREE.Material;net:THREE.Material;dot:THREE.BufferGeometry;pennant:THREE.BufferGeometry;sail:THREE.BufferGeometry;flat:THREE.Material}
let shared:SharedResources|null=null;
function resources():SharedResources{
  if(shared)return shared;
  // Pennant: a triangle hanging from the pole top along +x (rotated per instance).
  const pennant=new THREE.BufferGeometry();pennant.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.5,-.14,0,0,-.28,0],3));pennant.computeVertexNormals();
  const sailParts=[0,1,2,3].map(k=>{const g=new THREE.BoxGeometry(.12,.62,.02);g.translate(0,.36,0);g.rotateZ(k*Math.PI/2);return g;});
  const sail=new THREE.BufferGeometry();{const pos:number[]=[];for(const g of sailParts){const ng=g.toNonIndexed();pos.push(...ng.attributes.position.array as Float32Array);ng.dispose();g.dispose();}sail.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sail.computeVertexNormals();}
  shared={unlit:new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}),
    shadow:new THREE.CircleGeometry(1,10).rotateX(-Math.PI/2),shadowMaterial:new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.26,depthWrite:false}),
    skin:new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true}),
    painted:new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide}), // Generated faces: winding-independent.
    net:new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}),
    dot:new THREE.IcosahedronGeometry(1,0),pennant,sail,flat:new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true,side:THREE.DoubleSide})};
  return shared;
}
const SKIN:Record<string,BallSkin>={football:'football',bowling:'bowling',minigolf:'golf',cans:'beanbag',bullseye:'dart'};
const GOLF_COLORS=[0xffffff,0xf2c94c,0x56ccf2,0xeb5757],GOLF_BRIGHT=[0xff6b6b,0xffd93d,0x4dd2ff,0xa66bff];
const tmp=new THREE.Matrix4(),rot=new THREE.Matrix4(),q=new THREE.Quaternion(),q2=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),axis=new THREE.Vector3(),color=new THREE.Color(),up=new THREE.Vector3(0,1,0);
const zeroMatrix=new THREE.Matrix4().makeScale(0,0,0);
/** Seconds of the presentation-only animations. */
export const VIEW_TIMING={squash:.16,wobble:.5,fall:.28,boardWobble:.6,finished:4} as const;

/** Score board values: teams (football), else the local player's score and round / hole. */
export function scoreboardValues(game:BallGame,session:MiniGameSessionState|null,local:string):[number|null,number|null]{
  if(!session||session.status==='ready')return [null,null];
  const teams=game.def.teams??[];
  if(teams.length>=2)return [session.scores[teams[0].id]??0,session.scores[teams[1].id]??0];
  const who=session.players.some(p=>p.id===local)?local:session.players[0]?.id;if(!who)return [null,null];
  if(game.def.variant==='minigolf')return [session.scores[who]??0,((game.state as {stage?:Record<string,number>}).stage?.[who]??0)+1];
  return [session.scores[who]??0,Math.min(99,Math.floor(session.round/Math.max(1,session.players.length))+1)];
}

function create(parent:unknown,sim:MiniGameSimulation,_env:MiniGameEnvironment,ctx:MiniGameViewContext={}):MiniGameView{
  const root=parent as THREE.Object3D,res=resources(),world=ballWorldOf(sim),game=ballGameOf(sim),def=sim.def,spec=MINIGAME_VARIANTS[def.variant];
  const look:FieldLook=resolveLook(game,ctx),fx:MiniGameEffectsLike|null=look.effects?ctx.fx??null:null;
  const group=new THREE.Group();group.name='MiniGame:'+def.id;root.add(group);
  const owned:{dispose():void}[]=[];
  // Static field: floors, markings, walls, decoration, boards (one mesh) + nets.
  const field=paintField(game,look);
  for(const [p,m] of [[field.solid,res.painted],[field.nets,res.net]] as const){const g=p.geometry();if(g){const mesh=new THREE.Mesh(g,m);mesh.name=m===res.net?'nets':'field';group.add(mesh);owned.push(g);}}
  // Mode-dependent boxes (bowling bumpers): rebuilt only when the box list changes.
  let extraBoxes:StaticBox[]|null=null,extra:THREE.Mesh|null=null;
  const syncExtra=()=>{
    if(world.boxes===extraBoxes)return;extraBoxes=world.boxes;
    if(extra){group.remove(extra);extra.geometry.dispose();extra=null;}
    const more=world.boxes.filter(b=>!game.baseBoxes.includes(b));if(!more.length)return;
    const pt=new Painter(),nets=new Painter();for(const b of more)paintBox(pt,nets,game,look,b);
    const g=pt.geometry();if(g){extra=new THREE.Mesh(g,res.painted);extra.name='mode-boxes';group.add(extra);}
  };
  // Dynamic objects: balls (skinned) with blob shadows, uprights (pins / cans).
  const visual=spec.visual??{},upright=visual.upright??'pin',pinIndex:number[]=[],ballIndex:number[]=[];
  const uprightIds=new Set(def.elements.filter(e=>e.kind==='pin'||(e.kind==='target'&&!visual.board)).map(e=>e.id));
  for(let i=0;i<world.count;i++)(uprightIds.has(world.ids[i])?pinIndex:ballIndex).push(i);
  const balls=new THREE.InstancedMesh(ballGeometry(SKIN[def.variant]??'golf'),res.skin,Math.max(1,ballIndex.length));balls.frustumCulled=false;balls.name='balls';group.add(balls);owned.push(balls);
  const ballColor=(k:number)=>visual.playerColors?(look.bright?GOLF_BRIGHT:GOLF_COLORS)[k%4]:look.bright?(def.variant==='football'?0xffb347:0xff6b6b):visual.ballColor??0xffffff;
  ballIndex.forEach((_,k)=>balls.setColorAt(k,color.setHex(ballColor(k))));
  const shadows=new THREE.InstancedMesh(res.shadow,res.shadowMaterial,Math.max(1,ballIndex.length));shadows.frustumCulled=false;shadows.renderOrder=1;shadows.name='ball-shadows';group.add(shadows);owned.push(shadows);
  const pins=pinIndex.length?new THREE.InstancedMesh(upright==='can'?canGeometry():pinGeometry(),res.skin,pinIndex.length):null;
  if(pins){pins.frustumCulled=false;pins.name='uprights';group.add(pins);owned.push(pins);
    pinIndex.forEach((_,k)=>pins.setColorAt(k,color.setHex(upright==='can'?[0xd8503f,0x3f7fd8,0xf2c94c,0x6fcf97][k%4]:0xf6f1e4)));}
  // Target boards: rings on the face turned towards the thrower, in a group that wobbles.
  const boards=new Map<string,{group:THREE.Group;wobble:number}>();
  if(visual.board)for(const e of def.elements)if(e.kind==='target'){
    const half=(e.width??1.2)/2,p=areaToWorld(def.area,e.x,e.z-.06),y=game.env.height(p.x,p.z)+(e.height??1),g=new THREE.Group();g.position.set(p.x,y,p.z);g.rotation.y=def.area.heading+Math.PI;
    // Five scoring rings in ONE vertex-coloured disc (centre gold), facing the thrower.
    const palette=look.theme.bright?[0xc0392b,0x1f2326]:[0xd8503f,0xf8f4e8],pt=new Painter(),n=20;
    for(let k=0;k<5;k++){const r0=half*(4-k)/5,r1=half*(5-k)/5,c=k===4?0xf2c94c:palette[k%2];
      for(let j=0;j<n;j++){const a=j/n*Math.PI*2,b=(j+1)/n*Math.PI*2;pt.quad([Math.cos(a)*r0,Math.sin(a)*r0,0],[Math.cos(a)*r1,Math.sin(a)*r1,0],[Math.cos(b)*r1,Math.sin(b)*r1,0],[Math.cos(b)*r0,Math.sin(b)*r0,0],c);}}
    const geo=pt.geometry()!,mesh=new THREE.Mesh(geo,res.unlit);mesh.name='target-rings';g.add(mesh);owned.push(geo);
    group.add(g);boards.set(e.id,{group:g,wobble:0});
  }
  // Score boards and the name sign.
  const digits=field.boards.length?new ScoreboardDigits(group,field.boards):null;if(digits)owned.push(digits);
  let sign:THREE.Mesh|null=null;
  if(typeof document!=='undefined'&&typeof document.createElement==='function'){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c2=canvas.getContext('2d');
    if(c2){c2.fillStyle='#f6ecd6';c2.fillRect(0,0,256,64);c2.strokeStyle='#5b3d26';c2.lineWidth=6;c2.strokeRect(3,3,250,58);
      c2.fillStyle='#3b2a1a';c2.font='bold 26px system-ui,sans-serif';c2.textAlign='center';c2.textBaseline='middle';c2.fillText(def.name.slice(0,22),128,33);
      const tex=new THREE.Texture(canvas);tex.needsUpdate=true;const mat=new THREE.MeshBasicMaterial({map:tex}),geo=flatQuad(1.9,.475);
      sign=new THREE.Mesh(geo,mat);sign.position.set(field.sign.x,field.sign.y,field.sign.z);sign.rotation.y=field.sign.yaw;sign.visible=false;sign.name='name-sign';group.add(sign);owned.push(tex,mat,geo);}
  }
  // Animated decoration: pennants and windmill sails (instances; only rewritten while animated).
  const flagMesh=field.anchors.flags.length?new THREE.InstancedMesh(res.pennant,res.flat,field.anchors.flags.length):null;
  if(flagMesh){flagMesh.frustumCulled=false;flagMesh.name='flags';group.add(flagMesh);owned.push(flagMesh);field.anchors.flags.forEach((f,k)=>flagMesh.setColorAt(k,color.setHex(f.color)));}
  const sailMesh=field.anchors.sails.length?new THREE.InstancedMesh(res.sail,res.flat,field.anchors.sails.length):null;
  if(sailMesh){sailMesh.frustumCulled=false;sailMesh.name='sails';group.add(sailMesh);owned.push(sailMesh);field.anchors.sails.forEach((_,k)=>sailMesh.setColorAt(k,color.setHex(0xf4efe2)));}
  let animTime=0,animatedOnce=false;
  const animate=(dt:number)=>{
    const moving=(state==='active'||state==='finished'||state==='ready')&&look.tier!=='low';
    if(!moving&&animatedOnce)return;animTime+=moving?dt:0;animatedOnce=true;
    const wave=state==='active'||state==='finished'?1:.4;
    field.anchors.flags.forEach((f,k)=>{q.setFromAxisAngle(up,f.yaw+Math.sin(animTime*(3+k%3)+k*1.7)*.35*wave);pos.set(f.x,f.y,f.z);scale.setScalar(f.size);tmp.compose(pos,q,scale);flagMesh!.setMatrixAt(k,tmp);});
    if(flagMesh)flagMesh.instanceMatrix.needsUpdate=true;
    field.anchors.sails.forEach((s,k)=>{q.setFromAxisAngle(up,s.yaw);q2.setFromAxisAngle(axis.set(0,0,1),animTime*1.6);q.multiply(q2);pos.set(s.x,s.y,s.z);scale.setScalar(s.size);tmp.compose(pos,q,scale);sailMesh!.setMatrixAt(k,tmp);});
    if(sailMesh)sailMesh.instanceMatrix.needsUpdate=true;
  };
  // Per-ball presentation state (fixed arrays, no allocation per frame).
  const nb=ballIndex.length,spin=Array.from({length:nb},()=>new THREE.Quaternion()),last=new Float64Array(nb*3).fill(NaN);
  const spinAxis=new Float32Array(nb*3),spinRate=new Float32Array(nb),squash=new Float32Array(nb),trailT=new Float32Array(nb),dustT=new Float32Array(nb);
  const np=pinIndex.length,wobble=new Float32Array(np),wobbleAxis=new Float32Array(np),fall=new Float32Array(np);
  const homes=new Map(def.elements.map(e=>[e.id,areaToWorld(def.area,e.x,e.z)]));
  const slot=new Map<number,{ball:number}|{pin:number}>();ballIndex.forEach((i,k)=>slot.set(i,{ball:k}));pinIndex.forEach((i,k)=>slot.set(i,{pin:k}));
  const floorAt=(x:number,z:number)=>{const l=game.floors.regions;if(!l.length)return undefined;return l.length===1?l[0].material:game.floors.sample(x,z)===null?undefined:l.find(r=>{const a=areaToWorld(def.area,r.x,r.z);return Math.hypot(a.x-x,a.z-z)<Math.hypot(r.halfWidth,r.halfLength);})?.material;};
  const lastSound=new Map<string,number>();let clock=0;
  const sound=(id:MiniGameSoundId,x:number,y:number,z:number,intensity:number,gap=.07)=>{if(!ctx.sound)return;const t=lastSound.get(id)??-1;if(clock-t<gap)return;lastSound.set(id,clock);ctx.sound(id,x,y,z,intensity);};
  let lastSteps=world.steps,state:MiniGameFieldState='inactive',finishedFor=0;
  /** Contacts of the latest physics step → impacts, chips, dust, squash, wobble, sounds. */
  function contacts(){
    for(let i=0;i<world.count;i++){
      const s=world.hitSpeed[i];if(!world.enabled[i]||s<.25)continue;
      const kind=world.hitKind[i],sl=slot.get(i)!,r=world.radius[i],x=world.px[i],y=world.py[i],z=world.pz[i];
      if('pin' in sl){ if(!((game.state as {knocked?:number[]}).knocked??[]).includes(i)){wobble[sl.pin]=VIEW_TIMING.wobble;wobbleAxis[sl.pin]=Math.atan2(world.vx[i],world.vz[i]);}
        if(kind===HIT.ball&&s>1.2){const j=world.hitBox[i],other=slot.get(j);if(!other||'ball' in other||j<i)continue; // Ball↔pin: by the ball; pin↔pin: once.
          fx?.impact(x,y,z,s,upright==='can'?'iron':'wood');sound(upright==='can'?'hit.metal':'pins',x,y,z,Math.min(1,s/6));}
        continue;}
      if(s<1.2)continue;const k=sl.ball;
      if(fx?.quality.squash&&s>3)squash[k]=VIEW_TIMING.squash*Math.min(1,(s-2)/6);
      switch(kind){
        case HIT.ground:{fx?.impact(x,y-r+.02,z,s,null);const m=floorAt(x,z);if(s>2.5&&fx&&(m==='sand'||m==='pitch'))fx.dust(x,y-r,z,floorDust(m,look.theme),1);sound('ball.bounce',x,y,z,Math.min(1,s/8));break;}
        case HIT.box:case HIT.shared:{const b=kind===HIT.box?world.boxes[world.hitBox[i]]:undefined,chip=kind===HIT.box?chipFor(game,look,b):'stone';
          fx?.impact(x,y,z,s,chip);sound(b?.tag==='post'?'hit.metal':chip==='stone'?'hit.stone':'hit.wood',x,y,z,Math.min(1,s/8));break;}
        case HIT.ball:{const j=world.hitBox[i],other=slot.get(j);if(other&&'ball' in other&&j<i)break; // One effect per pair.
          if(other&&'pin' in other){fx?.impact((x+world.px[j])/2,(y+world.py[j])/2,(z+world.pz[j])/2,s,upright==='can'?'iron':'wood');sound(upright==='can'?'hit.metal':'pins',x,y,z,Math.min(1,s/6));}
          else{fx?.impact((x+world.px[j])/2,(y+world.py[j])/2,(z+world.pz[j])/2,s,null);sound('hit.ball',x,y,z,Math.min(1,s/8));}break;}
      }
    }
  }
  const elementAt=(id:string|undefined,lift=0)=>{const e=def.elements.find(x=>x.id===id);if(!e)return null;const p=areaToWorld(def.area,e.x,e.z);return {x:p.x,y:game.env.height(p.x,p.z)+(e.kind==='target'?(e.height??1):lift),z:p.z};};
  const centre=()=>{const p=areaToWorld(def.area,0,0);return {x:p.x,y:game.env.height(p.x,p.z)+.5,z:p.z};};
  const local={id:''};
  function refreshBoard(session:MiniGameSessionState|null){if(!digits)return;const [a,b]=scoreboardValues(game,session,local.id);digits.set(a,b);}
  function update(alpha:number,dt=1/30){
    clock+=dt;syncExtra();
    if(world.steps!==lastSteps){lastSteps=world.steps;contacts();}
    if(finishedFor>0&&(finishedFor-=dt)<=0&&state==='finished')state='ready';
    const Q=fx?.quality;
    for(let k=0;k<nb;k++){
      const i=ballIndex[k],r=world.radius[i],on=world.enabled[i]===1;
      if(!on){balls.setMatrixAt(k,zeroMatrix);shadows.setMatrixAt(k,zeroMatrix);last[k*3]=NaN;continue;}
      pos.set(world.ox[i]+(world.px[i]-world.ox[i])*alpha,world.oy[i]+(world.py[i]-world.oy[i])*alpha,world.oz[i]+(world.pz[i]-world.oz[i])*alpha);
      const ground=game.env.height(pos.x,pos.z),h=Math.max(0,pos.y-r-ground);
      // Rolling spin from the displacement (presentation only, never fed back).
      const lx=last[k*3],dx=pos.x-lx,dz=pos.z-last[k*3+2],d=Math.hypot(dx,dz);
      if(Number.isFinite(lx)&&d>1e-5&&d<2){
        if(h<.04){axis.set(dz/d,0,-dx/d);q2.setFromAxisAngle(axis,d/r);spin[k].premultiply(q2);spinAxis.set([axis.x,0,axis.z],k*3);spinRate[k]=d/r/Math.max(1e-3,dt);}
        else if(spinRate[k]>0){axis.set(spinAxis[k*3],0,spinAxis[k*3+2]);q2.setFromAxisAngle(axis,spinRate[k]*dt);spin[k].premultiply(q2);spinRate[k]*=Math.max(0,1-dt*.6);}
      }else if(d>=2)spinRate[k]=0; // Teleport (reset, out of bounds): no spin jump.
      last[k*3]=pos.x;last[k*3+1]=pos.y;last[k*3+2]=pos.z;
      // Squash & stretch in world space (Y), independent of the spin.
      let sy=1,sxz=1;if(squash[k]>0){const e=squash[k]/VIEW_TIMING.squash;sy=1-.22*e;sxz=1+.12*e;squash[k]=Math.max(0,squash[k]-dt);}
      rot.makeRotationFromQuaternion(spin[k]);tmp.makeScale(r*sxz,r*sy,r*sxz);rot.premultiply(tmp);rot.setPosition(pos.x,pos.y-(1-sy)*r,pos.z);balls.setMatrixAt(k,rot);
      // Blob shadow: smaller as the ball rises (height read at a glance).
      const sh=r*1.15*(1-Math.min(.6,h/4));pos.y=ground+.018;scale.set(sh,1,sh);tmp.compose(pos,q.identity(),scale);shadows.setMatrixAt(k,tmp);
      if(fx&&Q){
        const v=world.speed(i);
        if(Q.trails&&v>6&&(trailT[k]+=dt)>.03){trailT[k]=0;fx.trail(pos.x,ground+r+h,pos.z,r*.8,ballColor(k));}
        if(Q.dust&&h<.05&&v>3.5&&(dustT[k]+=dt)>.12){dustT[k]=0;const m=floorAt(pos.x,pos.z);if(m==='sand'||m==='pitch')fx.dust(pos.x,ground,pos.z,floorDust(m,look.theme),.6);}
      }
    }
    balls.instanceMatrix.needsUpdate=true;shadows.instanceMatrix.needsUpdate=true;
    if(pins){
      const knocked=(game.state as {knocked?:number[]}).knocked??[];
      for(let k=0;k<np;k++){
        const i=pinIndex[k],on=world.enabled[i]===1,home=homes.get(world.ids[i])!;
        if(!on){pins.setMatrixAt(k,zeroMatrix);fall[k]=0;continue;}
        pos.set(world.px[i],upright==='can'?world.py[i]:world.py[i]-world.radius[i],world.pz[i]);
        if(knocked.includes(i)){ // Animated fall along the displacement once the rules count it down.
          fall[k]=Math.min(1,fall[k]+dt/VIEW_TIMING.fall);const dx=world.px[i]-home.x,dz=world.pz[i]-home.z,dd=Math.hypot(dx,dz)||1;
          axis.set(dz/dd,0,-dx/dd);q.setFromAxisAngle(axis,Math.min(Math.PI/2,.4+dd*4)*(1-(1-fall[k])**2));
        }else if(wobble[k]>0){fall[k]=0;const e=wobble[k]/VIEW_TIMING.wobble;axis.set(Math.cos(wobbleAxis[k]),0,-Math.sin(wobbleAxis[k]));q.setFromAxisAngle(axis,Math.sin(clock*28)*.16*e);wobble[k]=Math.max(0,wobble[k]-dt);}
        else{fall[k]=0;q.identity();}
        scale.setScalar(1);tmp.compose(pos,q,scale);pins.setMatrixAt(k,tmp);
      }
      pins.instanceMatrix.needsUpdate=true;
    }
    for(const b of boards.values())if(b.wobble>0){b.wobble=Math.max(0,b.wobble-dt);b.group.rotation.x=Math.sin(clock*24)*.09*(b.wobble/VIEW_TIMING.boardWobble);}
    if(flagMesh||sailMesh)animate(dt);
  }
  function onEvent(e:MiniGameEvent,session:MiniGameSessionState|null,localPlayer:string){
    local.id=localPlayer;
    const mine=(id?:string)=>!id||id===localPlayer||(session?.players.find(p=>p.id===localPlayer)?.teamId!==undefined&&session?.players.find(p=>p.id===localPlayer)?.teamId===id);
    switch(e.type){
      case 'game:start':{const c=centre();fx?.success(c.x,c.y,c.z,1,look.theme.flags);sound('start',c.x,c.y,c.z,.6);state='active';break;}
      case 'target:hit':{
        const el=def.elements.find(x=>x.id===e.targetId);if(!el)break;
        if(el.kind==='goal'){const p=elementAt(el.id,.8)!;fx?.success(p.x,p.y,p.z,2,[def.teams?.find(t=>t.id!==el.teamId)?.color??0xf2c94c,...look.theme.flags]);sound('goal',p.x,p.y,p.z,1);}
        else if(el.kind==='hole'){const p=elementAt(el.id,.05)!;fx?.success(p.x,p.y,p.z,2,look.theme.flags);sound('cup',p.x,p.y,p.z,1);}
        else if(el.kind==='target'&&visual.board){const p=elementAt(el.id)!;const b=boards.get(el.id);if(b)b.wobble=VIEW_TIMING.boardWobble;fx?.success(p.x,p.y,p.z,1,look.theme.flags);sound('success',p.x,p.y,p.z,.7);}
        break;
      }
      case 'highlight':{
        const p=elementAt(e.targetId)??(def.variant==='bowling'?(()=>{const pinsAt=def.elements.filter(x=>x.kind==='pin');const a=areaToWorld(def.area,0,pinsAt.reduce((s,x)=>s+x.z,0)/Math.max(1,pinsAt.length));return {x:a.x,y:game.env.height(a.x,a.z)+.4,z:a.z};})():centre());
        fx?.success(p.x,p.y+.2,p.z,e.kind==='hole-in-one'||e.kind==='strike'?3:2,look.theme.flags);sound('success',p.x,p.y,p.z,1);break;
      }
      case 'game:finish':{
        state='finished';finishedFor=VIEW_TIMING.finished;const c=centre(),won=e.winners.some(w=>mine(w));
        if(won){fx?.success(c.x,c.y+.5,c.z,3,look.theme.flags);sound('applause',c.x,c.y,c.z,1);}else{fx?.dust(c.x,c.y,c.z,0xcfcfcf,3);sound(e.winners.length?'fail':'applause',c.x,c.y,c.z,.6);}
        break;
      }
      case 'ball:hit':if(e.shot){const i=world.ids.indexOf(e.ballId);if(i>=0)sound('ball.kick',world.px[i],world.py[i],world.pz[i],Math.min(1,e.speed/10),0);}break;
      case 'game:abandon':state='ready';break;
    }
    refreshBoard(session);
  }
  function setState(s:MiniGameFieldState){
    if(s===state||state==='finished'&&s==='ready'&&finishedFor>0)return;
    state=s;if(sign)sign.visible=s!=='inactive';
  }
  /** Personal record / victory celebration requested by the host. */
  function celebrate(kind:'record'){const c=centre();fx?.success(c.x,c.y+.6,c.z,3,[0xf2c94c,0xffffff,...look.theme.flags]);sound(kind,c.x,c.y,c.z,1,0);}
  refreshBoard(null);update(1,0);
  return {update,onEvent,setState,celebrate,
    dispose(){root.remove(group);for(const o of owned)o.dispose();owned.length=0;if(extra){extra.geometry.dispose();extra=null;}boards.clear();group.clear();},
    /** Test / metrics hook. */get debug(){return {state,look:{theme:look.themeId,border:look.border,tier:look.tier,decor:look.decor},boards:digits?1:0,flags:field.anchors.flags.length,sails:field.anchors.sails.length,signed:!!sign};}} as MiniGameView;
}
/** Dotted trajectory preview (slingshot): ≤ 32 instanced dots and a landing ring, tinted
 * green → red with the power, with a dark under-dot so it reads on snow and sand. */
export const AIM_DOTS=32;
function createAimLine(parent:unknown):MiniGameAimLine{
  const root=parent as THREE.Object3D,res=resources();
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.92,depthWrite:false});
  const outline=new THREE.MeshBasicMaterial({color:0x1f2326,transparent:true,opacity:.45,depthWrite:false});
  const dots=new THREE.InstancedMesh(res.dot,material,AIM_DOTS+1),under=new THREE.InstancedMesh(res.dot,outline,AIM_DOTS+1);
  for(const m of [dots,under]){m.frustumCulled=false;m.visible=false;root.add(m);}
  dots.renderOrder=3;under.renderOrder=2;dots.name='MiniGameAimLine';under.name='MiniGameAimLineOutline';
  return {
    set(points,power){
      if(!points||points.length<6){dots.visible=under.visible=false;return;}
      material.color.setHSL((1-Math.max(0,Math.min(1,power)))*.33,.85,.55);
      const n=points.length/3,step=Math.max(1,Math.ceil(n/AIM_DOTS));let k=0;
      for(let i=step;i<n&&k<AIM_DOTS;i+=step,k++){
        pos.set(points[3*i],points[3*i+1],points[3*i+2]);scale.setScalar(.05);tmp.compose(pos,q.identity(),scale);dots.setMatrixAt(k,tmp);
        scale.setScalar(.075);tmp.compose(pos,q,scale);under.setMatrixAt(k,tmp);
      }
      pos.set(points[3*(n-1)],points[3*(n-1)+1],points[3*(n-1)+2]);scale.set(.16,.03,.16);tmp.compose(pos,q.identity(),scale);dots.setMatrixAt(k,tmp);scale.set(.2,.025,.2);tmp.compose(pos,q,scale);under.setMatrixAt(k++,tmp);
      for(const m of [dots,under]){m.count=k;m.instanceMatrix.needsUpdate=true;m.visible=true;}
    },
    dispose(){for(const m of [dots,under]){root.remove(m);m.dispose();}material.dispose();outline.dispose();},
  };
}
function createEffects(parent:unknown):MiniGameEffectsLike{return new MiniGameVisualEffects(parent as THREE.Object3D);}
export const ballViewFactory:MiniGameViewFactory={create,createAimLine,createEffects};
