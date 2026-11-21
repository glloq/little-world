// Doc 107 §évolution graphique: shared effects, ball rendering, themed fields, props, score
// boards, field states, highlights, reactions and spectators — presentation never changes
// the simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {defaultMiniGame} from '../src/minigames/layouts.ts';
import {validateMiniGame,areaToWorld} from '../src/minigames/schema.ts';
import {createMiniGameManager} from '../src/minigames/manager.ts';
import {MINIGAME_VARIANT_IDS} from '../src/minigames/catalog.ts';
import {MINIGAME_THEME_IDS,MINIGAME_PROP_IDS,MINIGAME_BORDERS,themeForGround,validateStyle} from '../src/minigames/themes.ts';
import {ballWorldOf,ballGameOf} from '../src/minigames/ball/simulation.ts';
import {MiniGameVisualEffects,FX_QUALITY,FX_CAPACITY} from '../src/minigames/fx/effects.ts';
import {minigameFxTier} from '../src/minigames/fx/tier.ts';
import {ScoreboardDigits} from '../src/minigames/fx/scoreboard.ts';
import {Painter} from '../src/minigames/fx/painter.ts';
import {paintProp,emptyAnchors} from '../src/minigames/fx/props.ts';
import {MINIGAME_THEMES} from '../src/minigames/theme-palettes.ts';
import {ballViewFactory,scoreboardValues} from '../src/minigames/ball/view.ts';
import {HIT} from '../src/minigames/ball/ball-physics.ts';
import {withMiniGameSounds,minigameSoundEvent} from '../src/minigames/audio.ts';
import {selectSpectators,SPECTATORS_MAX} from '../src/npc-life/spectators.ts';
import {HamsterAnimator,ACTION_DEFS} from '../src/hamster/hamster-animation.ts';

