/** CPU-only colour preparation comparison against the recorded pre-change revision. */
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {materialColor} from '../src/geography/materials.ts';
import {LinearColor} from '../src/render/linear-color.ts';
const revision=process.argv[2]??'c34057f',out=process.argv[3]??'/tmp/ground-cover-data.json';
const old=execFileSync('git',['show',revision+':src/geography/materials.ts'],{encoding:'utf8'}).replace("'./noise.ts'",JSON.stringify(new URL('../src/geography/noise.ts',import.meta.url).href));
const before=(await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(old)).toString('base64'))).materialColor;
const samples=['grass','dry-grass','forest-floor','mud','rock'].map(material=>({height:35,slope:.1,coast:500,cliff:0,volcanic:0,moisture:.6,geology:'soil',biome:'meadow',material,occupation:'none',underwater:false}));
const c=new LinearColor(),count=100000,runs=[];
for(let run=0;run<8;run++)for(const [name,fn]of [['before',before],['after',materialColor]]){const begin=performance.now();for(let i=0;i<count;i++)fn(samples[i%5],0,c,i%4096,Math.floor(i/4096)*16,42);if(run)runs.push({name,ms:performance.now()-begin});}
const median=name=>runs.filter(r=>r.name===name).map(r=>r.ms).sort((a,b)=>a-b)[3];
const result={revision,count,materialMix:samples.map(s=>s.material),beforeMs:median('before'),afterMs:median('after'),method:'7 measured alternating runs after warmup, CPU only, colour generation not frame update',runs};
await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
