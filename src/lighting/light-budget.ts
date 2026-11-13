/** E10 — selection of the few real dynamic lights among many authored sources.
 * Pure and allocation-free per frame (typed arrays sized once per source set / capacity):
 *  - static sources are bucketed in a uniform grid; only the cells around the camera are read;
 *  - re-selection runs when the camera moved a few metres or a short interval elapsed, not
 *    every frame, and keeps the current lights unless a candidate is clearly better (hysteresis);
 *  - slots are stable (a light stays in its slot) so the renderer never reorders its pool;
 *  - a separate, larger set of « glow » sources (cheap far halos) is rebuilt only after a
 *    larger camera move, nearest cells first, up to a fixed capacity.
 * The light count seen by shaders is fixed by the renderer pool; this module only decides
 * which source feeds which slot. Values are starting points to benchmark, not validated. */
import {modeFactor,lightSeed,type RuntimeLight} from './light-data.ts';

export interface LightBudgetOptions {
  /** Maximum number of dynamic lights (pool size). */capacity:number;
  /** Grid cell size (m). */cellSize?:number;
  /** Extra distance beyond a light's range within which it may be a dynamic light (m). */dynamicRadius?:number;
  /** Radius of far halos (m). */glowRadius?:number;
  /** Maximum number of halos. */glowCapacity?:number;
  /** Camera move (m) / interval (s) triggering a re-selection. */reselectDistance?:number;reselectInterval?:number;
  /** Score bonus of a light already shown (hysteresis). */keepBonus?:number;
}
export type LightStatus='dynamic'|'glow'|'budget'|'off'|'far';
export interface LightBudgetStats {sources:number;followers:number;candidates:number;active:number;glow:number;glowDropped:number;overBudget:number;reselections:number;glowRebuilds:number;cellsRead:number}
type StateLookup=(entityId:string,key:string)=>boolean|undefined;
type FollowLookup=(entityId:string)=>{x:number;y:number;z:number}|undefined;
const KEY_OFFSET=32768,cellKey=(ix:number,iz:number)=>(ix+KEY_OFFSET)*65536+(iz+KEY_OFFSET);

