/** Player interface of the game (published worlds and « Jouer ici » alike): one controller,
 * panels loaded with the game, a minimal HUD and one notification manager. It reads gameplay
 * state through the existing runtime APIs and sends commands through them; it never writes
 * business state itself. Updates are event-driven or throttled (4 Hz), never a DOM rebuild
 * per frame. */
import type {GameplayView} from '../../gameplay/game-view.ts';
import type {MovementSpace} from '../../physics/collision-world.ts';
import type {AudioController} from '../../audio/view.ts';
import {UiController} from './ui-controller.ts';
import {isEditableGameTarget} from '../../input/gameplay-input.ts';
import {loadPreferences,savePreferences,type UiPreferences} from './preferences.ts';
import {createNotificationCenter,type NoticeKind} from '../notifications/notifications.ts';
import {inventoryPanel} from '../inventory/inventory.ts';
import {journalPanel,questChanges} from '../journal/journal.ts';
import {createMapRaster,mapPanel,type MapMarker,type MapDeps} from '../map/map.ts';
import {createMinimap} from '../map/minimap.ts';
import {createWaypointStore} from '../map/waypoints.ts';
import {hudIcon} from '../shared/icons.ts';
import {savesPanel} from '../saves/saves.ts';
import {settingsPanel} from '../settings/settings.ts';
import {pauseMenu} from '../menus/pause.ts';
import {shopPanel} from '../shop/shop.ts';
import {COIN,SHOPS,type ShopKind} from '../../gameplay/economy.ts';
import {activityCard,miningViewModel,farmingViewModel} from '../activities/activity-card.ts';
import {promptText,type TargetDescriptor} from '../interactions/targets.ts';
import {el,button,kbd} from '../shared/dom.ts';
import './ui.css';
import './hud.css';

