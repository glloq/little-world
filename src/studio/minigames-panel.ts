/**
 * Studio « Mini-jeux » (doc 107): choose a family/variant, place an area at the view centre,
 * configure players, teams, rules, elements and obstacles, check the ground, then test with
 * « Jouer ici ». Every change is one CommandBus transaction (Undo/Redo, save, archive).
 */
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {MINIGAME_VARIANTS,MINIGAME_VARIANT_IDS,ACTIVITY_FAMILIES,FLOOR_SHAPES,type FloorShape,type MiniGameVariantId} from '../minigames/catalog.ts';
import type {MiniGameElementV1,MiniGameInstanceV1,MiniGameRulesV1} from '../minigames/schema.ts';
import {MINIGAME_BORDERS,MINIGAME_PROP_IDS,MINIGAME_PROPS,MINIGAME_THEME_IDS,MINIGAME_THEME_LABELS,type MiniGameBorder,type MiniGamePropId,type MiniGameStyleV1,type MiniGameThemeId} from '../minigames/themes.ts';
import {inspectMiniGame,suggestMiniGameSites,type SiteQueries} from '../minigames/sites.ts';
import {addGolfHole,createMiniGame,GOLF_HOLE_TYPES,miniGamePad,putMiniGame,removeGolfHole,removeMiniGame,removeMiniGamePad,resetMiniGameLayout,setGolfHoleShape} from '../studio-core/minigame-authoring.ts';
import {gradeMiniGame,projectSiteQueries} from '../studio-core/minigame-composition.ts';
import {terrainHeight} from '../terrain.ts';

export interface MiniGamesPanelContext {session:StudioSession;viewport:StudioViewport;status(message:string,error?:boolean):void}
const RULE_FIELDS:[keyof MiniGameRulesV1,string,number,number][]=[
  ['scoreTarget','Score à atteindre',1,99],['timeLimitSeconds','Durée max (s)',10,3600],['attempts','Tentatives / coups max',1,20],['rounds','Manches',1,10],['par','Par',1,20]];
const ELEMENT_LABELS:Record<MiniGameElementV1['kind'],string>={goal:'But',pin:'Quille',tee:'Départ',hole:'Trou',obstacle:'Obstacle',spawn:'Point de départ',ball:'Balle',target:'Cible',lane:'Piste',scoreboard:'Tableau de score',decor:'Décoration'};
const SHAPE_LABELS:Record<FloorShape,string>={flat:'Plat','ramp-up':'Montée','ramp-down':'Descente',bank:'Dévers',bumps:'Bosses'};
const deg=(r:number)=>Math.round(r*180/Math.PI),rad=(d:number)=>Math.round(d*Math.PI/180*100)/100;

const siteQueries=(ctx:MiniGamesPanelContext):SiteQueries=>projectSiteQueries(ctx.session.document);
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

/** Presentation options (doc 107 §évolution graphique), grouped and compact: theme, borders,
 * score board, flags, automatic decoration, balls, effects; placed boards and decorations
 * are ordinary elements (3D gizmo, Undo/Redo, archives). */
