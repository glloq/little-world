import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:960,height:640}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await p.goto(base+'tools/impostors/bake.html');
 const result=await p.evaluate(async base=>{
  const THREE=await import(base+'node_modules/.vite/deps/three.js'),{createImpostorSectors}=await import(base+'src/render/impostor-sectors.ts'),{createRemoteCharacters,emptyPresentation}=await import(base+'src/render/remote-characters.ts');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1.5,.1,3000),renderer=new THREE.WebGLRenderer();renderer.setSize(600,400);document.body.append(renderer.domElement);camera.position.set(0,8,20);camera.lookAt(0,0,0);scene.add(new THREE.HemisphereLight(0xffffff,0x777777,3));
  const wait=async f=>{for(let i=0;i<300&&!f();i++)await new Promise(r=>setTimeout(r,20));if(!f())throw Error('Atlas timeout');};
  const trees=createImpostorSectors(scene,'trees');trees.setEnabled(true);await wait(()=>trees.ready);trees.setBudget(20,2);trees.begin();const tint=new THREE.Color(0xffffff);let accepted=0;for(let i=0;i<40;i++)accepted+=Number(trees.write('nature.broadleaf_round',i*260,0,0,1,0,tint));trees.end();renderer.render(scene,camera);
  const fallback=!trees.write('missing',0,0,0,1,0,tint);const bounded=trees.stats.instances<=20&&trees.stats.sectors<=2;
  const actors=createRemoteCharacters(scene),state=emptyPresentation(),records=[];for(const count of [10,50,100]){for(let i=0;i<count;i++){state.x=(i%10)*7;state.z=-Math.floor(i/10)*9;state.t=0;actors.push('actor-'+i,state);state.t=1;state.x+=1;actors.push('actor-'+i,state);}await wait(()=>actors.stats.atlas.state==='ready');actors.update(.033,1,camera,400,0);renderer.render(scene,camera);records.push(JSON.parse(JSON.stringify(actors.stats)));}
  const cacheBefore=trees.cache.bytes;actors.dispose();trees.dispose();const cacheAfter=trees.cache.bytes;renderer.dispose();renderer.forceContextLoss();return {bounded,fallback,accepted,records,cacheBefore,cacheAfter};
 },base);
 assert.equal(result.accepted,2);assert.equal(result.bounded,true);assert.equal(result.fallback,true);assert.equal(result.cacheAfter,0);for(const [i,n]of [10,50,100].entries()){const r=result.records[i];assert.equal(r.actors,n);assert.equal(r.full+r.impostors+r.proxy+r.hidden,n);assert.ok(r.rigs<=12);}
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
 // Missing atlas must keep the existing world playable, without silently dropping trees.
 await p.route('**/impostors/**',r=>r.abort());await p.goto(base+'?world=maps/production-reference/manifest.json&spawn=-250,230&metrics=1&impostors=trees');await p.locator('#start').click();await p.waitForFunction(()=>window.littleWorldMetrics?.hybrid.trees?.state==='failed',null,{timeout:90000});const fallback=await p.evaluate(()=>({calls:window.littleWorldMetrics.calls,triangles:window.littleWorldMetrics.triangles,instances:window.littleWorldMetrics.hybrid.trees.instances}));assert.ok(fallback.triangles>0);assert.equal(fallback.instances,0);console.log('Missing atlas geometric fallback:',fallback);
}finally{await browser.close();}