export interface GameUiDeps {
  gameplay:GameplayView|null;
  npcs:{states:readonly {x:number;z:number;definition:{id:string;name:string}}[];dialogue:{isOpen:boolean}};
  audio:AudioController|null;
  environment?():{dayPhase:number;weather:'clear'|'cloudy'|'rain'};
  landmarks?:readonly {id:string;label:string;x:number;z:number}[];
  world:{name:string;buildVersion:string;dayLength:number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};seaLevel:number;height(x:number,z:number):number;water(x:number,z:number):number|null};
  eatFood?(id:string):{ok:boolean;message:string};
  player():{gas?:number;maxGas?:number;x:number;y:number;z:number;yaw:number;space?:MovementSpace;mode:string;oxygen:number;maxOxygen:number;stamina:number;maxStamina:number;speed?:number;stalled?:boolean};
  target():TargetDescriptor|null;
  quality:HTMLSelectElement|null;
  applyDistantRendering?(value:UiPreferences['distantRendering'],initial:boolean):void;
  home():void;studioUrl:string;temporary:boolean;focusGameplay():boolean;
}
export function createGameUi(deps:GameUiDeps){
  const host=el('div','ui-root');host.id='ui-root';host.classList.add('ui-await-start');document.body.append(host);
  let prefs=loadPreferences();deps.applyDistantRendering?.(prefs.distantRendering,true);
  const devUrl=/[?&](metrics|dev)(=|&|$)/.test(location.search);
  const applyPrefs=()=>{document.body.classList.toggle('developer',prefs.developer||devUrl);document.body.classList.toggle('reduce-motion',prefs.reduceMotion);};applyPrefs();
  const updatePrefs=(patch:Partial<UiPreferences>)=>{prefs={...prefs,...patch};if(patch.distantRendering!==undefined)deps.applyDistantRendering?.(prefs.distantRendering,false);if(!savePreferences(prefs))center.notify('warning','Préférences non enregistrées (stockage local indisponible)');applyPrefs();};
  // Notifications: interface sounds from the Audio V2 catalogue, only when not merged.
  const sound=(kind:NoticeKind)=>{const id=kind==='error'||kind==='warning'?'ui.error':kind==='save'?'ui.save':kind==='quest'?'ui.confirm':null;if(id)deps.audio?.emit(id,{source:'ui'});};
  const center=createNotificationCenter(host,sound);
  const ui=new UiController(host,deps.focusGameplay),g=deps.gameplay,a=g?.activities;
  // Panels.
  let selectedTool:string|null=null,restoring=false;
  const inventory=inventoryPanel({items:()=>g?.runtime.data.items??[],inventory:()=>g?.runtime.state.inventory??{},selectedTool:()=>selectedTool,selectTool:id=>{selectedTool=id;renderTool();},gasLevel:()=>deps.player().gas??0,
    consume:deps.eatFood?(id)=>{const result=deps.eatFood!(id);center.notify(result.ok?'success':'warning',result.message);return result.ok;}:undefined});
  ui.register('inventory','Sac',{render:b=>inventory.render(b),onClose:()=>{inventory.markSeen();deps.audio?.emit('ui.inventory.close',{source:'ui'});}});
  ui.register('journal','Journal',{render:b=>journalPanel({objectives:()=>g?.runtime.data.objectives??[],status:()=>g?.runtime.state.objectives??{},activities:()=>g?.runtime.data.activities??[]}).render(b)});
  const waypoints=createWaypointStore(g?.runtime.data.worldId??deps.world.name,deps.world.bounds,deps.temporary);
  const markers=():MapMarker[]=>{
    const out:MapMarker[]=[];
    for(const [id,m] of a?.mines??[])out.push({id:'mine:'+id,kind:'mine',label:m.zone.name,x:m.zone.mine.entrance.x,z:m.zone.mine.entrance.z});
    for(const [id,f] of a?.farms??[]){const c=f.zone.polygon.reduce((s,p)=>({x:s.x+p.x/f.zone.polygon.length,z:s.z+p.z/f.zone.polygon.length}),{x:0,z:0});out.push({id:'farm:'+id,kind:'farm',label:f.zone.name,...c});}
    for(const n of deps.npcs.states)out.push({id:'npc:'+n.definition.id,kind:'npc',label:n.definition.name,x:n.x,z:n.z});
    // Missions in progress: places of the interactions of their activities (data-driven).
    if(g){const s=g.runtime.state;for(const act of g.runtime.data.activities??[]){if(!act.objectiveId||s.objectives[act.objectiveId]!=='active')continue;
      for(const iid of act.interactionIds){const i=g.runtime.data.interactions.find(x=>x.id===iid),eid=i?.trigger.type==='onInteract'?i.trigger.entityId:undefined,p=eid?g.runtime.getEntityPosition(eid):undefined;if(p&&s.entities[eid!]?.collected!==true)out.push({id:'quest:'+iid,kind:'quest',label:act.name,x:p.x,z:p.z});}}}
    for(const l of deps.landmarks??[])out.push({id:'poi:'+l.id,kind:'poi',label:l.label,x:l.x,z:l.z});
    for(const w of waypoints.points)out.push({id:w.id,kind:'waypoint',label:w.label,x:w.x,z:w.z,active:waypoints.activeId===w.id});
    return out;
  };
  const mapDeps:MapDeps={bounds:deps.world.bounds,height:deps.world.height,water:deps.world.water,seaLevel:deps.world.seaLevel,markers,player:()=>{const p=deps.player();return {x:p.x,z:p.z,yaw:p.yaw};}};
  const mapRaster=createMapRaster(mapDeps),map=mapPanel(mapDeps,mapRaster,waypoints);
  ui.register('map','Carte',{render:b=>map.render(b),onClose:()=>map.close()});
  if(g){const saves=savesPanel({worldId:g.runtime.data.worldId,buildVersion:g.runtime.data.buildVersion,dayLength:g.runtime.climate.definition.dayLengthSeconds,temporary:g.temporary,
    list:()=>g.slots.list(g.runtime.data.worldId),save:id=>g.slots.save(g.compose(id)),load:id=>g.slots.load(g.runtime.data.worldId,id),remove:id=>g.slots.delete(g.runtime.data.worldId,id),
    restore:save=>{restoring=true;try{return g.restore(save);}finally{restoring=false;snapshot();}},exportCurrent:()=>g.compose('slot-export'),importFile:raw=>g.importSave(raw),
    confirm:(t,l)=>ui.confirm(t,l),closePanels:()=>ui.close(),notify:(k,t)=>center.notify(k,t)});
    ui.register('saves','Parties',{pauses:true,render:b=>saves.render(b)});}
  // Counters (mine, forest, port, market, farm, inn): one panel, catalogue chosen by the counter.
  let shopKind:ShopKind|null=null;
  if(g){const shop=shopPanel({kind:()=>shopKind,inventory:()=>g.runtime.state.inventory,name:id=>g.itemName(id),max:id=>g.purse.max(id),trade:(k,id,q,m)=>g.trade(k,id,q,m),notify:(ok,t)=>{center.notify(ok?'success':'warning',t);deps.audio?.emit(ok?'ui.confirm':'ui.error',{source:'ui'});}});
    ui.register('shop','Comptoir',{pauses:true,render:b=>{const h=b.closest('.ui-panel')?.querySelector('h2');if(h&&shopKind)h.textContent=SHOPS[shopKind].name;shop.render(b);}});}
  let closeAudioPopover=()=>{};
  ui.register('settings','Paramètres',{pauses:true,render:b=>{closeAudioPopover();settingsPanel({preferences:()=>prefs,update:updatePrefs,quality:deps.quality,audioPanel:deps.audio?.panel??null}).render(b);},
    // The audio panel goes back to its developer place when the settings close.
    onClose:()=>{const audio=deps.audio?.panel;if(audio){audio.open=false;const advanced=audio.querySelector<HTMLDetailsElement>('.audio-mixer-advanced');if(advanced)advanced.open=false;document.body.append(audio);}}});
  ui.register('pause','Menu',{pauses:true,render:b=>pauseMenu({has:id=>ui.has(id),open:id=>ui.open(id),resume:()=>ui.close(),home:()=>{host.classList.add('ui-await-start');deps.home();},studioUrl:deps.studioUrl,worldName:deps.world.name,temporary:deps.temporary}).render(b)});
  // Non-blocking HUD. The map, sound engine and gameplay state remain the single sources of truth.
  const prompt=document.querySelector<HTMLElement>('#action')??el('div','action-toast');prompt.id='action';prompt.classList.add('ui-prompt','hide');host.append(prompt);
  const top=el('header','ui-hud-top'),topLeft=el('div','ui-hud-group'),topRight=el('div','ui-hud-group');
  const menu=button('',()=>ui.toggle('pause'),'ui-hud-button','Ouvrir le menu (Échap)');
  menu.dataset.panel='pause';menu.append(hudIcon('menu'));menu.setAttribute('aria-label','Menu (Échap)');
  const purse=el('div','ui-purse'),coinCount=el('span','ui-purse-count');purse.append(el('span','ui-coin-emoji','🪙'),coinCount);purse.setAttribute('aria-label','Bourse');
  topLeft.append(menu);if(g)topLeft.append(purse);
  const weather=el('div','ui-weather-chip');weather.setAttribute('aria-label','Météo et heure du monde');
  const soundButton=button('',()=>toggleAudioPopover(),'ui-hud-button ui-sound-button','Volume du jeu');
  soundButton.setAttribute('aria-label','Régler le volume');soundButton.setAttribute('aria-expanded','false');soundButton.setAttribute('aria-controls','ui-audio-popover');soundButton.append(hudIcon('volume'));
  topRight.append(weather,soundButton);top.append(topLeft,topRight);host.append(top);
  const audioPopover=el('div','ui-audio-popover');audioPopover.id='ui-audio-popover';audioPopover.hidden=true;host.append(audioPopover);
  function hideAudioPopover(focusGame=false){
    if(audioPopover.hidden)return;
    audioPopover.hidden=true;soundButton.setAttribute('aria-expanded','false');
    const mixer=deps.audio?.panel;
    if(mixer&&audioPopover.contains(mixer)){mixer.open=false;document.body.append(mixer);}
    if(focusGame&&!ui.blocking)deps.focusGameplay();
  }
  closeAudioPopover=hideAudioPopover;
  function toggleAudioPopover(){
    if(!audioPopover.hidden){hideAudioPopover(true);return;}
    const mixer=deps.audio?.panel;
    if(mixer){
      audioPopover.replaceChildren(el('h3','ui-audio-title','Son'),mixer);
      mixer.open=true;
      if(!deps.audio!.engine.settings.muted)void deps.audio!.engine.unlock();
    }else{
      audioPopover.replaceChildren(el('h3','ui-audio-title','Son'),el('p','ui-muted','Aucun son disponible pour ce monde. Les réglages audio sont inactifs.'));
    }
    audioPopover.hidden=false;soundButton.setAttribute('aria-expanded','true');
  }
  document.addEventListener('pointerdown',e=>{
    if(!audioPopover.hidden&&!audioPopover.contains(e.target as Node)&&!soundButton.contains(e.target as Node))hideAudioPopover();
  });
  const quick=el('nav','ui-quickbar');quick.setAttribute('aria-label','Accès rapide');
  for(const [id,label,key,icon] of [['inventory','Sac','I','backpack'],['journal','Journal','J','journal']] as const){
    if(id==='inventory'&&!g)continue;
    const b=button('',()=>ui.toggle(id),'ui-quick');b.append(hudIcon(icon),el('span','ui-quick-label',label),kbd(key));
    b.setAttribute('aria-label',label+' ('+key+')');b.dataset.panel=id;quick.append(b);
  }
  const minimap=createMinimap(mapDeps,mapRaster,()=>ui.open('map'));
  const tool=el('div','ui-tool hide'),oxygen=el('div','ui-oxygen hide');oxygen.setAttribute('role','meter');oxygen.setAttribute('aria-label','Oxygène');
  const oxyFill=el('span','ui-meter-fill');oxygen.append(el('span','','Oxygène'),el('span','ui-meter-track'));oxygen.lastElementChild!.append(oxyFill);
  const stamina=el('div','ui-oxygen ui-stamina hide');stamina.setAttribute('role','meter');stamina.setAttribute('aria-label','Endurance');
  const stFill=el('span','ui-meter-fill');stamina.append(el('span','','Endurance'),el('span','ui-meter-track'));stamina.lastElementChild!.append(stFill);
  const velocity=el('div','ui-motion-speed hide');velocity.setAttribute('aria-label','Vitesse de déplacement');
  const gas=el('div','ui-oxygen ui-gas hide');gas.setAttribute('role','meter');gas.setAttribute('aria-label','Réserve de gaz');
  const gasFill=el('span','ui-meter-fill');gas.append(el('span','',document.body.classList.contains('touch-mode')?'Gaz · Boost':'Gaz · Shift'),el('span','ui-meter-track'));gas.lastElementChild!.append(gasFill);
  host.append(quick,minimap.element,tool,oxygen,stamina,gas,velocity);
  ui.onChange(id=>{if(id)hideAudioPopover();});
  const card=activityCard(host,(plotId,cropId)=>{const name=a?.selectCrop(plotId,cropId);if(name){center.notify('info','Culture choisie : '+name);deps.audio?.emit('farm.seedbag',{source:'player'});}});
  function renderTool(){const item=g?.runtime.data.items.find(i=>i.id===selectedTool);tool.textContent=item?'En main : '+item.name:'';tool.classList.toggle('hide',!item);}
  // Gameplay changes → notifications (gains, missions) and open panel refresh.
  let lastInventory:Record<string,number>={...(g?.runtime.state.inventory??{})},lastObjectives={...(g?.runtime.state.objectives??{})};
  function snapshot(){lastInventory={...(g?.runtime.state.inventory??{})};lastObjectives={...(g?.runtime.state.objectives??{})};}
  g?.subscribe(()=>{
    // A restored save is not new progress: no gain / mission notification for it.
    if(restoring)return;
    const inv=g.runtime.state.inventory;for(const [id,q] of Object.entries(inv)){const d=q-(lastInventory[id]??0);if(d>0)center.gain(id,g.runtime.data.items.find(i=>i.id===id)?.name??id,d);}
    for(const text of questChanges(g.runtime.data.objectives,lastObjectives,g.runtime.state.objectives))center.quest(text);
    snapshot();if(ui.active==='inventory'||ui.active==='journal')ui.refresh();
  });
  let lastFrame=-1,promptKey='';
  return {
    /** Opens the counter panel of a shop entity. */openShop(kind:ShopKind){shopKind=kind;ui.open('shop');},
    controller:ui,notify:(kind:NoticeKind,text:string)=>center.notify(kind,text),center,
    get preferences(){return prefs;},
    get blocking(){return ui.blocking;},get paused(){return ui.paused;},
    started(){host.classList.remove('ui-await-start');},
    /** Keys of the interface. Returns true when consumed (the game must ignore it). */
    handleKey(e:KeyboardEvent,inGame:boolean):boolean{
      if(ui.handleKey(e))return true;
      if(e.key==='Escape'&&!audioPopover.hidden){e.preventDefault();hideAudioPopover(true);return true;}
      // A key already handled elsewhere (e.g. Escape closing an NPC dialogue) never also opens a panel.
      if(e.defaultPrevented||isEditableGameTarget(e.target))return false;if(!inGame||deps.npcs.dialogue.isOpen||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return false;
      const k=e.key.toLowerCase();
      if(e.key==='Escape'){e.preventDefault();ui.open('pause');return true;}
      if(k==='i'&&g){e.preventDefault();ui.open('inventory');deps.audio?.emit('ui.inventory.open',{source:'ui'});return true;}
      if(k==='j'){e.preventDefault();ui.open('journal');return true;}
      if(k==='m'){e.preventDefault();ui.open('map');return true;}
      return false;
    },
    /** HUD refresh, throttled to 4 Hz (prompt, activity card, oxygen). */
    frame(time:number){
      if(time-lastFrame<.25)return;lastFrame=time;const p=deps.player();
      const target=ui.blocking||deps.npcs.dialogue.isOpen?null:deps.target(),rawText=target?promptText(target):'';
      const text=document.body.classList.contains('touch-mode')?rawText.replace(/^\[[^\]]+\]\s*/,''):rawText;
      if(text!==promptKey){promptKey=text;prompt.textContent=text;prompt.classList.toggle('hide',!text);prompt.dataset.enabled=String(!!target?.primaryAction?.enabled);prompt.dataset.type=target?.targetType??'';}
      const nav=a?.mineNavigation(p,p.space),wall=nav&&target?.targetType==='mine-wall'?{materialName:target.displayName,ok:!!target.primaryAction?.enabled,reason:target.disabledReason,rewardName:(target.contextData?.resource as string|null)??undefined}:null;
      const plot=!p.space?a?.farmNear(p):null,view=plot?a?.farmView(plot.zone.id):null,preview=plot?a?.farmPreview(plot.zone.id):null;
      card.update(nav?miningViewModel(nav,p.yaw,wall):null,view&&preview?farmingViewModel({...view,plotId:plot!.zone.id},preview):null);
      if(g){const c=g.runtime.state.inventory[COIN]??0,txt=c.toLocaleString('fr-FR');if(coinCount.textContent!==txt){coinCount.textContent=txt;purse.setAttribute('aria-label',c+' pièces disponibles');}}
       const env=deps.environment?.();if(env){const minutes=Math.floor(((env.dayPhase%1+1)%1)*1440),hour=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
         const names={clear:'Temps clair',cloudy:'Ciel couvert',rain:'Pluie'},symbols={clear:'☀️',cloudy:'☁️',rain:'🌧️'},value=symbols[env.weather]+' '+hour;
         if(weather.textContent!==value){weather.textContent=value;weather.setAttribute('aria-label',names[env.weather]+' · '+hour);}}
       const muted=!!deps.audio?.engine.settings.muted,iconName=muted?'mute':'volume';
       if(soundButton.dataset.icon!==iconName){soundButton.replaceChildren(hudIcon(iconName));soundButton.dataset.icon=iconName;soundButton.title=muted?'Son coupé · ouvrir le mixeur':'Régler le son';}
       minimap.update();
      gas.classList.toggle('hide',p.mode!=='glide'||ui.blocking);
      if(p.mode==='glide'){gasFill.style.width=Math.round((p.gas??0)/(p.maxGas??100)*100)+'%';gas.setAttribute('aria-valuenow',String(Math.round(p.gas??0)));}
      const fast=p.mode==='roll'||p.mode==='glide';velocity.classList.toggle('hide',!fast||ui.blocking);if(fast)velocity.textContent=`${((p.speed??0)*3.6).toFixed(0)} km/h${p.stalled?' · Décrochage':''}`;
      const swim=p.mode==='swim'||p.mode==='dive';oxygen.classList.toggle('hide',!swim);if(swim){oxyFill.style.width=Math.round(p.oxygen/p.maxOxygen*100)+'%';oxygen.setAttribute('aria-valuenow',String(Math.round(p.oxygen)));}
      const tired=p.mode==='climb'||p.stamina<p.maxStamina-.5;stamina.classList.toggle('hide',!tired||swim);if(tired){stFill.style.width=Math.round(p.stamina/p.maxStamina*100)+'%';stamina.setAttribute('aria-valuenow',String(Math.round(p.stamina)));stamina.classList.toggle('ui-low',p.stamina<25);}
    },
  };
}
export type GameUi=ReturnType<typeof createGameUi>;
