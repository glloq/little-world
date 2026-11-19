/** Reproducible surf captures (fixed cameras + frozen presentation tick, metrics hooks only).
 * Usage: WORLD_URL=http://127.0.0.1:5173/little-world/ node tools/capture-surf-views.mjs [outDir] [tag]
 * SwiftShader by default: images are for visual review, never a performance qualification. */
import {chromium} from 'playwright';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const outDir=process.argv[2]??'/tmp/little-world-browser/surf-views';
const tag=process.argv[3]??'current';
const extra=process.env.SURF_VIEW_QUERY??'';
mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_PATH??(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],shots=[];
try{
 const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 // WebGL shader compile/link errors are console errors, not page errors.
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|program/i.test(m.text()))errors.push(m.text().slice(0,400));});
 await page.goto(new URL('?world=archipelago/worlds/surf-island/manifest.json&metrics=1&surfPerf=1'+extra,base).toString(),{waitUntil:'domcontentloaded'});
 await page.locator('#start-overlay').waitFor({state:'hidden',timeout:120000});
 await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>15,{},{timeout:120000});
 const layout=await (await page.request.get(new URL('archipelago/worlds/surf-island/surf-layout.json',base).toString())).json();
 const beach=layout.beaches.find(b=>b.name==='B');
 const zone=(await page.evaluate(()=>window.littleWorldMetrics.surfWorld)).zones.find(z=>z.id===beach.zone);
 // Comparable lighting: forced clear weather and paused world clock (test panel, never saved).
 const weather=page.locator('select[aria-label="Forcer la météo"]');
 if(await weather.count())await weather.first().selectOption(process.env.SURF_VIEW_WEATHER??'clear',{force:true}).catch(()=>{});
 const rate=page.locator('select[aria-label="Vitesse du monde"]');
 if(await rate.count())await rate.first().selectOption('0',{force:true}).catch(()=>{});
 // Hide UI chrome for clean images.
 await page.addStyleTag({content:'body *{visibility:hidden !important} canvas{visibility:visible !important}'});
 const settle=async(frames=12)=>{const f0=await page.evaluate(()=>window.littleWorldMetrics.frameId);
  await page.waitForFunction(n=>window.littleWorldMetrics.frameId>n,f0+frames,{timeout:60000});};
 await page.evaluate(p=>window.littleWorldDebug.teleport(p.x,p.z,0),beach.spawn);
 await settle(20);
 const brk=await page.evaluate(p=>window.littleWorldDebug.surfBreakPoint(p.x,p.z),beach.spawn);
 const dx=zone.dirX,dz=zone.dirZ,ax=-dz,az=dx,sea=zone.seaLevel;
 const at=(p,along,across,y)=>({x:p.x+dx*along+ax*across,z:p.z+dz*along+az*across,y:sea+y});
 const eyeAt=(p,along,across,dy)=>({x:p.x+dx*along+ax*across,z:p.z+dz*along+az*across,dy});
 // Eye heights are relative to the moving water surface at the shot tick (never underwater).
 const above=async(p,dy,tick)=>({...p,y:(await page.evaluate(([q,t])=>window.littleWorldDebug.surfWaterHeight(q.x,q.z,t),[p,tick])??sea)+dy});
 const shot=async(name,eye,target,tick)=>{
  if(eye.dy!==undefined)eye=await above(eye,eye.dy,tick??await page.evaluate(()=>window.littleWorldDebug.surfTick()));
  await page.evaluate(([e,t])=>window.littleWorldDebug.surfCamera({px:e.x,py:e.y,pz:e.z,tx:t.x,ty:t.y,tz:t.z}),[eye,target]);
  await page.evaluate(t=>window.littleWorldDebug.surfRenderTick(t),tick??null);
  await settle(8);
  const file=outDir+'/'+tag+'-'+name+'.png';
  await page.screenshot({path:file});
  const m=await page.evaluate(()=>({surf:window.littleWorldMetrics.surfPerf?.gauges,calls:window.littleWorldMetrics.calls}));
  shots.push({name,file,tick:tick??null,...m});
 };
 const t0=await page.evaluate(()=>window.littleWorldDebug.surfTick());
 const open=brk?await page.evaluate(([p,t])=>window.littleWorldDebug.surfOpenTubeTick(p.x,p.z,t),[brk,t0+30]):null;
 const crestTick=brk?await page.evaluate(([p,t])=>window.littleWorldDebug.surfCrestTick(p.x,p.z,t),[brk,t0+60]):t0+60;
 const center={x:(zone.minX+zone.maxX)/2,z:(zone.minZ+zone.maxZ)/2};
 const b=brk??center;
 await shot('01-ocean-overview',at(b,-120,-70,45),at(b,0,0,0),crestTick);
 await shot('02-side-view',eyeAt(b,-6,-38,2.2),at(b,-6,0,.8),crestTick-20);
 await shot('03-approach-shore',eyeAt(b,26,6,3),at(b,-40,0,0),crestTick-45);
 await shot('04-breaking',at(b,-18,-24,4),at(b,0,0,1),crestTick-6);
 const tubeTick=open?.tick??crestTick;
 // Look into the open section from both ends of the crest line (shoulder side unknown a priori).
 await shot('05-tube-open-a',eyeAt(b,6,20,1.6),at(b,0,0,1.6),tubeTick);
 await shot('05-tube-open-b',eyeAt(b,6,-20,1.6),at(b,0,0,1.6),tubeTick);
 await shot('06-tube-closing',eyeAt(b,10,14,2.2),at(b,0,0,1.2),tubeTick+30);
 await shot('09-tube-front',eyeAt(b,16,0,2),at(b,0,0,1.6),tubeTick);
 if(brk){
  await page.evaluate(([p,h])=>window.littleWorldDebug.surfPlace(p.x,p.z,h),[brk,Math.atan2(ax,az)]);
  // The shoulder lies on +sign along the across axis: look back into the open section.
  const shoulder=open?.shoulderSign??1;
  await shot('10-hamster-in-tube',eyeAt(b,2.5,shoulder*11,1.4),at(b,0,0,1.1),tubeTick);
  await shot('11-tube-mouth',eyeAt(b,4,shoulder*22,2),at(b,0,0,1.6),tubeTick);
 }
 await shot('07-nearsea-transition',at({x:zone.minX,z:zone.minZ},-60,-60,60),at(center,0,0,0),crestTick);
 await shot('08-low-angle-sets',eyeAt(b,-70,-3,1.6),at(b,40,0,0),crestTick-30);
 writeFileSync(outDir+'/'+tag+'-views.json',JSON.stringify({tag,beach:beach.name,zone,breakPoint:brk,crestTick,open,errors,shots},null,1)+'\n');
 console.log(JSON.stringify({tag,shots:shots.map(s=>({name:s.name,drawCalls:s.surf?.drawCalls,tri:s.surf?.triangles})),errors}));
}finally{await browser.close();}
if(errors.length){console.error('SURF VIEW ERRORS: '+errors.length);process.exitCode=1;}
