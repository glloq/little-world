/** Hero-only snow equipment and slope pose. Kept OUTSIDE the baked hamster/atlas inputs. */
import * as THREE from 'three';
import type {HamsterCharacter} from '../hamster/hamster.ts';
import type {Player} from '../player.ts';

export function createSnowCharacterView(character:HamsterCharacter){
  const rig=character.rig,j=rig.joints;
  const boardMaterial=new THREE.MeshLambertMaterial({color:0x3295b5,flatShading:true});
  const skiMaterial=new THREE.MeshLambertMaterial({color:0xe78e4b,flatShading:true});
  const boardGeometry=new THREE.BoxGeometry(.82,.085,1.85);
  const skiGeometry=new THREE.BoxGeometry(.21,.075,1.95);
  const snowboard=new THREE.Mesh(boardGeometry,boardMaterial);snowboard.name='Snowboard';snowboard.position.set(0,.07,0);
  const skiLeft=new THREE.Mesh(skiGeometry,skiMaterial),skiRight=new THREE.Mesh(skiGeometry,skiMaterial);
  skiLeft.position.set(-.27,.065,0);skiRight.position.set(.27,.065,0);
  snowboard.visible=false;skiLeft.visible=false;skiRight.visible=false;
  rig.group.add(snowboard,skiLeft,skiRight);
  return {
    update(player:Player){
      const active=(player.mode==='snow'||player.mode==='air'&&player.snowAirborne===true),skis=player.snowEquipment==='skis';
      snowboard.visible=active&&!skis;skiLeft.visible=skiRight.visible=active&&skis;
      if(!active)return;
      // Overlay the existing animation after its pose update: no skeleton or animation enum changes.
      const speed=Math.hypot(player.velocity.x,player.velocity.z);
      const edge=Math.max(-1,Math.min(1,player.snowEdge??0));
      j.HamsterBody.rotation.x=.13+Math.min(.15,speed*.004);
      j.HamsterBody.rotation.y=skis?0:-.30;
      j.HamsterBody.rotation.z=-edge*.20;
      j.Head.rotation.y=skis?0:.25;
      j.HipLeft.rotation.x=j.HipRight.rotation.x=-.24;
      j.FootLeft.rotation.x=j.FootRight.rotation.x=.17;
      j.ShoulderLeft.rotation.x=-.24;j.ShoulderRight.rotation.x=.12;
      j.ShoulderLeft.rotation.z=-.12;j.ShoulderRight.rotation.z=.12;
    },
    dispose(){rig.group.remove(snowboard,skiLeft,skiRight);boardGeometry.dispose();skiGeometry.dispose();boardMaterial.dispose();skiMaterial.dispose();}
  };
}