function presentationEditor(g:MiniGameInstanceV1,edit:(label:string,next:MiniGameInstanceV1)=>void){
  const box=node('details','','minigame-style'),st=g.style??{};box.append(node('summary','Présentation et décor'));
  const setStyle=(label:string,patch:Partial<MiniGameStyleV1>)=>{const next={...st,...patch};for(const k of Object.keys(next) as (keyof MiniGameStyleV1)[])if(next[k]===undefined)delete next[k];
    edit(label,Object.keys(next).length?{...g,style:next}:(({style:_drop,...rest})=>rest)(g) as MiniGameInstanceV1);};
  const yes=(v:boolean|undefined)=>v===false?'no':'yes';
  box.append(
    field('Thème',select(st.theme??'auto',[['auto','Automatique (biome)'],...MINIGAME_THEME_IDS.map(t=>[t,MINIGAME_THEME_LABELS[t]] as const)],v=>setStyle('Thème du terrain',{theme:v==='auto'?undefined:v as MiniGameThemeId}))),
    field('Bordures',select(st.border??'auto',[['auto','Selon le thème'],...MINIGAME_BORDERS.map(b=>[b,BORDER_LABELS[b]] as const)],v=>setStyle('Bordures du terrain',{border:v==='auto'?undefined:v as MiniGameBorder}))),
    field('Décor automatique',select(st.decor??'light',[['none','Aucun'],['light','Léger'],['full','Complet']],v=>setStyle('Décor automatique',{decor:v==='light'?undefined:v as 'none'|'full'}))),
    field('Tableau de score',select(yes(st.scoreboard),[['yes','Affiché'],['no','Masqué']],v=>setStyle('Tableau de score',{scoreboard:v==='yes'?undefined:false}))),
    field('Fanions',select(yes(st.flags),[['yes','Oui'],['no','Non']],v=>setStyle('Fanions',{flags:v==='yes'?undefined:false}))),
    field('Balles',select(st.balls??'classic',[['classic','Couleurs classiques'],['bright','Contrastées']],v=>setStyle('Apparence des balles',{balls:v==='classic'?undefined:'bright'}))),
    field('Effets',select(yes(st.effects),[['yes','Autorisés'],['no','Désactivés']],v=>setStyle('Effets visuels',{effects:v==='yes'?undefined:false}))),
    node('p','Le niveau de détail suit le réglage de qualité du joueur (bas : décor essentiel, sans traînées).','muted'));
  const free=(prefix:string)=>{let n=1;while(g.elements.some(e=>e.id===prefix+'-'+n))n++;return prefix+'-'+n;};
  const {halfWidth:hw,halfLength:hl}=g.area,count=(k:string)=>g.elements.filter(e=>e.kind===k).length;
  if(count('scoreboard')<2)box.append(button('Ajouter un tableau de score',()=>edit('Ajouter un tableau de score',{...g,elements:[...g.elements,{id:free('board'),kind:'scoreboard',x:-Math.min(hw+3,hw+7.9),z:0,yaw:Math.PI/2}]})));
  let prop:MiniGamePropId='podium';
  if(count('decor')<24)box.append(field('Décoration',select(prop,MINIGAME_PROP_IDS.map(p=>[p,MINIGAME_PROPS[p].label] as const),v=>{prop=v as MiniGamePropId;})),
    button('Ajouter (bord de la zone, déplaçable en 3D)',()=>edit('Ajouter une décoration',{...g,elements:[...g.elements,{id:free('decor'),kind:'decor',prop,x:Math.min(hw+2,hw+7.9),z:-hl*.5,yaw:-Math.PI/2}]})));
  return box;
}
const BORDER_LABELS:Record<MiniGameBorder,string>={boards:'Planches blanches',wood:'Bois',logs:'Rondins',rope:'Cordes',stone:'Pierre',snowbank:'Neige',basalt:'Basalte',planks:'Planches'};

