import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import catalogue from '../assets/catalog.json';
import { addPlacement, buildWorld, configureScene, type AssetId, type Placement, type WorldConfig, type WorldView } from './world';
import { insideWorld } from './terrain';

interface Draft { schemaVersion: 1; config: WorldConfig; placements: Placement[]; }
const defaultDraft=():Draft=>({schemaVersion:1,config:{seed:1284,density:1},placements:[]});
const validAssetIds=new Set(catalogue.assets.map(a=>a.id));
const isAsset=(v:unknown):v is AssetId=>typeof v==='string'&&validAssetIds.has(v);
function validDraft(v:unknown):v is Draft{
  if(typeof v!=='object'||v===null)return false;
  const d=v as Partial<Draft>;
  return d.schemaVersion===1 && !!d.config && Number.isInteger(d.config.seed) &&
    d.config.seed>=1&&d.config.seed<=9999999 && typeof d.config.density==='number' &&
    d.config.density>=0 && d.config.density<=2 && Array.isArray(d.placements) &&
    d.placements.length<=2000 && d.placements.every(p=>typeof p.id==='string'&&p.id.length<100 &&
       isAsset(p.assetId)&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
       insideWorld(p.x,p.z)&&Number.isFinite(p.rotation));
}
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('little-world-editor',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function saveLocal(d:Draft):Promise<void>{
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(d,'main');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
async function loadLocal():Promise<Draft|null>{
  const db=await openDb();
  const result=await new Promise<unknown>((resolve,reject)=>{
    const tx=db.transaction('drafts','readonly');const r=tx.objectStore('drafts').get('main');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  db.close();
  return validDraft(result)?result:null;
}

const viewport=document.querySelector<HTMLElement>('#editor-viewport')!;
const message=document.querySelector<HTMLElement>('#editor-message')!;
const seedInput=document.querySelector<HTMLInputElement>('#seed')!;
const densityInput=document.querySelector<HTMLInputElement>('#density')!;
const densityValue=document.querySelector<HTMLElement>('#density-value')!;
const count=document.querySelector<HTMLElement>('#object-count')!;
const toolLabel=document.querySelector<HTMLElement>('#active-tool')!;
const catalog=document.querySelector<HTMLElement>('#catalogue')!;
const importFile=document.querySelector<HTMLInputElement>('#import-file')!;
const scene=new THREE.Scene();configureScene(scene);
const camera=new THREE.PerspectiveCamera(51,1,.2,1100);
camera.position.set(180,180,220);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.target.set(0,9,0);orbit.enableDamping=true;orbit.maxDistance=530;orbit.minDistance=16;
orbit.maxPolarAngle=Math.PI/2.05;orbit.update();
let draft=defaultDraft();
let world:WorldView=buildWorld(draft.config);scene.add(world.root);
let chosen:AssetId|null=null,dirty=false;
const pointer={x:0,y:0};
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
function info(text:string){message.textContent=text;}
function updateControls(){
  seedInput.value=String(draft.config.seed);
  densityInput.value=String(draft.config.density);
  densityValue.textContent=String(draft.config.density);
  count.textContent=`${draft.placements.length} objet(s) ajoutés${dirty?' · non sauvegardés':''}`;
}
function rebuild(){
  world.dispose();
  world=buildWorld(draft.config);scene.add(world.root);
  for(const item of draft.placements)addPlacement(world,item);
  updateControls();
}
function markDirty(){
  dirty=true;updateControls();
}
catalogue.assets.forEach(asset=>{
  const btn=document.createElement('button');
  btn.type='button';btn.className='asset-choice';
  btn.textContent=asset.name;
  btn.title=`${asset.category} · prefab procédural original`;
  btn.addEventListener('click',()=>{
    for(const item of catalog.querySelectorAll('.asset-choice'))item.classList.remove('selected');
    chosen=asset.id as AssetId;btn.classList.add('selected');
    toolLabel.textContent=asset.name;
    info(`Placer : ${asset.name} — cliquer sur le terrain`);
  });
  catalog.appendChild(btn);
});
function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
resize();
renderer.domElement.addEventListener('pointerdown',e=>{pointer.x=e.clientX;pointer.y=e.clientY;});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!chosen||Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>6)return;
  const rect=renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(mouse,camera);
  const intersections=ray.intersectObject(world.terrain);
  if(!intersections.length)return;
  const pos=intersections[0].point;
  if(!insideWorld(pos.x,pos.z))return;
  const p:Placement={id:crypto.randomUUID(),assetId:chosen,x:+pos.x.toFixed(2),z:+pos.z.toFixed(2),rotation:0};
  draft.placements.push(p);addPlacement(world,p);markDirty();info(`Objet ajouté : ${chosen}`);
});
document.querySelector('#regenerate')!.addEventListener('click',()=>{
  const seed=Number(seedInput.value),density=Number(densityInput.value);
  if(!Number.isInteger(seed)||seed<1||seed>9999999){info('Graine invalide (1–9999999)');return;}
  draft.config={seed,density};rebuild();markDirty();info('Vallée régénérée · placements conservés');
});
densityInput.addEventListener('input',()=>densityValue.textContent=densityInput.value);
document.querySelector('#clear')!.addEventListener('click',()=>{
  if(!draft.placements.length)return;
  if(!window.confirm('Supprimer tous les objets placés manuellement ?'))return;
  draft.placements=[];rebuild();markDirty();info('Objets manuels effacés');
});
document.querySelector('#play-preview')!.addEventListener('click',()=>{
  if(!validDraft(draft)){info('Carte invalide : impossible de tester');return;}
  try{
    sessionStorage.setItem('little-world-preview',JSON.stringify(draft));
    window.location.href=import.meta.env.BASE_URL+'?preview=1';
  }catch(e){info('Prévisualisation impossible : '+String(e));}
});
document.querySelector('#save')!.addEventListener('click',async()=>{
  try{await saveLocal(draft);dirty=false;updateControls();info('Brouillon enregistré dans IndexedDB');}
  catch(e){info(`Échec de sauvegarde locale : ${String(e)}`);}
});
document.querySelector('#export')!.addEventListener('click',()=>{
  if(!validDraft(draft)){info('Carte invalide : export refusé');return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='little-world-valley.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);info('Carte exportée en JSON');
});
document.querySelector('#import')!.addEventListener('click',()=>importFile.click());
importFile.addEventListener('change',async()=>{
  const file=importFile.files?.[0];if(!file)return;
  try{
    if(file.size>2_000_000)throw new Error('Fichier trop grand');
    const parsed:unknown=JSON.parse(await file.text());
    if(!validDraft(parsed))throw new Error('Structure ou valeurs non valides');
    draft=parsed;rebuild();markDirty();info('Carte importée · sauvegarde locale facultative');
  }catch(e){info(`Import refusé : ${String(e)}`);}
  importFile.value='';
});
loadLocal().then(saved=>{
  if(saved){draft=saved;rebuild();info('Dernier brouillon local restauré');}
  else info('Prêt : choisir un objet à gauche pour le placer');
}).catch(()=>info('Stockage local indisponible ; utiliser export/import JSON'));

let previous=performance.now();
function animate(time:number){
  const dt=Math.min(.05,(time-previous)/1000);previous=time;
  orbit.update();world.update(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
