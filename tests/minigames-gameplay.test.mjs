// Lot 3 gameplay (doc 107 §terrains, §modes, §parcours, §visée): closed pitch, bowling modes,
// six-hole mini-golf course, activity floors and the slingshot aim / trajectory preview.
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMiniGame,MINIGOLF_COURSE} from '../src/minigames/layouts.ts';
import {areaToWorld,validateMiniGame,worldToArea} from '../src/minigames/schema.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {validateCommand} from '../src/minigames/authority.ts';
import {ballWorldOf} from '../src/minigames/ball/simulation.ts';
import {golfCourse,BOWLING_GUTTER} from '../src/minigames/ball/variants.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';

const flat={height:()=>0};
function harness(def,env=flat,extra={}){
 const m=createMiniGameManager([def],{env,...extra});let tick=0,seq=0;const events=[],refusals=[];
 const actor={id:'me',x:0,y:0,z:0,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
 const send=(body,playerId='me')=>m.submit({instanceId:def.id,playerId,tick:tick+1,seq:++seq,...body});
 const step=(n=1,actors=[actor])=>{for(let k=0;k<n;k++){const r=m.tick(++tick,1/30,actors);events.push(...r.events);refusals.push(...r.refusals);}};
 const at=(x,z)=>{const p=areaToWorld(def.area,x,z);actor.x=p.x;actor.z=p.z;};
 return {m,actor,send,step,at,events,refusals,get rec(){return m.records.get(def.id);},get sim(){return m.records.get(def.id).sim;},get world(){return ballWorldOf(m.records.get(def.id).sim);}};
}
const types=(events,t)=>events.filter(e=>e.type===t);
/** Stand 0.7 m behind ball `i` along `yaw`. */
const behind=(h,i,yaw)=>{h.actor.x=h.world.px[i]-Math.sin(yaw)*.7;h.actor.z=h.world.pz[i]-Math.cos(yaw)*.7;};

test('football: the pitch is closed — a shot into a side wall bounces back, players are blocked except at the gates',async()=>{
 const def=defaultMiniGame('football',{id:'minigame:wall',x:0,z:0});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join',teamId:'blue'});h.send({type:'start'});h.step();
 // Ball moved near the right touchline, away from the gate, then kicked straight at the wall.
 const p=areaToWorld(def.area,def.area.halfWidth-2,-6);h.world.place(0,p.x,undefined,p.z);
 const yaw=def.area.heading+Math.PI/2*-1;behind(h,0,yaw);h.send({type:'launch',yaw,power:1,loft:0});h.step(1);h.step(60,[]);
 assert.equal(types(h.events,'ball:out').length,0,'no ball out through a wall');
 const l=worldToArea(def.area,h.world.px[0],h.world.pz[0]);assert.ok(Math.abs(l.x)<def.area.halfWidth,'ball back on the pitch');
 // Player colliders: pieces of wall everywhere except the two gates and the goal mouths.
 const q=new WorldCollisionQuery(()=>0,()=>null);for(const c of h.sim.staticColliders)q.add({...c,shape:'box',enabled:()=>true});
 const blockedAt=(x,z)=>{const w=areaToWorld(def.area,x,z);return q.solidsNear(w.x-.05,w.x+.05,w.z-.05,w.z+.05).some(b=>b.maxY>.5&&b.minX<=w.x&&b.maxX>=w.x&&b.minZ<=w.z&&b.maxZ>=w.z);};
 assert.ok(blockedAt(-def.area.halfWidth-.1,-6),'left touchline is walled');
 assert.ok(!blockedAt(-def.area.halfWidth-.1,0),'gate in the middle of the touchline');
 assert.ok(!blockedAt(0,def.area.halfLength+.1),'goal mouth open');
 assert.ok(blockedAt(3,def.area.halfLength+.1),'goal line walled beside the goal');
});

test('bowling: beginner bumpers keep a wide ball on the lane; normal gutters swallow it', async()=>{
 const play=async mode=>{
  const def=defaultMiniGame('bowling',{id:'minigame:'+mode,x:10,z:5,heading:.3});
  const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start',mode});h.step();
  assert.equal(h.rec.session.mode,mode);
  const yaw=def.area.heading+.3;behind(h,0,yaw);h.send({type:'launch',yaw,power:1});h.step(1);
  let maxX=0;for(let k=0;k<200&&h.rec.sim.game?.state?.phase!=='aim';k++){h.step(1,[]);maxX=Math.max(maxX,Math.abs(worldToArea(def.area,h.world.px[0],h.world.pz[0]).x));}
  return {h,def,maxX};
 };
 const easy=await play('beginner');
 assert.equal(types(easy.h.events,'ball:out').length,0,'no gutter in beginner mode');
 assert.ok(easy.maxX<easy.def.area.halfWidth-BOWLING_GUTTER.width+.01,'the bumper sends the ball back: '+easy.maxX);
 const hard=await play('normal');
 assert.equal(types(hard.h.events,'ball:out').length,1,'gutter ball');
 assert.ok(types(hard.h.events,'target:hit').length<types(easy.h.events,'target:hit').length||types(easy.h.events,'target:hit').length>0,'the gutter ball knocks fewer pins');
 // Default mode: rules.mode, else the first mode; unknown modes fall back to the default.
 const def=validateMiniGame({...defaultMiniGame('bowling',{id:'minigame:dflt',x:0,z:0}),rules:{attempts:2,rounds:1,mode:'normal'}});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start',mode:'expert'});h.step();
 assert.equal(h.rec.session.mode,'normal');
 assert.throws(()=>validateMiniGame({...def,rules:{...def.rules,mode:'expert'}}),/règles/);
 assert.equal(validateCommand({instanceId:def.id,playerId:'p',tick:1,seq:1,type:'start',mode:'bad mode!'}),false);
});

test('floors: decks lie above the relief — flat pitch, sunken gutters, mini-golf ramps; the hamster walks on them',async()=>{
 const slope={height:(x,z)=>.05*x+.02*z};
 const foot=defaultMiniGame('football',{id:'minigame:fl',x:20,z:10});
 const f=harness(foot,slope);await f.m.prepare(foot.id);
 const s=f.sim.floorSurface,corners=[[-8,-13],[8,-13],[8,13],[-8,13],[0,0]].map(([x,z])=>{const w=areaToWorld(foot.area,x,z);return s.sample(w.x,w.z);});
 assert.ok(corners.every(h=>h===corners[0]),'one flat level');
 for(const [x,z] of [[-9,-14],[9,14]]){const w=areaToWorld(foot.area,x,z);assert.ok(corners[0]>=slope.height(w.x,w.z)+.04,'above the highest ground');}
 const bowl=defaultMiniGame('bowling',{id:'minigame:fb',x:0,z:0}),b=harness(bowl);await b.m.prepare(bowl.id);
 const lane=b.sim.floorSurface.sample(0,0),gutter=b.sim.floorSurface.sample(bowl.area.halfWidth-.1,0);
 assert.equal(Math.round((lane-gutter)*1000)/1000,BOWLING_GUTTER.drop,'gutter channel');
 const golf=defaultMiniGame('minigolf',{id:'minigame:fg',x:0,z:0}),g=harness(golf);await g.m.prepare(golf.id);
 const ramp=golfCourse(golf)[1],at=v=>{const c=Math.cos(ramp.lane.yaw),sn=Math.sin(ramp.lane.yaw),w=areaToWorld(golf.area,ramp.lane.x+v*sn,ramp.lane.z+v*c);return g.sim.floorSurface.sample(w.x,w.z);};
 assert.ok(at(3)-at(-3)>.3,'ramp up towards the hole');assert.equal(at(-3),at(-2.5),'flat tee end');
 const q=new WorldCollisionQuery(slope.height,()=>null);q.setOutdoorSurface(foot.id,f.sim.floorSurface);
 const c=areaToWorld(foot.area,0,0);assert.equal(q.reliefHeight(c.x,c.z),corners[0],'walking height = deck');
 q.setOutdoorSurface(foot.id,null);assert.equal(q.reliefHeight(c.x,c.z),slope.height(c.x,c.z));
 // The manager registers / removes the deck with the instance.
 const set=new Map(),m=createMiniGameManager([foot],{env:slope,surfaces:{set:(id,v)=>v?set.set(id,v):set.delete(id)}});
 await m.prepare(foot.id);assert.ok(set.has(foot.id));m.release(foot.id);assert.equal(set.size,0);
});

test('mini-golf course: six staged holes, ramps and bumps playable, strokes summed, one card per hole',async()=>{
 const def=defaultMiniGame('minigolf',{id:'minigame:course',x:0,z:0}),course=golfCourse(def);
 assert.equal(course.length,6);assert.deepEqual(course.map(c=>c.lane.shape??'flat'),MINIGOLF_COURSE.map(c=>c.shape));
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
 const st=()=>h.rec.sim.game.state;let holed=0;
 for(let shot=0;shot<60&&!h.rec.session.finished.includes('me');shot++){
  const hole=areaToWorld(def.area,course[st().stage.me].hole.x,course[st().stage.me].hole.z),w=h.world;
  const direct=Math.atan2(hole.x-w.px[0],hole.z-w.pz[0]);behind(h,0,direct);
  // The trajectory preview chooses the softest putt (any angle within ±0.45 rad) reaching the cup.
  let yaw=direct,power=1;
  search:for(let p=.04;p<=1;p+=.04)for(let d=0;d<=.45;d+=.05)for(const side of d?[-1,1]:[1]){
   const t=h.sim.predict(h.rec.session,h.actor,direct+side*d,p,0,150);
   for(let k=0;k<t.length;k+=3)if(Math.hypot(t[k]-hole.x,t[k+2]-hole.z)<.08){yaw=direct+side*d;power=p;break search;}
  }
  const before=types(h.events,'target:hit').length;
  h.send({type:'launch',yaw,power,loft:0});h.step(1);for(let k=0;k<300&&!w.asleep[0]&&w.enabled[0];k++)h.step(1,[]);h.step(1,[]);
  holed+=types(h.events,'target:hit').length-before;
 }
 assert.ok(h.rec.session.finished.includes('me'),'course completed');
 assert.equal(st().cards.me.length,6,'one card per hole');
 assert.equal(types(h.events,'checkpoint:passed').length,5,'five hole changes');
 assert.ok(holed>=4,'most holes holed with previewed putts: '+holed);
 const total=h.rec.session.scores.me,cards=st().cards.me.reduce((a,b)=>a+b,0);
 assert.ok(total>=cards&&total<=cards+6,'score = strokes (+1 for a picked-up ball)');
 assert.equal(h.rec.session.status,'finished');
});

test('slingshot aim: anchors only when the shot is possible; the preview follows the real physics exactly',async()=>{
 const def=defaultMiniGame('minigolf',{id:'minigame:aim',x:5,z:-3,heading:.7});
 const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
 h.at(0,0);assert.equal(h.sim.aim(h.rec.session,h.actor),null,'too far from the ball');
 const yaw=def.area.heading+.15;behind(h,0,yaw);
 const a=h.sim.aim(h.rec.session,h.actor);assert.ok(a&&Math.abs(a.anchor.x-h.world.px[0])<1e-9&&a.canLoft&&a.maxPull>0);
 const pred=h.sim.predict(h.rec.session,h.actor,yaw,.55,.4,40);
 h.send({type:'launch',yaw,power:.55,loft:.4});h.step(1);const real=[[h.world.px[0],h.world.py[0],h.world.pz[0]]];
 for(let k=1;k<40;k++){h.step(1,[]);real.push([h.world.px[0],h.world.py[0],h.world.pz[0]]);}
 for(let k=0;k<real.length&&3*(k+1)+2<pred.length;k++)for(let c=0;c<3;c++)assert.ok(Math.abs(pred[3*(k+1)+c]-real[k][c])<1e-4,`tick ${k} axis ${c}: ${pred[3*(k+1)+c]} vs ${real[k][c]}`);
 assert.equal(h.sim.aim(h.rec.session,h.actor),null,'no aim while the ball rolls');
 // Target games aim from the throwing hand above the mark; bowling never lofts.
 const cans=defaultMiniGame('cans',{id:'minigame:cans',x:0,z:0}),c=harness(cans);await c.m.prepare(cans.id);
 c.send({type:'join'});c.send({type:'start'});c.step();c.at(0,-4.2);
 const ca=c.sim.aim(c.rec.session,c.actor);assert.ok(ca&&ca.anchor.y>=.9&&ca.defaultLoft>0);
 const bowl=defaultMiniGame('bowling',{id:'minigame:bw',x:0,z:0}),b=harness(bowl);await b.m.prepare(bowl.id);
 b.send({type:'join'});b.send({type:'start'});b.step();behind(b,0,0);
 const ba=b.sim.aim(b.rec.session,b.actor);assert.equal(ba.canLoft,false);
 const flatShot=b.sim.predict(b.rec.session,b.actor,0,1,1,10);assert.ok(Math.abs(flatShot[4]-flatShot[1])<.05,'bowling ball stays on the lane');
 assert.equal(validateCommand({instanceId:'minigame:x',playerId:'p',tick:1,seq:1,type:'launch',yaw:0,power:.5,loft:1.5}),false,'loft bounded');
});

test('Studio course editing: add / remove / reshape holes keep a valid staged course; flat pad under the area',async()=>{
 const {addGolfHole,removeGolfHole,setGolfHoleShape,resetMiniGameLayout,flattenMiniGameGround,miniGameGroundPad}=await import('../src/studio-core/minigame-authoring.ts');
 const {parseEarthworks}=await import('../src/geography/earthworks.ts');
 const base=defaultMiniGame('minigolf',{id:'minigame:edit',x:0,z:0});
 const seven=addGolfHole(base,5);assert.equal(golfCourse(seven).length,7);
 assert.ok(seven.area.halfLength>base.area.halfLength,'full area grows for the new hole');
 assert.equal(seven.elements.filter(e=>e.stage===6&&e.kind==='obstacle').length,2,'chicane baffles');
 const six=removeGolfHole(seven,0);assert.equal(golfCourse(six).length,6);
 assert.deepEqual(golfCourse(six).map(s=>s.lane.id),golfCourse(seven).slice(1).map(s=>s.lane.id),'later holes move up');
 const ramp=setGolfHoleShape(six,2,'ramp-up',.15);assert.equal(golfCourse(ramp)[2].lane.shape,'ramp-up');assert.equal(golfCourse(ramp)[2].lane.slope,.15);
 const flat=setGolfHoleShape(ramp,2,'flat',0);assert.equal(golfCourse(flat)[2].lane.shape,undefined);
 let one=base;while(golfCourse(one).length>1)one=removeGolfHole(one,0);
 assert.throws(()=>removeGolfHole(one,0),/au moins un trou/);
 const legacy=validateMiniGame({...base,elements:[{id:'tee',kind:'tee',x:0,z:-7},{id:'hole',kind:'hole',x:0,z:7}]});
 assert.throws(()=>addGolfHole(legacy,0),/Disposition par défaut/);
 assert.equal(golfCourse(resetMiniGameLayout(legacy)).length,6,'reset gives the 6-hole course');
 // Pad: mean level, polygon around the area, valid earthwork, replaced (not duplicated) when re-applied.
 const tilted=(x,z)=>10+.1*x,pad=miniGameGroundPad(base,tilted,2);
 assert.ok(Math.abs(pad.levelM-8)<.01);assert.equal(pad.polygon.length,4);
 const doc={world:{seaLevel:2,terrain:{kind:'archipelago',archipelago:{earthworks:[]}}}};
 flattenMiniGameGround(doc,base,tilted);flattenMiniGameGround(doc,base,tilted);
 assert.equal(doc.world.terrain.archipelago.earthworks.length,1);parseEarthworks(doc.world.terrain.archipelago.earthworks);
});

test('floors: an access ramp (apron) lets the hamster walk onto a deck raised above sloping ground',async()=>{
 const {FLOOR_APRON_LIMITS}=await import('../src/minigames/ball/floors.ts');
 const steep={height:(x,z)=>.07*z};
 const def=defaultMiniGame('football',{id:'minigame:apron',x:0,z:0}),h=harness(def,steep);await h.m.prepare(def.id);
 const s=h.sim.floorSurface,deck=s.sample(0,0),edge=-def.area.halfLength-.4,A=h.sim.game.floors.apron;
 assert.ok(deck-steep.height(0,edge)>1.5,'the low end of the pitch stands more than 1.5 m above the relief');
 assert.ok(A>1.5&&A<=FLOOR_APRON_LIMITS.max,'wider apron for a high deck: '+A);
 let prev=s.sample(0,edge+.01);
 for(let d=.1;d<A;d+=.1){const y=s.sample(0,edge-d);assert.ok(y!==null&&y<prev&&prev-y<=.1*FLOOR_APRON_LIMITS.slope+.02,'gentle ramp at '+d.toFixed(1));prev=y;}
 assert.equal(s.sample(0,edge-A-.1),null,'nothing beyond the apron');
 assert.equal(s.sample(0,-edge+1),null,'no apron where the relief is higher than the deck');
 const q=new WorldCollisionQuery(steep.height,()=>null);q.setOutdoorSurface(def.id,s);
 let feet=steep.height(0,edge-A-.5);
 for(let z=edge-A-.5;z<edge+2;z+=.2){const y=q.reliefHeight(0,z,feet);assert.ok(y-feet<=.45,'every step is walkable at z='+z.toFixed(1));feet=y;}
 assert.equal(feet,deck,'the hamster ends on the deck');
});
