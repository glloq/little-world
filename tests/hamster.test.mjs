import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildHamsterRig,visibleTriangles,HAMSTER_JOINTS} from '../src/hamster/hamster-model.ts';
import {HamsterAnimator,ACTIONS,ACTION_DEFS,TRANSITIONS} from '../src/hamster/hamster-animation.ts';
import {buildHamster} from '../src/hamster/hamster.ts';
import {TOOL_IDS,TOOL_ITEMS,ACTIVITY_ANIMATIONS} from '../src/hamster/tools.ts';
import {parsePresentationState,interpolatePresentation} from '../src/hamster/presentation-state.ts';
import {createImpactEffects} from '../src/hamster/impact-effects.ts';

const input=(mode='ground',speed=0,verticalSpeed=0)=>({mode,speed,verticalSpeed,turnRate:0});
const step=(a,inp,s,dt=1/30)=>{const ev=[];for(let i=0;i<Math.round(s/dt);i++){a.update(inp,dt);ev.push(...a.events);}return ev;};
const player=(mode='ground',vx=0,vz=0,vy=0)=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(vx,vy,vz),mode});

test('HAMSTER model — ONE skinned mesh (1 draw call), low-poly budget, 22 animated joints, toggled pieces',()=>{
  const rig=buildHamsterRig();rig.group.updateMatrixWorld(true);
  const meshes=[];rig.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
  assert.deepEqual(meshes.map(m=>m.name).sort(),['HamsterMesh','Shadow'],'one character mesh + the ground blob shadow');
  assert.ok(rig.mesh.isSkinnedMesh&&rig.mesh.material===meshes.find(m=>m.name==='HamsterMesh').material);
  const tris=visibleTriangles(rig);
  assert.ok(tris>=800&&tris<=1500,'800–1500 triangles visible: '+tris);
  assert.equal(HAMSTER_JOINTS.length,22);for(const n of HAMSTER_JOINTS)assert.ok(rig.joints[n].isBone,n);
  // Rigid binding: one bone per vertex, weight 1.
  const sw=rig.mesh.geometry.getAttribute('skinWeight');for(let i=0;i<sw.count;i+=97)assert.equal(sw.getX(i),1);
  for(const s of ['tool','offHand','head','face','back','neck','satchel'])assert.ok(rig.sockets[s]?.isBone,'socket '+s);
  for(const k of ['hat','goggles','backpack','scarf','pendant'])assert.equal(rig.accessories[k].visible,false,k+' hidden by default');
  rig.accessories.hat.visible=true;assert.ok(visibleTriangles(rig)>tris,'accessory adds geometry');rig.accessories.hat.visible=false;assert.equal(visibleTriangles(rig),tris);
  // Geometry shared between every hamster (no per-instance copy).
  const other=buildHamsterRig();assert.equal(other.mesh.geometry,rig.mesh.geometry);assert.notEqual(other.skeleton,rig.skeleton);
  rig.setMembranes(1);assert.equal(rig.joints.MembraneLeft.scale.x,1);rig.setMembranes(.5);assert.equal(rig.joints.MembraneRight.scale.x,.5);rig.setMembranes(0);assert.equal(rig.joints.MembraneLeft.scale.x,0);
  rig.dispose();other.dispose();
});

test('HAMSTER model — skinning follows the joints and hides collapsed pieces',()=>{
  const rig=buildHamsterRig(),g=rig.mesh.geometry,si=g.getAttribute('skinIndex'),bones=rig.skeleton.bones;
  const first=name=>{const k=bones.findIndex(b=>b.name===name);for(let i=0;i<si.count;i++)if(si.getX(i)===k)return i;return -1;};
  const v=new THREE.Vector3(),at=(i)=>{rig.group.updateMatrixWorld(true);rig.skeleton.update();rig.mesh.getVertexPosition(i,v);return v.clone();};
  const hat=first('Acc_StrawHat'),paw=first('HandRight'),axe=first('Tool_axe');
  const hb=bones.find(b=>b.name==='Acc_StrawHat');assert.ok(at(hat).distanceTo(hb.getWorldPosition(new THREE.Vector3()))<1e-5,'hidden hat collapsed onto its bone (zero area, nothing rasterised)');
  rig.accessories.hat.visible=true;assert.ok(at(hat).y>1,'shown hat sits on the head');
  rig.tools.axe.visible=true;const a0=at(axe),p0=at(paw);rig.joints.ShoulderRight.rotation.x=-1.5;const a1=at(axe),p1=at(paw);
  assert.ok(a0.distanceTo(a1)>.2&&p0.distanceTo(p1)>.1,'the axe moves with the arm');
  assert.ok(Math.abs(a0.distanceTo(p0)-a1.distanceTo(p1))<1e-4,'rigid: tool–paw distance unchanged');
  rig.dispose();
});

