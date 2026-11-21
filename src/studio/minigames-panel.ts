/**
 * Studio « Mini-jeux » (doc 107): choose a family/variant, place an area at the view centre,
 * configure players, teams, rules, elements and obstacles, check the ground, then test with
 * « Jouer ici ». Every change is one CommandBus transaction (Undo/Redo, save, archive).
 */
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {MINIGAME_VARIANTS,MINIGAME_VARIANT_IDS,ACTIVITY_FAMILIES,type MiniGameVariantId} from '../minigames/catalog.ts';
import type {MiniGameElementV1,MiniGameInstanceV1,MiniGameRulesV1} from '../minigames/schema.ts';
import {inspectMiniGame,suggestMiniGameSites,type SiteQueries} from '../minigames/sites.ts';
import {createMiniGame,putMiniGame,removeMiniGame,resetMiniGameLayout} from '../studio-core/minigame-authoring.ts';
import {projectRaceTerrainEnvironment} from '../studio-core/race-terrain-context.ts';
import {terrainHeight} from '../terrain.ts';

export interface MiniGamesPanelContext {session:StudioSession;viewport:StudioViewport;status(message:string,error?:boolean):void}
const RULE_FIELDS:[keyof MiniGameRulesV1,string,number,number][]=[
  ['scoreTarget','Score à atteindre',1,99],['timeLimitSeconds','Durée max (s)',10,3600],['attempts','Tentatives / coups max',1,20],['rounds','Manches',1,10],['par','Par',1,20]];
const ELEMENT_LABELS:Record<MiniGameElementV1['kind'],string>={goal:'But',pin:'Quille',tee:'Départ',hole:'Trou',obstacle:'Obstacle',spawn:'Point de départ',ball:'Balle',target:'Cible'};
const deg=(r:number)=>Math.round(r*180/Math.PI),rad=(d:number)=>Math.round(d*Math.PI/180*100)/100;

/** Terrain queries of the project WITHOUT its mini-games (their own reserved ground is not an obstacle). */
function siteQueries(ctx:MiniGamesPanelContext):SiteQueries{
  const doc=ctx.session.document,env=projectRaceTerrainEnvironment({...doc,libraries:{...doc.libraries,minigames:undefined}});
  return {height:env.height,water:(x,z)=>env.water(x,z,env.height(x,z)),
    obstacles:(minX,maxX,minZ,maxZ)=>{const out:{x:number;z:number;r:number}[]=[];for(let x=minX;x<=maxX;x+=2)for(let z=minZ;z<=maxZ;z+=2)if(env.occupation(x,z))out.push({x,z,r:.5});return out;}};
}
let preview:{dispose():void}|null=null,previewKey='';
async function refreshPreview(ctx:MiniGamesPanelContext){
  const games=Object.values(ctx.session.document.libraries.minigames??{}),key=JSON.stringify(games);
  if(key===previewKey)return;previewKey=key;
  preview?.dispose();preview=null;ctx.viewport.setOverlay('minigames',null);
  if(!games.length)return;
  const {createMiniGamePreview}=await import('./minigames-preview.ts');
  const next=await createMiniGamePreview(games,{height:terrainHeight});
  if(key!==previewKey){next.dispose();return;}
  preview=next;ctx.viewport.setOverlay('minigames',next.group);
}
/** Called by the shell when the module closes. */
export function disposeMiniGamesPreview(ctx:Pick<MiniGamesPanelContext,'viewport'>){preview?.dispose();preview=null;previewKey='';ctx.viewport.setOverlay('minigames',null);}

