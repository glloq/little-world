/** Controlled A/B of the same atlas pixels. No world generation or adaptive-quality noise.
 * GPU queries are asynchronous. Pixel readback is a correctness check outside timed loops. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/',out=process.argv[3]??'/tmp/impostor-optimization';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});await page.goto(base+'tools/impostors/bake.html');
 const result=await page.evaluate(async base=>{
  const THREE=await import(base+'node_modules/.vite/deps/three.js'),{createImpostorSectors}=await import(base+'src/render/impostor-sectors.ts'),{createGpuTimer}=await import(base+'src/render/perf-sampler.ts');
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(640,480);document.body.append(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color(0x123456);const camera=new THREE.PerspectiveCamera(60,640/480,.1,3000),white=new THREE.Color(0xffffff);
  const trees=createImpostorSectors(scene,'trees');trees.setEnabled(true);for(let i=0;i<300&&!trees.ready;i++)await new Promise(r=>setTimeout(r,20));if(!trees.ready)throw Error('Atlas timeout');
  const fill=(count=1152,change=0,second=0)=>{trees.begin();for(let i=0;i<count;i++)trees.write('nature.broadleaf_round',(i%24)*12-138+(i===0?change:i===1?second:0),0,-40-Math.floor(i/24)*8,1,i*.13,white);trees.end();};
  camera.position.set(0,24,0);camera.lookAt(0,8,-180);fill();renderer.render(scene,camera);
  const versions=()=>trees.root.children.filter(m=>m.isMesh).map(m=>Object.values(m.geometry.attributes).map(a=>a.version));const beforeVersions=JSON.stringify(versions());fill();const staticUploads=trees.stats.uploadBytes;const stableVersions=beforeVersions===JSON.stringify(versions());renderer.render(scene,camera);fill(1152,.125);const changedUploads=trees.stats.uploadBytes;renderer.render(scene,camera);fill();renderer.render(scene,camera);fill(1152,.125);fill(1152,.125,.125);const pendingRange=trees.root.children.find(m=>m.isMesh&&m.geometry.getAttribute('offset').updateRanges.length)?.geometry.getAttribute('offset').updateRanges.map(r=>({...r}));fill();renderer.render(scene,camera);
  const mesh=trees.root.children.find(m=>m.isMesh),metadata=mesh.material.uniforms.metadata.value,original=new Float32Array(metadata.image.data),gl=renderer.getContext(),timer=createGpuTimer(renderer);
  function crop(on){for(let i=0;i<original.length/8;i++){metadata.image.data.set(on?original.subarray(i*8+4,i*8+8):[0,0,1,1],i*8+4);}metadata.needsUpdate=true;}
  const next=()=>new Promise(r=>requestAnimationFrame(r)),summarize=a=>{const v=[...a].sort((a,b)=>a-b);return {samples:v.length,mean:a.reduce((a,b)=>a+b,0)/Math.max(1,a.length),p50:v[Math.floor(v.length*.5)]??null,p95:v[Math.floor(v.length*.95)]??null};};
  const pixels=()=>{const data=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const rows=[],images={};let reference;
  // A/B/A/B reduces ordering bias. Both use the same shader and pixels; only UV bounds differ.
  for(const [iteration,on]of [false,true,false,true].entries()){
   crop(on);for(let i=0;i<6;i++){timer.begin();renderer.render(scene,camera);timer.end();await next();}
   const gpu=[],submit=[];let lastSample=timer.stats.samples;for(let i=0;i<64;i++){timer.begin();const start=performance.now();renderer.render(scene,camera);submit.push(performance.now()-start);timer.end();await next();if(timer.stats.ms!==null&&timer.stats.samples!==lastSample){gpu.push(timer.stats.ms);lastSample=timer.stats.samples;}}
   rows.push({iteration,cropped:on,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,gpuMs:timer.stats.available?summarize(gpu):null,submitMs:summarize(submit)});
   const data=pixels();if(!on)reference=data;else {let different=0,maxDelta=0,error=0,maskDifference=0;for(let i=0;i<data.length;i++){const delta=Math.abs(data[i]-reference[i]);if(delta>2)different++;maxDelta=Math.max(maxDelta,delta);error+=delta;}for(let i=0;i<data.length;i+=4){const a=reference[i]!==reference[0]||reference[i+1]!==reference[1]||reference[i+2]!==reference[2],b=data[i]!==reference[0]||data[i+1]!==reference[1]||data[i+2]!==reference[2];if(a!==b)maskDifference++;}rows.at(-1).pixels={channelsOver2:different,maxDelta,meanAbsoluteError:error/data.length,silhouetteDifferenceFraction:maskDifference/(640*480)};}images[on?'cropped':'full']=renderer.domElement.toDataURL('image/png').split(',')[1];
  }
  // Sparse sector: old cell-wide sphere submitted invisible geometry; tight bounds skip it.
  trees.begin();trees.write('nature.broadleaf_round',220,0,-20,1,0,white);trees.end();camera.position.set(0,10,0);camera.lookAt(0,10,-20);renderer.render(scene,camera);const tightCalls=renderer.info.render.calls,tightPixels=pixels();
  const single=trees.root.children.find(m=>m.isMesh&&m.geometry.instanceCount>0),sphere=single.geometry.boundingSphere.clone();single.geometry.boundingSphere.center.set(128,0,-128);single.geometry.boundingSphere.radius=Math.hypot(256,256)/2+50;renderer.render(scene,camera);const looseCalls=renderer.info.render.calls,loosePixels=pixels();let cullDifference=0;for(let i=0;i<tightPixels.length;i++)if(tightPixels[i]!==loosePixels[i])cullDifference++;single.geometry.boundingSphere.copy(sphere);
  timer.dispose();trees.dispose();renderer.dispose();renderer.forceContextLoss();return {rows,images,staticUploads,stableVersions,changedUploads,pendingRange,culling:{tightCalls,looseCalls,differentChannels:cullDifference},renderer:'Chromium SwiftShader; 640x480; fixed camera/atlas/instances; no adaptation'};
 },base);
 for(const [name,png]of Object.entries(result.images))await writeFile(out+'/'+name+'.png',Buffer.from(png,'base64'));delete result.images;
 await writeFile(out+'/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,errors},null,2));
 assert.equal(result.staticUploads,0);assert.equal(result.stableVersions,true);assert.equal(result.changedUploads,12);assert.deepEqual(result.pendingRange,[{start:0,count:6}]);assert.equal(result.culling.tightCalls,0);assert.equal(result.culling.looseCalls,1);assert.equal(result.culling.differentChannels,0);for(const r of result.rows.filter(r=>r.cropped))assert.ok(r.pixels.meanAbsoluteError<.2&&r.pixels.silhouetteDifferenceFraction<.0015,'only subpixel rasterisation differences are allowed');assert.deepEqual(errors,[]);

}finally{await browser.close();}
