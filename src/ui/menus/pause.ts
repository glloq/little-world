/** Pause menu (Échap with no panel open). The world simulation is paused while it is open. */
import {el,button} from '../shared/dom.ts';
export function pauseMenu(deps:{has(id:string):boolean;open(id:'saves'|'settings'|'inventory'|'journal'|'map'):void;resume():void;home():void;studioUrl:string;worldName:string;temporary:boolean}){
  return {render(body:HTMLElement){
    body.replaceChildren();if(deps.temporary)body.append(el('p','ui-badge-line','Partie de test (« Jouer ici ») : rien ne modifie le projet du Studio.'));
    body.append(el('p','ui-muted',deps.worldName));
    const list=el('nav','ui-menu');list.setAttribute('aria-label','Menu du jeu');
    const resume=button('Reprendre',deps.resume,'ui-button ui-primary');resume.dataset.autofocus='';
    list.append(resume);
    for(const [id,label] of [['saves','Parties : sauvegarder, charger'],['inventory','Sac (I)'],['journal','Journal (J)'],['map','Carte (M)'],['settings','Paramètres']] as const)if(deps.has(id))list.append(button(label,()=>deps.open(id)));
    list.append(button('Retour à l’accueil',deps.home));
    const studio=el('a','ui-button ui-link','Ouvrir le Studio de création ↗');studio.href=deps.studioUrl;
    body.append(list,studio);
  }};
}
