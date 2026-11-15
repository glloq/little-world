/** Studio visual assembly panel. Uses the same session/CommandBus as individual objects. */
import {node,button,field,input} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {captureAssembly,assemblyChunkIds,placeAssembly} from '../studio-core/assemblies.ts';
export function mountAssemblyPanel(host:HTMLElement,session:StudioSession,viewport:StudioViewport,status:(message:string,error?:boolean)=>void):()=>void {
  const box=node('section','','assembly-panel'),list=node('div','','feature-list');
  let name='Nouvel assemblage';
  const nameInput=input(name,value=>name=value);
  const run=(work:()=>Promise<void>)=>{void work().catch(error=>status(String(error instanceof Error?error.message:error),true));};
  const capture=button('Enregistrer la sélection',()=>run(async()=>{
    const ids=session.selection.selection.filter(ref=>ref.kind==='entity').map(ref=>ref.id);
    await session.hydrate(ids.map(id=>session.document.entityIndex[id]?.ownerChunkId).filter((x):x is string=>!!x));
    const group=captureAssembly(session.document,ids,name);
    await session.change('Enregistrer assemblage '+group.name,[],draft=>{
      draft.libraries.assemblies={...(draft.libraries.assemblies??{}),[group.id]:group};
    });
    status(group.items.length+' objets enregistrés dans « '+group.name+' ».');render();
  }));
  function render(){
    list.replaceChildren();
    const all=Object.values(session.document.libraries.assemblies??{});
    if(!all.length)list.append(node('p','Aucun assemblage enregistré. Sélectionnez plusieurs objets visuels dans la scène.','muted'));
    for(const group of all){
      const row=node('div','','feature-row'),title=node('strong',group.name+' · '+group.items.length+' objets');
      const place=button('Placer au centre de la vue',()=>run(async()=>{
        const target=viewport.camera.target,ids=assemblyChunkIds(session.document,group,target.x,target.z);
        let created:string[]=[];
        await session.change('Placer assemblage '+group.name,ids,draft=>{created=placeAssembly(draft,group,target.x,target.z);});
        session.selection.setSelection(created.map(id=>({kind:'entity' as const,id})));
        status(group.items.length+' objets placés ; une opération annulable.');
      }));
      const remove=button('Supprimer le modèle',()=>run(async()=>{
        if(!window.confirm('Supprimer le modèle « '+group.name+' » ? Les objets déjà placés restent intacts.'))return;
        await session.change('Supprimer assemblage '+group.name,[],draft=>{
          const next={...(draft.libraries.assemblies??{})};delete next[group.id];draft.libraries.assemblies=next;
        });
        render();
      }));
      row.append(title,place,remove);list.append(row);
    }
  }
  box.append(node('h3','Assemblages réutilisables'),node('p','Sélectionnez des bâtiments ou accessoires, enregistrez-les, puis placez des copies au centre de la vue. Les interactions liées aux objets ne sont pas copiées.','muted'),field('Nom de l’assemblage',nameInput),capture,list);
  host.append(box);render();const unsubscribe=session.commands.subscribe(()=>render());
  return ()=>unsubscribe();
}
