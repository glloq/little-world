import * as THREE from 'three';
import {createAsset,configureScene} from '../world.ts';
import type {AssetId} from '../world-data.ts';
import type {AssetDefinition} from '../studio-core/types.ts';
import {node,input} from './dom.ts';
import {placementSettings,type PlaceItem} from './viewport/placement-tool.ts';
import {worldAsset,groupLabel,costClass,placeableWorldAssets,assetDefinitionFor} from '../world-production/registry.ts';
import {loadAssetPreview} from '../world.ts';

/** E3 — visual catalogue: categories, search, name + thumbnail, one choice reused for
 * successive placements. Thumbnails are rendered once with a short-lived offscreen renderer. */
const thumbnails=new Map<string,string>();
export const CATEGORIES:Record<string,string>={nature:'Nature',architecture:'Bâtiments',props:'Objets'};
export function assetCategory(id:string){const a=worldAsset(id);if(a&&a.group!=='legacy')return groupLabel(a.group);return CATEGORIES[id.split('.')[0]]??'Divers';}
/** One catalogue for manual placement: project assets + the World Production registry. */
export function libraryAssets(project:Record<string,AssetDefinition>):Record<string,AssetDefinition>{
  const out:Record<string,AssetDefinition>={...project};for(const e of placeableWorldAssets())if(!out[e.id])out[e.id]=assetDefinitionFor(e.id)!;return out;
}
/** Registry facts shown in the library (measured from the GLB files, never typed by hand). */
export function assetFacts(id:string):string{
  const a=worldAsset(id);if(!a)return 'Asset historique du catalogue';
  const [x,y,z]=a.size,u=a.usage;
  return [`${groupLabel(a.group)} · ${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} m`,`${a.lods.length} LOD · ${a.lods.map(l=>l.triangles).join(' / ')} triangles · coût ${costClass(a)}`,
    `Licence : ${a.license} · art : ${a.artStatus} · runtime : ${a.runtimeStatus}`,...(u?[`Usages : ${u.habitats.join(', ')} · placement ${u.placement}${u.instancing?' · instancié':''}`]:[]),`Source : ${a.source}`].join('\n');
}
async function renderThumbnails(ids:string[],done:()=>void){
  const missing=ids.filter(id=>!thumbnails.has(id));if(!missing.length)return;
  const previews=new Map<string,THREE.Object3D>();await Promise.all(missing.map(async id=>{const o=await loadAssetPreview(id);if(o)previews.set(id,o);}));
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(112,84,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
  try{
    for(const id of missing){
      const scene=new THREE.Scene();configureScene(scene);scene.background=null;const object=previews.get(id)??createAsset(id as AssetId);scene.add(object);
      const box=new THREE.Box3().setFromObject(object),sphere=box.getBoundingSphere(new THREE.Sphere()),camera=new THREE.PerspectiveCamera(35,4/3,.1,500),r=Math.max(.5,sphere.radius);
      camera.position.set(sphere.center.x+r*1.9,sphere.center.y+r*1.3,sphere.center.z+r*2.4);camera.lookAt(sphere.center);renderer.render(scene,camera);thumbnails.set(id,canvas.toDataURL('image/png'));
      object.userData.disposed=true;object.removeFromParent();
    }
  }finally{renderer.dispose();renderer.forceContextLoss();}
  done();
}
export function mountLibrary(host:HTMLElement,assets:Record<string,AssetDefinition>,onChoose:(item:PlaceItem)=>void){
  const list=Object.values(libraryAssets(assets));void renderThumbnails(list.map(a=>a.id),()=>draw());
  let query='',category='';const grid=node('div','','library-grid'),tabs=node('div','','chip-row');
  const search=input('',v=>{query=v;draw();});search.placeholder='Rechercher un asset…';search.setAttribute('aria-label','Rechercher un asset');search.oninput=()=>{query=search.value;draw();};
  for(const [key,label]of [['','Tous'],...[...new Set(list.map(a=>assetCategory(a.id)))].map(c=>[c,c])]){const b=node('button',label,'chip');b.type='button';b.onclick=()=>{category=key;for(const c of tabs.children)c.classList.toggle('active',c===b);draw();};if(!key)b.classList.add('active');tabs.append(b);}
  function draw(){
    grid.replaceChildren();const current=placementSettings.item;
    for(const a of list.filter(a=>(!category||assetCategory(a.id)===category)&&(a.name+' '+a.id).toLowerCase().includes(query.toLowerCase()))){
      const b=node('button','','library-item');b.type='button';b.title=a.name+' — '+assetFacts(a.id);b.dataset.assetId=a.id;b.setAttribute('aria-label','Placer : '+a.name);
      const img=node('img');img.alt='';img.src=thumbnails.get(a.id)??'';b.append(img,node('span',a.name));
      if(current.kind==='asset'&&current.id===a.id)b.classList.add('active');
      b.onclick=()=>{placementSettings.item={kind:'asset',id:a.id};onChoose(placementSettings.item);draw();};grid.append(b);
    }
    if(!grid.children.length)grid.append(node('p','Aucun asset ne correspond.','muted'));
  }
  draw();host.append(search,tabs,grid,node('p','Survoler la vue : aperçu vert (valide), orange (à vérifier), rouge (impossible). R / Maj+R : pivoter. Clic : placer, plusieurs fois. Échap : terminer.','muted'));
}
