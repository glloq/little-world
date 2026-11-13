/** E10 — hybrid local lighting renderer.
 *  - A fixed pool of THREE.PointLight (created once, when the first source appears) is always
 *    in the scene: unused slots have intensity 0, so the light count seen by shaders never
 *    changes when lanterns are switched, culled or the budget lowered → no recompilation.
 *  - Every other visible source is a halo in ONE THREE.Points draw call (fixed-capacity
 *    buffers, rewritten only when the halo set changes).
 *  - No shadow map for local lights; flicker is computed only for the few pooled lights.
 * Selection itself is the pure LightBudget (grid + hysteresis). */
import * as THREE from 'three';
import {LightBudget,type LightBudgetOptions,type LightStatus} from './light-budget.ts';
import {flickerAt,type RuntimeLight} from './light-data.ts';

export interface LightViewStats {sources:number;pool:number;budget:number;active:number;glow:number;overBudget:number;candidates:number;reselections:number;updateMs:number;maxUpdateMs:number;night:number}
export interface LightView {
  setSources(list:RuntimeLight[]):void;
  /** Night factor 0–1 (environment or Studio preview) and presentation time (s) for flicker. */
  setEnvironment(night:number,time:number):void;
  /** count = lights fed this frame; poolSize = lights present in shaders (quality setting:
   * changing it is the only operation that recompiles lit materials, once). */
  setBudget(count:number,poolSize?:number):void;
  /** Game hooks: entity state (mode 'state') and moving carriers (lights attached to NPCs). */
  setLookups(state?:StateLookup,follow?:FollowLookup):void;
  update(camera:{x:number;y:number;z:number}):void;
  statusOf(id:string):LightStatus;
  readonly stats:LightViewStats;
  readonly budget:LightBudget;
  dispose():void;
}
type StateLookup=(entityId:string,key:string)=>boolean|undefined;
type FollowLookup=(entityId:string)=>{x:number;y:number;z:number}|undefined;
const GLOW_VERTEX=`attribute vec3 glowColor;attribute float glowSize;attribute float glowNight;uniform float night;uniform float pixelScale;varying vec3 vColor;varying float vAlpha;
void main(){vec4 view=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*view;float on=mix(1.0,night,glowNight);vAlpha=on*mix(.3,1.0,night);vColor=glowColor;
gl_PointSize=on<=0.0?0.0:clamp(glowSize*pixelScale/max(1.0,-view.z),1.5,28.0);}`;
const GLOW_FRAGMENT=`varying vec3 vColor;varying float vAlpha;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.0;if(r>1.0)discard;float a=(1.0-r)*(1.0-r)*vAlpha;gl_FragColor=vec4(vColor*a,a);}`;

export function createLightView(parent:THREE.Object3D,height:(x:number,z:number)=>number,options:LightBudgetOptions):LightView{
  const budget=new LightBudget(options),group=new THREE.Group();group.name='LocalLights';parent.add(group);
  let pool:THREE.PointLight[]=[],poolSize=budget.capacity;
  const cap=budget.glowCapacity,positions=new Float32Array(cap*3),colors=new Float32Array(cap*3),sizes=new Float32Array(cap),nightFlags=new Float32Array(cap);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('glowColor',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('glowSize',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('glowNight',new THREE.BufferAttribute(nightFlags,1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const uniforms={night:{value:0},pixelScale:{value:420}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:GLOW_VERTEX,fragmentShader:GLOW_FRAGMENT,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const halos=new THREE.Points(geometry,material);halos.frustumCulled=false;halos.renderOrder=3;halos.name='LightHalos';group.add(halos);
  let state:StateLookup|undefined,follow:FollowLookup|undefined;
  const color=new THREE.Color();let night=0,time=0,slotVersion=-1,glowVersion=-1;const followGlow:number[]=[];
  const stats:LightViewStats={sources:0,pool:0,budget:budget.budget,active:0,glow:0,overBudget:0,candidates:0,reselections:0,updateMs:0,maxUpdateMs:0,night:0};
  function ensurePool(){
    if(pool.length===poolSize||!budget.sources.length)return;
    for(const l of pool){l.removeFromParent();l.dispose();}slotVersion=-1;
    pool=Array.from({length:poolSize},(_,i)=>{const l=new THREE.PointLight(0xffffff,0,1,2);l.castShadow=false;l.name='LocalLight'+i;group.add(l);return l;});stats.pool=pool.length;
  }
  function uploadGlow(){
    const n=budget.glowCount;followGlow.length=0;
    for(let g=0;g<n;g++){const i=budget.glow[g],l=budget.sources[i];positions[g*3]=budget.px[i];positions[g*3+1]=budget.py[i];positions[g*3+2]=budget.pz[i];color.set(l.color);colors[g*3]=color.r;colors[g*3+1]=color.g;colors[g*3+2]=color.b;
      sizes[g]=Math.min(3.2,.9+Math.sqrt(l.intensity)*.28);nightFlags[g]=l.mode==='night'?1:0;if(l.follow&&follow)followGlow.push(g);}
    for(const name of ['position','glowColor','glowSize','glowNight'])(geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate=true;geometry.setDrawRange(0,n);
  }
  return {
    budget,stats,
    setSources(list){budget.setSources(list,height);stats.sources=list.length;if(list.length)ensurePool();slotVersion=-1;glowVersion=-1;},
    setEnvironment(n,t){night=Math.max(0,Math.min(1,n));time=t;uniforms.night.value=night;stats.night=night;},
    setBudget(count,size){if(size!==undefined)poolSize=Math.max(0,Math.min(budget.capacity,Math.floor(size)));budget.setBudget(Math.min(count,poolSize));stats.budget=budget.budget;if(pool.length&&pool.length!==poolSize)ensurePool();},
    setLookups(s,f){state=s;follow=f;},
    update(camera){
      const start=performance.now();
      budget.update(camera.x,camera.y,camera.z,night,time,state,follow);
      if(budget.glowVersion!==glowVersion){glowVersion=budget.glowVersion;uploadGlow();}
      else if(followGlow.length){for(const g of followGlow){const i=budget.glow[g];positions[g*3]=budget.px[i];positions[g*3+1]=budget.py[i];positions[g*3+2]=budget.pz[i];}(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;}
      const reassigned=budget.slotVersion!==slotVersion;slotVersion=budget.slotVersion;let active=0;
      for(let s=0;s<pool.length;s++){
        const light=pool[s],i=s<budget.budget?budget.slots[s]:-1;
        if(i<0){light.intensity=0;continue;}
        const l=budget.sources[i];active++;
        if(reassigned){light.color.set(l.color);light.distance=l.range;}
        if(reassigned||l.follow)light.position.set(budget.px[i],budget.py[i],budget.pz[i]);
        light.intensity=l.intensity*budget.factor[i]*(l.flicker?flickerAt(budget.seeds[i],time,l.flicker.amplitude,l.flicker.speed):1);
      }
      const ms=performance.now()-start,st=budget.stats;stats.active=active;stats.glow=st.glow;stats.overBudget=st.overBudget;stats.candidates=st.candidates;stats.reselections=st.reselections;stats.updateMs=ms;stats.maxUpdateMs=Math.max(stats.maxUpdateMs,ms);
    },
    statusOf:id=>budget.statusOf(id),
    dispose(){for(const l of pool)l.dispose();pool=[];geometry.dispose();material.dispose();group.removeFromParent();},
  };
}
