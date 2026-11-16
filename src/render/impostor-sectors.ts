/** Instanced, opaque alpha-tested billboards. One mesh per bounded spatial sector,
 * shared atlas/material, no Sprite or material per tree/character. Geometry is a fallback
 * owned by the caller until write() succeeds. No CPU billboard rotation per frame. */
import * as THREE from 'three';
import {acquireAtlas,atlasCacheStats,clearUnusedAtlases,type AtlasResource} from './impostor-atlas.ts';
import {IMPOSTOR_LIMITS} from './impostor-manifest.ts';
const vertex=`
attribute vec3 offset; attribute vec4 shape; attribute vec3 tint; attribute vec3 animation;
uniform sampler2D metadata;uniform vec2 grid;uniform float metaWidth;uniform float time;
varying vec2 vAtlasUv;varying vec3 vTint;
#include <fog_pars_vertex>
void main(){
 vec3 center=(modelMatrix*vec4(offset,1.)).xyz;vec3 eye=cameraPosition-center;
 float azimuth=mod(atan(eye.x,eye.z)-shape.y+6.2831853,6.2831853);
 float yawIndex=mod(floor(azimuth/6.2831853*4.+.5),4.);
 float elevation=atan(eye.y,length(eye.xz));
 float elevCount=animation.z;
 float elevIndex=elevCount<2.5?step(.5235988,elevation):floor(clamp(elevation/1.04719755+1.,0.,2.)+.5);
 float frame=mod(floor(max(0.,time)*animation.y),max(1.,animation.x));
 float index=shape.z+(frame*elevCount+elevIndex)*4.+yawIndex;
 vec4 meta=texture2D(metadata,vec2((index*2.+.5)/metaWidth,.5));
 vec4 crop=texture2D(metadata,vec2((index*2.+1.5)/metaWidth,.5));vec2 corner=mix(crop.xy,crop.zw,uv);
 vec2 uvCell=vec2(mod(index,grid.x),floor(index/grid.x));vAtlasUv=(uvCell+corner)/grid;vTint=tint;
 vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
 vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
 vec2 local=(corner-meta.xy)*meta.z*shape.x;local.x*=shape.w;
 vec4 mvPosition=viewMatrix*vec4(center+right*local.x+up*local.y,1.);
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const fragment=`
uniform sampler2D atlas;uniform float night;varying vec2 vAtlasUv;varying vec3 vTint;
#include <fog_pars_fragment>
void main(){vec4 c=texture2D(atlas,vAtlasUv);if(c.a<.5)discard;gl_FragColor=vec4(c.rgb*vTint*(1.-night*.72),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;
interface Sector {mesh:THREE.Mesh;geometry:THREE.InstancedBufferGeometry;arrays:Float32Array[];count:number;used:number;minX:number;maxX:number;minZ:number;maxZ:number;minY:number;maxY:number;maxRadius:number;dirtyMin:number[];dirtyMax:number[];debug?:THREE.Box3Helper}
function store(s:Sector,field:number,index:number,x:number,y:number,z:number,w?:number){
 const a=s.arrays[field];x=Math.fround(x);y=Math.fround(y);z=Math.fround(z);if(w!==undefined)w=Math.fround(w);
 if(a[index]===x&&a[index+1]===y&&a[index+2]===z&&(w===undefined||a[index+3]===w))return;
 a[index]=x;a[index+1]=y;a[index+2]=z;if(w!==undefined)a[index+3]=w;
 s.dirtyMin[field]=Math.min(s.dirtyMin[field],index);s.dirtyMax[field]=Math.max(s.dirtyMax[field],index+(w===undefined?3:4));
}
export function createImpostorSectors(parent:THREE.Object3D,kind:'trees'|'characters'|'buildings',onReady=()=>{}){
 const root=new THREE.Group();root.name='Impostors:'+kind;parent.add(root);
 const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide,fog:true,uniforms:{atlas:{value:null},metadata:{value:null},grid:{value:new THREE.Vector2(1,1)},metaWidth:{value:1},time:{value:0},night:{value:0}}});
 const sectors=new Map<string,Sector>();let atlas:AtlasResource|null=null,ticket:ReturnType<typeof acquireAtlas>|null=null,enabled=false,dead=false,clock=0,quota=4096,sectorQuota=32,sectorM=256,activeWrites=0,debug=false,generation=0;
 const stats={sectorM,bufferUploads:0,unchangedSectors:0,state:'off' as 'off'|'loading'|'ready'|'failed',instances:0,sectors:0,cachedSectors:0,calls:0,textureBytes:0,textures:0,uploadBytes:0,totalUploadBytes:0,evictions:0,preparationMs:0};
 function removeSector(s:Sector){s.debug?.geometry.dispose();if(s.debug)(s.debug.material as THREE.Material).dispose();s.debug?.removeFromParent();s.geometry.dispose();s.mesh.removeFromParent();}
 function clearSectors(){for(const s of sectors.values())removeSector(s);sectors.clear();}
 function setEnabled(on:boolean){
  if(dead)return;enabled=on;root.visible=on;
  if(!on){
   generation++;ticket?.release();ticket=null;atlas=null;clearSectors();clearUnusedAtlases();
   material.uniforms.atlas.value=material.uniforms.metadata.value=null;
   stats.instances=stats.sectors=stats.cachedSectors=stats.calls=stats.textureBytes=stats.textures=stats.uploadBytes=stats.bufferUploads=0;stats.state='off';return;
  }
  if(atlas){stats.state='ready';onReady();return;}if(ticket)return;
  const token=++generation,owner=acquireAtlas(kind);ticket=owner;stats.state='loading';
  void owner.promise.then(value=>{
   if(dead||token!==generation)return;atlas=value;material.uniforms.atlas.value=value.texture;material.uniforms.metadata.value=value.metadata;
   material.uniforms.grid.value.set(value.page.columns,value.page.rows);material.uniforms.metaWidth.value=value.page.anchors.length*2;
   stats.state='ready';stats.textureBytes=value.bytes;stats.textures=2;onReady();
  },()=>{if(dead||token!==generation)return;stats.state='failed';owner.release();ticket=null;onReady();});
 }
 function allocate(key:string,cx:number,cz:number):Sector{
  const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));g.setIndex([0,1,2,0,2,3]);
  const arrays=['offset','shape','tint','animation'].map(name=>{const size=name==='shape'?4:3,a=new Float32Array(IMPOSTOR_LIMITS.maxSectorInstances*size);const attribute=new THREE.InstancedBufferAttribute(a,size).setUsage(THREE.DynamicDrawUsage);attribute.onUpload(()=>attribute.clearUpdateRanges());g.setAttribute(name,attribute);return a;});
  const mesh=new THREE.Mesh(g,material);mesh.name=kind+' sector '+key;mesh.castShadow=mesh.receiveShadow=false;root.add(mesh);
  const s={mesh,geometry:g,arrays,count:0,used:++clock,minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity,maxY:-Infinity,maxRadius:0,dirtyMin:[Infinity,Infinity,Infinity,Infinity],dirtyMax:[0,0,0,0]};g.boundingSphere=new THREE.Sphere(new THREE.Vector3((cx+.5)*sectorM,0,(cz+.5)*sectorM),sectorM);sectors.set(key,s);return s;
 }
 return {root,stats,setDebug(on:boolean){debug=on;for(const s of sectors.values()){if(on&&!s.debug){s.debug=new THREE.Box3Helper(new THREE.Box3(),0xff55aa);root.add(s.debug);}if(s.debug){s.debug.visible=on&&s.count>0;s.debug.box.min.set(s.minX-s.maxRadius,s.minY-s.maxRadius,s.minZ-s.maxRadius);s.debug.box.max.set(s.maxX+s.maxRadius,s.maxY+s.maxRadius,s.maxZ+s.maxRadius);}}},get ready(){return enabled&&!!atlas;},setEnabled,
  setBudget(instances:number,activeSectors:number){quota=Math.max(0,instances);sectorQuota=Math.max(1,activeSectors);},
  setSectorSize(m:number){if(m===sectorM)return;clearSectors();sectorM=m;stats.sectorM=m;},
  begin(){activeWrites=0;stats.instances=0;stats.uploadBytes=stats.bufferUploads=stats.unchangedSectors=0;for(const s of sectors.values()){s.count=0;s.minX=s.minZ=s.minY=Infinity;s.maxX=s.maxZ=s.maxY=-Infinity;s.maxRadius=0;s.dirtyMin.fill(Infinity);s.dirtyMax.fill(0);}},
  /** Returns false to retain the old geometric representation, including missing/stale atlas. */
  write(id:string,x:number,y:number,z:number,scale:number,rotation:number,tint:THREE.Color,sourceHash?:string,width=1):boolean{
   if(!enabled||!atlas||stats.instances>=quota)return false;const entry=atlas.entries.get(id);if(!entry||sourceHash&&entry.sourceHash!==sourceHash)return false;
   const cx=Math.floor(x/sectorM),cz=Math.floor(z/sectorM),key=cx+':'+cz;let s=sectors.get(key);
   if((!s||!s.count)&&activeWrites>=sectorQuota)return false;
   if(!s){
    if(sectors.size>=IMPOSTOR_LIMITS.maxSectors){const stale=[...sectors].filter(([,s])=>!s.count).sort((a,b)=>a[1].used-b[1].used)[0];if(!stale)return false;removeSector(stale[1]);sectors.delete(stale[0]);stats.evictions++;}
    s=allocate(key,cx,cz);
   }
   if(s.count>=IMPOSTOR_LIMITS.maxSectorInstances)return false;if(!s.count)activeWrites++;const index=s.count++;
   store(s,0,index*3,x,y,z);store(s,1,index*4,scale,rotation,entry.first,width);store(s,2,index*3,tint.r,tint.g,tint.b);store(s,3,index*3,entry.frames,entry.fps,entry.elevations.length);
   s.minX=Math.min(s.minX,x);s.maxX=Math.max(s.maxX,x);s.minZ=Math.min(s.minZ,z);s.maxZ=Math.max(s.maxZ,z);s.minY=Math.min(s.minY,y);s.maxY=Math.max(s.maxY,y);const extents=atlas.extents.get(id)!;s.maxRadius=Math.max(s.maxRadius,Math.hypot(extents[0]*width,extents[1])*scale);s.used=++clock;stats.instances++;return true;
  },
  end(){const start=performance.now();let active=0;for(const s of sectors.values()){
   s.mesh.visible=enabled&&s.count>0;s.geometry.instanceCount=s.count;
   if(s.debug)s.debug.visible=enabled&&debug&&s.count>0;
   if(!s.count)continue;active++;
   let uploaded=false;
   for(let field=0;field<4;field++){
    if(s.dirtyMax[field]<=s.dirtyMin[field])continue;
    const a=s.geometry.getAttribute(['offset','shape','tint','animation'][field]) as THREE.InstancedBufferAttribute;
    // Keep any outstanding range until Three.js has actually uploaded it (a sector may
    // be outside the frustum for several updates). Clearing it here loses those changes.
    let min=s.dirtyMin[field],max=s.dirtyMax[field];for(const range of a.updateRanges){min=Math.min(min,range.start);max=Math.max(max,range.start+range.count);}a.clearUpdateRanges();const length=max-min;a.addUpdateRange(min,length);a.needsUpdate=true;stats.uploadBytes+=length*4;stats.bufferUploads++;uploaded=true;
   }
   if(!uploaded)stats.unchangedSectors++;
   const sphere=s.geometry.boundingSphere!;sphere.center.set((s.minX+s.maxX)/2,(s.minY+s.maxY)/2,(s.minZ+s.maxZ)/2);
   sphere.radius=Math.hypot(s.maxX-s.minX,s.maxY-s.minY,s.maxZ-s.minZ)/2+s.maxRadius;
   if(debug&&!s.debug){s.debug=new THREE.Box3Helper(new THREE.Box3(),0xff55aa);root.add(s.debug);}
   if(s.debug){s.debug.visible=enabled&&debug;s.debug.box.min.set(s.minX-s.maxRadius,s.minY-s.maxRadius,s.minZ-s.maxRadius);s.debug.box.max.set(s.maxX+s.maxRadius,s.maxY+s.maxRadius,s.maxZ+s.maxRadius);}
  }stats.sectors=active;stats.calls=active;stats.cachedSectors=sectors.size;stats.totalUploadBytes+=stats.uploadBytes;stats.preparationMs=performance.now()-start;},
  update(time:number,night=0){material.uniforms.time.value=time;material.uniforms.night.value=night;},
  dispose(){if(dead)return;setEnabled(false);dead=true;material.dispose();root.removeFromParent();},
  cache:atlasCacheStats,
 };
}
export type ImpostorSectors=ReturnType<typeof createImpostorSectors>;
