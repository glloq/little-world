/** Geography map tiles: one classification per pixel (shared by every layer), then cheap
 * per-layer images with diagnostic palettes. Pixel = sample of the same Geography Engine as the
 * game; slope uses the 3D tile convention (rise over the next 2 m eastward). */
import {classifyPoint,type GeoContext} from '../../geography/classify.ts';
import {CATEGORY_LAYERS,MASK_LAYERS,type LayerId,type MaskLayerId} from '../../geography/layers.ts';

export const TILE_PX=64;
const N=TILE_PX,G=N+2;
export interface SampleTile {
  level:number;tx:number;tz:number;mpp:number;x0:number;z0:number;
  /** Heights on a (N+2)² grid: pixel centres with a one-pixel border (shading, curvature). */
  heights:Float32Array;slope:Float32Array;moisture:Uint8Array;
  /** Category index + 1 per mask layer (0 = none / under water). */
  codes:Record<Exclude<MaskLayerId,'moisture'>,Uint8Array>;
  /** Bit per mask layer (MASK_LAYERS order) when an author correction applies. */
  authored:Uint8Array;underwater:Uint8Array;bytes:number;
}
export const levelMpp=(level:number)=>2**level;
export function tileOrigin(minX:number,minZ:number,level:number,tx:number,tz:number){const span=TILE_PX*levelMpp(level);return {x0:minX+tx*span,z0:minZ+tz*span,span};}
const indexOf:Record<Exclude<MaskLayerId,'moisture'>,Map<string,number>>={geology:new Map(),biome:new Map(),material:new Map(),occupation:new Map()};
for(const layer of Object.keys(CATEGORY_LAYERS) as Exclude<MaskLayerId,'moisture'>[])CATEGORY_LAYERS[layer].forEach((v,i)=>indexOf[layer].set(v.id,i+1));

export function sampleTile(ctx:GeoContext,bounds:{minX:number;minZ:number},level:number,tx:number,tz:number):SampleTile{
  const mpp=levelMpp(level),{x0,z0}=tileOrigin(bounds.minX,bounds.minZ,level,tx,tz);
  const heights=new Float32Array(G*G);
  for(let j=0;j<G;j++)for(let i=0;i<G;i++)heights[j*G+i]=ctx.height(x0+(i-.5)*mpp,z0+(j-.5)*mpp);
  const slope=new Float32Array(N*N),moisture=new Uint8Array(N*N),authored=new Uint8Array(N*N),underwater=new Uint8Array(N*N);
  const codes={geology:new Uint8Array(N*N),biome:new Uint8Array(N*N),material:new Uint8Array(N*N),occupation:new Uint8Array(N*N)};
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const x=x0+(i+.5)*mpp,z=z0+(j+.5)*mpp,h=heights[(j+1)*G+i+1],k=j*N+i;
    // The east neighbour sample is evaluated before the classification so the generator's
    // one-entry memo serves the classification of (x,z).
    const s=Math.abs(ctx.height(x+2,z)-h)/2,sample=classifyPoint(ctx,x,z,{height:h,slope:s});
    slope[k]=s;moisture[k]=Math.round(sample.moisture*255);underwater[k]=sample.underwater?1:0;
    codes.geology[k]=indexOf.geology.get(sample.geology)??0;codes.biome[k]=indexOf.biome.get(sample.biome)??0;
    codes.material[k]=indexOf.material.get(sample.material)??0;codes.occupation[k]=indexOf.occupation.get(sample.occupation)??0;
    let bits=0;for(let l=0;l<MASK_LAYERS.length;l++){const c=ctx.mask(MASK_LAYERS[l],x,z);if(c&&c!=='.')bits|=1<<l;}
    authored[k]=bits;
  }
  return {level,tx,tz,mpp,x0,z0,heights,slope,moisture,codes,authored,underwater,bytes:heights.byteLength+slope.byteLength+N*N*8};
}
const rgb=(hex:number):[number,number,number]=>[hex>>16&255,hex>>8&255,hex&255];
const mix=(a:[number,number,number],b:[number,number,number],t:number):[number,number,number]=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const ramp=(stops:[number,number][],v:number)=>{if(v<=stops[0][0])return rgb(stops[0][1]);for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){const t=(v-stops[i-1][0])/(stops[i][0]-stops[i-1][0]);return mix(rgb(stops[i-1][1]),rgb(stops[i][1]),t);}return rgb(stops.at(-1)![1]);};
/** Diagnostic ramps (also used by the legends). */
export const ALTITUDE_RAMP:[number,number][]=[[-80,0x3c6e9e],[-1,0x8cc0dc],[0,0xdcd3a2],[25,0x9cc27f],[120,0x7aa364],[250,0xb7ad7c],[400,0x9c8f80],[600,0xf0eeea]];
export const SLOPE_RAMP:[number,number][]=[[0,0x3d8f5a],[.25,0x9fca5a],[.5,0xf0d050],[.8,0xe0803a],[1.2,0xb03a2e]];
export const MOISTURE_RAMP:[number,number][]=[[0,0xc8a15a],[.35,0xd9d39a],[.6,0x8fc58a],[.85,0x3f9aa8],[1,0x235f9a]];
const SEA:[number,number][]=[[-80,0x2f5f8f],[-1,0x7fb3d3]];
const MASK_BIT:Record<MaskLayerId,number>=Object.fromEntries(MASK_LAYERS.map((l,i)=>[l,1<<i])) as Record<MaskLayerId,number>;
const PALETTES=Object.fromEntries(Object.entries(CATEGORY_LAYERS).map(([layer,values])=>[layer,[[0,0,0] as [number,number,number],...values.map(v=>rgb(v.color))]])) as Record<Exclude<MaskLayerId,'moisture'>,[number,number,number][]>;

