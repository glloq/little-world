/** Node benchmark of the geography workloads (3D tiles, horizon, dressing, 2D map) with output
 * checksums: optimisations must keep every checksum identical. Usage:
 * node --experimental-strip-types tools/benchmark-geography-cpu.mjs reference|island */
// Geography workload benchmark with output checksums (optimisations must keep them identical).
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const R=new URL('../src/',import.meta.url).href;
const {configureTerrain}=await import(R+'terrain.ts');
const {configureGeography,geoContext}=await import(R+'geography/engine.ts');
const {createChunkGeometry}=await import(R+'terrain-view.ts');
const {horizonBlockData,horizonGrid}=await import(R+'horizon-view.ts');
const {generateDressingCell}=await import(R+'geography/dressing.ts');
const {sampleTile}=await import(R+'studio/geo-map/raster.ts');
const {projectGeography}=await import(R+'studio-core/geo-context.ts');
const {parseProject}=await import(R+'studio-core/schema.ts');
const {toRuntimeWorld}=await import(R+'studio-core/migration.ts');
const which=process.argv[2]??'reference';
const p=parseProject(JSON.parse(await readFile(new URL(`../maps/${which}.project.json`,import.meta.url),'utf8')));
const def=toRuntimeWorld(p),c=def.config,W=c.width,L=c.length,g=def.geography;
configureTerrain(c,def.terrain,def.water,def.paths);
configureGeography({seed:c.seed,grid:{minX:-W/2,minZ:-L/2,chunkSizeM:64,columns:Math.ceil(W/64),rows:Math.ceil(L/64)},masks:g?.masks??{},zones:g?.zones??[],biomeStrokes:[],buildings:def.placements.filter(q=>q.assetId.startsWith('architecture.')).map(q=>({x:q.x,z:q.z,radius:6}))});
const out={which};
function measure(name,warm,work){warm();const hash=createHash('sha256');const runs=[];for(let r=0;r<7;r++){const t=performance.now();work(r===0?hash:null);runs.push(performance.now()-t);}runs.sort((a,b)=>a-b);out[name]=+runs[0].toFixed(1);out[name+'#']=hash.digest('hex').slice(0,12);}
const chunks=[];for(let i=0;i<48;i++){const x=((i*7)%12-6)*64,z=((i*5)%16-8)*64;chunks.push({minX:x,maxX:x+64,minZ:z,maxZ:z+64,lod:i%3});}
measure('tiles48',()=>{for(const ch of chunks.slice(0,6))createChunkGeometry(ch,ch.lod);},h=>{for(const ch of chunks){const geo=createChunkGeometry(ch,ch.lod);if(h)for(const n of ['position','color','normal'])h.update(Buffer.from(geo.getAttribute(n).array.buffer));}});
const grid=horizonGrid(W,L),bounds={width:W,length:L,seaLevel:c.seaLevel};
measure('horizonAll',()=>horizonBlockData(bounds,grid,0,0),h=>{for(let r=0;r<grid.rows;r++)for(let q=0;q<grid.columns;q++){const d=horizonBlockData(bounds,grid,q,r);if(h)for(const a of [d.positions,d.colors,d.normals])h.update(Buffer.from(a.buffer));}});
const inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;
measure('dressing60',()=>generateDressingCell(geoContext(),c.seed,0,0,inside),h=>{const ctx=geoContext();for(let i=0;i<60;i++){const cell=generateDressingCell(ctx,c.seed,(i*3)%14-7,(i*7)%22-11,inside);if(h)for(const a of Object.values(cell.items))h.update(Buffer.from(a.buffer));}});
const geo=projectGeography(p);
measure('map16',()=>sampleTile(geo.ctx,p.world.bounds,3,1,1),h=>{for(let i=0;i<16;i++){const t=sampleTile(geo.ctx,p.world.bounds,2,i%6,(i*3)%9);if(h){h.update(Buffer.from(t.heights.buffer));h.update(Buffer.from(t.slope.buffer));h.update(Buffer.from(t.moisture.buffer));for(const a of Object.values(t.codes))h.update(Buffer.from(a.buffer));h.update(Buffer.from(t.authored.buffer));}}});
console.log(JSON.stringify(out));
