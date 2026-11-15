import * as THREE from 'three';
import {createAsset,configureScene} from '../world.ts';
import type {AssetId} from '../world-data.ts';
import type {AssetDefinition} from '../studio-core/types.ts';
import {node,input,button} from './dom.ts';
import {placementSettings,type PlaceItem} from './viewport/placement-tool.ts';
import {worldAsset,groupLabel,costClass,placeableWorldAssets,assetDefinitionFor} from '../world-production/registry.ts';
import {loadAssetPreview} from '../world.ts';

/** E3 — visual catalogue: categories, search, name + thumbnail, one choice reused for
 * successive placements. Thumbnails are rendered once with a short-lived offscreen renderer. */
const thumbnails=new Map<string,string>();
const FAVORITES_KEY='little-world-studio-asset-favorites-v1';
function favoriteIds():Set<string>{
  try{const values=JSON.parse(localStorage.getItem(FAVORITES_KEY)??'[]');return new Set(Array.isArray(values)?values.filter(x=>typeof x==='string'):[]);}
  catch{return new Set();}
}
function saveFavoriteIds(values:Set<string>){try{localStorage.setItem(FAVORITES_KEY,JSON.stringify([...values]));}catch{/* local preferences are optional */}}
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
// A bounded queue avoids fetching every GLB and holding every preview mesh at once.
const queuedPreviews=new Set<string>();let previewQueue=Promise.resolve();
async function thumbnailBatch(ids:string[],done:()=>void){
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setSize(112,84,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
  try{
    for(const id of ids){
      try{
        const object=await loadAssetPreview(id)??createAsset(id as AssetId),scene=new THREE.Scene();
        configureScene(scene);scene.background=null;scene.add(object);
        const box=new THREE.Box3().setFromObject(object),sphere=box.getBoundingSphere(new THREE.Sphere()),camera=new THREE.PerspectiveCamera(35,4/3,.1,500),r=Math.max(.5,sphere.radius);
        camera.position.set(sphere.center.x+r*1.9,sphere.center.y+r*1.3,sphere.center.z+r*2.4);camera.lookAt(sphere.center);
        renderer.render(scene,camera);thumbnails.set(id,canvas.toDataURL('image/png'));object.removeFromParent();
      }catch{/* One unavailable thumbnail never stops the rest of the catalogue. */thumbnails.set(id,'');}
      finally{queuedPreviews.delete(id);}
    }
  }finally{renderer.dispose();renderer.forceContextLoss();done();}
}
function renderThumbnails(ids:string[],done:()=>void){
  const missing=ids.filter(id=>!thumbnails.has(id)&&!queuedPreviews.has(id));
  for(let i=0;i<missing.length;i+=8){
    const batch=missing.slice(i,i+8);batch.forEach(id=>queuedPreviews.add(id));
    previewQueue=previewQueue.catch(()=>{}).then(()=>thumbnailBatch(batch,done));
  }
}
export function mountLibrary(host:HTMLElement,assets:Record<string,AssetDefinition>,onChoose:(item:PlaceItem)=>void){
  const list=Object.values(libraryAssets(assets));
  let query='',category='';const favorites=favoriteIds(),grid=node('div','','library-grid'),tabs=node('div','','chip-row'),facts=node('p','','muted');
  const search=input('',v=>{query=v;draw();});search.placeholder='Rechercher un asset…';search.setAttribute('aria-label','Rechercher un asset');search.oninput=()=>{query=search.value;draw();};
  for(const [key,label]of [['','Tous'],['#favorites','Favoris'],...[...new Set(list.map(a=>assetCategory(a.id)))].map(c=>[c,c])]){const b=node('button',label,'chip');b.type='button';b.onclick=()=>{category=key;for(const c of tabs.children)c.classList.toggle('active',c===b);draw();};if(!key)b.classList.add('active');tabs.append(b);}
  function draw(){
    grid.replaceChildren();const current=placementSettings.item;
    facts.textContent=current.kind==='asset'?(list.find(a=>a.id===current.id)?.name??current.id)+' — '+assetFacts(current.id).split('\n').slice(0,2).join(' · '):'Choisissez un modèle 3D dans la bibliothèque.';
    const filtered=list.filter(a=>(!category||(category==='#favorites'?favorites.has(a.id):assetCategory(a.id)===category))&&(a.name+' '+a.id).toLowerCase().includes(query.toLowerCase()));
    // Progressively render all matches in small batches (visible entries first).
    renderThumbnails(filtered.map(a=>a.id),()=>{for(const image of grid.querySelectorAll<HTMLImageElement>('img[data-asset-id]')){const url=thumbnails.get(image.dataset.assetId??'');if(url){image.src=url;image.style.display='block';const placeholder=image.nextElementSibling as HTMLElement|null;if(placeholder)placeholder.style.display='none';}}});
    for(const a of filtered){
      const b=node('button','','library-item');b.type='button';b.title=a.name+' — '+assetFacts(a.id);b.dataset.assetId=a.id;b.setAttribute('aria-label','Placer : '+a.name);
      const img=node('img');img.alt='';img.loading='lazy';img.dataset.assetId=a.id;
      const placeholder=node('div','Aperçu 3D','asset-thumbnail-placeholder'),url=thumbnails.get(a.id);
      if(url){img.src=url;placeholder.style.display='none';}
      else img.style.display='none';
      b.append(img,placeholder,node('span',a.name));
      if(current.kind==='asset'&&current.id===a.id)b.classList.add('active');
      b.onclick=()=>{placementSettings.item={kind:'asset',id:a.id};onChoose(placementSettings.item);draw();};
      const tile=node('div','','library-tile'),favorite=button(favorites.has(a.id)?'★':'☆',()=>{
        if(favorites.has(a.id))favorites.delete(a.id);else favorites.add(a.id);
        saveFavoriteIds(favorites);draw();
      },'chip');
      favorite.title=favorites.has(a.id)?'Retirer des favoris':'Ajouter aux favoris';
      favorite.setAttribute('aria-label',favorite.title);tile.append(b,favorite);grid.append(tile);
    }
    if(!grid.children.length)grid.append(node('p','Aucun asset ne correspond.','muted'));
  }
  draw();host.append(search,tabs,grid,facts,node('p','Survoler la vue : aperçu vert (valide), orange (à vérifier), rouge (impossible). R / Maj+R : pivoter. Clic : placer, plusieurs fois. Échap : terminer.','muted'));
}
