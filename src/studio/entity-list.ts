import type {EntityIndexEntry,ProjectDocument} from '../studio-core/types.ts';
import {node,input} from './dom.ts';
/** E2 — search and type filters over the lightweight entity index (unloaded sectors included). */
export const ENTITY_FILTERS:[string,string,(e:EntityIndexEntry)=>boolean][]=[
  ['all','Tous',()=>true],['prop','Objets',e=>e.kind==='prop'],['building','Bâtiments',e=>e.kind==='building'],
  ['character','PNJ',e=>e.kind==='character'],['interactive','Interactifs',e=>!!e.logical?.interactable],
];
export function filterEntities(p:ProjectDocument,query:string,filter:string,limit=80):EntityIndexEntry[]{
  const test=ENTITY_FILTERS.find(f=>f[0]===filter)?.[2]??(()=>true),q=query.trim().toLowerCase();
  return Object.values(p.entityIndex).filter(e=>test(e)&&(!q||(e.name+' '+e.id).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'fr')).slice(0,limit);
}
export function mountEntityList(host:HTMLElement,p:ProjectDocument,selected:()=>string[],choose:(entry:EntityIndexEntry,additive:boolean)=>void){
  let query='',filter='all';const results=node('div','','search-results'),chips=node('div','','chip-row'),count=node('p','','muted');
  const search=input('',()=>{});search.placeholder='Nom ou identifiant…';search.oninput=()=>{query=search.value;draw();};
  const label=node('label','Rechercher une entité');label.append(search);search.setAttribute('aria-label','Rechercher une entité');
  for(const [key,title]of ENTITY_FILTERS){const b=node('button',title,'chip'+(key==='all'?' active':''));b.type='button';b.setAttribute('aria-label','Filtre '+title);b.setAttribute('aria-pressed',String(key==='all'));b.onclick=()=>{filter=key;for(const c of chips.children){c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',String(c===b));}draw();};chips.append(b);}
  function draw(){
    const ids=new Set(selected()),list=filterEntities(p,query,filter);results.replaceChildren();
    for(const e of list){const b=node('button',e.name,'light-button'+(ids.has(e.id)?' selected':''));b.type='button';b.title=`${e.kind} · ${e.id}`;b.onclick=ev=>choose(e,ev.shiftKey);results.append(b);}
    count.textContent=`${list.length} résultat(s) · Maj+clic : ajouter à la sélection`;
  }
  draw();host.append(label,chips,count,results);return {refresh:draw};
}