test('HAMSTER animator — locomotion transitions follow the simulation mode',()=>{
  const a=new HamsterAnimator();
  step(a,input('ground',0),.3);assert.equal(a.state,'IDLE');
  step(a,input('ground',2),.3);assert.equal(a.state,'WALK');
  step(a,input('ground',8),.3);assert.equal(a.state,'RUN');
  let ev=step(a,input('roll',6),1/30);assert.equal(a.state,'ROLL_ENTER');assert.deepEqual(ev.map(e=>e.name),['roll-start']);
  step(a,input('roll',6),TRANSITIONS.ROLL_ENTER+.1);assert.equal(a.state,'ROLL_LOOP');assert.ok(a.pose.tuck>.5,'limbs tucked in the ball');
  const r0=a.pose.roll;step(a,input('roll',6),.5);assert.ok(a.pose.roll!==r0,'the ball spins with the distance');
  ev=step(a,input('ground',0),1/30);assert.equal(a.state,'ROLL_EXIT');assert.deepEqual(ev.map(e=>e.name),['roll-stop']);
  step(a,input('ground',0),1);assert.equal(a.state,'IDLE');assert.ok(a.pose.tuck<.1,'limbs out again');
  ev=step(a,input('air',0,4),1/30);assert.equal(a.state,'JUMP');assert.ok(ev.some(e=>e.name==='jump'));
  step(a,input('air',0,-3),.4);assert.equal(a.state,'FALL');
  ev=step(a,input('glide',5,-1),1/30);assert.equal(a.state,'GLIDE_OPEN');assert.ok(ev.some(e=>e.name==='glide-open'));
  step(a,input('glide',5,-1),.5);assert.equal(a.state,'GLIDE_LOOP');assert.ok(a.pose.membrane>.9,'membranes spread');
  ev=step(a,input('air',3,-2),1/30);assert.equal(a.state,'GLIDE_CLOSE');assert.ok(ev.some(e=>e.name==='glide-close'));
  step(a,input('air',3,-2),.4);ev=step(a,input('ground',0),1/30);assert.equal(a.state,'LAND');assert.ok(ev.some(e=>e.name==='land'));
  step(a,input('swim',1),.4);assert.equal(a.state,'SWIM');
  step(a,input('climb',1),.4);assert.equal(a.state,'CLIMB');
  step(a,{...input('ground',0),aboard:true},.4);assert.equal(a.state,'BOAT');
});

test('HAMSTER animator — every action fires each event exactly once, loops keep running, refused in ball/glide/swim',()=>{
  for(const name of ACTIONS){
    const a=new HamsterAnimator(),def=ACTION_DEFS[name];step(a,input(),.2);
    assert.equal(a.play(name),true,name);assert.equal(a.toolOut,true,name+' paws may hold an object');
    const ev=step(a,input(),def.loop?def.duration*2.5:def.duration+.3).filter(e=>e.action===name);
    assert.deepEqual(ev.map(e=>e.name),def.loop?[]:def.events.map(e=>e.name),name+' events once');
    assert.equal(a.action,def.loop?name:null,name+(def.loop?' loops':' ends'));
  }
  const a=new HamsterAnimator();step(a,input('roll',5),.5);assert.equal(a.play('TOOL_SWING_VERTICAL'),false,'no tool in the ball');
  const g=new HamsterAnimator();step(g,input('glide',5,-1),.5);assert.equal(g.play('PICKUP'),false,'no pickup while gliding');
  const s=new HamsterAnimator();step(s,input(),.1);s.play('FISH_WAIT');step(s,input('roll',4),1/30);assert.equal(s.action,null,'entering the ball cancels the action');
  const t=new HamsterAnimator();t.play('TOOL_SWING_VERTICAL');step(t,input(),.1);t.play('TOOL_SWING_VERTICAL');
  assert.equal(step(t,input(),.6).filter(e=>e.name==='impact').length,1,'a restarted swing hits once');
});

