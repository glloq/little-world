/** Multi-asset decoration palette: shares the viewport tool manager and V3 CommandBus. */
import {node,button,field,numberInput} from './dom.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {scatterSettings} from './viewport/scatter-tool.ts';
import {placementSettings} from './viewport/placement-tool.ts';
import {placeableWorldAssets} from '../world-production/registry.ts';
export function mountScatterPanel(host:HTMLElement,viewport:StudioViewport):void{
  const box=node('section','','scatter-panel'),items=node('div','','feature-list');
  const assets=placeableWorldAssets(),valid=new Set(assets.map(a=>a.id));
  scatterSettings.palette=scatterSettings.palette.filter(id=>valid.has(id));
  const render=()=>{
    items.replaceChildren();
    for(const id of scatterSettings.palette){
      const asset=assets.find(a=>a.id===id);if(!asset)continue;
      const line=node('div','','feature-row');
      line.append(node('span',asset.name),button('Retirer',()=>{scatterSettings.palette=scatterSettings.palette.filter(x=>x!==id);render();}));
      items.append(line);
    }
    if(!scatterSettings.palette.length)items.append(node('p','Palette vide : sélectionnez un asset dans la bibliothèque, puis ajoutez-le.','muted'));
  };
  const add=button('Ajouter l’asset sélectionné',()=>{
    const item=placementSettings.item;if(item.kind!=='asset'||!valid.has(item.id))return;
    if(!scatterSettings.palette.includes(item.id))scatterSettings.palette.push(item.id);render();
  });
  const paint=button('Peindre avec la palette',()=>{
    if(!scatterSettings.palette.length)return;viewport.setTool('scatter');
  },'primary-button');
  const single=button('Revenir au placement individuel',()=>viewport.setTool('place'));
  box.append(node('h3','Peinture de décor'),node('p','Choisissez jusqu’à plusieurs espèces. Le pinceau distribue un nombre limité d’objets avec rotation et taille variables, en une seule opération annulable.','muted'),
    add,items,field('Rayon (m)',numberInput(scatterSettings.radius,v=>scatterSettings.radius=Math.max(1,Math.min(80,v||1)),1,80)),
    field('Densité (objet/m²)',numberInput(scatterSettings.density,v=>scatterSettings.density=Math.max(.001,Math.min(.2,v||.001)),.001,.2,'0.005')),
    field('Distance minimale (m)',numberInput(scatterSettings.spacing,v=>scatterSettings.spacing=Math.max(.5,Math.min(20,v||.5)),.5,20,'0.5')),
    field('Graine',numberInput(scatterSettings.seed,v=>scatterSettings.seed=Math.round(v||0),0,9999999)),
    paint,single,node('p','Glissez sur le relief pour peindre. Maximum 120 objets par trait ; Ctrl+Z annule le trait. Échap quitte le mode.','muted'));
  host.append(box);render();
}
