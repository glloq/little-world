/** Two-point authoring of low-poly natural rock bridges, arches and tunnels.
 * Single V3 CommandBus transaction includes the reversible heightfield corridor on tunnels. */
import {button,field,node,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import type {StudioViewport} from './viewport/editor-viewport.ts';
import type {PolylineTarget} from './viewport/polyline-tool.ts';
import {NATURAL_ASSET_ID,NATURAL_LABELS,naturalPlan,structureEndpoints,tunnelExcavation,
  type NaturalKind,type NaturalForm,type PointXZ} from '../structures/natural-structure.ts';
import {naturalMesh,naturalMeshBudget} from '../structures/natural-mesh.ts';
import {terrainHeight} from '../terrain.ts';
import {affectedChunkIds,chunkAt} from '../studio-core/schema.ts';
import {putEntity,putTerrainEdit,removeTerrainEdit} from '../studio-core/source.ts';
import {yawQuaternion} from '../studio-core/transforms.ts';
export interface NaturalContext {
  session:StudioSession;viewport:StudioViewport;status(text:string,error?:boolean):void;
  edit(target:PolylineTarget):void;
}
const DEFAULTS={width:7,clearance:4.2,thickness:1.3,curvature:1,form:'round' as NaturalForm};
const asYaw=(q:{x:number;y:number;z:number;w:number})=>Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
/** Old terrain edits are identified by the structure ID, not by geographic scanning. */
function authoredExcavation(project:StudioSession['document'],id:string){
  const prefix='natural:'+id+':',old=new Set<string>(),sectors=new Set<string>();
  for(const [cid,meta]of Object.entries(project.chunkIndex))
    for(const edit of Object.keys(meta.terrainOwners??{}))if(edit.startsWith(prefix)){old.add(edit);sectors.add(cid);}
  return {ids:[...old],sectors:[...sectors]};
}
export function mountNaturalPanel(host:HTMLElement,ctx:NaturalContext):()=>void {
  const s=ctx.session,p=s.document,container=node('section','','natural-panel'),
    cards=node('div','','feature-list');
  const settings:{kind:NaturalKind;form:NaturalForm;width:number;clearance:number;thickness:number;curvature:number}=
    {kind:'arch',...DEFAULTS};
  const run=(action:()=>Promise<unknown>)=>{void action().catch(e=>ctx.status(e instanceof Error?e.message:String(e),true));};
  function sourceOf(id:string){
    const entry=p.entityIndex[id];return entry&&p.chunks[entry.ownerChunkId]?.entities[id];
  }
  function editNatural(id:string){
    run(async()=>{
      const owner=p.entityIndex[id]?.ownerChunkId;if(!owner)throw Error('Structure absente');
      await s.hydrate([owner]);const source=sourceOf(id),spec=source?.components.NaturalStructure,t=source?.components.Transform;
      if(!spec||!t)throw Error('Structure non chargée ou type non compatible');
      Object.assign(settings,{kind:spec.kind,form:spec.form,width:spec.width,clearance:spec.clearance,
        thickness:spec.thickness,curvature:spec.curvature});
      ctx.edit(makeTarget(id,structureEndpoints(t.position.x,t.position.z,asYaw(t.rotation),spec.span)));
    });
  }
  function makeTarget(id:string|null,initial:PointXZ[]=[]):PolylineTarget{
    const settingsSnapshot={...settings};
    // Reference to mutable settings allows live controls to update preview and final mesh
    // without rebuilding the viewport or losing the two selected endpoints.
    const parameters={...settingsSnapshot};
    const calculate=(pts:PointXZ[])=>{
      if(pts.length!==2)throw Error('Placer deux extrémités');
      return naturalPlan(pts[0],pts[1],parameters.kind,parameters,terrainHeight);
    };
    return {
      label:(id?'Modifier ':'Créer ')+NATURAL_LABELS[parameters.kind],points:initial,min:2,max:2,color:0x8a9b80,
      diagnose(points){try{calculate(points);return null;}catch(e){return e instanceof Error?e.message:String(e);}},
      preview(points){
        if(points.length!==2)return null;
        const plan=calculate(points),group=naturalMesh(plan.spec);
        group.position.set(plan.x,terrainHeight(plan.x,plan.z)+plan.y,plan.z);
        group.rotation.y=plan.yaw;group.userData.preview=true;return group;
      },
      controls(tools,redraw){
        tools.append(node('h4','Réglages de la structure'),
          field('Structure',select(parameters.kind,[['arch','Arche rocheuse'],['bridge','Pont naturel'],['tunnel','Tunnel traversant']],v=>{parameters.kind=v as NaturalKind;redraw();})),
          field('Forme',select(parameters.form,[['round','Arrondie'],['pointed','Ogivale'],['flat','Plate / polygonale']],v=>{parameters.form=v as NaturalForm;redraw();})),
          field('Largeur du passage (m)',numberInput(parameters.width,v=>{parameters.width=v;redraw();},2.5,20,'.5')),
          field('Hauteur libre au centre (m)',numberInput(parameters.clearance,v=>{parameters.clearance=v;redraw();},2.3,12,'.2')),
          field('Épaisseur rocheuse (m)',numberInput(parameters.thickness,v=>{parameters.thickness=v;redraw();},.6,5,'.2')),
          field('Courbure',numberInput(parameters.curvature,v=>{parameters.curvature=v;redraw();},.2,2,'.1')),
          node('p','Deux points = axe longitudinal. Le tunnel applique une excavation locale au heightfield. Prévisualisation translucide · Entrée pour enregistrer.','muted'));
      },
      async commit(points){
        const plan=calculate(points),entityId=id??crypto.randomUUID(),old=authoredExcavation(p,entityId),
          before=p.entityIndex[entityId],edits=tunnelExcavation(points[0],points[1],plan.spec,terrainHeight);
        const ids=new Set<string>([...old.sectors,...(before?[before.ownerChunkId]:[]),
          chunkAt(p.world,plan.x,plan.z)]);
        for(const e of edits)for(const cid of affectedChunkIds(p.world,e.x,e.z,e.radius))ids.add(cid);
        for(const e of edits){const b=p.world.bounds;if(e.x<b.minX||e.x>b.maxX||e.z<b.minZ||e.z>b.maxZ)throw Error('Excavation hors de la carte');}
        await s.change((id?'Modifier ':'Créer ')+NATURAL_LABELS[parameters.kind],[...ids],draft=>{
          for(const eid of old.ids)removeTerrainEdit(draft,eid);
          for(const [i,e] of edits.entries())putTerrainEdit(draft,{...e,id:'natural:'+entityId+':'+i});
          if(!draft.assets[NATURAL_ASSET_ID])draft.assets[NATURAL_ASSET_ID]={
            id:NATURAL_ASSET_ID,name:'Structure naturelle rocheuse',type:'procedural',
            source:'Little World procedural stone vault (local low-poly)',license:'project-original'};
          const previous=before?draft.chunks[before.ownerChunkId]?.entities[entityId]:undefined,
            ownerChunkId=chunkAt(draft.world,plan.x,plan.z),
            components={...(previous?.components??{}),Transform:{type:'Transform' as const,
              position:{x:plan.x,y:plan.y,z:plan.z},rotation:yawQuaternion(plan.yaw),
              scale:{x:1,y:1,z:1}},Visual:{type:'Visual' as const,assetId:NATURAL_ASSET_ID},
              NaturalStructure:plan.spec};
          // Full-span generic Collider would block the portal. Physics uses the 16
          // separately generated vault descriptors from NaturalStructure instead.
          delete (components as {Collider?:unknown}).Collider;
          putEntity(draft,{id:entityId,kind:'prop',name:NATURAL_LABELS[parameters.kind],
            ownerChunkId,components});
        });
        s.selection.select({kind:'entity',id:entityId});
        const budget=naturalMeshBudget(plan.spec);
        ctx.status(NATURAL_LABELS[parameters.kind]+' enregistré : '+budget.triangles+
          ' triangles, '+budget.colliders+' volumes de collision. Ctrl+Z pour annuler.');
      }
    };
  }
  const create=(kind:NaturalKind)=>{
    Object.assign(settings,{kind,...DEFAULTS});
    ctx.edit(makeTarget(null));
  };
  function render(){
    cards.replaceChildren();
    const all=Object.values(p.entityIndex).filter(e=>Object.values(NATURAL_LABELS).includes(e.name)||!!sourceOf(e.id)?.components.NaturalStructure);
    if(!all.length)cards.append(node('p','Aucune structure naturelle. Choisissez un type puis définissez les deux extrémités sur le relief.','muted'));
    for(const e of all.slice(0,100)){
      const row=node('div','','feature-row');
      row.append(node('strong',e.name),button('Modifier',()=>editNatural(e.id)),
        button('Voir',()=>{ctx.viewport.goTo(e.position.x,e.position.z,35);s.selection.select({kind:'entity',id:e.id});}));
      cards.append(row);
    }
  }
  container.append(node('h3','Structures naturelles'),node('p','Arches rocheuses, ponts naturels et tunnels traversants. Terrain heightfield conservé ; voûte locale low-poly, passage réellement ouvert et collisions décomposées.','muted'),
    button('Modifier la structure sélectionnée',()=>{
      const ref=s.selection.selection.find(r=>r.kind==='entity');
      if(!ref){ctx.status('Sélectionnez d’abord une structure naturelle dans le Studio.',true);return;}
      editNatural(ref.id);
    }),
    button('Nouvelle arche rocheuse',()=>create('arch')),
    button('Nouveau pont naturel',()=>create('bridge')),
    button('Nouveau tunnel traversant',()=>create('tunnel'),'primary-button'),
    node('p','Portée 3–40 m, largeur 2,5–20 m. Adapter aux deux rives ou entrées, puis régler forme, hauteur et épaisseur dans le tracé.','muted'),
    node('h4','Ouvrages de la carte'),cards);
  host.append(container);
  render();
  const stop=s.commands.subscribe(()=>render());
  return ()=>stop();
}