test('HAMSTER animator — pose stays finite and bounded under random inputs (no NaN, no explosion)',()=>{
  const a=new HamsterAnimator(),modes=['ground','air','glide','roll','swim','dive','climb'];let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<3000;i++){if(i%37===0)a.play(ACTIONS[Math.floor(rnd()*ACTIONS.length)]);a.update({mode:modes[Math.floor(rnd()*modes.length)],speed:rnd()*14,verticalSpeed:rnd()*10-5,turnRate:rnd()*6-3},rnd()*.1);
    for(const [k,v]of Object.entries(a.pose))assert.ok(Number.isFinite(v)&&(k==='roll'||Math.abs(v)<8),k+'='+v);}
});

test('HAMSTER character — tools follow the actions, fishing line and float, one tool at a time, clean dispose',()=>{
  const h=buildHamster(),scene=new THREE.Scene();scene.add(h.group);
  for(let i=0;i<10;i++)h.update(player(),1/30,i/30);
  assert.equal(h.tool,null,'paws empty at rest');
  assert.equal(h.play('mine'),true);h.update(player(),1/30,1);assert.equal(h.tool,'pickaxe');assert.equal(h.action,'TOOL_SWING_VERTICAL');
  const ev=[];const off=h.onEvent(e=>ev.push(e));
  for(let i=0;i<20;i++)h.update(player(),1/30,1+i/30);
  assert.deepEqual(ev.map(e=>e.name),['impact'],'one impact event per swing');assert.ok(ev[0].position.isVector3&&Number.isFinite(ev[0].position.y),'event carries the tool head position');
  assert.equal(h.tool,null,'tool stowed after the swing');
  h.play('fell');h.update(player(),1/30,2);assert.equal(h.tool,'axe');
  h.play('farm-water');h.update(player(),1/30,2.1);assert.equal(h.tool,'watering-can');
  assert.equal(Object.values(h.rig.tools).filter(t=>t.visible).length,1,'exactly one tool visible');
  for(let i=0;i<40;i++)h.update(player(),1/30,3+i/30);
  h.setFishing({x:3,y:0,z:4,biting:false});h.update(player(),1/30,4);
  assert.equal(h.tool,'fishing-rod');assert.equal(h.action,'FISH_WAIT');
  const line=h.group.getObjectByName('FishingLine'),float=h.group.getObjectByName('FishingFloat');
  assert.ok(line.visible&&float.visible,'line and float out');
  h.group.position.set(100,5,-50);h.update(player(),1/30,4.1);const w=float.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(w.x-3)<.01&&Math.abs(w.z-4)<.01,'float stays on its world target when the player moves');
  h.setFishing(null);h.update(player(),1/30,4.2);assert.equal(line.visible,false);assert.equal(h.action,null,'FISH_WAIT stops with the line');
  // Tools live in the shared single mesh: another character draws the same geometry.
  const other=buildHamster();other.play('mine');other.update(player(),1/30,0);assert.equal(other.rig.mesh.geometry,h.rig.mesh.geometry);assert.equal(other.tool,'pickaxe');
  off();h.dispose();other.dispose();assert.equal(h.group.parent,null,'removed from the scene');
  h.update(player(),1/30,5);// no throw after dispose
});

test('HAMSTER character — accessories and emotions, hidden when rolled into a ball',()=>{
  const h=buildHamster();h.setAppearance({hat:true,backpack:true,neckwear:'scarf',emotion:'curious',goggles:false});h.update(player(),1/30,0);
  assert.ok(h.rig.accessories.hat.visible&&h.rig.accessories.backpack.visible&&h.rig.accessories.scarf.visible);
  assert.ok(h.rig.faces.curious.visible&&!h.rig.faces.happy.visible,'face follows the emotion');
  for(let i=0;i<20;i++)h.update({...player('roll',5)},1/30,i/30);
  assert.equal(h.rig.accessories.hat.visible,false,'hat tucked away in the ball');
  h.setAppearance({hat:false,backpack:false,neckwear:'none',emotion:'happy',goggles:true});h.update(player(),1/30,1);for(let i=0;i<30;i++)h.update(player(),1/30,1+i/30);
  assert.ok(h.rig.accessories.goggles.visible,'goggles');h.dispose();
});

