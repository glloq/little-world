import type {EntityIndexEntry,ProjectDocument} from '../studio-core/types.ts';
import {listElements,elementLabel,isLightEntity,type ElementRef} from '../studio-core/elements.ts';
import {node,input} from './dom.ts';
/** E2/E7 — search and type filters over every authoring element: entities from the
 * lightweight global index (unloaded sectors included), lines, zones and retouches. */
export const ENTITY_FILTERS:[string,string,(e:EntityIndexEntry)=>boolean][]=[
  ['all','Tous',()=>true],['prop','Objets',e=>e.kind==='prop'],['building','Bâtiments',e=>e.kind==='building'],
  ['character','PNJ',e=>e.kind==='character'],['interactive','Interactifs',e=>!!e.logical?.interactable],
];
/** Non-entity author layers (lights are entities carrying a Light component). */
const ELEMENT_FILTERS:[string,string][]=[['light','Lumières'],['path','Chemins'],['water','Rivières'],['zone','Zones'],['terrainEdit','Retouches relief'],['biomeEdit','Retouches biotope']];
export function filterEntities(p:ProjectDocument,query:string,filter:string,limit=80):EntityIndexEntry[]{
  const test=ENTITY_FILTERS.find(f=>f[0]===filter)?.[2]??(()=>true),q=query.trim().toLowerCase();
  return Object.values(p.entityIndex).filter(e=>test(e)&&(!q||(e.name+' '+e.id).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'fr')).slice(0,limit);
}
export function filterElements(p:ProjectDocument,query:string,filter:string,limit=80):{ref:ElementRef;label:string;title:string}[]{
  if(filter==='all'){
    const entities=filterEntities(p,query,'all',limit).map(e=>({ref:{kind:'entity',id:e.id} as ElementRef,label:e.name,title:`${isLightEntity(p,e.id)?'lumière':e.kind} · ${e.id}`}));
    const others=listElements(p,query,'all',limit).filter(v=>v.ref.kind!=='entity').map(v=>({...v,title:`${v.ref.kind} · ${v.ref.id}`}));
    return [...entities,...others].slice(0,limit);
  }
  if(ENTITY_FILTERS.some(f=>f[0]===filter))return filterEntities(p,query,filter,limit).map(e=>({ref:{kind:'entity',id:e.id},label:e.name,title:`${e.kind} · ${e.id}`}));
  return listElements(p,query,filter as never,limit).map(v=>({...v,label:v.ref.kind==='entity'?elementLabel(p,v.ref):v.label,title:`${v.ref.kind} · ${v.ref.id}`}));
}
export function mountEntityList(host:HTMLElement,p:ProjectDocument,selected:()=>string[],choose:(ref:ElementRef,additive:boolean)=>void){
  let query='',filter='all';const results=node('div','','search-results'),chips=node('div','','chip-row'),count=node('p','','muted');
  const search=input('',()=>{});search.placeholder='Nom, type ou identifiant…';search.oninput=()=>{query=search.value;draw();};
  const label=node('label','Rechercher une entité');label.append(search);search.setAttribute('aria-label','Rechercher une entité');
  for(const [key,title]of [...ENTITY_FILTERS.map(f=>[f[0],f[1]] as [string,string]),...ELEMENT_FILTERS]){const b=node('button',title,'chip'+(key==='all'?' active':''));b.type='button';b.dataset.filter=key;b.setAttribute('aria-label','Filtre '+title);b.setAttribute('aria-pressed',String(key==='all'));b.onclick=()=>{filter=key;for(const c of chips.children){c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',String(c===b));}draw();};chips.append(b);}
  function draw(){
    const ids=new Set(selected()),list=filterElements(p,query,filter);results.replaceChildren();
    for(const e of list){const b=node('button',e.label,'light-button'+(ids.has(e.ref.id)?' selected':''));b.type='button';b.title=e.title;b.dataset.kind=e.ref.kind;b.onclick=ev=>choose(e.ref,ev.shiftKey);results.append(b);}
    count.textContent=`${list.length} résultat(s) · Maj+clic : ajouter à la sélection`;
  }
  draw();host.append(label,chips,count,results);return {refresh:draw};
}