export function mountMiniGamesPanel(host:HTMLElement,ctx:MiniGamesPanelContext){
  const doc=ctx.session.document,games=Object.values(doc.libraries.minigames??{});
  const edit=(label:string,next:MiniGameInstanceV1)=>void ctx.session.change(label,[],d=>putMiniGame(d,next)).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
  host.append(node('div','MINI-JEUX','kicker'),node('h3','Mini-jeux de l’île'),
    node('p','Chaque mini-jeu est une instance indépendante (zone, éléments, règles) chargée par le jeu seulement à proximité. Testez avec « Jouer ici ».','muted'));
  // Creation.
  let variant:MiniGameVariantId='football',name='';
  const create=node('div','', 'minigame-create');
  // Family → variants of that family (data from the catalogue, nothing hard-coded here).
  const families=ACTIVITY_FAMILIES.filter(f=>MINIGAME_VARIANT_IDS.some(v=>MINIGAME_VARIANTS[v].family===f.id));
  const variantsOf=(family:string)=>MINIGAME_VARIANT_IDS.filter(v=>MINIGAME_VARIANTS[v].family===family).map(v=>[v,MINIGAME_VARIANTS[v].label] as const);
  const variantSelect=select(variant,variantsOf('ball'),v=>{variant=v as MiniGameVariantId;});
  create.append(field('Famille',select('ball',families.map(f=>[f.id,f.label] as const),f=>{
      variantSelect.replaceChildren(...variantsOf(f).map(([id,label])=>new Option(label,id)));variant=variantSelect.value as MiniGameVariantId;})),
    field('Variante',variantSelect),
    field('Nom (facultatif)',input('',v=>{name=v.trim();})),
    button('Créer au centre de la vue',async()=>{
      const t=ctx.viewport.camera.target,game=createMiniGame(ctx.session.document,variant,{x:t.x,z:t.z},name||undefined);
      await ctx.session.change('Créer un mini-jeu',[],d=>putMiniGame(d,game)).then(()=>ctx.status(game.name+' créé : vérifiez le terrain puis « Jouer ici ».')).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
    },'primary-button'),
    button('Trouver un terrain adapté près de la vue',async()=>{
      const t=ctx.viewport.camera.target,b=ctx.session.document.world.bounds,avoid=Object.values(ctx.session.document.libraries.minigames??{}).map(g=>g.area);
      const [area]=suggestMiniGameSites(variant,siteQueries(ctx),{anchors:[t],bounds:b,avoid,maxDistance:200});
      if(!area){ctx.status('Aucun terrain assez plat et libre à moins de 200 m',true);return;}
      const game=createMiniGame(ctx.session.document,variant,area,name||undefined);
      await ctx.session.change('Créer un mini-jeu sur un terrain adapté',[],d=>putMiniGame(d,game)).catch(e=>ctx.status(String(e),true));
      ctx.viewport.goTo(area.x,area.z,30);ctx.status(game.name+' placé sur un terrain adapté.');
    }));
  host.append(create,node('p',MINIGAME_VARIANTS[variant].description,'muted'));
  // Instances.
  host.append(node('h4',games.length?`${games.length} mini-jeu(x)`:'Aucun mini-jeu'));
  for(const g of games){
    const box=node('details','', 'minigame-item');box.append(node('summary',`${g.name} · ${MINIGAME_VARIANTS[g.variant].label}`));
    const a=g.area,set=(label:string,patch:Partial<MiniGameInstanceV1>)=>edit(label,{...g,...patch});
    box.append(
      field('Nom',input(g.name,v=>set('Renommer le mini-jeu',{name:v}))),
      field('Joueurs min',numberInput(g.playersMin,v=>set('Joueurs min',{playersMin:v}),1,8,'1')),
      field('Joueurs max',numberInput(g.playersMax,v=>set('Joueurs max',{playersMax:v}),1,8,'1')),
      field('Entraînement solo',select(g.rules.practice?'yes':'no',[['yes','Autorisé'],['no','Non']],v=>set('Entraînement solo',{rules:{...g.rules,practice:v==='yes'}}))),
      field('Orientation (°)',numberInput(deg(a.heading),v=>set('Orienter le mini-jeu',{area:{...a,heading:rad(v)}}),-360,360,'1')),
      field('Demi-largeur (m)',numberInput(a.halfWidth,v=>set('Redimensionner le mini-jeu',resetMiniGameLayout({...g,area:{...a,halfWidth:v}})),.5,60,'.1')),
      field('Demi-longueur (m)',numberInput(a.halfLength,v=>set('Redimensionner le mini-jeu',resetMiniGameLayout({...g,area:{...a,halfLength:v}})),1,80,'.1')));
    for(const [key,label,min,max] of RULE_FIELDS){
      if(g.rules[key]===undefined&&!MINIGAME_VARIANTS[g.variant].requiredRules.includes(key as never)&&!(key==='timeLimitSeconds'))continue;
      box.append(field(label,numberInput(Number(g.rules[key]??0),v=>set('Règle : '+label,{rules:{...g.rules,[key]:v||undefined}}),min===10?0:min,max,'1')));
    }
    for(const [i,t] of (g.teams??[]).entries())box.append(field('Équipe '+(i+1),input(t.name,v=>set('Nommer une équipe',{teams:g.teams!.map(x=>x.id===t.id?{...x,name:v}:x)}))));
    const table=node('div','', 'minigame-elements');
    for(const e of g.elements){
      const row=node('div','', 'minigame-element');
      const patch=(p:Partial<MiniGameElementV1>,label:string)=>set(label,{elements:g.elements.map(x=>x.id===e.id?{...x,...p}:x)});
      row.append(node('span',ELEMENT_LABELS[e.kind]+(e.teamId?' ('+(g.teams?.find(t=>t.id===e.teamId)?.name??e.teamId)+')':'')),
        field('x',numberInput(e.x,v=>patch({x:v},'Déplacer un élément'),-a.halfWidth,a.halfWidth,'.1')),
        field('z',numberInput(e.z,v=>patch({z:v},'Déplacer un élément'),-a.halfLength,a.halfLength,'.1')));
      if(e.kind==='obstacle')row.append(field('largeur',numberInput(e.width??1,v=>patch({width:v},'Redimensionner un obstacle'),.1,20,'.1')),
        button('Retirer',()=>set('Retirer un obstacle',{elements:g.elements.filter(x=>x.id!==e.id)})));
      table.append(row);
    }
    box.append(table);
    const allowed=MINIGAME_VARIANTS[g.variant].elements.obstacle;
    if(allowed&&g.elements.filter(e=>e.kind==='obstacle').length<allowed[1])
      box.append(button('Ajouter un obstacle',()=>{let n=1;while(g.elements.some(e=>e.id==='obstacle-'+n))n++;set('Ajouter un obstacle',{elements:[...g.elements,{id:'obstacle-'+n,kind:'obstacle',x:0,z:0,width:1.2,depth:.3,height:.35}]});}));
    const report=node('p','', 'muted');
    box.append(report,
      button('Analyser le terrain',()=>{const r=inspectMiniGame(g,siteQueries(ctx),{others:games.filter(o=>o.id!==g.id).map(o=>o.area)});report.textContent=r.ok?`Terrain adapté (pente max ${Math.round(r.maxSlope*100)} %)`:'À corriger : '+r.issues.join(' · ');}),
      button('Voir',()=>ctx.viewport.goTo(a.x,a.z,Math.hypot(a.halfWidth,a.halfLength)*1.6)),
      button('Déplacer au centre de la vue',()=>{const t=ctx.viewport.camera.target;set('Déplacer le mini-jeu',{area:{...a,x:Math.round(t.x*10)/10,z:Math.round(t.z*10)/10}});}),
      button('Disposition par défaut',()=>set('Disposition par défaut',resetMiniGameLayout(g))),
      button('Supprimer',()=>void ctx.session.change('Supprimer un mini-jeu',[],d=>removeMiniGame(d,g.id)).catch(e=>ctx.status(String(e),true))));
    host.append(box);
  }
  host.append(node('h4','Familles d’activités'),node('ul'));
  const list=host.lastElementChild!;
  for(const f of ACTIVITY_FAMILIES)list.append(node('li',`${f.label} — ${f.status==='implemented'?'mini-jeux configurables':f.status==='existing'?'système existant : '+f.reuses:'prévu'}`));
  void refreshPreview(ctx);
}
