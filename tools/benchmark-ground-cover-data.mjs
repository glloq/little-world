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
// Include the canonical slope and classification cost on a real island tile, not only colours.
const {readFile}=await import('node:fs/promises'),{parseProject}=await import('../src/studio-core/schema.ts'),{projectGeographyInput}=await import('../src/studio-core/geo-context.ts'),{configureTerrain}=await import('../src/terrain.ts'),{configureGeography}=await import('../src/geography/engine.ts');
const project=parseProject(JSON.parse(await readFile(new URL('../maps/island.project.json',import.meta.url),'utf8'))),input=projectGeographyInput(project);
configureTerrain(input.config,input.edits,input.waters,input.paths);configureGeography(input.sources);
function historical(path,overrides={}){
 const raw=execFileSync('git',['show',revision+':'+path],{encoding:'utf8'});
 const source=stripTypeScriptTypes(raw).replace(/from\s+(['"])([^'"]+)\1/g,(_,q,spec)=>'from '+JSON.stringify(overrides[spec]??new URL(spec,new URL('../'+path,import.meta.url)).href));
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
const oldSurface=historical('src/geography/surface.ts',{'./materials.ts':historical('src/geography/materials.ts')});
const oldTile=(await import(historical('src/terrain-data.ts',{'./geography/surface.ts':oldSurface}))).createChunkData,{createChunkData}=await import('../src/terrain-data.ts');
const tile={minX:-384,maxX:-320,minZ:-1216,maxZ:-1152};result.tile={bounds:tile,lods:[]};
for(const lod of [0,1,2]){
 const rows=[];let final;
 for(let run=0;run<8;run++)for(const [name,fn]of [['before',oldTile],['after',createChunkData]]){const start=performance.now();final=fn(tile,lod);if(run)rows.push({name,ms:performance.now()-start});}
 const mid=name=>rows.filter(r=>r.name===name).map(r=>r.ms).sort((a,b)=>a-b)[3];
 result.tile.lods.push({lod,vertices:final.surfaceVertices,beforeMs:mid('before'),afterMs:mid('after'),runs:rows});
}
result.tile.note='CPU generation on the real island; historical builders use the current bit-equivalent LinearColor helper. No GPU upload or worker message cost.';
await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({tile:result.tile}));