test('HAMSTER tools — every inventory tool maps to a model, every activity to a valid action',()=>{
  for(const id of Object.values(TOOL_ITEMS))assert.ok(TOOL_IDS.includes(id));
  for(const [k,v]of Object.entries(ACTIVITY_ANIMATIONS)){assert.ok(ACTIONS.includes(v.action),k);if(v.tool)assert.ok(TOOL_IDS.includes(v.tool),k);
  }
  const h=buildHamster();h.play('farm-plant');h.update(player(),1/30,0);assert.equal(h.tool,'seed-bag','seed bag shown while sowing (PICKUP + object)');
  h.play('pick');h.update(player(),1/30,.1);assert.equal(h.tool,null,'bare paws to pick');h.dispose();
});

test('HAMSTER presentation — a remote hamster rebuilt from 10 Hz compact states plays each action once',()=>{
  const local=buildHamster(),remote=buildHamster(),states=[];let impactsLocal=0,impactsRemote=0;
  local.onEvent(e=>{if(e.name==='impact')impactsLocal++;});remote.onEvent(e=>{if(e.name==='impact')impactsRemote++;});
  const p=player('ground',0,3);
  for(let i=0;i<90;i++){const t=i/30;p.position.z=t*3;local.group.position.copy(p.position);
    if(i===15||i===45)local.play('mine');local.update(p,1/30,t);
    if(i%3===0){const s=local.presentation(t);states.push(JSON.parse(JSON.stringify(s)));}}
  assert.equal(states.length,30);const bytes=JSON.stringify(states[10]).length;assert.ok(bytes<400,'compact state: '+bytes+' bytes');
  // Remote side: 30 FPS rendering interpolating between received samples.
  let k=0;for(let i=0;i<90;i++){const t=i/30;while(k<states.length-2&&states[k+1].t<=t)k++;
    const s=interpolatePresentation(parsePresentationState(states[k]),parsePresentationState(states[k+1]),t);remote.applyPresentation(s,1/30);}
  assert.equal(impactsLocal,2);assert.equal(impactsRemote,2,'each swing replayed exactly once remotely');
  assert.ok(Math.abs(remote.group.position.z-local.group.position.z)<.35,'remote position follows (within one 10 Hz sample)');
  local.dispose();remote.dispose();
});

test('HAMSTER presentation — strict validation of untrusted states',()=>{
  const ok={v:1,t:1,x:0,y:0,z:0,yaw:0,mode:'roll',speed:3,verticalSpeed:0,turnRate:0,aboard:false,action:null,actionSeq:0,tool:null,fishing:null};
  assert.deepEqual(parsePresentationState(ok),ok);
  for(const bad of [null,{...ok,v:2},{...ok,x:NaN},{...ok,y:1e9},{...ok,mode:'fly'},{...ok,action:'EXPLODE'},{...ok,tool:'laser'},{...ok,fishing:{x:0,y:0,z:0}},{...ok,aboard:'yes'}])
    assert.throws(()=>parsePresentationState(bad),JSON.stringify(bad));
  const a={...ok,t:0,yaw:3.1},b={...ok,t:1,yaw:-3.1,x:10};const m=interpolatePresentation(a,b,.5);
  assert.equal(m.x,5);assert.ok(Math.abs(Math.abs(m.yaw)-Math.PI)<.05,'yaw takes the short way across ±π');
});

test('HAMSTER impacts — pooled chips, no allocation per hit, fade out',()=>{
  const scene=new THREE.Scene(),fx=createImpactEffects(scene,24);const before=scene.children.length;
  for(let i=0;i<50;i++)fx.spawn(new THREE.Vector3(0,1,0),'stone');
  assert.equal(scene.children.length,before,'same objects whatever the number of hits');
  for(let i=0;i<60;i++)fx.update(1/30);
  let visible=0;scene.traverse(o=>{if(o.isInstancedMesh)visible+=o.count;});assert.equal(visible,0,'chips gone after their life');
  fx.dispose();
});