export class LightBudget {
  readonly capacity:number;readonly glowCapacity:number;
  readonly cellSize:number;readonly dynamicRadius:number;readonly glowRadius:number;
  readonly reselectDistance:number;readonly reselectInterval:number;readonly keepBonus:number;
  sources:RuntimeLight[]=[];
  /** Absolute positions (followers updated during selection and for their active slot). */
  px=new Float64Array(0);py=new Float64Array(0);pz=new Float64Array(0);
  /** Current mode factor of each source (0 = off), refreshed on selection. */
  factor=new Float32Array(0);seeds=new Uint32Array(0);
  /** slot → source index (-1 = unused). Stable between selections. */
  readonly slots:Int32Array;
  /** Halo source indices [0, glowCount). */
  readonly glow:Int32Array;glowCount=0;
  /** Incremented when slots / glow content change (renderer uploads only then). */
  slotVersion=0;glowVersion=0;
  budget:number;
  readonly stats:LightBudgetStats={sources:0,followers:0,candidates:0,active:0,glow:0,glowDropped:0,overBudget:0,reselections:0,glowRebuilds:0,cellsRead:0};
  private cells=new Map<number,number[]>();private followers:number[]=[];private maxRange=0;
  private topIndex:Int32Array;private topScore:Float64Array;private chosen:Int32Array;
  private last={x:Infinity,y:Infinity,z:Infinity,time:-Infinity,night:-1};private glowAt={x:Infinity,z:Infinity,time:-Infinity,night:-1};
  private dirty=true;private count=0;private over=0;private glowN=0;private glowDropped=0;
  constructor(o:LightBudgetOptions){
    this.capacity=Math.max(0,Math.floor(o.capacity));this.budget=this.capacity;this.cellSize=o.cellSize??48;this.dynamicRadius=o.dynamicRadius??40;this.glowRadius=o.glowRadius??700;
    this.glowCapacity=o.glowCapacity??512;this.reselectDistance=o.reselectDistance??3;this.reselectInterval=o.reselectInterval??.25;this.keepBonus=o.keepBonus??1.35;
    this.slots=new Int32Array(this.capacity).fill(-1);this.glow=new Int32Array(this.glowCapacity);
    this.topIndex=new Int32Array(this.capacity);this.topScore=new Float64Array(this.capacity);this.chosen=new Int32Array(this.capacity);
  }
  /** Replace the source set (world/project change or authoring edit). `height` gives the
   * ground under a static source (its `y` is a height above the ground). */
  setSources(list:RuntimeLight[],height:(x:number,z:number)=>number){
    const n=list.length,previous=Array.from(this.slots,i=>i>=0?this.sources[i]?.id:undefined);
    this.sources=list;this.px=new Float64Array(n);this.py=new Float64Array(n);this.pz=new Float64Array(n);this.factor=new Float32Array(n);this.seeds=new Uint32Array(n);
    this.cells.clear();this.followers=[];this.maxRange=0;
    for(let i=0;i<n;i++){
      const l=list[i];this.seeds[i]=lightSeed(l.id);this.maxRange=Math.max(this.maxRange,l.range);
      // Height above the ground under the carrying entity (as for its model), plus the offset.
      this.px[i]=l.x;this.py[i]=height(l.x-l.offset.x,l.z-l.offset.z)+l.y;this.pz[i]=l.z;
      if(l.follow){this.followers.push(i);continue;}
      const key=cellKey(Math.floor(l.x/this.cellSize),Math.floor(l.z/this.cellSize));let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(i);
    }
    // Keep surviving lights in their slot (an edit must not reshuffle the pool).
    const ids=new Map(list.map((l,i)=>[l.id,i]));for(let s=0;s<this.capacity;s++){const id=previous[s];this.slots[s]=id!==undefined?ids.get(id)??-1:-1;}
    this.stats.sources=n;this.stats.followers=this.followers.length;this.dirty=true;this.slotVersion++;this.glowVersion++;this.glowCount=0;
  }
  setBudget(count:number){const next=Math.max(0,Math.min(this.capacity,Math.floor(count)));if(next!==this.budget){this.budget=next;this.dirty=true;}}
  /** Per-frame entry point. Returns true when the slot assignment changed. */
  update(cx:number,cy:number,cz:number,night:number,time:number,state?:StateLookup,follow?:FollowLookup):boolean{
    if(!this.sources.length){if(this.stats.active||this.glowCount){this.slots.fill(-1);this.glowCount=0;this.stats.active=0;this.stats.glow=0;this.slotVersion++;this.glowVersion++;}return false;}
    const l=this.last,moved=Math.hypot(cx-l.x,cy-l.y,cz-l.z),nightChanged=Math.abs(night-l.night)>.02;
    let changed=false;
    if(this.dirty||moved>this.reselectDistance||time-l.time>=this.reselectInterval||nightChanged){changed=this.select(cx,cy,cz,night,time,state,follow);}
    else if(follow)for(let s=0;s<this.budget;s++){const i=this.slots[s];if(i>=0&&this.sources[i].follow)this.followPosition(i,follow);}
    const g=this.glowAt;if(this.dirty||Math.hypot(cx-g.x,cz-g.z)>this.glowRadius/8||time-g.time>=1||Math.abs(night-g.night)>.02)this.rebuildGlow(cx,cz,night,time,state);
    this.dirty=false;return changed;
  }
  private followPosition(i:number,follow:FollowLookup){const l=this.sources[i],p=follow(l.entityId);if(p){this.px[i]=p.x+l.offset.x;this.py[i]=p.y+l.offset.y;this.pz[i]=p.z+l.offset.z;}}
  private refreshFactor(i:number,night:number,state?:StateLookup){const l=this.sources[i];this.factor[i]=modeFactor(l.mode,night,l.mode==='state'&&l.stateKey?state?.(l.entityId,l.stateKey):undefined);}
  private consider(i:number,cx:number,cy:number,cz:number){
    const l=this.sources[i],f=this.factor[i];if(f<=0)return;
    const dx=this.px[i]-cx,dy=this.py[i]-cy,dz=this.pz[i]-cz,d2=dx*dx+dy*dy+dz*dz,reach=l.range+this.dynamicRadius;if(d2>reach*reach)return;
    this.stats.candidates++;let score=f*l.intensity*l.range*l.range/(d2+1);
    for(let s=0;s<this.capacity;s++)if(this.slots[s]===i){score*=this.keepBonus;break;}
    // Insertion into the fixed top-k buffer (k = budget ≤ capacity, a handful of lights).
    const k=this.budget;if(!k){this.over++;return;}
    if(this.count<k){let j=this.count++;while(j>0&&this.topScore[j-1]<score){this.topScore[j]=this.topScore[j-1];this.topIndex[j]=this.topIndex[j-1];j--;}this.topScore[j]=score;this.topIndex[j]=i;return;}
    this.over++;if(score<=this.topScore[k-1])return;
    let j=k-1;while(j>0&&this.topScore[j-1]<score){this.topScore[j]=this.topScore[j-1];this.topIndex[j]=this.topIndex[j-1];j--;}this.topScore[j]=score;this.topIndex[j]=i;
  }
  private select(cx:number,cy:number,cz:number,night:number,time:number,state?:StateLookup,follow?:FollowLookup):boolean{
    const st=this.stats;st.reselections++;st.candidates=0;st.cellsRead=0;this.count=0;this.over=0;
    const reach=this.maxRange+this.dynamicRadius,size=this.cellSize,x0=Math.floor((cx-reach)/size),x1=Math.floor((cx+reach)/size),z0=Math.floor((cz-reach)/size),z1=Math.floor((cz+reach)/size);
    for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){const cell=this.cells.get(cellKey(ix,iz));st.cellsRead++;if(!cell)continue;for(let k=0;k<cell.length;k++){const i=cell[k];this.refreshFactor(i,night,state);this.consider(i,cx,cy,cz);}}
    for(const i of this.followers){if(follow)this.followPosition(i,follow);this.refreshFactor(i,night,state);this.consider(i,cx,cy,cz);}
    st.overBudget=this.over;
    // Stable slots: lights still chosen keep their slot, newcomers take the freed ones.
    const n=this.count;for(let j=0;j<n;j++)this.chosen[j]=this.topIndex[j];
    let changed=false;
    for(let s=0;s<this.capacity;s++){const i=this.slots[s];if(i<0)continue;let keep=s<this.budget;if(keep){keep=false;for(let j=0;j<n;j++)if(this.chosen[j]===i){keep=true;this.chosen[j]=-1;break;}}if(!keep){this.slots[s]=-1;changed=true;}}
    for(let j=0;j<n;j++){const i=this.chosen[j];if(i<0)continue;for(let s=0;s<this.budget;s++)if(this.slots[s]<0){this.slots[s]=i;changed=true;break;}}
    let active=0;for(let s=0;s<this.capacity;s++)if(this.slots[s]>=0)active++;st.active=active;
    const l=this.last;l.x=cx;l.y=cy;l.z=cz;l.time=time;l.night=night;if(changed)this.slotVersion++;return changed;
  }
  /** Nearest cells first (square rings) so that a full halo buffer keeps the closest sources. */
  private rebuildGlow(cx:number,cz:number,night:number,time:number,state?:StateLookup){
    const size=this.cellSize,ox=Math.floor(cx/size),oz=Math.floor(cz/size),rings=Math.ceil(this.glowRadius/size);this.glowN=0;this.glowDropped=0;
    for(let r=0;r<=rings;r++)for(let ix=ox-r;ix<=ox+r;ix++){
      // Ring r: full rows at the top/bottom edges, only the two side cells elsewhere.
      const edge=ix===ox-r||ix===ox+r,step=edge||r===0?1:2*r;
      for(let iz=oz-r;iz<=oz+r;iz+=step){const cell=this.cells.get(cellKey(ix,iz));if(cell)for(let k=0;k<cell.length;k++)this.takeGlow(cell[k],cx,cz,night,state);}
    }
    for(let k=0;k<this.followers.length;k++)this.takeGlow(this.followers[k],cx,cz,night,state);
    const n=this.glowN;this.glowCount=n;this.stats.glow=n;this.stats.glowDropped=this.glowDropped;this.stats.glowRebuilds++;this.glowVersion++;const g=this.glowAt;g.x=cx;g.z=cz;g.time=time;g.night=night;
  }
  private takeGlow(i:number,cx:number,cz:number,night:number,state?:StateLookup){
    this.refreshFactor(i,night,state);if(this.factor[i]<=0)return;const dx=this.px[i]-cx,dz=this.pz[i]-cz;if(dx*dx+dz*dz>this.glowRadius*this.glowRadius)return;
    if(this.glowN<this.glowCapacity)this.glow[this.glowN++]=i;else this.glowDropped++;
  }
  /** Authoring feedback (Studio list): why a source is or is not lit right now. */
  statusOf(id:string):LightStatus{
    const i=this.sources.findIndex(l=>l.id===id);if(i<0)return 'off';
    for(let s=0;s<this.capacity;s++)if(this.slots[s]===i)return 'dynamic';
    if(this.factor[i]<=0&&this.last.time>-Infinity)return 'off';
    const l=this.last,dx=this.px[i]-l.x,dy=this.py[i]-l.y,dz=this.pz[i]-l.z,reach=this.sources[i].range+this.dynamicRadius;
    if(dx*dx+dy*dy+dz*dz<=reach*reach)return 'budget';
    for(let g=0;g<this.glowCount;g++)if(this.glow[g]===i)return 'glow';
    return 'far';
  }
}
