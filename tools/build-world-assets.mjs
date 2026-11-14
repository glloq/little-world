/** World Production V1 — WP-1 asset inventory.
 * Reads every local asset manifest (vegetation lots, enclosures, walls, bridges, dock, buildings,
 * boats, legacy catalogue), inspects the REAL GLB files (header, JSON chunk, accessors) and
 * merges the authoring usage table of `src/world-production/asset-usage.ts`. Writes the single
 * registry used by the runtime, the Studio library and the compiler:
 *   assets/world-assets.json
 * Nothing is downloaded; GLB files are never modified. `--check` fails when the committed
 * registry is stale (CI-friendly). Usage: node --experimental-strip-types tools/build-world-assets.mjs [--check]
 */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const {ASSET_USAGE,REGISTRY_VERSION}=await import(new URL('src/world-production/asset-usage.ts',root).href);

/** Normalised `models/...glb` path (relative to public/, like the legacy catalogue). */
const modelPath=p=>p.replace(/^public\//,'');
/** Collect {id, source, sourceId, label, group, license, status, lods:[{level,file,triangles?,sha256?}]} */
async function collect(){
  const out=[];
  const add=entry=>out.push(entry);
  for(const lot of ['lot1','lot2']){
    const m=await json(`assets/vegetation/${lot}-manifest.json`);
    for(const item of m.items)add({id:'nature.'+item.id,source:`assets/vegetation/${lot}-manifest.json`,sourceId:item.id,label:item.label,group:item.group,license:'project-original',status:m.status==='APPROVED'?'ART_APPROVED':'UNKNOWN',
      lods:Object.entries(item.lods).map(([level,l])=>({level:Number(level),file:modelPath(l.path),triangles:l.triangles,sha256:l.sha256}))});
  }
  const enclosures=[['assets/vegetation/manifest.json','nature.','hedges'],['assets/structures/fences/manifest.json','structure.','fences'],['assets/structures/walls/manifest.json','structure.','walls']];
  for(const [file,prefix,group]of enclosures){
    const m=await json(file);
    for(const item of m.models)add({id:prefix+item.id,source:file,sourceId:item.id,label:item.label,group,license:'project-original',status:'ART_APPROVED',placement:item.placement,
      lods:item.lods.map(l=>({level:l.level,file:modelPath(l.path),triangles:l.triangles}))});
  }
  const bridges=await json('assets/structures/bridges/manifest.json');
  for(const item of bridges.models){
    const key=item.id.includes('wooden_arch')?'bridge_wooden_arch':'bridge_log';
    add({id:'structure.'+key,source:'assets/structures/bridges/manifest.json',sourceId:item.id,label:item.name,group:'bridges',license:bridges.license,status:bridges.status==='ART_APPROVED_RUNTIME_NOT_QUALIFIED'?'ART_APPROVED':'UNKNOWN',
      anchors:item.placement,lods:item.lods.map((l,i)=>({level:i,file:l.file,triangles:l.triangles,sha256:l.sha256}))});
  }
  const stone=await json('assets/structures/stone_bridge/manifest.json');
  add({id:'structure.bridge_stone',source:'assets/structures/stone_bridge/manifest.json',sourceId:stone.id,label:stone.name,group:'bridges',license:stone.license,status:'ART_APPROVED',anchors:stone.placement,
    lods:stone.lods.map(l=>({level:l.level,file:l.path,triangles:l.triangles,sha256:l.sha256}))});
  const dock=await json('assets/structures/dock/manifest.json');
  for(const [key,item]of Object.entries(dock.assets))add({id:'structure.dock_'+key,source:'assets/structures/dock/manifest.json',sourceId:key,label:'Ponton — '+key,group:'dock',license:dock.license,status:'ART_APPROVED',
    lods:Object.entries(item.lods).map(([level,l])=>({level:Number(level.replace('lod','')),file:l.file,triangles:l.triangles,sha256:l.sha256}))});
  const approved=await json('assets/buildings/approved.json');
  for(const item of approved.models)add({id:item.id,source:'assets/buildings/approved.json',sourceId:item.id,label:item.name,group:'buildings',license:item.license,status:item.status==='ART_APPROVED_RUNTIME_NOT_QUALIFIED'?'ART_APPROVED':'UNKNOWN',
    lods:item.lods.map((l,i)=>({level:i,file:l.path,triangles:l.triangles,sha256:l.sha256}))});
  const windmill=await json('assets/buildings/windmill_stone/manifest.json');
  add({id:'architecture.windmill_stone',source:'assets/buildings/windmill_stone/manifest.json',sourceId:windmill.id,label:windmill.name,group:'buildings',license:windmill.license,status:'ART_APPROVED',
    lods:windmill.lods.map((l,i)=>({level:i,file:l.path,triangles:l.triangles,sha256:l.sha256}))});
  const watermill=await json('assets/buildings/watermill_log_stone/manifest.json');
  add({id:'architecture.watermill_log_stone',source:'assets/buildings/watermill_log_stone/manifest.json',sourceId:watermill.id,label:watermill.name,group:'buildings',license:'project-original',status:'ART_APPROVED',
    lods:watermill.lods.map((l,i)=>({level:i,file:modelPath(l.path),triangles:l.triangles,sha256:l.sha256}))});
  const boats=await json('assets/boats/manifest.json');
  for(const item of boats.models)add({id:item.id,source:'assets/boats/manifest.json',sourceId:item.id,label:item.name,group:'boats',license:'project-original',status:boats.status==='APPROVED'?'ART_APPROVED':'UNKNOWN',
    lods:['lod0','lod1'].filter(k=>item[k]).map((k,i)=>({level:i,file:modelPath(item[k].file),triangles:item[k].triangles,sha256:item[k].sha256}))});
  const kit=await json('assets/world-kit/manifest.json');
  for(const item of kit.models)add({id:item.id,source:'assets/world-kit/manifest.json',sourceId:item.id,label:item.label,group:item.group,license:kit.license,status:'GENERATED_NOT_REVIEWED',
    lods:item.lods.map(l=>({level:l.level,file:modelPath(l.path),triangles:l.triangles,sha256:l.sha256}))});
  const legacy=await json('assets/catalog.json');
  for(const item of legacy.assets.filter(a=>a.type==='glb'))add({id:item.id,source:'assets/catalog.json',sourceId:item.id,label:item.name,group:'legacy',license:item.license,status:'RUNTIME_QUALIFIED',lods:[{level:0,file:item.file}]});
  return out;
}

/** GLB inspection: triangles, vertices, world-space bounds (node TRS applied), materials,
 * textures, vertex colours, primitive modes. Pure reading, no dependency. */
function inspectGlb(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw Error('Invalid GLB header');
  const jsonLength=view.getUint32(12,true);if(view.getUint32(16,true)!==0x4e4f534a)throw Error('Missing JSON chunk');
  const gltf=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
  let triangles=0,vertices=0,vertexColors=true,nonTriangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const mul=(a,b)=>{const o=new Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
  const local=n=>{
    if(n.matrix)return n.matrix;
    const [tx,ty,tz]=n.translation??[0,0,0],[x,y,z,w]=n.rotation??[0,0,0,1],[sx,sy,sz]=n.scale??[1,1,1];
    return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0, 2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0, 2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0, tx,ty,tz,1];
  };
  const ident=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],nodeNames=[];
  const visit=(index,parent)=>{
    const n=gltf.nodes[index],m=mul(parent,local(n));if(n.name)nodeNames.push(n.name);
    if(n.mesh!==undefined)for(const p of gltf.meshes[n.mesh].primitives){
      const pos=gltf.accessors[p.attributes.POSITION],mode=p.mode??4;
      if(mode!==4){nonTriangles++;continue;}
      vertices+=pos.count;triangles+=(p.indices!==undefined?gltf.accessors[p.indices].count:pos.count)/3;
      if(!p.attributes.COLOR_0)vertexColors=false;
      for(let c=0;c<8;c++){const v=[c&1?pos.max[0]:pos.min[0],c&2?pos.max[1]:pos.min[1],c&4?pos.max[2]:pos.min[2]];
        for(let a=0;a<3;a++){const w=m[a]*v[0]+m[4+a]*v[1]+m[8+a]*v[2]+m[12+a];min[a]=Math.min(min[a],w);max[a]=Math.max(max[a],w);}}
    }
    for(const child of n.children??[])visit(child,m);
  };
  const scene=gltf.scenes?.[gltf.scene??0];for(const index of scene?.nodes??gltf.nodes.map((_,i)=>i))visit(index,ident);
  const r=v=>Math.round(v*1000)/1000;
  return {triangles,vertices,nonTriangles,bounds:{min:min.map(r),max:max.map(r)},materials:(gltf.materials??[]).length,textures:(gltf.images??[]).length,vertexColors,animations:(gltf.animations??[]).length,nodes:nodeNames.slice(0,12)};
}