/** Holes of a staged course: relief type and slope per lane, add / remove a hole. */
function courseEditor(g:MiniGameInstanceV1,edit:(label:string,next:MiniGameInstanceV1)=>void,ctx:MiniGamesPanelContext){
  const box=node('div','','minigame-course'),lanes=g.elements.filter(e=>e.kind==='lane').sort((a,b)=>(a.stage??0)-(b.stage??0));
  const guard=(label:string,f:()=>MiniGameInstanceV1)=>{try{edit(label,f());}catch(e){ctx.status(String(e instanceof Error?e.message:e),true);}};
  box.append(node('h5',lanes.length?`Parcours : ${lanes.length} trou(s)`:'Trou unique (historique)'));
  if(!lanes.length)box.append(node('p','« Disposition par défaut » remplace ce trou par le parcours de 6 trous à pistes.','muted'));
  for(const lane of lanes){
    const k=lane.stage??0,row=node('div','','minigame-element'),shape=lane.shape??'flat';
    row.append(node('span','Trou '+(k+1)),
      field('relief',select(shape,FLOOR_SHAPES.map(f=>[f,SHAPE_LABELS[f]] as const),v=>guard('Relief du trou '+(k+1),()=>setGolfHoleShape(g,k,v as FloorShape,lane.slope??(v==='bumps'?.12:.1))))),
      field(shape==='bumps'?'hauteur (m)':'pente',numberInput(lane.slope??0,v=>guard('Pente du trou '+(k+1),()=>setGolfHoleShape(g,k,shape,v)),0,.3,'.01')),
      button('Voir',()=>{const p=g.area,c=Math.cos(p.heading),sn=Math.sin(p.heading);ctx.viewport.goTo(p.x+lane.x*c+lane.z*sn,p.z-lane.x*sn+lane.z*c,9);}),
      button('Retirer',()=>guard('Retirer le trou '+(k+1),()=>removeGolfHole(g,k))));
    box.append(row);
  }
  if(lanes.length){
    let type=0;
    box.append(field('Nouveau trou',select('0',GOLF_HOLE_TYPES.map(t=>[String(t.id),t.label] as const),v=>{type=Number(v);})),
      button('Ajouter un trou',()=>guard('Ajouter un trou',()=>addGolfHole(g,type))));
  }
  return box;
}

