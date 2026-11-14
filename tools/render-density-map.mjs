#!/usr/bin/env node
/** World Production — top-down density map of a project (diagnostic, not a render): terrain
 * relief shading, sea, dressing density per 64 m cell (trees green, shrubs/rocks olive),
 * landscape footprints (outlines) and authored entities (dots: buildings orange, NPCs red,
 * counters blue). Shows large empty areas at a glance. Output: PNG (via Chromium canvas).
 * Usage: node tools/render-density-map.mjs maps/island.project.json out.png [metresPerPixel=8] */
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const [src='maps/island.project.json',out='docs/captures/island-density.png',mppArg='8']=process.argv.slice(2),mpp=Number(mppArg);
const {parseProject}=await import('../src/studio-core/schema.ts');
const {projectGeography}=await import('../src/studio-core/geo-context.ts');
const {generateDressingCell,ITEM_STRIDE,DRESSING_CELL_M}=await import('../src/geography/dressing.ts');
const project=parseProject(JSON.parse(await readFile(src,'utf8'))),b=project.world.bounds,{ctx}=projectGeography(project);
const W=Math.round((b.maxX-b.minX)/mpp),H=Math.round((b.maxZ-b.minZ)/mpp),inside=(x,z)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
const height=new Float32Array(W*H);for(let j=0;j<H;j++)for(let i=0;i<W;i++)height[j*W+i]=ctx.height(b.minX+(i+.5)*mpp,b.maxZ-(j+.5)*mpp);
const cells=[];let empty=0,land=0;
for(let cz=Math.floor(b.minZ/DRESSING_CELL_M);cz<=Math.floor(b.maxZ/DRESSING_CELL_M);cz++)for(let cx=Math.floor(b.minX/DRESSING_CELL_M);cx<=Math.floor(b.maxX/DRESSING_CELL_M);cx++){
  const c=generateDressingCell(ctx,project.world.seed,cx,cz,inside),count=k=>(c.items[k]?.length??0)/ITEM_STRIDE;
  const trees=count('pine')+count('oak'),small=count('shrub')+count('plant')+count('rock')+count('deadwood'),mx=(cx+.5)*DRESSING_CELL_M,mz=(cz+.5)*DRESSING_CELL_M;
  const dry=ctx.height(mx,mz)>project.world.seaLevel+.5;if(dry){land++;if(trees+small<4)empty++;}cells.push([cx,cz,trees,small,dry]);}
const entities=Object.values(project.chunks).flatMap(c=>Object.values(c.entities)).map(e=>({x:e.components.Transform?.position.x,z:e.components.Transform?.position.z,k:e.kind==='character'?'npc':e.components.State?.initial?.shop?'shop':'obj'})).filter(e=>e.x!==undefined);
const landscapes=Object.values(project.libraries.landscapes??{}).map(l=>({x:l.center.x,z:l.center.z,w:l.width,l:l.length,r:l.rotation,id:l.presetId}));
const sea=project.world.seaLevel;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{const page=await browser.newPage();
  const data=await page.evaluate(({W,H,height:hs,cells,entities,landscapes,b,mpp,sea,cell})=>{
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d'),img=g.createImageData(W,H),h=i=>hs[i];
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=j*W+i,v=h(k),sx=i<W-1?h(k+1)-v:0,sz=j<H-1?h(k+W)-v:0,shade=Math.max(.55,Math.min(1.25,1-(sx-sz)*.08));
      let r,gg,bb;if(v<=sea){r=70;gg=130;bb=170;}else if(v<sea+2){r=225;gg=210;bb=160;}else{const t=Math.min(1,(v-sea)/180);r=200-40*t;gg=215-70*t;bb=170-60*t;}
      img.data[k*4]=r*shade;img.data[k*4+1]=gg*shade;img.data[k*4+2]=bb*shade;img.data[k*4+3]=255;}
    g.putImageData(img,0,0);const px=x=>(x-b.minX)/mpp,pz=z=>(b.maxZ-z)/mpp;
    for(const [cx,cz,t,s,dry] of cells){if(!dry)continue;const x=px(cx*cell),y=pz((cz+1)*cell),w=cell/mpp;
      if(t+s<4){g.fillStyle='rgba(255,40,200,.18)';g.fillRect(x,y,w,w);continue;}
      g.fillStyle=`rgba(20,${90+Math.min(80,t)},40,${Math.min(.75,t/60)})`;g.fillRect(x,y,w,w);g.fillStyle=`rgba(120,120,40,${Math.min(.35,s/200)})`;g.fillRect(x,y,w,w);}
    g.lineWidth=1.5;for(const l of landscapes){g.save();g.translate(px(l.x),pz(l.z));g.rotate(-l.r);g.strokeStyle='rgba(30,30,30,.7)';g.strokeRect(-l.w/2/mpp,-l.l/2/mpp,l.w/mpp,l.l/mpp);g.fillStyle='#111';g.font='9px sans-serif';g.fillText(l.id,-l.w/2/mpp+2,-l.l/2/mpp+9);g.restore();}
    for(const e of entities){g.fillStyle=e.k==='npc'?'#e01010':e.k==='shop'?'#1060ff':'rgba(230,120,20,.8)';const r=e.k==='obj'?1:2.5;g.fillRect(px(e.x)-r,pz(e.z)-r,2*r,2*r);}
    return cv.toDataURL('image/png');
  },{W,H,height:[...height],cells,entities,landscapes,b,mpp,sea,cell:DRESSING_CELL_M});
  await writeFile(out,Buffer.from(data.split(',')[1],'base64'));
}finally{await browser.close();}
console.log(JSON.stringify({out,size:[W,H],landCells:land,emptyLandCells:empty,emptyShare:+(empty/land).toFixed(3),entities:entities.length,landscapes:landscapes.length}));
