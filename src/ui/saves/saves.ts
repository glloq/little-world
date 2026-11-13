/** Saves screen: the existing local slots (createGameSaveStore), with confirmations for
 * destructive operations and explicit errors. « Partie sauvegardée » is shown only after the
 * store resolved (manifest written). */
import type {SaveSlot,GameSaveV2} from '../../gameplay/save.ts';
import {el,button} from '../shared/dom.ts';

export interface SaveSlotViewModel {slotId:string;title:string;state:'empty'|'ready'|'error';when?:string;progress?:string;versionWarning?:boolean;error?:string}
export function saveSlotViewModel(ids:readonly string[],slots:readonly SaveSlot[],buildVersion:string,dayLength:number):SaveSlotViewModel[]{
  return ids.map((id,i)=>{const s=slots.find(v=>v.slotId===id),title='Partie '+(i+1);if(!s)return {slotId:id,title,state:'empty'};if(s.error)return {slotId:id,title,state:'error',error:s.error};
    const t=s.progress?.time??0,day=Math.floor(t/dayLength)+1;
    return {slotId:id,title,state:'ready',when:s.savedAt?new Date(s.savedAt).toLocaleString('fr'):undefined,progress:s.progress?`Jour ${day} · ${s.progress.items} objet(s) · ${s.progress.objectivesDone} mission(s) terminée(s)`:undefined,versionWarning:!!s.worldBuildVersion&&s.worldBuildVersion!==buildVersion};});
}
export interface SavesDeps {
  worldId:string;buildVersion:string;dayLength:number;temporary:boolean;
  list():Promise<SaveSlot[]>;save(slotId:string):Promise<{external:boolean}>;load(slotId:string):Promise<GameSaveV2|null>;remove(slotId:string):Promise<void>;
  restore(save:GameSaveV2):string[];exportCurrent():unknown;importFile(raw:unknown):Promise<string>;
  confirm(text:string,label:string):Promise<boolean>;closePanels():void;notify(kind:'save'|'error'|'warning',text:string):void;
}
export function savesPanel(deps:SavesDeps){
  const ids=['slot-1','slot-2','slot-3'];let feedback='',feedbackKind:'ok'|'error'='ok',body:HTMLElement|null=null;
  const download=(name:string,value:unknown)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const say=(text:string,kind:'ok'|'error'='ok')=>{feedback=text;feedbackKind=kind;if(body)void render(body);};
  const guard=(task:()=>Promise<void>)=>()=>task().catch(e=>{const text=String(e instanceof Error?e.message:e);say(text,'error');deps.notify('error',text);});
  async function render(target:HTMLElement){
    body=target;let slots:SaveSlot[]=[];let listError='';try{slots=await deps.list();}catch(e){listError='Stockage local inaccessible : '+String(e instanceof Error?e.message:e);}
    const vm=saveSlotViewModel(ids,slots,deps.buildVersion,deps.dayLength);target.replaceChildren();
    target.append(el('p','ui-muted',deps.temporary?'Partie de test : emplacements temporaires, séparés des vraies parties.':'Parties conservées dans ce navigateur. Exportez une partie pour la protéger ou la transférer.'));
    if(listError)target.append(el('p','ui-alert',listError));
    for(const s of vm){
      const row=el('div','game-slot-row');row.dataset.slot=s.slotId;row.dataset.state=s.state;const info=el('div','ui-slot-info');info.append(el('strong','',s.title));
      info.append(el('span','',s.state==='empty'?'Vide':s.state==='error'?'Illisible : '+s.error:s.when??'Sauvegardée'));if(s.progress)info.append(el('span','ui-muted',s.progress));if(s.versionWarning)info.append(el('span','ui-warn-text','Version du monde différente : certains éléments peuvent ne pas être restaurés.'));
      const actions=el('div','ui-row');
      actions.append(button('Sauvegarder',guard(async()=>{if(s.state!=='empty'&&!(await deps.confirm(`Remplacer « ${s.title} » par la partie en cours ?`,'Remplacer')))return;const r=await deps.save(s.slotId);say(r.external?'Partie sauvegardée (détails des mines et parcelles dans le stockage IndexedDB du navigateur).':'Partie sauvegardée.');deps.notify('save','Partie sauvegardée');})));
      if(s.state==='ready'){
        actions.append(button('Charger',guard(async()=>{if(!(await deps.confirm(`Charger « ${s.title} » ? La progression non sauvegardée sera perdue.`,'Charger')))return;const save=await deps.load(s.slotId);if(!save)throw Error('Emplacement vide');const warnings=deps.restore(save);deps.closePanels();deps.notify(warnings.length?'warning':'save',warnings.length?'Partie restaurée avec réserves : '+warnings.join(' · '):'Partie restaurée');})),
          button('Exporter',guard(async()=>{const save=await deps.load(s.slotId);if(save)download(`${deps.worldId}-${s.slotId}`,save);})));
      }
      if(s.state!=='empty')actions.append(button('Supprimer',guard(async()=>{if(!(await deps.confirm(`Supprimer définitivement « ${s.title} » ?`,'Supprimer')))return;await deps.remove(s.slotId);say('Partie supprimée.');})));
      row.append(info,actions);target.append(row);
    }
    const file=el('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Importer une sauvegarde');
    file.onchange=()=>void guard(async()=>{const f=file.files?.[0];if(!f)return;if(f.size>20_000_000)throw Error('Sauvegarde trop volumineuse');let raw:unknown;try{raw=JSON.parse(await f.text());}catch{throw Error('Fichier illisible : ce n’est pas une sauvegarde Little World');}
      // An imported save keeps its slot when it names one: replacing an existing slot is confirmed.
      const named=(raw as {slotId?:unknown}|null)?.slotId,taken=vm.find(v=>v.slotId===named&&v.state!=='empty');file.value='';if(taken&&!(await deps.confirm(`Remplacer « ${taken.title} » par la partie importée ?`,'Remplacer')))return;const slot=await deps.importFile(raw);say(`Partie importée dans ${slot.replace('slot-','Partie ')}. Chargez-la pour reprendre.`);})();
    const tools=el('div','ui-row');tools.append(button('Exporter la partie en cours',()=>download(`${deps.worldId}-partie-en-cours`,deps.exportCurrent())),el('label','ui-file','Importer une partie'));tools.lastElementChild!.append(file);target.append(tools);
    if(feedback){const p=el('p',feedbackKind==='error'?'ui-alert':'ui-ok',feedback);p.setAttribute('role',feedbackKind==='error'?'alert':'status');target.append(p);}
    target.append(button('Reprendre l’exploration',()=>deps.closePanels(),'ui-button ui-primary'));
  }
  return {render:(target:HTMLElement)=>{feedback='';void render(target);}};
}