export async function buildRegistry(){
  const entries=await collect(),assets=[],diagnostics=[];
  const ids=new Set();
  for(const entry of entries){
    if(ids.has(entry.id))throw Error('Identifiant dupliqué : '+entry.id);ids.add(entry.id);
    const lods=[];
    for(const lod of entry.lods.sort((a,b)=>a.level-b.level)){
      const url=new URL('public/'+lod.file,root);let bytes;
      try{bytes=new Uint8Array(await readFile(url));}catch{diagnostics.push({severity:'ERROR',code:'ASSET_FILE_MISSING',id:entry.id,message:'Fichier absent : '+lod.file});continue;}
      const sha256=createHash('sha256').update(bytes).digest('hex'),info=inspectGlb(bytes);
      if(lod.sha256&&lod.sha256!==sha256)diagnostics.push({severity:'ERROR',code:'ASSET_HASH_MISMATCH',id:entry.id,message:`Empreinte différente du manifeste : ${lod.file}`});
      if(lod.triangles!==undefined&&lod.triangles!==info.triangles)diagnostics.push({severity:'WARNING',code:'ASSET_TRIANGLES_MISMATCH',id:entry.id,message:`Triangles ${info.triangles} ≠ manifeste ${lod.triangles} : ${lod.file}`});
      lods.push({level:lod.level,file:lod.file,bytes:bytes.byteLength,sha256,...info});
    }
    if(!lods.length)continue;
    const b=lods[0].bounds,size=[0,1,2].map(a=>Math.round((b.max[a]-b.min[a])*1000)/1000);
    // Pivot: ground-anchored models start at y≈0 and are centred on X/Z (tolerance 15 % of size).
    const pivot={base:Math.abs(b.min[1])<=Math.max(.08,size[1]*.03)?'ground':b.min[1]<0?'below-ground':'above-ground',
      centred:Math.abs((b.min[0]+b.max[0])/2)<=size[0]*.15+.05&&Math.abs((b.min[2]+b.max[2])/2)<=size[2]*.15+.05};
    const usage=ASSET_USAGE[entry.id];
    if(!usage)diagnostics.push({severity:'INFO',code:'ASSET_NO_USAGE',id:entry.id,message:'Pas de règle d’usage géographique : inventorié seulement'});
    for(const l of lods){
      if(l.textures>0)diagnostics.push({severity:'WARNING',code:'ASSET_TEXTURE',id:entry.id,message:'Texture embarquée : '+l.file});
      if(l.nonTriangles)diagnostics.push({severity:'WARNING',code:'ASSET_PRIMITIVE',id:entry.id,message:'Primitives non triangulaires ignorées : '+l.file});
    }
    if(lods.length<2&&usage?.instancing)diagnostics.push({severity:'WARNING',code:'ASSET_SINGLE_LOD',id:entry.id,message:'Un seul LOD pour un asset instancié'});
    if(lods[0].triangles>(usage?.maxTriangles??3000))diagnostics.push({severity:'WARNING',code:'ASSET_HEAVY',id:entry.id,message:`Modèle lourd (${lods[0].triangles} triangles)`});
    if(!entry.license)diagnostics.push({severity:'ERROR',code:'ASSET_LICENSE_MISSING',id:entry.id,message:'Licence manquante'});
    assets.push({id:entry.id,label:entry.label,group:entry.group,source:entry.source,sourceId:entry.sourceId,license:entry.license,origin:'Little World original (feat/little-world-assets ou catalogue historique)',
      artStatus:entry.status,runtimeStatus:usage?.runtimeStatus??'INVENTORIED',size,pivot,lods,...(entry.anchors?{anchors:entry.anchors}:{}),...(usage?{usage:usage}:{})});
  }
  assets.sort((a,b)=>a.id.localeCompare(b.id));
  return {format:'little-world-world-assets',version:REGISTRY_VERSION,generatedBy:'tools/build-world-assets.mjs',units:'m',up:'Y',externalAssets:[],
    totals:{assets:assets.length,glbFiles:assets.reduce((s,a)=>s+a.lods.length,0),bytes:assets.reduce((s,a)=>s+a.lods.reduce((t,l)=>t+l.bytes,0),0),withUsage:assets.filter(a=>a.usage).length},
    assets,diagnostics};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const registry=await buildRegistry(),text=JSON.stringify(registry,null,1)+'\n',target=new URL('assets/world-assets.json',root);
  if(process.argv.includes('--check')){
    const current=await readFile(target,'utf8').catch(()=>'');
    if(current!==text){console.error('assets/world-assets.json est obsolète : relancer npm run generate:world-assets');process.exit(1);}
    console.log('Registre à jour');
  }else{await writeFile(target,text);const s=await stat(target);console.log(JSON.stringify({...registry.totals,errors:registry.diagnostics.filter(d=>d.severity==='ERROR').length,warnings:registry.diagnostics.filter(d=>d.severity==='WARNING').length,registryBytes:s.size}));}
}
