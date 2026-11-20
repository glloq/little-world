import {islandStyleControls} from './island-style-controls.ts';
import {selectIslandStyle} from '../studio-core/island-styles.ts';
import {button,field,node,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {drawWelcomePreview} from './home-welcome.ts';
import {applyWorldRecomposition,type RecompositionPreview} from '../studio-core/world-recomposition.ts';
import {createCompositionClient,CompositionCancelled} from '../studio-core/composition-client.ts';
import {createProgress} from './progress.ts';
export function mountCompositionPanel(host:HTMLElement,session:StudioSession,status:(message:string,error?:boolean)=>void){
 const composer=createCompositionClient();
 let seed=session.document.world.generation?.seed??4242,mode:'full'|'biomes'='full',preview:RecompositionPreview|null=null,busy=false,disposed=false;
 const output=node('div'),apply=button('Appliquer la composition',async()=>{
  if(!preview||busy)return;busy=true;apply.disabled=true;
  try{const plan=preview;await session.change('Recomposer le monde',plan.chunks,p=>applyWorldRecomposition(p,plan));status('Composition appliquée dans une transaction annulable.');invalidate();}catch(e){status(String(e),true);}finally{busy=false;}
 },'primary-button');apply.disabled=true;
 function invalidate(){preview=null;apply.disabled=true;output.replaceChildren(node('p','Recalculer l’aperçu avant application.','muted'));}
 host.append(node('h2','Recomposer le monde'),node('p','La recomposition globale est protégée si le relief, l’eau, les régions ou des objets ont été retouchés. Le rafraîchissement des biomes respecte les cellules manuelles et les régions supprimées.','muted'));
 if(!session.document.world.generation){host.append(node('p','Projet ancien : besoins absents. La création guidée reste disponible depuis l’accueil.'));return ()=>{};}
 let nextRequirements=structuredClone(session.document.world.generation);
 let version:1|2|3|4|5=session.document.world.generation.compositionVersion??1;
 const versionInput=select(String(version),[['1','Composition initiale'],['2','Provinces, plateaux et vallées'],['3','Île en étages et réseau de ruisseaux'],['4','Styles insulaires naturels'],['5','Silhouettes et zones utiles']],value=>{version=Number(value) as 1|2|3|4|5;if(version>=4&&!nextRequirements.islandStyle)nextRequirements=selectIslandStyle(nextRequirements,'central-massif');renderStyle();invalidate();});
 const styleHost=node('div');let styleBox:HTMLFieldSetElement|undefined;
 function renderStyle(){styleHost.replaceChildren();if(version<4)return;styleBox=islandStyleControls({...nextRequirements,compositionVersion:version},next=>{nextRequirements=next;version=next.compositionVersion??4;versionInput.value=String(version);renderStyle();invalidate();});styleBox.disabled=mode==='biomes';styleHost.append(styleBox);}
 renderStyle();
 const seedInput=numberInput(seed,v=>{seed=v;invalidate();},1,9999999,'1');
 host.append(field('Mode de recomposition',select(mode,[['full','Composition globale'],['biomes','Rafraîchir les biomes actuels']],v=>{mode=v as typeof mode;seedInput.disabled=mode==='biomes';versionInput.disabled=mode==='biomes';if(styleBox)styleBox.disabled=mode==='biomes';invalidate();})),field('Nouvelle graine',seedInput),field('Génération du relief',versionInput),styleHost,
  button('Comparer avant / après',async()=>{
   if(busy)return;busy=true;invalidate();
   try{
    const p=await session.fullDocument(),next={...structuredClone(nextRequirements),seed,compositionVersion:version};
    // Every V5-only option goes when composing with an older version (the validator refuses them).
    if(version<5){for(const key of ['activities','maritimePort','welcomeVillage','welcomeActivity','layout','earthworks','circulation','poles','architecture','underwater','stories','locale'] as const)delete next[key];if(next.islandStyle)delete next.islandStyle.silhouette;}if(version<4)delete next.islandStyle;
    const progress=createProgress('Recomposition',()=>composer.cancel());output.replaceChildren(progress.element);
    const result=await composer.recompose(p,next,mode,{onProgress:q=>progress.update(q)});progress.done();if(disposed)return;
    preview=result;output.replaceChildren(node('p',result.summary));
    for(const [label,source]of [['Avant',p],['Après',result.project]] as const){const canvas=node('canvas');canvas.width=480;canvas.height=320;canvas.style.width='100%';canvas.setAttribute('aria-label',label+' recomposition');drawWelcomePreview(canvas,source);output.append(node('h3',label),canvas);}
    apply.disabled=false;
   }catch(e){if(!disposed)output.replaceChildren(node('p',e instanceof CompositionCancelled?'Comparaison annulée.':String(e),'diagnostic ERROR'));}finally{busy=false;}
  }),output,apply);
 const stop=session.commands.subscribe(()=>invalidate());
 return ()=>{disposed=true;stop();composer.dispose();};
}