/** RGBA pixels of one layer; alpha 0 where the layer has nothing to show. */
export function layerPixels(t:SampleTile,layer:LayerId,seaLevel:number,out:Uint8ClampedArray){
  const mpp=t.mpp,contour=mpp<=2?10:mpp<=8?20:100;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const k=j*N+i,g=(j+1)*G+i+1,h=t.heights[g],alt=h-seaLevel,o=k*4;let c:[number,number,number]=[0,0,0],a=255;
    const shade=()=>{const dx=(t.heights[g+1]-t.heights[g-1])/(2*mpp),dz=(t.heights[g+G]-t.heights[g-G])/(2*mpp);return Math.max(.55,Math.min(1.3,1-(dx+dz)*.9));};
    switch(layer){
      case 'landsea':c=alt<0?ramp(SEA,alt):alt<1.5?rgb(0xe6d9a6):rgb(0xb9cf98);if(alt>=0&&(t.heights[g+1]<seaLevel||t.heights[g-1]<seaLevel||t.heights[g+G]<seaLevel||t.heights[g-G]<seaLevel))c=rgb(0x54493a);break;
      case 'altitude':{c=ramp(ALTITUDE_RAMP,alt);if(alt>=0){const f=shade();c=[c[0]*f,c[1]*f,c[2]*f];const band=Math.floor(alt/contour);if(Math.floor((t.heights[g+1]-seaLevel)/contour)!==band||Math.floor((t.heights[g+G]-seaLevel)/contour)!==band)c=mix(c,[70,60,50],.45);}break;}
      case 'slope':{if(alt<0){a=0;break;}c=ramp(SLOPE_RAMP,t.slope[k]);const curv=(4*h-t.heights[g+1]-t.heights[g-1]-t.heights[g+G]-t.heights[g-G])/(mpp*mpp);const tint=Math.max(-1,Math.min(1,curv*mpp*.6));c=tint>0?mix(c,[255,255,255],tint*.45):mix(c,[30,30,40],-tint*.45);break;}
      case 'moisture':if(t.underwater[k]){a=0;break;}c=ramp(MOISTURE_RAMP,t.moisture[k]/255);break;
      default:{
        const code=t.codes[layer][k];
        if(!code||(layer!=='biome'&&t.underwater[k])){a=0;break;}
        c=PALETTES[layer][code];
      }
    }
    // Author corrections of the displayed layer: fine diagonal hatching.
    if(a&&layer in MASK_BIT&&t.authored[k]&MASK_BIT[layer as MaskLayerId]&&(i+j)%4===0)c=mix(c,[255,255,255],.55);
    out[o]=c[0];out[o+1]=c[1];out[o+2]=c[2];out[o+3]=a;
  }
}
