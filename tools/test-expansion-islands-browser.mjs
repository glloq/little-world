import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:600}});
 await page.addInitScript(()=>localStorage.setItem('little-world-quality','low'));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [id,name] of [['alpine-island','Île des Cimes'],['harvest-island','Île des Moissons']]){
  const folder='archipelago/worlds/'+id;
  const project=await (await page.request.get(base+folder+'/project.json')).json();
  await page.goto(base+'?world='+folder+'/manifest.json&metrics=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(id=>window.littleWorldMetrics?.ferry?.islandId===id&&
    window.littleWorldMetrics?.frameId>2,id,{timeout:100000});
  await page.locator('#start-overlay').waitFor({state:'hidden',timeout:100000});
  if(id==='alpine-island'){
   const alpine=await page.evaluate(()=>window.littleWorldMetrics.alpine);
   assert.ok(alpine.lift&&alpine.points>20);
   const start=project.libraries.races['race:composition-ski'].gates[0];
   await page.locator('button[data-panel=races]').click();
   await page.evaluate(({center,normal})=>window.littleWorldDebug.teleport(
     center.x-normal.x*3,center.z-normal.z*3,Math.atan2(normal.x,normal.z)),start);
   await page.locator('.ui-race-option').filter({hasText:'Chrono des Cimes'}).getByRole('button',{name:'Lancer'}).click();
   await page.locator('.race-course-hud').filter({hasText:'Chrono des Cimes'}).waitFor({state:'visible'});
   await page.keyboard.down('KeyW');
   try{
    await page.waitForFunction(()=>/Portes : [1-9]/.test(document.querySelector('.race-course-hud')?.textContent??''),
     null,{timeout:15000});
   }finally{await page.keyboard.up('KeyW');}
   console.log('Cimes : première porte franchie en glisse, chrono démarré.');
   await page.locator('button[data-panel=races]').click();
   await page.getByRole('button',{name:'Abandonner la course'}).click();
   await page.keyboard.press('Escape');
   await page.evaluate(({x,z})=>window.littleWorldDebug.teleport(x,z,0),alpine.base);
   await page.keyboard.press('KeyE');
   await page.waitForFunction(()=>['waiting','riding'].includes(window.littleWorldMetrics?.alpine?.ride),null,{timeout:20000});
   console.log('Cimes : embarquement au télésiège.');
  }else{
   const field=Object.values(project.libraries.zones).find(zone=>zone.farm?.assignment==='player');
   assert.ok(field,'Moissons has a player-owned field');
   const pos=field.polygon.reduce((out,p)=>({x:out.x+p.x/field.polygon.length,z:out.z+p.z/field.polygon.length}),{x:0,z:0});
   await page.evaluate(({x,z,crop})=>{window.littleWorldDebug.grant('seed:'+crop,2);window.littleWorldDebug.teleport(x,z,0);},{...pos,crop:field.farm.crops[0]});
   await page.waitForFunction(id=>window.littleWorldMetrics?.targetId===id,field.id,{timeout:15000});
   await page.keyboard.press('KeyF');
   await page.waitForFunction(id=>!!window.littleWorldMetrics?.activities?.plots?.[id]?.crop,field.id,{timeout:15000});
   console.log('Moissons : semis dans une parcelle du joueur.');
  }
  await page.goto(base+'studio/');
  await page.getByRole('button',{name:'Explorer un monde prêt'}).click();
  await page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('button',{name:'Ouvrir ce monde'}).click();
  await page.locator('#workspace canvas').waitFor({state:'visible',timeout:35000});
  assert.match(await page.locator('#breadcrumbs').textContent(),new RegExp(name));
  await page.getByRole('button',{name:'Quêtes',exact:true}).click();
  const title=id==='alpine-island'?'Première descente aux Cimes':'Les premières carottes';
  await page.getByRole('button',{name:title,exact:true}).click();
  assert.ok(await page.getByLabel('Consigne dans le journal').inputValue());
  if(id==='alpine-island'){
   const race=page.getByLabel('Course',{exact:true});
   assert.equal(await race.inputValue(),'race:composition-ski');
   const list=await race.getAttribute('list');
   assert.equal(await page.locator('#'+list+' option[value="race:composition-ski"]').getAttribute('label'),'Chrono des Cimes');
  }else{
   const plot=await page.getByLabel('Parcelle indiquée dans le journal').inputValue();
   assert.equal(project.libraries.zones[plot].farm.assignment,'player');
  }
  console.log(name+' et sa mission ouvertes dans Studio.');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
