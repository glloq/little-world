import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectArchive } from '../src/studio-core/archive.ts';
import { waitForBrowserCondition } from './poll-browser.mjs';
import { playerUi } from './ui-test-helpers.mjs';
const base = process.env.WORLD_URL ?? 'http://127.0.0.1:5173/little-world/', out = '/tmp/little-world-settlement-services';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log('OK', label); };
try {
    const page = await browser.newPage({ viewport: { width: 1540, height: 1040 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'studio/');
    await page.evaluate(async () => { const { flatSettlementProject } = await import('/little-world/tools/settlement-fixture.mjs'), { ProjectStore } = await import('/little-world/src/studio-core/project-store.ts'); await new ProjectStore().create(flatSettlementProject()); });
    await page.reload();
    await page.getByRole('button', { name: 'Reprendre un projet', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer', exact: true }).first().click();
    await page.locator('.viewport canvas').waitFor();
    await page.getByRole('button', { name: 'Villages & villes', exact: true }).click();
    await page.getByLabel('Organisation', {exact:true}).selectOption('linear');
    await page.getByRole('button', { name: '3. Personnalisation', exact: true }).click();
    await page.getByLabel('Activité dominante', { exact: true }).selectOption('agriculture');
    await page.getByLabel('Ajouter une place et des équipements', { exact: true }).check();
    await page.getByRole('button', { name: 'Prévisualiser l’implantation', exact: true }).click();
    await page.getByRole('button', { name: 'Créer dans le monde', exact: true }).waitFor();
    check(await page.getByRole('button', { name: 'Créer dans le monde', exact: true }).isEnabled(), 'La place et les équipements agricoles ont des accès validés');
    await page.screenshot({ path: out + '/preview.png', fullPage: true });
    await page.getByRole('button', { name: 'Créer dans le monde', exact: true }).click();
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    const saved = () => page.evaluate(async () => { const { ProjectStore } = await import('/little-world/src/studio-core/project-store.ts'), store = new ProjectStore(), summary = (await store.list())[0], v = await store.loadProject(summary.projectId); Object.assign(v.document.chunks, await store.loadChunks(summary.projectId, Object.keys(v.document.chunkIndex), v.revision)); return v.document; });
    let p = await saved(), s = Object.values(p.libraries.settlements)[0];
    check(s.amenities.length === 4 && s.amenities.some(a => a.role === 'mill'), 'Le projet contient un moulin réel, un comptoir, un puits et un banc');
    const well = s.amenities.find(a => a.role === 'well'), counter = s.amenities.find(a => a.role === 'counter'), bench = s.amenities.find(a => a.role === 'bench');
    await page.getByLabel('Équipement à modifier', { exact: true }).selectOption(well.id);
    await page.getByLabel('Verrouiller cet équipement', { exact: true }).check();
    await page.getByRole('button', { name: 'Modifier ' + s.recipe.name, exact: true }).click();
    await page.getByRole('button', { name: 'Varier les maisons', exact: true }).click();
    await page.getByRole('button', { name: 'Appliquer les changements', exact: true }).click();
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    p = await saved();
    check(p.libraries.settlements[s.id].amenities.find(a => a.id === well.id).locked, 'Le verrou de l’équipement survit à la régénération');
    await page.getByLabel('Équipement à modifier', { exact: true }).selectOption(bench.id);
    await page.getByRole('button', { name: 'Supprimer cet équipement', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier ' + s.recipe.name, exact: true }).click();
    await page.getByRole('button', { name: 'Prévisualiser l’implantation', exact: true }).click();
    await page.getByRole('button', { name: 'Appliquer les changements', exact: true }).click();
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    p = await saved();
    check(!p.entityIndex[bench.id] && p.libraries.settlements[s.id].suppressedAmenities.includes('bench'), 'Un équipement supprimé ne réapparaît pas');
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter ZIP', exact: true }).click();
    const download = await event, archive = readProjectArchive(new Uint8Array(await readFile(await download.path())));
    check(archive.entityIndex[counter.id].logical.shopAccess && archive.libraries.settlements[s.id].amenities.length === 3, 'L’archive conserve les équipements et leurs poses d’usage');
    await page.getByLabel('Équipement à modifier', { exact: true }).selectOption(counter.id);
    const popup = page.context().waitForEvent('page');
    await page.locator('#header-actions').getByRole('button', { name: 'Jouer ici', exact: true }).click();
    const game = await popup;
    game.on('pageerror', e => errors.push(e.message));
    await game.waitForLoadState();
    check(new URL(game.url()).searchParams.has('studioBuild'), 'Le comptoir passe le compilateur et le lecteur de jeu');
    await game.locator('#start-overlay').waitFor({state:'hidden',timeout:60000});
    await game.waitForFunction(() => /Commercer/.test(document.querySelector('#action')?.textContent ?? ''), {}, { timeout: 30000 });
    await game.keyboard.press('KeyE');
    const shop = game.locator('.ui-panel[data-panel="shop"]');
    await shop.waitFor();
    const wheat=shop.locator('.ui-shop-row[data-item="seed:wheat"]'),price=parseInt(await wheat.locator('.ui-shop-price').textContent()),beforeCoins=Number((await shop.locator('.ui-shop-coins').textContent()).match(/Bourse : (\d+)/)[1]),expectedCoins=beforeCoins-price;
    assert.ok(price>0);
    await wheat.getByRole('button', { name: 'Acheter', exact: true }).click();
    await shop.getByText(new RegExp('^Bourse : '+expectedCoins+' pièces')).waitFor();
    check(true, 'Le comptoir agricole applique le prix réellement annoncé par le marché local');
    await game.screenshot({ path: out + '/shop.png' });
    const ui = playerUi(game);
    await ui.save();
    const save = await game.evaluate(expectedCoins => { for (let i = 0; i < sessionStorage.length; i++) {
        try {
            const v = JSON.parse(sessionStorage.getItem(sessionStorage.key(i)));
            if (v?.schemaVersion === 2 && v.inventory?.coin === expectedCoins)
                return v;
        }
        catch { }
    } return null; },expectedCoins);
    check(save?.inventory?.['seed:wheat'] === 4, 'Les semences achetées et les pièces sont sauvegardées ensemble');
    await game.close();
    await page.reload();
    await page.getByRole('button', { name: 'Reprendre un projet', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Villages & villes', exact: true }).waitFor();
    check(await page.getByLabel('Équipement à modifier', { exact: true }).count() === 1, 'Les équipements restent modifiables après réouverture');
    check(errors.length === 0, errors.join('\n') || 'Aucune erreur JavaScript');
    await writeFile(out + '/browser-report.json', JSON.stringify({ checks, errors }, null, 2));
    console.log({ checks, errors });
}
finally {
    await browser.close();
}
