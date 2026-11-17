/** Player interface journey (doc 40), on the published beta world with the real gameplay
 * runtime: contextual prompt, collect, Sac, NPC dialogue and mission, Journal, impossible
 * action with its reason, Carte, Paramètres (preferences + existing audio mixer), pause,
 * Parties (save / replace confirmation / corrupted slot / invalid import / other world),
 * reload + restore, delete, keyboard focus and small resolution. Screenshots go to
 * /tmp/little-world-browser/ui-*.png. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {playerUi} from './ui-test-helpers.mjs';
const base=process.env.WORLD_URL??'http://127.0.0.1:5173/little-world/',out='/tmp/little-world-browser';
const SLOT=n=>`little-world:game-save:v1:little-world-beta:slot-${n}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0;const verify=(yes,message)=>{assert.ok(yes,'FAILED: '+message);checks++;console.log('OK: '+message);};
try{
  await mkdir(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ui=playerUi(page),shot=name=>page.screenshot({path:`${out}/ui-${name}.png`});
  const prompt=()=>page.locator('#action').evaluate(n=>({text:n.textContent,hidden:n.classList.contains('hide'),enabled:n.dataset.enabled}));
  const notices=()=>page.locator('.ui-notifications').textContent();
  const inPanel=()=>page.evaluate(()=>!!document.activeElement?.closest('.ui-panel:not([hidden]),.ui-modal'));
  const envTime=()=>page.evaluate(()=>window.littleWorldMetrics.environment.time);
  async function moveTo(x,z){await ui.save();const raw=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SLOT(1));raw.position={x,y:raw.position.y,z};await ui.importSave(raw,'position.json');await ui.load();await page.waitForFunction(([x,z])=>{const p=window.littleWorldMetrics?.position;return p&&Math.abs(p[0]-x)<.2&&Math.abs(p[2]-z)<.2;},[x,z]);await page.waitForTimeout(400);}
  const boot=async()=>{await page.goto(base+'?beta=1&metrics');await page.getByRole('button',{name:'Explorer l’île'}).click();await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>3);};
  await boot();

  // 1. Minimal HUD: quick bar, no technical statistics outside developer mode.
  verify(await page.getByRole('navigation',{name:'Accès rapide'}).isVisible(),'Quick bar visible (Sac, Journal)');
  verify(await page.evaluate(()=>{
    const quick=document.querySelector('.ui-quickbar')?.getBoundingClientRect(),map=document.querySelector('.ui-minimap')?.getBoundingClientRect();
    return !!quick&&!!map&&quick.left>=innerWidth/2&&quick.bottom<map.top&&quick.right<=innerWidth;
  }),'Sac and Journal appear on the right above the minimap');
  verify(await page.locator('.ui-hint,.hud-title,.hud-help').filter({visible:true}).count()===0,'Old help and legacy HUD blocks no longer appear');
  verify(await page.locator('.ui-purse').textContent().then(t=>t.includes('🪙')),'Coin balance uses the real HUD');
  verify(await page.locator('.ui-weather-chip').textContent().then(t=>/\d\d:\d\d/.test(t)),'HUD shows the simulated clock');
  verify(await page.getByRole('button',{name:'Ouvrir la carte du monde (M)'}).isVisible(),'Minimap is visible');
  await page.getByRole('button',{name:'Régler le volume'}).click();
  verify(await page.locator('.ui-audio-popover').isVisible(),'Speaker opens the existing mixer');
  verify(await page.locator('.ui-audio-popover').getByLabel('Volume général').count()===1,'One shared master volume');
  verify(await page.getByRole('button',{name:'Activer / reprendre le son'}).count()===0,'Redundant sound activation button is gone');
  await page.locator('.ui-audio-popover').getByLabel('Couper le son',{exact:true}).check();
  verify(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:audio:v1')).muted)===true,'Speaker provides working mute');
  await page.locator('.ui-audio-popover').getByLabel('Couper le son',{exact:true}).uncheck();
  const hudMaster=page.locator('.ui-audio-popover').getByLabel('Volume général',{exact:true});
  await hudMaster.fill('0.37');
  verify(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:audio:v1')).master)===0.37,'Speaker changes the actual master volume');
  await hudMaster.fill('0.8');
  await page.getByRole('button',{name:'Régler le volume'}).click();
  verify(!(await page.locator('.ui-audio-popover').isVisible()),'Speaker closes its mixer');
  const statsHidden=await page.evaluate(()=>{document.body.classList.remove('developer');const v=getComputedStyle(document.querySelector('.hud-stats')).display==='none';document.body.classList.add('developer');return v;});
  verify(statsHidden,'Technical statistics hidden unless developer mode');
  // 2. Contextual prompt from the gameplay target.
  await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');
  await page.waitForFunction(()=>/Ramasser un gland/.test(document.querySelector('#action')?.textContent??''));const p1=await prompt();
  verify(p1.text.startsWith('[E] Ramasser un gland')&&p1.enabled==='true','Prompt shows key, action and object: '+p1.text);await shot('hud');
  // 3. Collect → single merged gain notification.
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>/\+1 Gland/.test(document.querySelector('.ui-notifications')?.textContent??''));verify(true,'Collect gives a « +1 Gland » notification');
  // 4. Inventory: business category, quantity, new mark, keyboard focus trapped, Escape returns.
  await page.keyboard.press('KeyI');const sac=ui.panel('inventory');await sac.waitFor();
  const sacText=await sac.textContent();verify(/Ressources naturelles/.test(sacText)&&/Gland/.test(sacText)&&/× ?1|1 ?\/ ?9/.test(sacText),'Sac lists Gland under its business category with quantity: '+sacText.slice(0,120));
  verify(await inPanel(),'Focus moves into the panel');for(let i=0;i<12;i++)await page.keyboard.press('Tab');verify(await inPanel(),'Tab stays inside the open panel');
  await sac.locator('.ui-item[data-item="acorn"]').click();verify(/Gland/.test(await sac.locator('.ui-inventory-detail').textContent()),'Item details shown on selection');await shot('sac');
  const t0=await envTime();await page.waitForTimeout(600);verify(await envTime()>t0,'Sac does not pause the world');
  await page.keyboard.press('Escape');verify(!(await sac.isVisible()),'Escape closes the panel');
  // 5. Journal before the mission: empty state.
  verify(/Aucune mission en cours/.test(await ui.journal()),'Journal empty state before talking to anyone');
  // 6. NPC dialogue: hint tag on the mission choice, choice, delivery → mission banners.
  await moveTo(-30,-180);verify(/Parler avec/.test((await prompt()).text),'Prompt « Parler avec … » near the inhabitant');
  await page.keyboard.press('KeyE');const talk=page.getByRole('dialog',{name:'Conversation'});await talk.waitFor();await shot('dialogue');
  await talk.getByRole('button',{name:'Avec plaisir.',exact:true}).click();await page.waitForFunction(()=>/Nouvelle mission/.test(document.querySelector('#quest-banner')?.textContent??''));verify(true,'Accepting shows « Nouvelle mission » banner');
  verify(/En cours.*Apporter un gland à Galopin/s.test(await ui.journal()),'Journal lists the active mission');
  await talk.getByRole('button',{name:'Je vais voir.',exact:true}).click().catch(()=>{});
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>/Mission terminée/.test(document.querySelector('#quest-banner')?.textContent??''));verify(true,'Delivery shows « Mission terminée » banner');
  verify(/Terminées.*✓ Apporter un gland à Galopin/s.test(await ui.journal()),'Journal moves the mission to completed');
  // 7. Impossible action: reason shown, nothing executed.
  await moveTo(-20,-175.5);const p2=await prompt();verify(p2.enabled==='false'&&/Essayer le mécanisme.*·/.test(p2.text),'Disabled prompt with reason: '+p2.text);
  await page.keyboard.press('KeyE');await page.waitForTimeout(300);verify(/conditions/i.test(await notices()),'E on an impossible action explains why');
  verify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).entities?.['beta-gate']?.open!==true,SLOT(1)),'Impossible action changed nothing');
  // 8. Map: player position, markers, raster completes progressively.
  await page.keyboard.press('KeyM');const canvas=page.locator('.ui-map-canvas');await canvas.waitFor();await page.waitForFunction(()=>document.querySelector('.ui-map-canvas')?.dataset.progress==='1',null,{timeout:30000});
  const mapData=await canvas.evaluate(c=>({...c.dataset}));const [mx,mz]=mapData.player.split(',').map(Number);verify(Math.abs(mx+20)<=1&&Math.abs(mz+176)<=1.5&&Number(mapData.markers)>0,'Map shows the player at '+mapData.player+' with '+mapData.markers+' markers');
  await page.getByRole('button',{name:'Placer un repère'}).click();await canvas.click();
  await ui.panel('map').getByLabel('Nom du repère').fill('Belvédère');
  await ui.panel('map').getByRole('button',{name:'Enregistrer'}).click();
  verify((await ui.panel('map').locator('.ui-map-entry').allTextContents()).some(t=>t.includes('Belvédère')),'Custom map waypoint is displayed');
  verify(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('little-world:waypoints:v1:world:'))),'Custom waypoint persisted separately from saves');
  await page.getByRole('button',{name:'Autour de moi'}).click();await canvas.focus();await page.keyboard.press('+');await page.keyboard.press('ArrowLeft');verify(await ui.panel('map').isVisible(),'Map keyboard zoom/pan stays in the map');await shot('carte');await page.keyboard.press('Escape');verify(!(await ui.panel('map').isVisible()),'Escape closes the map');
  // 9. Pause menu: world paused, keyboard focus on « Reprendre ».
  await page.keyboard.press('Escape');await ui.panel('pause').waitFor();
  verify(await page.evaluate(()=>document.activeElement?.textContent==='Reprendre'),'Pause menu focuses « Reprendre »');
  // The frame already in flight when the panel opens may still advance the clock once: read it
  // after that frame, then check it stays frozen (CI flake: intermittent off-by-one-frame).
  await page.waitForTimeout(250);const tp=await envTime();await page.waitForTimeout(700);verify(await envTime()===tp,'Pause menu pauses the world clock');await shot('pause');
  // 10. Settings: preferences stored apart, existing audio mixer reused and persisted.
  await ui.panel('pause').getByRole('button',{name:'Paramètres'}).click();const set=ui.panel('settings');await set.waitFor();
  await set.getByLabel('Sensibilité de la caméra').fill('2');await set.getByText('Inverser l’axe vertical de la caméra').click();await set.getByText('Réduire les animations de l’interface').click();
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:ui-preferences:v1')));verify(prefs.cameraSensitivity===2&&prefs.invertY&&prefs.reduceMotion,'Preferences saved in their own key');
  verify(await page.evaluate(()=>document.body.classList.contains('reduce-motion')),'Reduced motion applied');
  verify(await set.locator('.audio-controls').count()===1,'Audio section is the existing audio panel (no second mixer)');
  await set.getByLabel('Musique').fill('0.25');verify(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-world:audio:v1')).music)===0.25,'Music volume persisted by the audio engine');
  verify(!(await page.evaluate(k=>JSON.stringify(JSON.parse(localStorage.getItem(k))).includes('cameraSensitivity'),SLOT(1))),'Preferences never written into game saves');
  await shot('parametres');await page.keyboard.press('Escape');verify(await page.evaluate(()=>document.querySelector('body>.audio-controls')!==null),'Audio panel returned to its place on close');
  // 11. Saves: replacement confirmation (cancel keeps the slot), corrupted slot, invalid / foreign imports.
  await ui.openSaves();const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).savedAt,SLOT(1));
  await ui.panel('saves').locator('.game-slot-row').first().getByRole('button',{name:'Sauvegarder',exact:true}).click();const modal=page.getByRole('alertdialog');await modal.waitFor();
  verify(await page.evaluate(()=>document.activeElement?.textContent==='Annuler'),'Destructive confirmation focuses « Annuler »');await page.keyboard.press('Escape');
  verify(!(await modal.count())&&await ui.panel('saves').isVisible(),'Escape cancels the confirmation without closing the panel');
  verify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).savedAt,SLOT(1))===before,'Cancelled replacement wrote nothing');
  await page.evaluate(k=>localStorage.setItem(k,'{corrupted'),SLOT(3));await ui.closeAll();await ui.openSaves();
  verify(await ui.panel('saves').locator('.game-slot-row[data-slot="slot-3"][data-state="error"]').count()===1,'Corrupted slot shown as unreadable instead of crashing');
  const file=ui.panel('saves').getByLabel('Importer une sauvegarde');
  await file.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('not json')});await ui.panel('saves').getByRole('alert').filter({hasText:/Fichier illisible/}).waitFor();verify(true,'Invalid import explained');
  const foreign=await page.evaluate(k=>({...JSON.parse(localStorage.getItem(k)),worldId:'other-world',slotId:'slot-2'}),SLOT(1));
  await file.setInputFiles({name:'other.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(foreign))});await ui.panel('saves').getByRole('alert').filter({hasText:/autre monde/}).waitFor();verify(true,'Save of another world refused');
  await shot('parties');await ui.save();verify(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).savedAt,SLOT(1))!==before,'Confirmed replacement saved after storage resolved');
  // 12. Reload + restore through the UI: mission and inventory back.
  await boot();await ui.load();verify(await page.locator('#quest-banner').evaluate(n=>n.classList.contains('hide')),'Loading a save does not replay mission banners');const j=await ui.journal();verify(/✓ Apporter un gland à Galopin/.test(j),'Mission restored after reload');
  verify(/Votre sac est vide/.test(await ui.bag()),'Inventory restored (acorn delivered)');
  // 13. Delete a slot with confirmation.
  await ui.openSaves();await ui.panel('saves').locator('.game-slot-row[data-slot="slot-3"]').getByRole('button',{name:'Supprimer'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer'}).click();
  await page.waitForFunction(()=>document.querySelector('.game-slot-row[data-slot="slot-3"]')?.dataset.state==='empty');verify(await page.evaluate(k=>localStorage.getItem(k)===null,SLOT(3)),'Deleted slot removed from storage');await ui.resume();
  // 14. Small resolution: panels and HUD stay inside the viewport.
  await page.setViewportSize({width:720,height:540});await page.keyboard.press('KeyI');await ui.panel('inventory').waitFor();
  const fits=await page.evaluate(()=>[...document.querySelectorAll('.ui-panel:not([hidden]),.ui-quickbar,#action')].filter(n=>!n.classList.contains('hide')).every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
  verify(fits,'Panels, quick bar and prompt fit a 720 × 540 viewport');await shot('petit-ecran');await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:800});
  // 15. Back to the start screen from the menu, then play again.
  await page.keyboard.press('Escape');await ui.panel('pause').getByRole('button',{name:'Retour à l’accueil'}).click();await page.getByRole('button',{name:'Explorer l’île'}).waitFor({state:'visible'});verify(true,'Menu returns to the start screen');
  await page.getByRole('button',{name:'Explorer l’île'}).click();const t1=await envTime();await page.waitForTimeout(600);verify(await envTime()>t1,'Playing again resumes the world');
  // 16. Real mobile viewport: joystick is touch-only, analog, resets on release, and menus block movement.
  verify(await page.locator('.touch-controls').count()===0,'Desktop build does not create the phone joystick');
  const phone=await browser.newContext({viewport:{width:844,height:390},screen:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobilePage=await phone.newPage(),mobileErrors=[];
  mobilePage.on('pageerror',e=>mobileErrors.push(e.message));
  await mobilePage.goto(base+'?beta=1&metrics');
  await mobilePage.getByRole('button',{name:'Explorer l’île'}).click();
  await mobilePage.locator('.touch-joystick').waitFor({state:'visible'});
  verify(await mobilePage.locator('.touch-controls').isVisible(),'Phone-sized coarse pointer activates joystick and action buttons');
  verify(await mobilePage.getByRole('button',{name:'Saut'}).isVisible()&&await mobilePage.getByRole('button',{name:'Agir'}).isVisible(),'Phone has touch jump and interact controls');
  const stick=mobilePage.locator('.touch-joystick'),bounds=await stick.boundingBox();
  assert.ok(bounds,'Joystick has a screen rect');
  const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
  const mobileBefore=await mobilePage.evaluate(()=>window.littleWorldMetrics.position);
  await mobilePage.mouse.move(cx,cy);await mobilePage.mouse.down();
  await mobilePage.mouse.move(cx,cy-42,{steps:5});
  verify(await stick.locator('.touch-joystick-thumb').evaluate(e=>e.style.transform!=='translate(-50%, -50%)'),'Joystick thumb follows its pointer');
  await mobilePage.waitForTimeout(750);await mobilePage.mouse.up();
  const mobileAfter=await mobilePage.evaluate(()=>window.littleWorldMetrics.position);
  verify(Math.hypot(mobileAfter[0]-mobileBefore[0],mobileAfter[2]-mobileBefore[2])>.03,'Joystick moves the player through the real simulation');
  verify(await stick.locator('.touch-joystick-thumb').evaluate(e=>e.style.transform==='translate(-50%, -50%)'),'Releasing the joystick resets input to zero');
  await mobilePage.getByRole('button',{name:'Sac (I)'}).click();
  await mobilePage.locator('.ui-panel[data-panel="inventory"]').waitFor({state:'visible'});
  await mobilePage.locator('.touch-controls').waitFor({state:'hidden'});
  verify(true,'Opening an inventory panel disables touch movement');
  await mobilePage.keyboard.press('Escape');
  await mobilePage.locator('.touch-joystick').waitFor({state:'visible'});
  verify(true,'Touch controls resume when returning to the world');
  // Gas boost from the latest main merge: press-and-hold only while gliding.
  const boostButton=mobilePage.locator('.touch-boost');
  verify(!(await boostButton.isVisible()),'Gas boost is hidden while grounded');
  await mobilePage.evaluate(()=>{
    const p=window.littleWorldMetrics.position;
    window.littleWorldDebug.teleport(p[0],p[2],0,45);
  });
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='air');
  await mobilePage.getByRole('button',{name:'Saut'}).tap();
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='glide');
  await boostButton.waitFor({state:'visible'});
  verify(await boostButton.isEnabled(),'Gas boost appears and can be held while gliding');
  const gasBefore=await mobilePage.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve);
  const boostRect=await boostButton.boundingBox();
  assert.ok(boostRect,'Boost button has a screen rect');
  await mobilePage.mouse.move(boostRect.x+boostRect.width/2,boostRect.y+boostRect.height/2);
  await mobilePage.mouse.down();
  await mobilePage.waitForFunction(level=>window.littleWorldMetrics?.movement?.state?.gasReserve<level-.5,gasBefore);
  const gasAfter=await mobilePage.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve);
  verify(gasAfter<gasBefore,'Holding mobile boost consumes the existing gas reserve');
  await mobilePage.mouse.up();
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.movement?.state?.gasBoosting===false);
  verify(true,'Releasing mobile boost stops gas propulsion');
  await mobilePage.evaluate(()=>{
    const p=window.littleWorldMetrics.position;
    window.littleWorldDebug.teleport(p[0],p[2],0);
  });
  await boostButton.waitFor({state:'hidden'});
  verify(true,'Gas boost disappears when landing');
  verify(mobileErrors.length===0,mobileErrors.join('\\n')||'Mobile HUD has no JavaScript errors');
  await phone.close();
  verify(errors.length===0,errors.join('\n')||'No page errors');console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
