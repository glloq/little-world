/** Settings: display (existing quality selector and its storage), controls (camera sensitivity,
 * vertical inversion, key reminder), interface (reduced motion, developer mode) and audio (the
 * audio engine's own panel and persisted levels — no second mixer). Preferences are stored in
 * the separate UI key, never in game saves nor in authoring projects. */
import {el,kbd} from '../shared/dom.ts';
import type {UiPreferences} from '../app/preferences.ts';

export const KEY_BINDINGS:[string,string][]=[
  ['Z Q S D / W A S D / flèches','Se déplacer'],['Clic + glisser','Tourner la caméra · molette : distance'],['Shift','Courir'],['Espace','Sauter / planer'],['Ctrl','Plonger'],
  ['E','Action principale (parler, ramasser, embarquer, creuser, cultiver)'],['F','Creuser / agir sur la parcelle'],['C','Changer de culture'],['A (maintenir)','Accessoires et émotions'],
  ['I','Sac'],['J','Journal'],['M','Carte'],['Échap','Fermer · menu'],['R','Retour au point de départ'],
];
export interface SettingsDeps {preferences():UiPreferences;update(patch:Partial<UiPreferences>):void;quality:HTMLSelectElement|null;audioPanel:HTMLDetailsElement|null}
export function settingsPanel(deps:SettingsDeps){
  return {render(body:HTMLElement){
    const p=deps.preferences();body.replaceChildren();
    const section=(title:string)=>{const s=el('section','ui-settings-section');s.append(el('h3','ui-group',title));body.append(s);return s;};
    const check=(label:string,value:boolean,patch:(v:boolean)=>Partial<UiPreferences>)=>{const l=el('label','ui-check'),i=el('input');i.type='checkbox';i.checked=value;i.onchange=()=>deps.update(patch(i.checked));l.append(i,document.createTextNode(label));return l;};
    const display=section('Affichage');
    if(deps.quality){const l=el('label','ui-field','Qualité du rendu');l.append(deps.quality);display.append(l);}
    display.append(check('Réduire les animations de l’interface',p.reduceMotion,v=>({reduceMotion:v})),check('Mode développeur (statistiques techniques, outils de test)',p.developer,v=>({developer:v})));
    const controls=section('Contrôles');const sens=el('input');sens.type='range';sens.min='0.3';sens.max='2.5';sens.step='0.1';sens.value=String(p.cameraSensitivity);sens.setAttribute('aria-label','Sensibilité de la caméra');sens.oninput=()=>deps.update({cameraSensitivity:Number(sens.value)});
    const sl=el('label','ui-field','Sensibilité de la caméra');sl.append(sens);controls.append(sl,check('Inverser l’axe vertical de la caméra',p.invertY,v=>({invertY:v})));
    const keys=el('dl','ui-keys');for(const [k,label]of KEY_BINDINGS){const dt=el('dt');dt.append(kbd(k));keys.append(dt,el('dd','',label));}controls.append(keys,el('p','ui-muted','La réaffectation des touches n’est pas encore disponible.'));
    const audio=section('Son');if(deps.audioPanel){deps.audioPanel.open=true;audio.append(deps.audioPanel);}else audio.append(el('p','ui-muted','Le son n’est pas disponible pour ce monde.'));
  }};
}
