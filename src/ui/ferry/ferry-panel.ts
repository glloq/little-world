/** Maritime travel panel: an ordinary UiController panel, no second UI system. */
import {el,button} from '../shared/dom.ts';
import type {PublishedIsland} from '../../archipelago/registry.ts';
import type {FerryStatus} from '../../archipelago/ferry-schedule.ts';

export interface FerryPanelDeps {
  currentIslandId:string;
  islands:readonly PublishedIsland[];
  state():FerryStatus;
  canBoard?():boolean;
  preview():void;
  travel(destination:PublishedIsland):Promise<{ok:boolean;message:string}>;
}
export function renderFerryPanel(body:HTMLElement,deps:FerryPanelDeps):void {
  body.replaceChildren();
  const state=deps.state();
  const heading=el('p','ui-group','La navette du rameur');
  const status=el('p','',state.present
    ? state.minutesUntilDeparture===null?'Embarquement permanent.'
      : 'Navette à quai · départ dans '+state.minutesUntilDeparture+' min de jeu.'
    : state.nextArrivalMinute===null?'Aucune desserte prévue.':'Navette absente · prochaine escale au calendrier.');
  const near=deps.canBoard?.()??true;
  body.append(heading,status,el('p','ui-muted',near
    ? 'Choisissez votre destination parmi les îles d’exemple validées.'
    : 'Consultez les horaires depuis la carte, puis rejoignez le rameur sur le quai pour embarquer.'));
  const list=el('div','ui-ferry-list');
  for(const island of deps.islands){
    const card=el('div','ui-ferry-card'),title=el('strong','',island.name),details=el('p','ui-muted',island.description);
    const current=island.id===deps.currentIslandId;
    const go=button(current?'Vous êtes ici':'Choisir cette île',()=>{go.disabled=true;go.textContent='Vérification de la destination…';void deps.travel(island).then(result=>{
      if(!result.ok){go.disabled=false;go.textContent='Choisir cette île';status.textContent=result.message;status.className='ui-alert';}
    }).catch(()=>{go.disabled=false;go.textContent='Choisir cette île';status.textContent='Voyage indisponible : veuillez réessayer.';status.className='ui-alert';});},'ui-button'+(current?'':' ui-primary'));
    go.disabled=current||!state.present||!near;
    card.append(title,details,go);list.append(card);
  }
  body.append(list);
  const preview=button('Voir la cinématique de voyage (essai)',()=>deps.preview(),'ui-button');
  body.append(el('p','ui-group','Prévisualisation'),preview);
  body.append(el('p','ui-muted','L’essai n’effectue aucun changement d’île ni modification de sauvegarde.'));
}
