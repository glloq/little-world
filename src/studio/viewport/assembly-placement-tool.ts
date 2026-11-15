/** Position a visual assembly at the cursor without creating another editor or journal. */
import * as THREE from 'three';
import {assemblyChunkIds,placeAssembly} from '../../studio-core/assemblies.ts';
import type {Tool,ToolContext} from './tools.ts';
export const assemblyPlacement={id:''};
export class AssemblyPlacementTool implements Tool {
  readonly id='assembly';readonly cursor='crosshair';
  private ctx!:ToolContext;private ghost:THREE.Group|null=null;
  private down:{x:number;y:number}|null=null;
  private position:{x:number;z:number}|null=null;private busy=false;
  activate(ctx:ToolContext){this.ctx=ctx;this.ghost=new THREE.Group();this.ghost.name='AssemblyPreview';ctx.scene.add(this.ghost);this.rebuild();}
  private rebuild(){
    const group=this.ghost;if(!group)return;
    for(const child of [...group.children]){const m=child as THREE.Mesh;m.geometry.dispose();(m.material as THREE.Material).dispose();group.remove(child);}
    const assembly=this.ctx.session.document.libraries.assemblies?.[assemblyPlacement.id];
    if(!assembly)return;
    for(const item of assembly.items){
      const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),
        new THREE.MeshBasicMaterial({color:0x64b891,transparent:true,opacity:.3,wireframe:true,depthTest:false}));
      m.position.set(item.dx,.5,item.dz);group.add(m);
    }
  }
  deactivate(){if(!this.ghost)return;
    for(const child of this.ghost.children){const m=child as THREE.Mesh;m.geometry.dispose();(m.material as THREE.Material).dispose();}
    this.ghost.removeFromParent();this.ghost=null;this.position=null;this.down=null;
  }
  pointerMove(e:PointerEvent){
    if(e.buttons&~1)return;
    const ground=this.ctx.ground(e);this.position=ground?{x:ground.x,z:ground.z}:null;
    if(this.ghost){this.ghost.visible=!!ground;if(ground)this.ghost.position.set(ground.x,ground.y,ground.z);}
    this.ctx.invalidate(2);
  }
  pointerDown(e:PointerEvent){if(e.button===0)this.down={x:e.clientX,y:e.clientY};}
  pointerUp(e:PointerEvent){
    const down=this.down;this.down=null;if(e.button!==0||!down||!this.position||this.busy||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
    const s=this.ctx.session,assembly=s.document.libraries.assemblies?.[assemblyPlacement.id];if(!assembly){this.ctx.message('Assemblage introuvable',true);return;}
    const {x,z}=this.position;this.busy=true;this.ctx.run(async()=>{try{
      const chunks=assemblyChunkIds(s.document,assembly,x,z);
      let created:string[]=[];
      await s.change('Placer assemblage '+assembly.name,chunks,p=>{created=placeAssembly(p,assembly,x,z);});
      s.selection.setSelection(created.map(id=>({kind:'entity',id})));
      this.ctx.message(assembly.items.length+' objets placés. Cliquez encore pour répéter ; Échap pour terminer.');
    }finally{this.busy=false;}});
  }
  cancel(){this.ctx.setTool('select');return true;}
}
