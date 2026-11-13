/** Bounded LRU cache of map sample tiles and their per-layer images. Edits mark tiles stale
 * (still drawn, re-sampled in priority order) instead of clearing the map: no flicker, local
 * invalidation only. Byte counts are estimates of the typed arrays and RGBA images. */
import {TILE_PX,layerPixels,type SampleTile} from './raster.ts';
import type {LayerId} from '../../geography/layers.ts';

export interface TileEntry {sample:SampleTile;images:Map<LayerId,HTMLCanvasElement>;stale:boolean;used:number}
const IMAGE_BYTES=TILE_PX*TILE_PX*4;
export class TileCache {
  private tiles=new Map<string,TileEntry>();private clock=0;
  bytes=0;
  readonly maxBytes:number;
  constructor(maxBytes=24*1024*1024){this.maxBytes=maxBytes;}
  static key(level:number,tx:number,tz:number){return level+'/'+tx+'/'+tz;}
  get size(){return this.tiles.size;}
  get(level:number,tx:number,tz:number):TileEntry|undefined{const e=this.tiles.get(TileCache.key(level,tx,tz));if(e)e.used=++this.clock;return e;}
  put(sample:SampleTile):TileEntry{
    const key=TileCache.key(sample.level,sample.tx,sample.tz),old=this.tiles.get(key);
    if(old)this.bytes-=old.sample.bytes+old.images.size*IMAGE_BYTES;
    const entry:TileEntry={sample,images:new Map(),stale:false,used:++this.clock};this.tiles.set(key,entry);this.bytes+=sample.bytes;this.evict();return entry;
  }
  image(entry:TileEntry,layer:LayerId,seaLevel:number):HTMLCanvasElement{
    let canvas=entry.images.get(layer);if(canvas)return canvas;
    canvas=document.createElement('canvas');canvas.width=canvas.height=TILE_PX;const ctx=canvas.getContext('2d')!,image=ctx.createImageData(TILE_PX,TILE_PX);
    layerPixels(entry.sample,layer,seaLevel,image.data);ctx.putImageData(image,0,0);entry.images.set(layer,canvas);this.bytes+=IMAGE_BYTES;this.evict();return canvas;
  }
  /** Mark tiles intersecting a world rectangle (or all tiles) as stale. Returns the count. */
  invalidate(rect:{minX:number;maxX:number;minZ:number;maxZ:number}|null):number{
    let n=0;
    for(const e of this.tiles.values()){const s=e.sample,span=TILE_PX*s.mpp;if(rect&&(s.x0>rect.maxX||s.x0+span<rect.minX||s.z0>rect.maxZ||s.z0+span<rect.minZ))continue;if(!e.stale){e.stale=true;n++;}}
    return n;
  }
  private evict(){
    if(this.bytes<=this.maxBytes)return;
    const order=[...this.tiles.entries()].sort((a,b)=>a[1].used-b[1].used);
    for(const [key,e]of order){if(this.bytes<=this.maxBytes*.85)break;this.tiles.delete(key);this.bytes-=e.sample.bytes+e.images.size*IMAGE_BYTES;}
  }
  clear(){this.tiles.clear();this.bytes=0;}
}
