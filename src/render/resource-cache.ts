/** Small shared ownership/LRU primitive, not a second quality controller. */
export class SharedResourceCache<T extends {bytes:number;dispose():void}>{
 private entries=new Map<string,{refs:number;used:number;promise:Promise<T>;value?:T;failed?:boolean}>();private clock=0;
 readonly stats={bytes:0,entries:0,loads:0,hits:0,evictions:0,failed:0};
 readonly maxBytes:number;
 constructor(maxBytes:number){this.maxBytes=maxBytes;}
 acquire(key:string,load:()=>Promise<T>){
  let e=this.entries.get(key);if(e){this.stats.hits++;e.refs++;e.used=++this.clock;}
  else{const entry={refs:1,used:++this.clock,promise:null as unknown as Promise<T>,value:undefined as T|undefined,failed:false};e=entry;this.entries.set(key,e);this.stats.loads++;
   entry.promise=load().then(value=>{if(!entry.refs){value.dispose();this.entries.delete(key);this.stats.entries=this.entries.size;return value;}entry.value=value;this.stats.bytes+=value.bytes;this.trim();return value;},error=>{entry.failed=true;this.stats.failed++;if(!entry.refs)this.entries.delete(key);throw error;});}
  this.stats.entries=this.entries.size;let released=false;
  return {promise:e.promise,release:()=>{if(released)return;released=true;e!.refs--;e!.used=++this.clock;if(!e!.refs&&e!.failed)this.entries.delete(key);this.trim();}};
 }
 trim(target=this.maxBytes){
  for(const [key,e]of [...this.entries].sort((a,b)=>a[1].used-b[1].used)){
   if(this.stats.bytes<=target)break;if(e.refs||!e.value)continue;
   this.stats.bytes-=e.value.bytes;e.value.dispose();this.entries.delete(key);this.stats.evictions++;
  }
  this.stats.entries=this.entries.size;
 }
}
