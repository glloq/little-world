/** Deterministic rendering of one planned take (shared by the build script and the tests). */
import {SR,rng,hash,dcBlock,fade,normalize,lp,wav16} from './dsp.mjs';
import {RECIPES} from './recipes.mjs';
export const SYNTH_VERSION='lw-synth-1';export const PRODUCTION_DATE='2026-11-13';
/** Decimate ×2 with circular pre-roll so loops stay seamless. */
function to22k(x,loop){const pre=4096,ext=new Float32Array(x.length+pre);ext.set(loop?x.subarray(x.length-pre):new Float32Array(pre));ext.set(x,pre);lp(ext,9000,.6);lp(ext,9000,.6);const o=new Float32Array(Math.floor(x.length/2));for(let i=0;i<o.length;i++)o[i]=ext[pre+i*2];return o;}
export function render(item){const recipe=RECIPES[item.group];if(!recipe)return null;const r=rng(hash(item.assetId+'#'+SYNTH_VERSION));let x=recipe.fn(r,item.take);
 if(recipe.loop){let m=0;for(const v of x)m+=v;m/=x.length;for(let i=0;i<x.length;i++)x[i]-=m;}else{x=dcBlock(x);fade(x,.0015,.012);}
 let sr=SR;if(recipe.sr===22050){x=to22k(x,!!recipe.loop);sr=22050;if(!recipe.loop)fade(x,.0015,.012);}
 normalize(x,recipe.peak??-12);return {x,sr,recipe};}
/** Exact bytes written for a take (16-bit PCM, seeded dither). */
export function renderBytes(item){const out=render(item);return out?wav16(out.x,out.sr,hash(item.assetId)):null;}
