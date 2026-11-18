/** Walkable low-poly N1 port collision proxies. They never depend on GLB triangles. */
import type {WorldCollisionQuery} from '../physics/collision-world.ts';
import type {PortN1Layout} from './port-n1-plan.ts';

export function portN1CollisionBodies(port:PortN1Layout){
  const bodies:Parameters<WorldCollisionQuery['add']>[0][]=[];
  const cos=Math.cos(port.heading),sin=Math.sin(port.heading);
  const fromLocal=(x:number,z:number)=>({
    x:port.shore.x+x*cos+z*sin,
    z:port.shore.z-x*sin+z*cos,
  });
  const add=(key:string,x:number,z:number,bottom:number,sizeX:number,sizeY:number,sizeZ:number)=>{
    const p=fromLocal(x,z),id='port-n1:'+key;
    // AABBs are intentionally conservative; use narrow pieces rather than one
    // full-building collider that would make the guichet and PNJ unreachable.
    const sx=Math.abs(cos)*sizeX+Math.abs(sin)*sizeZ;
    const sz=Math.abs(sin)*sizeX+Math.abs(cos)*sizeZ;
    bodies.push({id,shape:'box',position:{x:p.x,y:bottom,z:p.z},
      size:{x:sx,y:sizeY,z:sz},enabled:()=>true});
  };
  // Each real dock tile has a continuous 2 x 2 m deck at seaLevel + 0.8 m.
  // The top is a walkable collision surface, even above submerged terrain.
  for(let i=0;i<port.dockCells;i++)add('deck-'+i,0,1+2*i,
    port.dockBaseY+.72,1.94,.28,1.94);
  // Four post proxies + the merchant's counter only, rear open.
  const y=port.stand.y;
  for(const x of [-1.3,1.3])for(const z of [-.86,.94])add(
    'post-'+x+'-'+z,x,-5.3+z,y,.17,2.45,.17);
  add('counter',0,-5.3+.79,y+.06,2.1,1.0,.3);
  return bodies;
}
export function attachPortN1Collisions(world:WorldCollisionQuery,port:PortN1Layout){const bodies=portN1CollisionBodies(port);for(const body of bodies)world.add(body);return ()=>{for(const body of bodies)world.remove(body.id);};
}