export function mountMiniGamesPanel(host:HTMLElement,ctx:MiniGamesPanelContext){
  const doc=ctx.session.document,games=Object.values(doc.libraries.minigames??{});
  // A graded field follows its area: moving, turning or resizing it re-levels its pad from
  // the natural ground (one transaction, Undo restores both).
  const edit=(label:string,next:MiniGameInstanceV1)=>void ctx.session.change(label,[],d=>{
    const before=d.libraries.minigames?.[next.id];putMiniGame(d,next);
    if(miniGamePad(d,next.id)&&before&&JSON.stringify(before.area)!==JSON.stringify(next.area))gradeMiniGame(d,next);
  }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
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
      await ctx.session.change('Créer un mini-jeu',[],d=>{putMiniGame(d,game);gradeMiniGame(d,game);}).then(()=>ctx.status(game.name+' créé sur un sol aplani : vérifiez puis « Jouer ici ».')).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
    },'primary-button'),
    button('Trouver un terrain adapté près de la vue',async()=>{
      const t=ctx.viewport.camera.target,b=ctx.session.document.world.bounds,avoid=Object.values(ctx.session.document.libraries.minigames??{}).map(g=>g.area);
      const [area]=suggestMiniGameSites(variant,siteQueries(ctx),{anchors:[t],bounds:b,avoid,maxDistance:200});
      if(!area){ctx.status('Aucun terrain assez plat et libre à moins de 200 m',true);return;}
      const game=createMiniGame(ctx.session.document,variant,area,name||undefined);
      await ctx.session.change('Créer un mini-jeu sur un terrain adapté',[],d=>{putMiniGame(d,game);gradeMiniGame(d,game);}).catch(e=>ctx.status(String(e),true));
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
    const modes=MINIGAME_VARIANTS[g.variant].modes;
    if(modes?.length)box.append(field('Mode proposé par défaut',select(g.rules.mode??modes[0].id,modes.map(m=>[m.id,m.label] as const),v=>set('Mode par défaut',{rules:{...g.rules,mode:v}}))),
      node('p','Le joueur peut changer de mode avant de commencer (touches 1, 2…).','muted'));
    if(MINIGAME_VARIANTS[g.variant].stages)box.append(courseEditor(g,(label,next)=>edit(label,next),ctx));
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
      if(e.kind==='decor')row.append(field('objet',select(e.prop??'flag',MINIGAME_PROP_IDS.map(p=>[p,MINIGAME_PROPS[p].label] as const),v=>patch({prop:v as MiniGamePropId},'Changer une décoration'))),
        field('orientation (°)',numberInput(deg(e.yaw??0),v=>patch({yaw:rad(v)},'Orienter une décoration'),-360,360,'5')),
        button('Retirer',()=>set('Retirer une décoration',{elements:g.elements.filter(x=>x.id!==e.id)})));
      if(e.kind==='scoreboard')row.append(field('matière',select(e.prop??'auto',[['auto','Selon le thème'],['wood','Bois'],['stone','Pierre']],v=>patch({prop:v==='auto'?undefined:v as 'wood'|'stone'},'Matière du tableau de score'))),
        field('orientation (°)',numberInput(deg(e.yaw??0),v=>patch({yaw:rad(v)},'Orienter un tableau de score'),-360,360,'5')),
        button('Retirer',()=>set('Retirer un tableau de score',{elements:g.elements.filter(x=>x.id!==e.id)})));
      table.append(row);
    }
    box.append(table);
    box.append(presentationEditor(g,(label,next)=>edit(label,next)));
    const allowed=MINIGAME_VARIANTS[g.variant].elements.obstacle;
    if(allowed&&g.elements.filter(e=>e.kind==='obstacle').length<allowed[1])
      box.append(button('Ajouter un obstacle',()=>{let n=1;while(g.elements.some(e=>e.id==='obstacle-'+n))n++;set('Ajouter un obstacle',{elements:[...g.elements,{id:'obstacle-'+n,kind:'obstacle',x:0,z:0,width:1.2,depth:.3,height:.35}]});}));
    const report=node('p','', 'muted');
    box.append(report,
      button('Analyser le terrain',()=>{const r=inspectMiniGame(g,siteQueries(ctx),{others:games.filter(o=>o.id!==g.id).map(o=>o.area)});report.textContent=r.ok?`Terrain adapté (pente max ${Math.round(r.maxSlope*100)} %)`:'À corriger : '+r.issues.join(' · ');}),
      button('Voir',()=>ctx.viewport.goTo(a.x,a.z,Math.hypot(a.halfWidth,a.halfLength)*1.6)),
      button('Déplacer au centre de la vue',()=>{const t=ctx.viewport.camera.target;set('Déplacer le mini-jeu',{area:{...a,x:Math.round(t.x*10)/10,z:Math.round(t.z*10)/10}});}),
      button('Disposition par défaut',()=>set('Disposition par défaut',resetMiniGameLayout(g))),
      // Optional: flat ground under the activity (an earthwork pad, annulable like any edit).
      button(miniGamePad(doc,g.id)?'Réaplanir le terrain':'Aplanir le terrain',()=>void ctx.session.change('Aplanir le terrain du mini-jeu',[],d=>{const pad=gradeMiniGame(d,g);ctx.status(pad?`Sol lissé au niveau moyen ${pad.levelM} m (terrassement « ${pad.id} », annulable).`:'Relief historique : pas de terrassement possible.',!pad);}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true))),
      ...(miniGamePad(doc,g.id)?[button('Rendre le relief naturel',()=>void ctx.session.change('Retirer le terrassement du mini-jeu',[],d=>removeMiniGamePad(d,g.id)).catch(e=>ctx.status(String(e),true)))]:[]),
      button('Supprimer',()=>void ctx.session.change('Supprimer un mini-jeu',[],d=>removeMiniGame(d,g.id)).catch(e=>ctx.status(String(e),true))));
    host.append(box);
  }
  host.append(node('h4','Familles d’activités'),node('ul'));
  const list=host.lastElementChild!;
  for(const f of ACTIVITY_FAMILIES)list.append(node('li',`${f.label} — ${f.status==='implemented'?'mini-jeux configurables':f.status==='existing'?'système existant : '+f.reuses:'prévu'}`));
  void refreshPreview(ctx);
}
