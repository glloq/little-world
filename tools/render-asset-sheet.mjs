import {chromium} from 'playwright';
/** Contact sheet of registry assets (art review aid). Usage: node tools/render-asset-sheet.mjs <base-url> <out.png> [source-filter] */
const base=process.argv[2]??'http://127.0.0.1:5173/little-world/';const out=process.argv[3]??'asset-sheet.png';const filter=process.argv[4]??'world-kit';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(base+'studio/');
await p.evaluate(async({base,filter})=>{
  const THREE=await import(base+'node_modules/three/build/three.module.js');
  const {GLTFLoader}=await import(base+'node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const list=await (await import(base+'src/world-production/registry.ts')).WORLD_ASSETS.assets.filter(a=>a.source.includes(filter));
  const {linearizeVertexColors}=await import(base+'src/world-production/species-library.ts');
  document.body.innerHTML='';const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1600,1000);r.outputColorSpace=THREE.SRGBColorSpace;document.body.append(r.domElement);
  r.setScissorTest(true);const cols=8,rows=Math.ceil(list.length/cols),cw=200,ch=1000/rows;const loader=new GLTFLoader();
  for(let i=0;i<list.length;i++){const a=list[i];const g=(await loader.loadAsync(base+a.lods[0].file)).scene;linearizeVertexColors(g);g.traverse(o=>{if(o.isMesh)o.material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});});
    const sc=new THREE.Scene();sc.background=new THREE.Color(0xcfe3dc);sc.add(new THREE.HemisphereLight(0xffffff,0x667766,2));const d=new THREE.DirectionalLight(0xffeedd,2);d.position.set(-3,5,-4);sc.add(d);sc.add(g);
    const box=new THREE.Box3().setFromObject(g),s=box.getBoundingSphere(new THREE.Sphere()),cam=new THREE.PerspectiveCamera(35,cw/ch,.1,500);cam.position.set(s.center.x-s.radius*1.6,s.center.y+s.radius*.9,s.center.z-s.radius*2.2);cam.lookAt(s.center);
    const x=(i%cols)*cw,y=1000-(Math.floor(i/cols)+1)*ch;r.setViewport(x,y,cw,ch);r.setScissor(x,y,cw,ch);r.render(sc,cam);}
},{base,filter});
await p.waitForTimeout(500);await p.screenshot({path:out});await b.close();