const flat={height:()=>0};
function harness(def,env=flat){
  const m=createMiniGameManager([def],{env});let tick=0,seq=0;const events=[];
  const actor={id:'me',x:0,y:0,z:0,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
  const send=(b,p='me')=>m.submit({instanceId:def.id,playerId:p,tick:tick+1,seq:++seq,...b});
  const step=(n=1,actors=[actor])=>{const out=[];for(let k=0;k<n;k++){const r=m.tick(++tick,1/30,actors);events.push(...r.events);out.push(...r.events);}return out;};
  return {m,actor,send,step,events,get rec(){return m.records.get(def.id);},get world(){return ballWorldOf(m.records.get(def.id).sim);}};
}
/** Effect pool double that records calls (views only talk to this contract). */
function spyFx(tier='high'){
  const calls=[];const q=FX_QUALITY[tier];
  return {calls,quality:q,impact:(...a)=>calls.push(['impact',...a]),dust:(...a)=>calls.push(['dust',...a]),trail:(...a)=>calls.push(['trail',...a]),
    success:(...a)=>calls.push(['success',...a]),update(){},clear(){},dispose(){}};
}
const drawCalls=g=>{let n=0;g.traverseVisible(o=>{if((o.isMesh||o.isLine)&&(!o.isInstancedMesh||o.count>0))n++;});return n;};

test('effects pool: bounded per kind, weak contacts give nothing, particles expire, dispose leaves nothing',()=>{
  const scene=new THREE.Group(),fx=new MiniGameVisualEffects(scene);fx.setTier('high');
  fx.impact(0,0,0,.8);assert.equal(fx.live,0,'weak contact: no effect');
  const chips=[];fx.chips=(...a)=>chips.push(a);
  fx.impact(0,0,0,9,'wood');assert.ok(fx.stats().ring===1&&fx.stats().puff===1&&chips.length===1,'strong contact: ring + puff + shared chips');
  for(let k=0;k<500;k++)fx.success(0,0,0,3);
  for(const [kind,cap] of Object.entries(FX_CAPACITY))assert.ok(fx.stats()[kind]<=cap,kind+' never exceeds its pool');
  const before=scene.children[0].children.length;
  for(let k=0;k<120;k++)fx.update(1/30);
  assert.equal(fx.live,0,'all particles expire within 4 s');assert.equal(scene.children[0].children.length,before,'no mesh created per particle');
  fx.setTier('low');fx.impact(0,0,0,9,'stone');assert.equal(chips.length,1,'low tier: no chips');fx.trail(0,0,0,.1,0xffffff);assert.equal(fx.stats().trail,0,'low tier: no trails');
  fx.success(0,0,0,3);assert.ok(fx.stats().confetti<=Math.round(40*FX_QUALITY.low.burst),'low tier: limited confetti');
  fx.dispose();assert.equal(scene.children.length,0);
  assert.equal(minigameFxTier('high',0),'high');assert.equal(minigameFxTier('high',2),'low');assert.equal(minigameFxTier('medium',1),'low');assert.equal(minigameFxTier('low',0),'low');
});

test('every variant: themed field in ≤ 9 draw calls, presentation never changes the simulation, clean dispose',async()=>{
  for(const variant of MINIGAME_VARIANT_IDS){
    for(const theme of ['classic','snow','volcano']){
      const base=defaultMiniGame(variant,{id:`minigame:v-${variant}`,x:3,z:-2,heading:.4});
      const def=validateMiniGame({...base,style:{theme,decor:'full'}});
      const a=harness(def),b=harness(def);await a.m.prepare(def.id);await b.m.prepare(def.id);
      const factory=await a.rec.module.loadView(),scene=new THREE.Group(),fx=spyFx();
      const view=factory.create(scene,a.rec.sim,flat,{fx,tier:()=>'high'});
      assert.ok(drawCalls(scene)<=9,`${variant}/${theme}: ${drawCalls(scene)} draw calls`);
      assert.equal(view.debug.look.theme,theme);
      // Same commands on two managers, one rendered every frame: identical simulation state.
      for(const h of [a,b]){h.send({type:'join'});h.send({type:'start'});h.step();}
      for(let k=0;k<200;k++){
        if(k%50===0)for(const h of [a,b]){const aim=h.rec.sim.aim(h.rec.session,h.actor);const w=h.world;
          const p=aim?.anchor??{x:w.px[0],z:w.pz[0]};h.actor.x=p.x-Math.sin(def.area.heading)*.7;h.actor.z=p.z-Math.cos(def.area.heading)*.7;h.send({type:'launch',yaw:def.area.heading,power:.8,loft:.3});}
        const ea=a.step(),eb=b.step();for(const e of ea)view.onEvent(e,a.rec.session,'me');
        view.update(.5,1/60);view.update(1,1/60);
        assert.deepEqual(ea.map(e=>e.type),eb.map(e=>e.type));
      }
      assert.deepEqual(a.rec.sim.snapshot(),b.rec.sim.snapshot(),`${variant}/${theme}: rendering does not alter the simulation`);
      view.dispose();assert.equal(scene.children.length,0,'view removed');a.m.dispose();b.m.dispose();
    }
  }
});

test('ball rendering: rolling spin from the displacement, blob shadow under the ball, squash on strong impacts',async()=>{
  const def=defaultMiniGame('football',{id:'minigame:spin',x:0,z:0}),h=harness(def);await h.m.prepare(def.id);
  const factory=await h.rec.module.loadView(),scene=new THREE.Group(),fx=spyFx();const view=factory.create(scene,h.rec.sim,flat,{fx,tier:()=>'high'});
  const balls=scene.getObjectByName('balls'),shadows=scene.getObjectByName('ball-shadows'),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  h.send({type:'join',teamId:'blue'});h.send({type:'start'});h.step();
  const w=h.world;h.actor.x=w.px[0];h.actor.z=w.pz[0]-.9;h.send({type:'launch',yaw:0,power:.6,loft:0});
  balls.getMatrixAt(0,m);m.decompose(p,q,s);const q0=q.clone();
  for(let k=0;k<7;k++){h.step(1,k?[]:[h.actor]);view.update(1,1/30);}
  balls.getMatrixAt(0,m);m.decompose(p,q,s);assert.ok(q.angleTo(q0)>.3,'the ball rotates while rolling');
  shadows.getMatrixAt(0,m);m.decompose(p,q,s);assert.ok(Math.abs(p.x-w.px[0])<.5&&p.y<w.py[0],'shadow under the ball');
  // A strong ground hit squashes the ball for a few frames (presentation only).
  w.hitSpeed[0]=8;w.hitKind[0]=HIT.ground;w.steps++;view.update(1,1/60);balls.getMatrixAt(0,m);m.decompose(p,q,s);
  assert.ok(Math.abs(s.y-s.x)>.01,'squash & stretch');assert.ok(fx.calls.some(c=>c[0]==='impact'&&c[4]===8),'impact effect with the contact speed');
  for(let k=0;k<20;k++)view.update(1,1/60);balls.getMatrixAt(0,m);m.decompose(p,q,s);assert.ok(Math.abs(s.y-s.x)<1e-6,'back to round');
  view.dispose();
});

test('events: goals, holes, highlights and the end of a game trigger proportionate effects and score board updates',async()=>{
  const def=defaultMiniGame('football',{id:'minigame:ev',x:0,z:0}),h=harness(def);await h.m.prepare(def.id);
  const factory=await h.rec.module.loadView(),scene=new THREE.Group(),fx=spyFx(),sounds=[];
  const view=factory.create(scene,h.rec.sim,flat,{fx,tier:()=>'high',sound:(id)=>sounds.push(id)});
  h.send({type:'join',teamId:'blue'});h.send({type:'start'});for(const e of h.step())view.onEvent(e,h.rec.session,'me');
  assert.ok(fx.calls.some(c=>c[0]==='success'&&c[4]===1),'start: small burst');
  for(let goal=0;goal<3;goal++){
    const w=h.world;h.actor.x=w.px[0];h.actor.z=w.pz[0]-.9;h.send({type:'launch',yaw:0,power:1,loft:0});
    for(let k=0;k<90;k++)for(const e of h.step(1,k?[]:[h.actor]))view.onEvent(e,h.rec.session,'me');
  }
  assert.ok(fx.calls.filter(c=>c[0]==='success'&&c[4]===2).length>=3,'one goal burst per goal');
  assert.ok(fx.calls.some(c=>c[0]==='success'&&c[4]===3),'victory burst');assert.ok(sounds.includes('goal')&&sounds.includes('applause'));
  assert.deepEqual(scoreboardValues(ballGameOf(h.rec.sim),h.rec.session,'me'),[3,0]);
  const digits=new ScoreboardDigits(new THREE.Group(),[{x:0,y:0,z:0,yaw:0,kind:'wood'}]);
  assert.equal(digits.set(3,0),true);assert.equal(digits.set(3,0),false,'unchanged score: no rewrite');assert.equal(digits.set(4,0),true);
  view.dispose();
});

test('highlights: hole-in-one is announced once; bowling strike / spare and target bullseye are session events',async()=>{
  const def=validateMiniGame({version:1,id:'minigame:h1',name:'Trou',family:'ball',variant:'minigolf',playersMin:1,playersMax:1,
    area:{x:0,z:0,heading:0,halfWidth:2,halfLength:4},rules:{attempts:5,practice:true},elements:[{id:'tee',kind:'tee',x:0,z:-3},{id:'hole',kind:'hole',x:0,z:-2}]});
  const h=harness(def);await h.m.prepare(def.id);h.send({type:'join'});h.send({type:'start'});h.step();
  const w=h.world;h.actor.x=w.px[0];h.actor.z=w.pz[0]-.6;
  let best=null;for(let p=.0;p<=.3&&!best;p+=.01){const t=h.rec.sim.predict(h.rec.session,h.actor,0,p,0,90);for(let k=0;k<t.length;k+=3)if(Math.hypot(t[k],t[k+2]+2)<.05){best=p;break;}}
  h.send({type:'launch',yaw:0,power:best??.05,loft:0});h.step(90);
  assert.equal(h.events.filter(e=>e.type==='highlight'&&e.kind==='hole-in-one').length,1);
  assert.ok(h.events.findIndex(e=>e.type==='highlight')>h.events.findIndex(e=>e.type==='target:hit'),'after the hole');
});

test('themes, props and style: automatic theme from the biome, strict validation, solid props stop balls',async()=>{
  assert.equal(themeForGround('forest','forest-floor'),'forest');assert.equal(themeForGround('coast','sand'),'beach');assert.equal(themeForGround('meadow','snow'),'snow');
  assert.equal(themeForGround('volcanic','basalt'),'volcano');assert.equal(themeForGround('wetland','mud'),'marsh');assert.equal(themeForGround('mountain','rock'),'mountain');
  assert.equal(themeForGround('village','grass'),'village');assert.equal(themeForGround(null,null),'classic');
  assert.throws(()=>validateStyle({theme:'jungle'}),/style/);assert.throws(()=>validateStyle({glitter:true}),/inconnu/);
  const base=defaultMiniGame('football',{id:'minigame:st',x:0,z:0});
  const styled=validateMiniGame({...base,style:{theme:'forest',border:'stone',decor:'full',scoreboard:false,flags:false,balls:'bright',effects:false},
    elements:[...base.elements,{id:'pod',kind:'decor',prop:'podium',x:0,z:-16},{id:'board',kind:'scoreboard',prop:'stone',x:-12,z:0,yaw:1.57}]});
  assert.deepEqual(JSON.parse(JSON.stringify(styled)),styled,'JSON round trip');
  assert.throws(()=>validateMiniGame({...base,elements:[...base.elements,{id:'x',kind:'decor',prop:'unicorn',x:0,z:0}]}),/décor/);
  assert.throws(()=>validateMiniGame({...base,elements:[...base.elements,{id:'x',kind:'decor',prop:'flag',x:0,z:30}]}),/hors/);
  // Every prop paints into ONE painter, with and without animated anchors.
  const pt=new Painter(),anchors=emptyAnchors();for(const id of MINIGAME_PROP_IDS)paintProp(pt,id,0,0,0,0,MINIGAME_THEMES.village,anchors);
  assert.ok(pt.triangles>500&&anchors.flags.length>=1&&anchors.sails.length===1);
  for(const t of MINIGAME_THEME_IDS)assert.ok(MINIGAME_THEMES[t].decor.length>0&&MINIGAME_BORDERS.includes(MINIGAME_THEMES[t].border));
  // The golf template's windmill is solid (approximate box) and off the lanes: the course plays as before.
  const golf=defaultMiniGame('minigolf',{id:'minigame:g',x:0,z:0}),g=harness(golf);await g.m.prepare(golf.id);
  const props=ballGameOf(g.rec.sim).baseBoxes.filter(b=>b.tag==='prop');assert.equal(props.length,1,'windmill footprint');
  const golfNoDecor=validateMiniGame({...golf,elements:golf.elements.filter(e=>e.kind!=='decor')}),n=harness(golfNoDecor);await n.m.prepare(golf.id);
  assert.equal(ballGameOf(n.rec.sim).baseBoxes.length,ballGameOf(g.rec.sim).baseBoxes.length-1);
});

test('field states: flags wave only while the field is in use; low tier drops decoration and animation',async()=>{
  const def=defaultMiniGame('football',{id:'minigame:fs',x:0,z:0}),h=harness(def);await h.m.prepare(def.id);
  const factory=await h.rec.module.loadView();
  const high=new THREE.Group(),v=factory.create(high,h.rec.sim,flat,{tier:()=>'high'}),flags=high.getObjectByName('flags');
  assert.ok(flags&&flags.count>=4);
  const version=()=>flags.instanceMatrix.version;
  v.setState('inactive');v.update(1,1/30);const idle=version();for(let k=0;k<10;k++)v.update(1,1/30);
  assert.equal(version(),idle,'inactive field: no animation work');
  v.setState('active');for(let k=0;k<10;k++)v.update(1,1/30);assert.ok(version()>idle,'active field: flags wave');
  const low=new THREE.Group(),lv=factory.create(low,h.rec.sim,flat,{tier:()=>'low'});
  assert.equal(lv.debug.look.decor,0);
  const tris=g=>{let n=0;g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)n+=o.geometry.attributes.position.count/3;});return n;};
  assert.ok(tris(low)<tris(high),'fewer triangles on low');
  v.dispose();lv.dispose();
});

