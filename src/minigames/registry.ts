/**
 * MiniGameRegistry: family id → loader. Loaders are statically analysable dynamic imports,
 * so Vite emits one chunk per family and nothing is fetched until an island needs it.
 * An imported ES module stays in the browser's module cache: "unloading" a family means
 * dropping instances and their resources, not evicting the code.
 */
import type {MiniGameFamilyId} from './catalog.ts';
import type {MiniGameFamilyModule} from './types.ts';

export type MiniGameLoader=()=>Promise<MiniGameFamilyModule>;
export const DEFAULT_LOADERS:Record<MiniGameFamilyId,MiniGameLoader>={
  ball:async()=>(await import('./ball/family.ts')).default,
};
export class MiniGameRegistry {
  private pending=new Map<string,Promise<MiniGameFamilyModule>>();
  private ready=new Map<string,MiniGameFamilyModule>();
  private loaders:Record<string,MiniGameLoader>;
  constructor(loaders:Record<string,MiniGameLoader>=DEFAULT_LOADERS){this.loaders=loaders;}
  has(family:string){return Object.prototype.hasOwnProperty.call(this.loaders,family);}
  /** Single flight per family; a failed load can be retried later. */
  load(family:string):Promise<MiniGameFamilyModule>{
    const done=this.ready.get(family);if(done)return Promise.resolve(done);
    let p=this.pending.get(family);
    if(!p){
      if(!this.has(family))return Promise.reject(Error('Famille de mini-jeu inconnue : '+family));
      p=this.loaders[family]().then(m=>{if(m.family!==family)throw Error('Module de famille incohérent');this.ready.set(family,m);return m;})
        .finally(()=>this.pending.delete(family));
      this.pending.set(family,p);
    }
    return p;
  }
  /** Families actually imported so far (tests: an island without mini-games imports none). */
  loaded():string[]{return [...this.ready.keys()].sort();}
}
