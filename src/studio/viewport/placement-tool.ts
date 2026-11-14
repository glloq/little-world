import {assetDefinitionFor} from '../../world-production/registry.ts';
import * as THREE from 'three';
import {createAsset,removePlacement} from '../../world.ts';
import {terrainHeight,waterDepth} from '../../terrain.ts';
import {chunkAt} from '../../studio-core/schema.ts';
import {putEntity} from '../../studio-core/source.ts';
import {yawQuaternion} from '../../studio-core/transforms.ts';
import {createCharacter} from '../../studio-core/character-authoring.ts';
import {createLightEntity} from '../../studio-core/light-authoring.ts';
import {LIGHT_PRESETS} from '../../lighting/light-data.ts';
import type {AssetId} from '../../world-data.ts';
import {checkPlacement,type PlacementCheck} from './placement-rules.ts';
import type {Tool,ToolContext} from './tools.ts';
import {transformSettings} from './select-tool.ts';

export type PlaceItem={kind:'asset';id:string}|{kind:'npc';species:import('../../studio-core/types.ts').CharacterSpecies;name:string}|{kind:'light';preset:import('../../studio-core/types.ts').LightPreset;name:string};
/** Library choice shared with the catalogue panel: one choice, many placements. */
export const placementSettings={item:{kind:'asset',id:'props.crate'} as PlaceItem,yaw:0};
/** E3 — semi-transparent preview following the cursor, R/Shift+R to rotate before commit,
 * left click to place (repeatable), Escape to leave. One click = one transaction. */
export class PlacementTool implements Tool {
  readonly id='place';readonly cursor='crosshair';
  private ctx!:ToolContext;private ghost:THREE.Object3D|null=null;private ghostKey='';private check:PlacementCheck={level:'ok',reason:''};
  private materials!:Record<PlacementCheck['level'],THREE.MeshBasicMaterial>;
  private down:{x:number;y:number}|null=null;
  activate(ctx:ToolContext){this.ctx=ctx;this.materials={ok:ghostMaterial(0x7fd08c),warning:ghostMaterial(0xf0b44c),invalid:ghostMaterial(0xe0614e)};}
  deactivate(){this.clearGhost();for(const m of Object.values(this.materials))m.dispose();this.ctx.canvas.title='';}
  private clearGhost(){
    const ghost=this.ghost;this.ghost=null;this.ghostKey='';if(!ghost)return;
    // Preview materials belong to the tool: detach them so asset cleanup never disposes them.
    ghost.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)(m as unknown as {material:THREE.Material|null}).material=null;});
    if(ghost.userData.ownsGeometry){ghost.traverse(o=>(o as THREE.Mesh).geometry?.dispose());ghost.removeFromParent();}else removePlacement(ghost);
  }
  private ensureGhost(){
    const item=placementSettings.item,key=item.kind==='asset'?item.id:item.kind==='light'?'light:'+item.preset:'npc:'+item.species;if(this.ghost&&this.ghostKey===key)return this.ghost;this.clearGhost();
    let ghost:THREE.Object3D;
    if(item.kind==='asset'){ghost=createAsset(item.id as AssetId);}
    else if(item.kind==='light'){const g=new THREE.Group(),y=LIGHT_PRESETS[item.preset].offsetY,post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,y,6));post.position.y=y/2;const bulb=new THREE.Mesh(new THREE.OctahedronGeometry(.4,0));bulb.position.y=y;g.add(post,bulb);g.userData.ownsGeometry=true;ghost=g;}
    else{const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.45,.9,4,8));body.position.y=.9;const head=new THREE.Mesh(new THREE.SphereGeometry(.38,10,8));head.position.y=1.95;g.add(body,head);g.userData.ownsGeometry=true;ghost=g;}
    ghost.name='PlacementPreview';ghost.renderOrder=25;this.ctx.scene.add(ghost);this.ghost=ghost;this.ghostKey=key;return ghost;
  }
  pointerMove(e:PointerEvent){
    if(e.buttons&~1)return;const point=this.ctx.ground(e),ghost=this.ensureGhost();if(!point){ghost.visible=false;this.ctx.invalidate(2);return;}
    let x=point.x,z=point.z;if(transformSettings.snap){x=Math.round(x/transformSettings.grid)*transformSettings.grid;z=Math.round(z/transformSettings.grid)*transformSettings.grid;}
    const item=placementSettings.item,building=item.kind==='asset'&&item.id.startsWith('architecture.');
    this.check=checkPlacement(this.ctx.session.document,x,z,{ground:terrainHeight,depth:waterDepth,building,radius:building?4:1});
    ghost.visible=true;ghost.position.set(x,terrainHeight(x,z),z);ghost.rotation.set(0,placementSettings.yaw,0);
    // GLB models may finish loading later: (re)apply the preview material on every move.
    const material=this.materials[this.check.level];ghost.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.material=material;});
    this.ctx.canvas.title=this.check.reason;this.ctx.invalidate(2);
  }
  pointerDown(e:PointerEvent){if(e.button===0)this.down={x:e.clientX,y:e.clientY};}
  pointerUp(e:PointerEvent){
    const start=this.down;this.down=null;if(e.button!==0||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5||!this.ghost?.visible)return;
    if(this.check.level==='invalid'){this.ctx.message('Placement impossible : '+this.check.reason+'.',true);return;}
    const x=this.ghost.position.x,z=this.ghost.position.z,yaw=placementSettings.yaw,item=placementSettings.item,s=this.ctx.session,owner=chunkAt(s.document.world,x,z),id=crypto.randomUUID(),warning=this.check.level==='warning'?' Attention : '+this.check.reason+'.':'';
    this.ctx.run(async()=>{
      if(item.kind==='asset'){const known=s.document.assets[item.id],asset=known??assetDefinitionFor(item.id);if(!asset)throw Error('Asset inconnu : '+item.id);
        await s.change('Placer '+asset.name,[owner],d=>{if(!known)d.assets={...d.assets,[asset.id]:asset};putEntity(d,{id,kind:item.id.startsWith('architecture.')?'building':'prop',name:asset.name,ownerChunkId:owner,components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:yawQuaternion(yaw),scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:item.id}}});});}
      else if(item.kind==='light')await s.change('Placer une lumière',[owner],d=>{createLightEntity(d,{id,name:item.name,x,z,preset:item.preset});});
      else await s.change('Placer un personnage',[owner],d=>{createCharacter(d,{id,name:item.name,x,z,species:item.species});const source=d.chunks[owner].entities[id];source.components.Transform!.rotation=yawQuaternion(yaw);putEntity(d,source);});
      s.selection.select({kind:'entity',id});this.ctx.message('Élément placé. Cliquez encore pour en placer un autre, Échap pour terminer.'+warning);this.ctx.refreshInspector();
    });
  }
  keyDown(e:KeyboardEvent){if(e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey){placementSettings.yaw+=(e.shiftKey?-1:1)*Math.PI/12;if(this.ghost)this.ghost.rotation.y=placementSettings.yaw;this.ctx.invalidate(2);return true;}return false;}
  cancel(){this.ctx.setTool('select');return true;}
}
function ghostMaterial(color:number){return new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,depthWrite:false});}
