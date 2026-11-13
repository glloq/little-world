/** Studio — settings of mine and farm-plot zones, edited in the shared inspector (one undoable
 * transaction per change, validated before it is applied). The mine plan per level previews
 * what the player will find when digging (deterministic geology, galleries, entrance, stairs). */
import {node,button,field,numberInput,select,input} from './dom.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import {defaultMineSettings,validateMineSettings,withLevelCount,MINE_MATERIALS,type MineSettingsV3} from '../mine/mine-data.ts';
import {MineGrid} from '../mine/mine-state.ts';
import {defaultFarmSettings,validateFarmSettings,CROPS,type FarmSettingsV3} from '../farm/farm-data.ts';

type Apply=(label:string,patch:Partial<ActivityZoneV3>)=>void;
const deg=(r:number)=>Math.round(r*180/Math.PI),rad=(d:number)=>d*Math.PI/180;
export function activitySection(zone:ActivityZoneV3,apply:Apply,ground:(x:number,z:number)=>number,status:(t:string,e?:boolean)=>void):HTMLElement{
  return zone.kind==='mine'?mineSection(zone,apply,ground,status):farmSection(zone,apply,status);
}
function mineSection(zone:ActivityZoneV3,apply:Apply,ground:(x:number,z:number)=>number,status:(t:string,e?:boolean)=>void){
  const box=node('div','','activity-card mine-card');box.append(node('h4','Mine : niveaux, entrée, géologie'));
  const centre={x:zone.polygon.reduce((s,p)=>s+p.x,0)/zone.polygon.length,z:zone.polygon.reduce((s,p)=>s+p.z,0)/zone.polygon.length};
  if(!zone.mine){box.append(node('p','Paramètres par défaut au jeu (niveaux sous le relief, entrée au nord). Configurez-les pour les modifier.','muted'),button('Configurer la mine',()=>apply('Configurer la mine',{mine:defaultMineSettings(zone.polygon,zone.levels??2,ground(centre.x,centre.z),Math.floor(Math.random()*1e6))}),'primary-button'));return box;}
  const m=zone.mine,edit=(label:string,change:(next:MineSettingsV3)=>void)=>{const next=structuredClone(m);change(next);try{validateMineSettings(next,zone.polygon,zone.levels??next.levels.length);apply(label,{mine:next});}catch(e){status(String(e instanceof Error?e.message:e),true);}};
  box.append(field('Graine géologique',numberInput(m.seed,v=>edit('Graine de la mine',n=>{n.seed=Math.max(0,Math.round(v));}),0,2**31,'1')),
    field('Entrée X (m)',numberInput(m.entrance.x,v=>edit('Entrée de la mine',n=>{n.entrance.x=v;}))),field('Entrée Z (m)',numberInput(m.entrance.z,v=>edit('Entrée de la mine',n=>{n.entrance.z=v;}))),
    field('Orientation de l’entrée (°)',numberInput(deg(m.entrance.heading),v=>edit('Entrée de la mine',n=>{n.entrance.heading=rad(v);}),-360,360,'1')));
  const levels=node('div','','mine-levels');
  m.levels.forEach((l,i)=>{const row=node('div','','water-point');row.dataset.level=l.id;row.append(node('strong',l.id),field(`Nom du niveau ${i+1}`,input(l.name,v=>edit('Nom du niveau',n=>{n.levels[i].name=v.trim()||l.name;}))),
    field(`Sol du niveau ${i+1} (m)`,numberInput(l.floorY,v=>edit('Altitude du niveau',n=>{n.levels[i].floorY=v;}),-2000,2000,'.5')),field(`Hauteur du niveau ${i+1} (m)`,numberInput(l.height,v=>edit('Hauteur du niveau',n=>{n.levels[i].height=v;}),2.5,6,'.5')));levels.append(row);});
  for(const [i,c] of m.connectors.entries()){const row=node('div','','water-point');row.append(node('strong',`Escalier ${c.upper} → ${c.lower}`),field(`Escalier ${i+1} X`,numberInput(c.x,v=>edit('Déplacer un escalier',n=>{n.connectors[i].x=v;}))),field(`Escalier ${i+1} Z`,numberInput(c.z,v=>edit('Déplacer un escalier',n=>{n.connectors[i].z=v;}))));levels.append(row);}
  box.append(node('h4','Niveaux et escaliers'),levels,node('p',`${m.galleries.length} galerie(s) initiale(s) · ${m.connectors.length} escalier(s)`,'muted'));
  // Plan per level: geology, open cells, entrance and stairs (preview of the dig).
  let level=0;const plan=node('canvas','','mine-plan');plan.setAttribute('aria-label','Plan de la mine par niveau');
  const draw=()=>{try{const grid=new MineGrid({id:zone.id,name:zone.name,polygon:zone.polygon,mine:m}),scale=Math.max(1,Math.floor(240/Math.max(grid.width,grid.depth)));plan.width=grid.width*scale;plan.height=grid.depth*scale;const g=plan.getContext('2d');if(!g)return;
    for(let z=0;z<grid.depth;z++)for(let x=0;x<grid.width;x++){const ix=grid.minX+x,iz=grid.minZ+z,mat=grid.material(level,ix,iz);g.fillStyle=mat===0?'#efe2c4':'#'+MINE_MATERIALS[mat].color.toString(16).padStart(6,'0');g.fillRect(x*scale,z*scale,scale,scale);}
    const mark=(x:number,z:number,c:string)=>{g.fillStyle=c;g.fillRect((Math.floor(x)-grid.minX)*scale-1,(Math.floor(z)-grid.minZ)*scale-1,scale+2,scale+2);};
    if(level===0)mark(m.entrance.x,m.entrance.z,'#2c8a3c');for(const c of m.connectors)if(c.upper===m.levels[level].id||c.lower===m.levels[level].id)mark(c.x,c.z,'#1f5f9a');
    const counts=new Map<number,number>();for(let z=0;z<grid.depth;z++)for(let x=0;x<grid.width;x++){const k=grid.material(level,grid.minX+x,grid.minZ+z);counts.set(k,(counts.get(k)??0)+1);}
    legend.textContent=`Filons de fer : ${counts.get(4)??0} cellules · cristaux : ${counts.get(5)??0} · ouvert : ${counts.get(0)??0} · vert : entrée, bleu : escalier`;}catch(e){legend.textContent=String(e);}};
  const legend=node('p','','muted mine-plan-legend');
  box.append(node('h4','Plan par niveau (aperçu du creusement)'),field('Niveau affiché',select('0',m.levels.map((l,i)=>[String(i),l.name] as [string,string]),v=>{level=Number(v);draw();})),plan,legend,
    button('Réinitialiser la mine (valeurs par défaut)',()=>apply('Réinitialiser la mine',{mine:defaultMineSettings(zone.polygon,zone.levels??m.levels.length,ground(centre.x,centre.z),m.seed)})));
  draw();return box;
}
/** Level count change keeps the settings coherent (levels, stairs, galleries). */
export function levelCountPatch(zone:ActivityZoneV3,count:number):Partial<ActivityZoneV3>{
  const levels=Math.max(1,Math.min(8,Math.round(count)));return zone.mine?{levels,mine:withLevelCount(zone.mine,levels)}:{levels};
}
function farmSection(zone:ActivityZoneV3,apply:Apply,status:(t:string,e?:boolean)=>void){
  const box=node('div','','activity-card farm-card');box.append(node('h4','Parcelle : cultures, sol, irrigation'));
  if(!zone.farm){box.append(node('p','Paramètres par défaut au jeu (trois cultures, irrigation à l’est). Configurez-les pour les modifier.','muted'),button('Configurer la parcelle',()=>apply('Configurer la parcelle',{farm:defaultFarmSettings(zone.polygon)}),'primary-button'));return box;}
  const f=zone.farm,edit=(label:string,change:(next:FarmSettingsV3)=>void)=>{const next=structuredClone(f);change(next);try{validateFarmSettings(next);apply(label,{farm:next});}catch(e){status(String(e instanceof Error?e.message:e),true);}};
  const crops=node('div','','chip-row');
  for(const c of Object.values(CROPS)){const b=node('input');b.type='checkbox';b.checked=f.crops.includes(c.id);b.onchange=()=>edit('Cultures autorisées',n=>{n.crops=b.checked?[...n.crops,c.id]:n.crops.filter(x=>x!==c.id);if(n.initialCrop&&!n.crops.includes(n.initialCrop))n.initialCrop=null;});crops.append(field(c.name,b));}
  box.append(node('h4','Cultures autorisées'),crops,
    field('Culture initiale',select(f.initialCrop??'',[['','Aucune (parcelle vide)'],...f.crops.map(c=>[c,CROPS[c].name] as [string,string])],v=>edit('Culture initiale',n=>{n.initialCrop=v||null;}))),
    field('Orientation des rangs (°)',numberInput(deg(f.rowAngle),v=>edit('Orientation des rangs',n=>{n.rowAngle=rad(v);}),-360,360,'1')),
    field('Fertilité du sol (0–1)',numberInput(f.soil.fertility,v=>edit('Fertilité du sol',n=>{n.soil.fertility=Math.max(0,Math.min(1,v));}),0,1,'.05')),
    field('Drainage du sol (0–1)',numberInput(f.soil.drainage,v=>edit('Drainage du sol',n=>{n.soil.drainage=Math.max(0,Math.min(1,v));}),0,1,'.05')));
  const irrigation=node('input');irrigation.type='checkbox';irrigation.checked=!!f.irrigation;
  irrigation.onchange=()=>edit('Point d’irrigation',n=>{n.irrigation=irrigation.checked?defaultFarmSettings(zone.polygon).irrigation:null;});
  box.append(field('Point d’irrigation (sinon : eau à moins de 20 m)',irrigation));
  if(f.irrigation)box.append(field('Irrigation X (m)',numberInput(f.irrigation.x,v=>edit('Point d’irrigation',n=>{n.irrigation={...n.irrigation!,x:v};}))),field('Irrigation Z (m)',numberInput(f.irrigation.z,v=>edit('Point d’irrigation',n=>{n.irrigation={...n.irrigation!,z:v};}))));
  // Stage preview: the colours the plants take while growing (same palette as the game).
  const stages=node('div','','farm-stages');for(const c of f.crops){const row=node('p','',`farm-stage-row`);row.append(node('strong',CROPS[c].name+' : '));for(const [label,color] of [['semis',CROPS[c].color],['croissance',CROPS[c].color],['mûr',CROPS[c].matureColor]] as const){const chip=node('span',label,'farm-stage');chip.style.background='#'+color.toString(16).padStart(6,'0');row.append(chip);}stages.append(row);}
  box.append(node('h4','Aperçu des stades'),stages);
  return box;
}
