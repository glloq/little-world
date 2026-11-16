/** Controlled WebGL fixture: real terrain palettes/grass, fixed inputs, no game simulation.
 * Measures CPU submission and actual buffer uploads; SwiftShader is not a hardware GPU result. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/',out=process.argv[3]??'/tmp/ground-cover-controlled';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});await page.goto(base+'tools/impostors/bake.html');
 const result=await page.evaluate(async base=>{
  const THREE=await import(base+'node_modules/.vite/deps/three.js'),{groundCover}=await import(base+'src/geography/ground-cover.ts'),{materialColor}=await import(base+'src/geography/materials.ts'),{createGrass}=await import(base+'src/render/grass.ts'),{applySkyLighting}=await import(base+'src/environment/sky-lighting.ts');
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(800,600);document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,4/3,.1,3000),lighting={ambient:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight(),fill:new THREE.DirectionalLight()};scene.add(lighting.ambient,lighting.sun,lighting.fill);lighting.sun.position.set(-130,185,-120);lighting.fill.position.set(100,70,190);
  const gl=renderer.getContext();let uploads=0,uploadBytes=0,uploadMs=0;
  for(const name of ['bufferData','bufferSubData']){const original=gl[name].bind(gl);gl[name]=(...args)=>{const data=args[name==='bufferData'?1:2],start=performance.now();const value=original(...args);uploadMs+=performance.now()-start;uploads++;uploadBytes+=typeof data==='number'?data:(args[4]??data?.length??0)*(data?.BYTES_PER_ELEMENT??1);return value;};}
  const height=(x,z)=>30+Math.sin(x/150)*3+Math.cos(z/190)*2;
  const states=[['meadow','grass',.6],['dry','dry-grass',.18],['forest','forest-floor',.65],['wetland','mud',.95]];
  const results=[],images={};
  for(const [name,material,moisture]of states){
   const sample=(x,z)=>({height:height(x,z),slope:.08,coast:500,cliff:0,volcanic:0,moisture,geology:'soil',biome:name==='dry'?'scrub':name==='wetland'?'wetland':name==='forest'?'forest':'meadow',material,occupation:Math.abs(x-12)<2?'road':'none',underwater:false});
   const geometry=new THREE.PlaneGeometry(2048,2048,128,128);geometry.rotateX(-Math.PI/2);const pos=geometry.getAttribute('position'),colors=new Float32Array(pos.count*3),c=new THREE.Color();let start=performance.now();
   for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),s=sample(x,z);pos.setY(i,s.height);materialColor(s,0,c,x,z,42);colors.set([c.r,c.g,c.b],i*3);}
   const terrainBuildMs=performance.now()-start;geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();const ground=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));scene.add(ground);
   const sampler=(x,z)=>{const c=groundCover(sample(x,z),x,z,42);return c.density?{share:c.density,tall:c.tallGrass,color:c.color}:null;};
   for(const profile of ['dense','balanced','ultra','groundOnly']){
    const grass=createGrass(scene,42,sampler,height,24000,true);grass.setProfile(profile);
    for(let i=0;i<60;i++)grass.update(1/30,{x:0,y:height(0,0),z:0},50);
    for(const [view,y,z]of [['near',33,7],['distant',220,500]]){
     camera.position.set(0,y,z);camera.lookAt(0,30,0);applySkyLighting(lighting,new THREE.Color(),1,.5,0);scene.background=new THREE.Color(0xcadce7);
     for(let i=0;i<60;i++)grass.update(1/30,{x:0,y:height(0,0),z:0},50,{position:camera.position,fov:60,height:600},[{x:1,y:height(1,1),z:1}]);
     renderer.render(scene,camera);const beforeUploads=uploads,beforeBytes=uploadBytes,beforeMs=uploadMs;start=performance.now();
     for(let i=0;i<12;i++){grass.update(1/30,{x:0,y:height(0,0),z:0},1,{position:camera.position,fov:60,height:600});renderer.render(scene,camera);}
     const submitAndUpdateMs=(performance.now()-start)/12;
     results.push({name,profile,view,terrainBuildMs,submitAndUpdateMs,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,grass:{...grass.stats},steadyUploads:uploads-beforeUploads,steadyUploadBytes:uploadBytes-beforeBytes,steadyUploadMs:uploadMs-beforeMs});
     if(profile==='balanced'||profile==='groundOnly')images[name+'-'+profile+'-'+view]=renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    grass.dispose();
   }
   if(name==='meadow'){
    const grass=createGrass(scene,42,sampler,height);grass.setProfile('balanced');for(let i=0;i<60;i++)grass.update(1/30,{x:0,y:height(0,0),z:0},50);
    camera.position.set(0,33,7);camera.lookAt(0,30,0);
    for(const [label,alt,phase]of [['day',1,.5],['night',-1,0]]){applySkyLighting(lighting,new THREE.Color(),alt,phase,0);renderer.render(scene,camera);images[label]=renderer.domElement.toDataURL('image/png').split(',')[1];}grass.dispose();
   }
   ground.removeFromParent();geometry.dispose();ground.material.dispose();
  }
  const gpu=gl.getExtension('WEBGL_debug_renderer_info');const graphics=gl.getParameter(gpu?gpu.UNMASKED_RENDERER_WEBGL:gl.RENDERER);renderer.dispose();renderer.forceContextLoss();return {results,graphics,images,gpuTimeMs:null,totalUploads:uploads,totalUploadBytes:uploadBytes,uploadSubmitMs:uploadMs};
 },base);
 for(const [name,png]of Object.entries(result.images))await writeFile(out+'/'+name+'.png',Buffer.from(png,'base64'));delete result.images;
 await writeFile(out+'/results.json',JSON.stringify({...result,errors},null,2)+'\n');
 assert.deepEqual(errors,[]);for(const r of result.results){assert.equal(r.steadyUploadBytes,0,'no buffer uploads at rest');assert.ok(r.calls<=2);if(r.profile==='groundOnly')assert.equal(r.grass.tufts,0);}
 console.log(JSON.stringify({cases:result.results.length,errors,graphics:result.graphics,totalUploadBytes:result.totalUploadBytes}));
}finally{await browser.close();}
