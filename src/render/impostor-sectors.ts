/** Instanced, opaque alpha-tested billboards. One mesh per bounded spatial sector,
 * shared atlas/material, no Sprite or material per tree/character. Geometry is a fallback
 * owned by the caller until write() succeeds. No CPU billboard rotation per frame. */
import * as THREE from 'three';
import {acquireAtlas,atlasCacheStats,clearUnusedAtlases,type AtlasResource} from './impostor-atlas.ts';
import {IMPOSTOR_LIMITS} from './impostor-manifest.ts';
const vertex=`
attribute vec3 offset; attribute vec3 shape; attribute vec3 tint; attribute vec3 animation;
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
 vec4 meta=texture2D(metadata,vec2((index+.5)/metaWidth,.5));
 vec2 uvCell=vec2(mod(index,grid.x),floor(index/grid.x));vAtlasUv=(uvCell+uv)/grid;vTint=tint;
 vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
 vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
 vec2 local=(uv-meta.xy)*meta.z*shape.x;
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
interface Sector {mesh:THREE.Mesh;geometry:THREE.InstancedBufferGeometry;arrays:Float32Array[];count:number;used:number;minY:number;maxY:number;maxSpan:number}
export function createImpostorSectors(parent:THREE.Object3D,kind:'trees'|'characters'|'buildings',onReady=()=>{}){
 const root=new THREE.Group();root.name='Impostors:'+kind;parent.add(root);
 const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide,fog:true,uniforms:{atlas:{value:null},metadata:{value:null},grid:{value:new THREE.Vector2(1,1)},metaWidth:{value:1},time:{value:0},night:{value:0}}});
 const sectors=new Map<string,Sector>();let atlas:AtlasResource|null=null,ticket:ReturnType<typeof acquireAtlas>|null=null,enabled=false,dead=false,clock=0,quota=4096,sectorQuota=32,sectorM=256,activeWrites=0;
 const stats={state:'off' as 'off'|'loading'|'ready'|'failed',instances:0,sectors:0,cachedSectors:0,calls:0,textureBytes:0,textures:0,uploadBytes:0,totalUploadBytes:0,evictions:0,preparationMs:0};
 function setEnabled(on:boolean){
  enabled=on;root.visible=on;if(!on){stats.instances=stats.calls=0;stats.state='off';return;}
  if(atlas){stats.state='ready';onReady();return;}if(ticket)return;stats.state='loading';ticket=acquireAtlas(kind);
  void ticket.promise.then(value=>{if(dead)return;atlas=value;material.uniforms.atlas.value=value.texture;material.uniforms.metadata.value=value.metadata;material.uniforms.grid.value.set(value.page.columns,value.page.rows);material.uniforms.metaWidth.value=value.page.anchors.length;stats.state=enabled?'ready':'off';stats.textureBytes=value.bytes;stats.textures=2;onReady();},()=>{if(dead)return;stats.state='failed';onReady();});
 }
 function allocate(key:string,cx:number,cz:number):Sector{
  const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));g.setIndex([0,1,2,0,2,3]);
  const arrays=['offset','shape','tint','animation'].map(name=>{const a=new Float32Array(IMPOSTOR_LIMITS.maxSectorInstances*3);g.setAttribute(name,new THREE.InstancedBufferAttribute(a,3).setUsage(THREE.DynamicDrawUsage));return a;});
  const mesh=new THREE.Mesh(g,material);mesh.name=kind+' sector '+key;mesh.castShadow=mesh.receiveShadow=false;root.add(mesh);
  const s={mesh,geometry:g,arrays,count:0,used:++clock,minY:Infinity,maxY:-Infinity,maxSpan:0};g.boundingSphere=new THREE.Sphere(new THREE.Vector3((cx+.5)*sectorM,0,(cz+.5)*sectorM),sectorM);sectors.set(key,s);return s;
 }
 return {root,stats,get ready(){return enabled&&!!atlas;},setEnabled,
  setBudget(instances:number,activeSectors:number){quota=Math.max(0,instances);sectorQuota=Math.max(1,activeSectors);},
  setSectorSize(m:number){if(m===sectorM)return;for(const s of sectors.values()){s.geometry.dispose();s.mesh.removeFromParent();}sectors.clear();sectorM=m;},
  begin(){activeWrites=0;stats.instances=0;stats.uploadBytes=0;for(const s of sectors.values()){s.count=0;s.minY=Infinity;s.maxY=-Infinity;s.maxSpan=0;}},
  /** Returns false to retain the old geometric representation, including missing/stale atlas. */
  write(id:string,x:number,y:number,z:number,scale:number,rotation:number,tint:THREE.Color,sourceHash?:string):boolean{
   if(!enabled||!atlas||stats.instances>=quota)return false;const entry=atlas.entries.get(id);if(!entry||sourceHash&&entry.sourceHash!==sourceHash)return false;
   const cx=Math.floor(x/sectorM),cz=Math.floor(z/sectorM),key=cx+':'+cz;let s=sectors.get(key);
   if((!s||!s.count)&&activeWrites>=sectorQuota)return false;
   if(!s){
    if(sectors.size>=IMPOSTOR_LIMITS.maxSectors){const stale=[...sectors].filter(([,s])=>!s.count).sort((a,b)=>a[1].used-b[1].used)[0];if(!stale)return false;stale[1].geometry.dispose();stale[1].mesh.removeFromParent();sectors.delete(stale[0]);stats.evictions++;}
    s=allocate(key,cx,cz);
   }
   if(s.count>=IMPOSTOR_LIMITS.maxSectorInstances)return false;if(!s.count)activeWrites++;const o=s.count++*3;
   s.arrays[0].set([x,y,z],o);s.arrays[1].set([scale,rotation,entry.first],o);s.arrays[2].set([tint.r,tint.g,tint.b],o);s.arrays[3].set([entry.frames,entry.fps,entry.elevations.length],o);
   s.minY=Math.min(s.minY,y);s.maxY=Math.max(s.maxY,y);s.maxSpan=Math.max(s.maxSpan,atlas.page.anchors[entry.first][2]*scale);s.used=++clock;stats.instances++;return true;
  },
  end(){const start=performance.now();let active=0;for(const s of sectors.values()){
   s.mesh.visible=enabled&&s.count>0;s.geometry.instanceCount=s.count;if(!s.count)continue;active++;
   for(const attr of ['offset','shape','tint','animation']){const a=s.geometry.getAttribute(attr) as THREE.InstancedBufferAttribute;a.clearUpdateRanges();a.addUpdateRange(0,s.count*3);a.needsUpdate=true;stats.uploadBytes+=s.count*12;}
   const sphere=s.geometry.boundingSphere!;sphere.center.y=(s.minY+s.maxY)/2;sphere.radius=Math.hypot(sectorM,sectorM,s.maxY-s.minY)/2+s.maxSpan;
  }stats.sectors=active;stats.calls=active;stats.cachedSectors=sectors.size;stats.totalUploadBytes+=stats.uploadBytes;stats.preparationMs=performance.now()-start;},
  update(time:number,night=0){material.uniforms.time.value=time;material.uniforms.night.value=night;},
  dispose(){if(dead)return;dead=true;ticket?.release();for(const s of sectors.values())s.geometry.dispose();sectors.clear();material.dispose();root.removeFromParent();atlas=null;clearUnusedAtlases();stats.instances=stats.sectors=stats.calls=stats.textureBytes=stats.textures=0;},
  cache:atlasCacheStats,
 };
}
export type ImpostorSectors=ReturnType<typeof createImpostorSectors>;