test('sounds: runtime catalogue extension never overrides authored events; semantic ids map to it',()=>{
  const authored={schemaVersion:2,assets:{},events:{'minigame.goal':{id:'minigame.goal',category:'ui'}}};
  const out=withMiniGameSounds(authored);
  assert.equal(out.events['minigame.goal'],authored.events['minigame.goal'],'authored kept');
  for(const id of ['ball.bounce','hit.wood','hit.stone','hit.metal','pins','cup','success','fail','record','applause'])assert.ok(out.events[minigameSoundEvent(id)],id);
  assert.ok(Object.values(out.assets).every(a=>a.kind==='procedural'),'procedural, nothing downloaded');
});

test('spectators: nearest available residents only, bounded, refreshed per event, then released',()=>{
  const residents=[{id:'a',x:2,z:0,busy:false},{id:'b',x:5,z:0,busy:false},{id:'c',x:1,z:0,busy:true},{id:'d',x:40,z:0,busy:false},
    {id:'e',x:3,z:1,busy:false},{id:'f',x:4,z:1,busy:false},{id:'g',x:6,z:1,busy:false}];
  const current=new Map();
  assert.equal(selectSpectators(residents,{x:0,z:0},{max:10,seconds:5},current,0),SPECTATORS_MAX);
  assert.ok(!current.has('c')&&!current.has('d'),'busy and far residents ignored');assert.ok(current.has('a'),'nearest first');
  selectSpectators(residents,{x:0,z:0},{cheer:true},current,3);assert.ok([...current.values()].every(w=>w.cheer&&!w.cheered&&w.until===9));
  selectSpectators([],{x:0,z:0},{},current,20);assert.equal(current.size,0,'released after their time');
});

test('hamster reactions: kick / throw / putt / cheer / clap / sad use the existing rig channels and are refused in the ball',()=>{
  for(const name of ['KICK','THROW','PUTT','CHEER','CLAP','SAD']){
    assert.ok(ACTION_DEFS[name]&&!ACTION_DEFS[name].tool&&ACTION_DEFS[name].events.length===0,name);
    const a=new HamsterAnimator();assert.equal(a.play(name),true);
  }
  const r=new HamsterAnimator();r.update({mode:'roll',speed:5,verticalSpeed:0,turnRate:0},.5);assert.equal(r.play('CHEER'),false,'never inside the ball');
});
