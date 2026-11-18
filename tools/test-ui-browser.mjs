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
  const boot=async()=>{await page.goto(base+'?beta=1&metrics');await page.locator('#start-overlay').waitFor({state:'hidden'});await page.waitForFunction(()=>window.littleWorldMetrics?.frameId>3);};
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
  const statsHidden=await page.evaluate(()=>{document.body.classList.remove('developer');const v=getComputedStyle(document.querySelector('.hud-debug')).display==='none';document.body.classList.add('developer');return v;});
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
  verify(await sac.locator('.ui-bag-layout').count()===1,'Bag V3 has the three-zone layout');
  verify(await sac.locator('.ui-bag-slot').count()===10,'Ten fixed favourite slots appear without a gear scrollbar');
  verify(await sac.locator('[data-hamster-target]').count()===5,'Hamster has five drop zones');
  await sac.getByRole('button',{name:'Activer la sélection multiple'}).click();
  verify(await sac.locator('.ui-bag-check').count()>0,'Multi-select reveals checkboxes on every visible stock object');
  await sac.locator('.ui-item[data-item="acorn"]').first().click();
  verify(await sac.locator('.ui-bag-checked[data-item="acorn"]').count()===1,'Click toggles selected stack');
  await page.keyboard.press('Escape');
  verify(await sac.isVisible(),'First Escape exits multi-select without closing bag');

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
  await page.keyboard.press('Escape');await ui.panel('pause').getByRole('button',{name:'Retour à l’accueil'}).click();await page.getByRole('button',{name:'Reprendre l’exploration'}).waitFor({state:'visible'});verify(true,'Menu returns to the start screen');
  await page.getByRole('button',{name:'Reprendre l’exploration'}).click();const t1=await envTime();await page.waitForTimeout(600);verify(await envTime()>t1,'Playing again resumes the world');
  // 16. Desktop input regression: game focus, Space, context menu and contextual boost.
  const sceneCanvas=page.locator('#viewport canvas');
  // Accessible minimap label changes when a waypoint is active; class is stable.
  const mapShortcut=page.locator('.ui-minimap');
  await mapShortcut.click();await ui.panel('map').waitFor();
  await page.keyboard.press('Escape');
  verify(await sceneCanvas.evaluate(e=>document.activeElement===e),'Closing a HUD-opened map returns focus to the game canvas');
  await page.keyboard.press('Space');
  verify(await page.locator('.ui-panel:not([hidden])').count()===0,'Space after closing the map does not reopen the previously focused button');
  await page.getByRole('button',{name:'Sac (I)'}).click();await page.keyboard.press('Escape');
  verify(await sceneCanvas.evaluate(e=>document.activeElement===e),'Closing inventory also restores canvas focus');
  await mapShortcut.focus();await page.keyboard.press('Space');
  verify(await page.locator('.ui-panel:not([hidden])').count()===0,'Space never activates a focused HUD shortcut while gameplay is active');
  await page.keyboard.press('Enter');await ui.panel('map').waitFor();
  verify(true,'Enter still activates the focused HUD shortcut for keyboard accessibility');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Régler le volume'}).click();
  await page.keyboard.press('Escape');
  verify(await sceneCanvas.evaluate(e=>document.activeElement===e),'Closing the audio popover restores canvas focus');
  const contextMenu=await page.evaluate(()=>{
    const inspect=target=>{
      const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2});
      target.dispatchEvent(event);return event.defaultPrevented;
    };
    const edit=document.createElement('input');document.querySelector('#ui-root').append(edit);
    const results={canvas:inspect(document.querySelector('#viewport canvas')),hud:inspect(document.querySelector('.ui-minimap')),page:inspect(document.body),editable:inspect(edit)};
    edit.remove();return results;
  });
  verify(contextMenu.canvas&&contextMenu.hud&&contextMenu.page&&!contextMenu.editable,'Context menu is blocked across the running game (including body/HUD), except editable fields');

  await page.evaluate(()=>{const p=window.littleWorldMetrics.position;window.littleWorldDebug.teleport(p[0],p[2],0,180);});
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='air');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.littleWorldMetrics?.mode==='glide');
  const shiftGas=await page.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve);
  await page.keyboard.down('Shift');
  await page.waitForFunction(value=>window.littleWorldMetrics?.movement?.state?.gasReserve<value-.5,shiftGas);
  await page.keyboard.up('Shift');
  verify(await page.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve)<shiftGas,'Shift activates the existing gas boost while gliding');
  await page.waitForFunction(()=>window.littleWorldMetrics?.movement?.state?.gasBoosting===false);
  // Right click is deliberately NOT a game binding: Firefox can force its native menu with Shift+right.
  const rightGas=await page.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve);
  await page.mouse.move(400,390);await page.mouse.down({button:'right'});
  await page.waitForTimeout(450);
  await page.mouse.up({button:'right'});
  verify(Math.abs((await page.evaluate(()=>window.littleWorldMetrics.movement.state.gasReserve))-rightGas)<1e-6,
    'Right mouse no longer consumes flight gas; Shift is the sole desktop boost binding');
  const rightPointer=await page.evaluate(()=>{
    const node=document.querySelector('#viewport canvas'),event=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:2});
    node.dispatchEvent(event);return event.defaultPrevented;
  });
  verify(rightPointer,'Secondary pointerdown is cancelled on the running game canvas');

  // 17. Real mobile viewport: joystick is touch-only, analog, resets on release, and menus block movement.
  verify(await page.locator('.touch-controls').count()===0,'Desktop build does not create the phone joystick');
  const phone=await browser.newContext({viewport:{width:844,height:390},screen:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobilePage=await phone.newPage(),mobileErrors=[];
  mobilePage.on('pageerror',e=>mobileErrors.push(e.message));
  await mobilePage.goto(base+'?beta=1&metrics');
  verify(await mobilePage.locator('#quality').inputValue()==='low','Phone first launch defaults to economical rendering');
  await mobilePage.locator('#start-overlay').waitFor({state:'hidden'});
  await mobilePage.locator('.touch-joystick').waitFor({state:'visible'});
  verify(await mobilePage.locator('.touch-controls').isVisible(),'Phone-sized coarse pointer activates joystick and action buttons');
  verify(await mobilePage.getByRole('button',{name:'Saut'}).isVisible()&&await mobilePage.getByRole('button',{name:'Courir'}).isVisible(),'Phone keeps jump and acceleration as separate primary buttons');
  verify(await mobilePage.locator('.touch-action').count()===3,'Only two permanent buttons and one contextual action are created');
  verify(await mobilePage.locator('.touch-roll,.touch-dive').count()===0,'Roll and dive never add extra buttons');
  await mobilePage.waitForTimeout(450);
  verify(await mobilePage.evaluate(()=>{
    const action=document.querySelector('.touch-interact');
    const usable=!!window.littleWorldMetrics?.targetId&&document.querySelector('#action')?.dataset.enabled==='true';
    return !!action&& (getComputedStyle(action).display!=='none')===usable;
  }),'Object action appears only for a usable nearby target');
  verify(await mobilePage.evaluate(()=>{
    const visible=s=>{const n=document.querySelector(s);return n&&getComputedStyle(n).display!=='none';};
    const bounds=s=>document.querySelector(s)?.getBoundingClientRect();
    const a=bounds('.touch-joystick'),b=bounds('.touch-actions'),m=bounds('.ui-minimap'),q=bounds('.ui-quickbar');
    return visible('.ui-quickbar')&&a&&b&&m&&q&&a.right<b.left&&m.bottom<b.top&&q.right<m.left&&
      document.querySelector('.ui-minimap canvas')&&getComputedStyle(document.querySelector('.ui-minimap canvas')).display==='none';
  }),'Phone HUD moves map and quick actions to the top without covering thumb zones');
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
  // Check both mobile horizontal directions against a fixed yaw=0 baseline.
  await mobilePage.evaluate(()=>{const p=window.littleWorldMetrics.position;window.littleWorldDebug.teleport(p[0],p[2],0);});
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics.mode==='ground');
  const x0=await mobilePage.evaluate(()=>window.littleWorldMetrics.position[0]);
  await mobilePage.mouse.move(cx,cy);await mobilePage.mouse.down();
  await mobilePage.mouse.move(cx+44,cy,{steps:4});
  await mobilePage.waitForTimeout(650);await mobilePage.mouse.up();
  const x1=await mobilePage.evaluate(()=>window.littleWorldMetrics.position[0]);
  verify(x1<x0-.04,'Right on the mobile joystick matches keyboard D (world -X at yaw 0)');
  // A single short press toggles the ball; no double-tap gesture is required.
  await mobilePage.getByRole('button',{name:'Courir'}).tap();
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='roll');
  await mobilePage.waitForTimeout(450);
  verify(await mobilePage.evaluate(()=>window.littleWorldMetrics.mode==='roll'),'One short tap selects a persistent roll even at rest');
  await mobilePage.getByRole('button',{name:'Accélérer'}).tap();
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='ground');
  verify(true,'A second single tap exits the ball');
  // A rightward swipe on the scene must change the touch camera in the intended direction.
  await mobilePage.evaluate(()=>{const p=window.littleWorldMetrics.position;window.littleWorldDebug.teleport(p[0],p[2],0);});
  await mobilePage.waitForTimeout(500);
  const cameraBefore=await mobilePage.evaluate(()=>window.littleWorldMetrics.camera.position[0]-window.littleWorldMetrics.position[0]);
  await mobilePage.mouse.move(360,156);await mobilePage.mouse.down();
  await mobilePage.mouse.move(420,156,{steps:5});
  await mobilePage.waitForTimeout(350);await mobilePage.mouse.up();
  const cameraAfter=await mobilePage.evaluate(()=>window.littleWorldMetrics.camera.position[0]-window.littleWorldMetrics.position[0]);
  verify(cameraAfter>cameraBefore+.2,'Dragging right rotates the mobile camera with the reversed horizontal touch direction');
  await mobilePage.getByRole('button',{name:'Sac (I)'}).click();
  await mobilePage.locator('.ui-panel[data-panel="inventory"]').waitFor({state:'visible'});
  await mobilePage.locator('.touch-controls').waitFor({state:'hidden'});
  verify(true,'Opening an inventory panel disables touch movement');
  await mobilePage.keyboard.press('Escape');
  await mobilePage.locator('.touch-joystick').waitFor({state:'visible'});
  verify(true,'Touch controls resume when returning to the world');
  // Ground acceleration stays available; flight boost reuses the same physical button.
  const boostButton=mobilePage.locator('.touch-accelerate');
  verify(await boostButton.isVisible()&&await boostButton.isEnabled(),'Acceleration remains available on the ground');
  await mobilePage.evaluate(()=>{
    const p=window.littleWorldMetrics.position;
    // Leave enough airtime for SwiftShader/CI scheduling before the touch tap.
    // 45 m can be consumed while Playwright dispatches the input on a busy runner.
    window.littleWorldDebug.teleport(p[0],p[2],0,150);
  });
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='air');
  await mobilePage.waitForFunction(()=>document.querySelector('.touch-accelerate')?.textContent==='Boost');
  verify(await boostButton.isEnabled(),'Boost is available in freefall for an aerial double jump');
  await mobilePage.getByRole('button',{name:'Planeur'}).tap();
  await mobilePage.waitForFunction(()=>window.littleWorldMetrics?.mode==='glide');
  await mobilePage.waitForFunction(()=>document.querySelector('.touch-accelerate')?.textContent==='Boost');
  verify(await boostButton.isEnabled(),'The acceleration button becomes gas boost only while gliding');
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
  await mobilePage.waitForFunction(()=>document.querySelector('.touch-accelerate')?.textContent==='Courir');
  verify(await boostButton.isVisible()&&await boostButton.isEnabled(),'On landing the same button becomes normal acceleration');
  await mobilePage.setViewportSize({width:390,height:844});
  await mobilePage.getByRole('dialog',{name:'Orientation de l’écran recommandée'}).waitFor({state:'visible'});
  await mobilePage.getByRole('button',{name:'Continuer en portrait'}).click();
  // Input readiness is an observable post-transition state, not a same-event-loop assertion.
  await mobilePage.locator('.touch-joystick').waitFor({state:'visible',timeout:5000});
  verify(await mobilePage.locator('.touch-controls').isVisible(),'If the browser cannot lock rotation, portrait play remains possible by choice');
  await mobilePage.setViewportSize({width:844,height:390});
  await mobilePage.getByRole('dialog',{name:'Orientation de l’écran recommandée'}).waitFor({state:'hidden'});
  verify(mobileErrors.length===0,mobileErrors.join('\\n')||'Mobile HUD has no JavaScript errors');
  await phone.close();
  verify(errors.length===0,errors.join('\n')||'No page errors');console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
