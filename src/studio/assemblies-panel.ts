/** Studio visual assembly panel. Uses the same session/CommandBus as individual objects. */
import {node,button,field,input,select} from './dom.ts';
import {libraryAssets} from './library.ts';
import {assemblyInstanceRoot,instanceMemberIds,instanceTreeChunkIds,overrideAssemblyVisual,updateAssemblyTemplateVisual,assemblyVisualOf} from '../studio-core/assembly-instances.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import {captureAssembly,assemblyChunkIds,placeAssembly} from '../studio-core/assemblies.ts';
export function mountAssemblyPanel(host:HTMLElement,session:StudioSession,viewport:StudioViewport,status:(message:string,error?:boolean)=>void):()=>void {
  const box=node('section','','assembly-panel'),list=node('div','','feature-list'),instanceBox=node('div','','section-card');
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
      const cursorPlace=button('Placer à la souris',()=>{
        void import('./viewport/assembly-placement-tool.ts').then(({assemblyPlacement})=>{
          assemblyPlacement.id=group.id;viewport.setTool('assembly');status('Cliquez dans la vue pour poser « '+group.name+' ». Échap pour terminer.');
        });
      });
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
      row.append(title,cursorPlace,place,remove);list.append(row);
    }
  }
  function renderInstance(){
    instanceBox.replaceChildren();
    const selected=session.selection.selection.filter(r=>r.kind==='entity');
    if(selected.length!==1)return;
    const entityId=selected[0].id,entry=session.document.entityIndex[entityId],source=entry&&session.document.chunks[entry.ownerChunkId]?.entities[entityId];
    if(!source?.prefabId?.startsWith('assembly-part:'))return;
    const p=session.document,available=Object.values(libraryAssets(p.assets));
    let chosen=assemblyVisualOf(p,entityId);
    const assetChoice=select(chosen,available.map(a=>[a.id,a.name] as const),val=>chosen=val);
    const owners=new Set<string>(Object.values(p.entityIndex).filter(e=>e.references.includes(source.prefabId!)).map(e=>e.ownerChunkId));
    const getRoot=async()=>{
      // The selected item and its direct ancestors are loaded on demand, not copied into a new data model.
      let cursor=entityId;
      for(let i=0;i<100;i++){
        const owner=p.entityIndex[cursor]?.ownerChunkId;if(!owner)break;
        await session.hydrate([owner]);const member=p.chunks[owner]?.entities[cursor];
        if(!member?.parentId)return cursor;
        cursor=member.parentId;
      }
      throw Error('Hiérarchie invalide ou cyclique');
    };
    instanceBox.append(node('h4','Instance de prefab'),
      node('p','Les propriétés de position, rotation et échelle de cet élément restent éditables individuellement dans l’inspecteur.','muted'),
      field('Modèle visuel de cette pièce',assetChoice),
      button('Modifier uniquement cette instance',()=>run(async()=>{
        await session.change('Modifier une instance de prefab',[entry.ownerChunkId],draft=>overrideAssemblyVisual(draft,entityId,chosen));
        status('Cette pièce utilise maintenant son propre visuel ; les autres instances restent inchangées.');
      })),
      button('Modifier le modèle partagé',()=>run(async()=>{
        const ownersArray=[...owners];
        await session.change('Modifier un modèle prefab',ownersArray,draft=>{
          updateAssemblyTemplateVisual(draft,entityId,chosen);
        });
        status('Le modèle partagé a été modifié ; les instances non personnalisées suivent son nouveau visuel.');
      })),
      button('Sélectionner l’instance entière',()=>run(async()=>{
        const root=await getRoot();
        await session.hydrate(instanceTreeChunkIds(p,root));
        const members=instanceMemberIds(p,root);
        session.selection.setSelection(members.map(id=>({kind:'entity' as const,id})));
        status(members.length+' éléments du groupe sélectionnés. Déplacer avec le gizmo.');
      })));
  }
  box.append(node('h3','Assemblages réutilisables'),node('p','Sélectionnez des bâtiments ou accessoires, enregistrez-les, puis placez des copies au centre de la vue. Les interactions liées aux objets ne sont pas copiées.','muted'),field('Intitulé de l’assemblage',nameInput),capture,list,instanceBox);
  host.append(box);render();renderInstance();
  const stops=[session.commands.subscribe(()=>{render();renderInstance();}),session.selection.subscribe(()=>renderInstance())];
  return ()=>stops.forEach(stop=>stop());
}
