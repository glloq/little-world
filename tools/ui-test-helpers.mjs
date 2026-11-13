/** Shared browser helpers for the player interface (doc 40): saves through Menu → Parties with
 * the in-app confirmations, inventory through the Sac panel, journal through the Journal panel.
 * They only drive the real UI; nothing writes gameplay state directly. */
export function playerUi(page){
  const panel=id=>page.locator(`.ui-panel[data-panel="${id}"]`);
  const confirmIf=async label=>{const box=page.getByRole('alertdialog');if(await box.count())await box.getByRole('button',{name:label,exact:true}).click();};
  async function closeAll(){for(let i=0;i<3&&await page.locator('.ui-panel:not([hidden])').count();i++){await page.locator('.ui-panel:not([hidden])').getByRole('button',{name:'Fermer · Échap'}).click();}}
  async function openSaves(){if(await panel('saves').isVisible())return;await closeAll();await page.getByRole('button',{name:'Menu (Échap)'}).click();await page.getByRole('button',{name:/^Parties/}).click();await panel('saves').locator('.game-slot-row').first().waitFor();}
  /** Save into a slot (confirms the replacement), waiting for the store confirmation. */
  async function save(slot=0){await openSaves();const row=panel('saves').locator('.game-slot-row').nth(slot),filled=(await row.getAttribute('data-state'))!=='empty';
    await row.getByRole('button',{name:'Sauvegarder',exact:true}).click();if(filled)await page.getByRole('alertdialog').getByRole('button',{name:'Remplacer',exact:true}).click();
    await panel('saves').getByText(/^Partie sauvegardée/).waitFor();}
  /** Load a slot (confirmed); the panel closes and the game resumes. */
  async function load(slot=0){await openSaves();const row=panel('saves').locator('.game-slot-row').nth(slot);await page.waitForFunction(i=>document.querySelectorAll('.game-slot-row')[i]?.dataset.state==='ready',slot);await row.getByRole('button',{name:'Charger',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'Charger',exact:true}).click();await page.waitForFunction(()=>/Partie restaurée/.test(document.querySelector('#message')?.textContent??'')&&!document.querySelector('.ui-panel:not([hidden])'));}
  /** Import a save file through the panel (confirms when it replaces a slot). */
  async function importSave(value,name='save.json'){await openSaves();await panel('saves').getByLabel('Importer une sauvegarde').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});const done=panel('saves').getByText(/^Partie importée/);await page.getByRole('alertdialog').or(done).first().waitFor();await confirmIf('Remplacer');await done.waitFor();}
  async function resume(){if(await panel('saves').isVisible())await panel('saves').getByRole('button',{name:'Reprendre l’exploration'}).click();else await closeAll();}
  /** Text of the inventory panel (Sac), then closes it. */
  async function bag(){await closeAll();await page.getByRole('button',{name:'Sac (I)'}).click();await panel('inventory').waitFor();const text=await panel('inventory').textContent();await closeAll();return text;}
  async function journal(){await closeAll();await page.getByRole('button',{name:'Journal (J)'}).click();await panel('journal').waitFor();const text=await panel('journal').textContent();await closeAll();return text;}
  return {panel,openSaves,save,load,importSave,resume,bag,journal,closeAll};
}
