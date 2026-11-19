import {isCorridor} from '../settlements/corridor.ts';
import {suggestSettlementSite} from '../settlements/site-search.ts';
import {placementTool} from './settlement-placement-tool.ts';
import {DEFAULT_SETTLEMENT_LAYOUT,recommendedLayoutRadius} from '../settlements/layout.ts';
import {worldAsset} from '../world-production/registry.ts';
/** One Studio module: native sources, Canvas preview and the shared viewport/history. */
import { node, button, field, input, numberInput, select } from './dom.ts';
import type { StudioSession } from './session.ts';
import { newSettlement, type SettlementRecipe } from '../settlements/schema.ts';
import { planSettlement, type SettlementPlan } from '../settlements/planner.ts';
import { applySettlement, previewSettlementProject, settlementChunkIds, lockSettlementBuilding, removeSettlement, removeSettlementBuilding,lockSettlementAmenity,removeSettlementAmenity } from '../settlements/authoring.ts';
import { validateSettlements } from '../settlements/validation.ts';
import {residentRegistry} from '../npc-life/registry.ts';
import {residentQuestReadiness} from '../npc-life/quest-readiness.ts';
import { terrainAccessContext } from '../studio-core/terrain-access.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
export function mountSettlements(host: HTMLElement, s: StudioSession, options: {
    status: (text: string, error?: boolean) => void;
    open3D: (view?: {
        x: number;
        z: number;
        radius: number;
    }) => void;
    play: () => void;
}) {
    const p = s.document, b = p.world.bounds, center = s.selection.state.camera.target ?? { x: 0, z: 0 }, root = node('div', '', 'settlements-view'), form = node('section', '', 'section-card'), preview = node('section', '', 'section-card'), list = node('section', '', 'section-card'), canvas = node('canvas'), result = node('div');
    canvas.width = 900;
    canvas.height = 610;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', 'Plan des villages et villes');
    preview.append(canvas, result);
    root.append(form, preview, list);
    host.replaceChildren(root);
    const fresh = () => ({...newSettlement(p.world, 'settlement-' + crypto.randomUUID().slice(0, 8), { x: Math.min(b.maxX, Math.max(b.minX, center.x)), z: Math.min(b.maxZ, Math.max(b.minZ, center.z)) }),cultivation:true,waterfront:true,residentRoutines:true,residentDensity:'normal' as const,layout:structuredClone(DEFAULT_SETTLEMENT_LAYOUT)});
    let recipe:SettlementRecipe = fresh(), plan: SettlementPlan | null = null, disposed = false, busy = false, globalView = false, step = 1, view = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    let viewScale=1,viewAnchor={...recipe.center},mapRevision=0,terrainKey='',placement:ReturnType<typeof placementTool>|null=null;const background=node('canvas');background.width=canvas.width;background.height=canvas.height;
    const report = (text: string, error = false) => options.status(text, error);
    async function run(fn: () => Promise<void> | void) { if (busy)
        return; busy = true; try {
        await fn();
    }
    catch (e) {
        report(e instanceof Error ? e.message : String(e), true);
    }
    finally {
        busy = false;
        if (!disposed)
            render();
    } }
    function update(change: Partial<SettlementRecipe>) { if(change.center)viewAnchor={...change.center};recipe = { ...recipe, ...change }; plan = null; result.replaceChildren(node('p', 'Réglages modifiés : recalculer l’aperçu avant de créer.')); draw(); }
    function draw() {
        if (disposed)
            return;
        const c = canvas.getContext('2d')!, span = globalView ? Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * canvas.width / canvas.height) : Math.max(150,(recipe.radius+20)*2.2*canvas.width/canvas.height)/viewScale, depth = span * canvas.height / canvas.width, cx = globalView ? (b.minX + b.maxX) / 2 : viewAnchor.x, cz = globalView ? (b.minZ + b.maxZ) / 2 : viewAnchor.z;
        view = { minX: cx - span / 2, maxX: cx + span / 2, minZ: cz - depth / 2, maxZ: cz + depth / 2 };
        canvas.dataset.view = JSON.stringify(view);
        const px=(x:number)=>(x-view.minX)/span*canvas.width,pz=(z:number)=>(z-view.minZ)/depth*canvas.height,key=JSON.stringify([view,mapRevision]);
        if(terrainKey!==key){const ctx=terrainAccessContext(p),bg=background.getContext('2d')!;for(let y=0;y<canvas.height;y+=7)for(let x=0;x<canvas.width;x+=7){const wx=view.minX+x/canvas.width*span,wz=view.minZ+y/canvas.height*depth,h=ctx.height(wx,wz);bg.fillStyle=wx<b.minX||wx>b.maxX||wz<b.minZ||wz>b.maxZ?'#e1e5e1':ctx.wet(wx,wz)||h<=p.world.seaLevel?'#3b7f9e':`hsl(83 26% ${Math.max(37,72-h*.07)}%)`;bg.fillRect(x,y,7,7);}terrainKey=key;}
        c.drawImage(background,0,0);
        const path = (points: {
            x: number;
            z: number;
        }[], color: string, width: number) => { c.strokeStyle = color; c.lineWidth = Math.max(1, width / span * canvas.width); c.beginPath(); points.forEach((q, i) => i ? c.lineTo(px(q.x), pz(q.z)) : c.moveTo(px(q.x), pz(q.z))); c.stroke(); };
        for (const v of Object.values(p.libraries.paths))
            path(v.points, '#8b806b', v.width);
        for (const v of plan?.paths ?? [])
            path(v.points, '#a76234', v.width);
        c.strokeStyle = '#305f45';
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        if(recipe.layout?.boundary)recipe.layout.boundary.forEach((q,i)=>i?c.lineTo(px(q.x),pz(q.z)):c.moveTo(px(q.x),pz(q.z)));else c.ellipse(px(recipe.center.x),pz(recipe.center.z),recipe.radius/span*canvas.width,recipe.radius/depth*canvas.height,0,0,Math.PI*2);c.closePath();
        c.stroke();
        c.setLineDash([]);
        const entities = plan?.entities ?? Object.values(p.chunks).flatMap(c => Object.values(c.entities));
        for (const e of entities) {
            const t = e.components.Transform;
            if(!t)continue;if(!e.components.Habitat){if(e.id.includes('-service-')){const size=worldAsset(e.components.Visual?.assetId??'')?.size??[2,2,2];c.save();c.translate(px(t.position.x),pz(t.position.z));c.rotate(-2*Math.atan2(t.rotation.y,t.rotation.w));c.fillStyle=e.components.State?.initial.shop?'#d39851':'#608db0';c.fillRect(-size[0]/2/span*canvas.width,-size[2]/2/depth*canvas.height,size[0]/span*canvas.width,size[2]/depth*canvas.height);c.restore();c.fillStyle='#23382e';c.font='11px sans-serif';c.fillText(e.name,px(t.position.x)+5,pz(t.position.z)-6);}continue;}
            const a = 2 * Math.atan2(t.rotation.y, t.rotation.w);
            c.save();
            c.translate(px(t.position.x), pz(t.position.z));
            c.rotate(-a);
            c.fillStyle = plan?.buildings.find(b => b.id === e.id)?.locked ? '#5a5b68' : '#f5d7a0';
            c.strokeStyle = '#563c2b';
            c.lineWidth = 1;
            if(recipe.layout){c.setLineDash([3,3]);c.strokeStyle='#628063';c.strokeRect(-4.2/span*canvas.width,-5/depth*canvas.height,8.4/span*canvas.width,10/depth*canvas.height);c.setLineDash([]);c.strokeStyle='#563c2b';}
            c.fillRect(-3 / span * canvas.width, -3.5 / depth * canvas.height, 6 / span * canvas.width, 7 / depth * canvas.height);
            c.strokeRect(-3 / span * canvas.width, -3.5 / depth * canvas.height, 6 / span * canvas.width, 7 / depth * canvas.height);
            c.restore();
        }
        c.fillStyle = '#71381e';
        c.beginPath();
        c.arc(px(recipe.center.x), pz(recipe.center.z), 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#19372e';
        c.font = '14px sans-serif';
        c.fillText('N ↑ · Cliquer pour choisir le centre', 12, 22);
        if(recipe.layout&&recipe.layout.pattern!=='linear'){c.fillStyle='#3e3527';c.font='bold 12px sans-serif';c.fillText(isCorridor(recipe)?'Point d’activité · axe du village':recipe.services?'Cœur du village · place et activités':'Place commune',px(recipe.center.x)+10,pz(recipe.center.z)+19);}
        const handles=placement?.handles()??[];canvas.dataset.handles=JSON.stringify(handles);
        for(const h of handles){c.fillStyle=h.kind==='center'?'#b25c30':h.kind==='module'?'#256d91':h.kind==='house'?'#fcfcf7':'#477449';c.strokeStyle='#244c3e';c.lineWidth=1.5;c.beginPath();c.arc(px(h.x),pz(h.z),h.kind==='house'?3.5:7,0,Math.PI*2);c.fill();c.stroke();if(h.kind==='module'){c.font='12px sans-serif';c.fillStyle='#1e4553';c.fillText('Quartier '+(h.index!+1),px(h.x)+10,pz(h.z)-7);}}
        const draft=placement?.draftBoundary();if(draft){c.strokeStyle='#d46d30';c.lineWidth=2;c.beginPath();draft.forEach((q,i)=>{if(i)c.lineTo(px(q.x),pz(q.z));else c.moveTo(px(q.x),pz(q.z));});c.stroke();for(const q of draft){c.fillStyle='#d46d30';c.fillRect(px(q.x)-3,pz(q.z)-3,6,6);}}
        const ghost=placement?.ghost();if(ghost){const q={x:ghost.handle.x+ghost.to.x-ghost.from.x,z:ghost.handle.z+ghost.to.z-ghost.from.z};c.strokeStyle='#d46d30';c.lineWidth=2;c.beginPath();c.moveTo(px(ghost.handle.x),pz(ghost.handle.z));c.lineTo(px(q.x),pz(q.z));c.arc(px(q.x),pz(q.z),11,0,Math.PI*2);c.stroke();}
        canvas.dataset.planHash = plan ? fingerprint([plan.entities, plan.paths]) : '';
    }
    async function calculate() { await s.fullDocument(); const generated = planSettlement(p, recipe); const checked = generated.diagnostics.some(d => d.severity === 'ERROR') ? [] : validateSettlements(previewSettlementProject(p, generated), recipe.id); generated.diagnostics.push(...checked); plan = generated; step = 4; showPlan();report(generated.buildings.length+' maisons proposées · contrôler l’aperçu avant de créer.'); }
    function showPlan() {
        if (!plan)
            return;
        const life=plan.lifeStats;
        result.replaceChildren(node('strong', `${plan.buildings.length} maisons · ${plan.amenities?.length??0} équipements · ${plan.paths.filter(v => !v.id.includes('-access-')).length} voies partagées · ${plan.paths.filter(v => v.id.includes('-access-')&&!v.id.includes('-civic-')).length} accès privés · ${plan.paths.filter(v=>v.id.includes('-civic-access-')).length} accès aux équipements`), node('p', `${plan.preserved.length} éléments protégés · ${plan.removed.length} suppressions · calcul ${Math.round(plan.generationMs)} ms`, 'muted'),
          ...(life?[node('p',`Vie locale : ${life.assigned} nouveaux résidents · ${life.homes} maisons · ${life.jobs} postes · ${life.play} points de jeu · ${life.unreachable} affectations impossibles · ${life.graphNodes} nœuds piétons`,life.unreachable||life.graphTruncated?'diagnostic WARNING':'status-success')]:[]),
          ...plan.diagnostics.map(d => node('p', d.message, 'diagnostic ' + d.severity)));
        const commit = button(p.libraries.settlements?.[recipe.id] ? 'Appliquer les changements' : 'Créer dans le monde', () => void run(async () => { const current = plan!; await s.change('Créer / modifier ' + recipe.name, settlementChunkIds(p, current), d => applySettlement(d, current)); recipe = structuredClone(p.libraries.settlements![recipe.id].recipe); plan = null; result.replaceChildren(node('p', 'Implantation enregistrée · une opération annulable.', 'status-success'), button('Modifier dans Studio', () => { const id = p.libraries.settlements![recipe.id].buildings[0]?.id; if (id)
            s.selection.select({ kind: 'entity', id }); options.open3D(); }), button('Jouer ici', () => { const b = p.libraries.settlements?.[recipe.id]?.buildings[0]; if (b)
            s.selection.select({ kind: 'entity', id: b.id }); options.play(); })); }), 'primary-button');
        commit.disabled = plan.diagnostics.some(d => d.severity === 'ERROR');
        result.append(commit);
    }
    function render() {
        if (disposed)
            return;
        form.replaceChildren(node('h2', 'Villages & villes'), node('p', 'Choisir une implantation, prévisualiser puis créer. Les maisons ont des portes indépendantes et des murs solides.', 'muted'));
        const steps = node('nav');
        for (const [n, label] of [[1, '1. Type'], [2, '2. Emplacement'], [3, '3. Personnalisation'], [4, '4. Aperçu']] as const) {
            const v = button(label, () => { step = n; render(); });
            v.setAttribute('aria-pressed', String(step === n));
            steps.append(v);
        }
        form.append(steps);
        if (step === 1) {
            form.append(field('Type d’implantation', select(recipe.form, [['hamlet', 'Hameau'], ['village', 'Village'], ['town', 'Ville (80 maisons maximum)'],['fortified','Ville fortifiée — implantation compacte']], v => { const form = v as SettlementRecipe['form']; update({ form, targetBuildings: form === 'hamlet' ? 12 : form === 'village' ? 40 : 70, radius: form === 'hamlet' ? 90 : 150 }); render(); })), node('p', 'Campements, ports bâtis, fortifications et grottes habitables : pas encore disponibles.', 'muted'));
        }
        if(step===1)form.append(field('Organisation',select(recipe.layout?.pattern??'linear',[['network','Quartiers organiques'],['organic','Concentrique organique'],['clusters','Concentrique aéré'],['street','Village-rue organique'],['mountain','Village de montagne'],['river','Village de rivière'],['fishing','Village de pêcheurs'],['linear','Rues alignées (ancien modèle)']],pattern=>{update({...(pattern==='fishing'?{activity:'fishing' as const,services:true}:{}),layout:{...DEFAULT_SETTLEMENT_LAYOUT,...recipe.layout,pattern:pattern as NonNullable<SettlementRecipe['layout']>['pattern']}});render();})),node('p','Concentrique : autour de la place. Village-rue : axe sinueux. Montagne : suit les courbes de niveau et les replats. Rivière et pêcheurs : suivent une berge ou un rivage sec, sans pont ajouté. Les positions restent adaptées au terrain.','muted'));
        if(step===1&&recipe.layout?.pattern==='river')form.append(field('Occupation des rives',select(recipe.layout.riverBanks??'single',[['single','Une rive'],['auto','Deux rives si possible'],['required','Deux rives requises']],riverBanks=>{update({layout:{...recipe.layout!,riverBanks:riverBanks as 'single'|'auto'|'required'}});render();})));
        if(step===1&&recipe.layout?.pattern!=='linear'&&recipe.layout){form.append(field('Point d’intérêt central',select(recipe.layout?.poi??(recipe.services?'market':'square'),[['square','Place commune'],['market','Marché et place'],['activity','Activité du village']],poi=>{update({services:poi!=='square',...(poi==='market'?{activity:'commerce' as const}:{}),layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout,poi:poi as 'square'|'market'|'activity'}});render();})),node('p',isCorridor(recipe)?'Le point d’activité rejoint l’axe du village. Les maisons se répartissent le long du passage, selon le relief et la rive.':'Le centre est réservé avant les maisons. L’habitat se concentre autour de ce centre, avec des rues irrégulières adaptées au terrain.','muted'));}
        if(step===1)form.append(node('p',isCorridor(recipe)?'Maisons réparties le long d’un passage adapté au site ; les pentes trop fortes et l’eau restent libres.':recipe.form==='fortified'?'Profil le plus resserré ; sans enceinte construite automatiquement.':recipe.form==='town'?'Ville compacte autour du centre, avec des rues périphériques irrégulières.':'Village plus espacé autour du point d’intérêt central.','muted'));
        if (step === 2) {
            const toggle = button(globalView ? 'Zoomer sur l’implantation' : 'Voir toute l’île', () => { globalView = !globalView; draw(); });
            form.append(node('p', 'Cliquer sur le plan pour placer le centre. Choisir une plaine ou un replat ; aucune terrasse n’est creusée silencieusement.', 'muted'), toggle, button('Chercher un emplacement',()=>void run(async()=>{await s.fullDocument();const before=structuredClone(recipe),found=await suggestSettlementSite(p,before,{yield:()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())),progress:(n,total)=>report('Recherche d’un site adapté : '+n+' / '+total)});if(fingerprint(recipe)!==fingerprint(before)){report('Les réglages ont changé : relancer la recherche.',true);return;}if(found.plan){recipe=found.plan.recipe;viewAnchor={...recipe.center};globalView=false;plan=found.plan;step=4;showPlan();report(plan.buildings.length+' maisons proposées autour du point d’intérêt · accès validés.');}else report('Aucun site compatible trouvé : réduire la taille ou définir une autre zone.',true);})));}

        if(step===2)form.append(button('Dessiner une zone',()=>placement?.startBoundary()),button('Terminer la zone',()=>placement?.finishBoundary()),button('Annuler le tracé',()=>placement?.cancelBoundary()),button('Revenir à une zone ronde',()=>{const layout={...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout};delete layout.boundary;update({layout});render();}),button('Cadrer l’implantation',()=>{viewAnchor={...recipe.center};globalView=false;draw();}),node('p','Poignée centrale : déplacer · poignée verte : rayon ou orientation · bleue : groupe · blanche : maison. Relâcher pour recalculer le plan.','muted'));
        if (step === 3) {
            const sizes = recipe.form === 'hamlet' ? [8, 12, 15] : recipe.form === 'village' ? [20, 40, 60] : [60, 70, 80];
            form.append(field('Taille', select(String(recipe.targetBuildings), sizes.map((v, i) => [String(v), ['Petite', 'Moyenne', 'Grande'][i] + ' · ' + v + ' maisons']), v=>{const next={...recipe,targetBuildings:Number(v)};update({targetBuildings:Number(v),radius:recipe.layout?.boundary?recipe.radius:Math.max(recipe.radius,recommendedLayoutRadius(next))});})), field('Style architectural', select(recipe.style, [['auto', 'Automatique / mixte'], ['timber', 'Bois'], ['stone', 'Pierre'], ['white', 'Enduit clair']], v => update({ style: v as SettlementRecipe['style'] }))), field('Richesse', select(String(recipe.wealth), [['0', 'Modeste'], ['1', 'Équilibrée'], ['2', 'Prospère']], v => update({ wealth: Number(v) as 0 | 1 | 2 }))), field('Activité dominante', select(recipe.activity, [['mixed', 'Mixte'], ['agriculture', 'Agriculture'], ['forest', 'Forêt'],['mine','Mine'],['fishing','Pêche'],['commerce','Commerce']], v => update({ activity: v as SettlementRecipe['activity'],services:recipe.layout?.pattern!=='linear'?true:recipe.services,layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout,poi:'activity'} }))), node('p', 'Les équipements dépendent de l’activité et des ressources proches. Les comptoirs réutilisent les marchés et ateliers existants. Le dialogue local est optionnel.', 'muted'));
        }
        if(step===3&&(!recipe.layout||recipe.layout.pattern==='linear')){const services=node('input');services.type='checkbox';services.checked=!!recipe.services;services.onchange=()=>{update({services:services.checked,radius:services.checked?Math.max(110,recipe.radius):recipe.radius});render();};form.append(field('Ajouter une place et des équipements',services));}
        if(step===3)for(const [key,label]of [['cultivation','Parcelles du joueur et des habitants'],['waterfront','Habiller les abords du port'],['variedServices','Bâtiments d’activité variés'],['localLife','Habitant avec dialogue local'],['residentRoutines','Routines jour/nuit du PNJ (si présent)'],['maritimePort','Préparer le raccord au port N1 existant']] as const){const toggle=node('input');toggle.type='checkbox';toggle.checked=!!recipe[key];toggle.onchange=()=>{update({[key]:toggle.checked,...(toggle.checked?{services:true}:{})});render();};form.append(field(label,toggle));}
        if(step===3&&recipe.localLife&&recipe.residentRoutines)form.append(field('Population du village',select(recipe.residentDensity??'normal', [['low','Calme'],['normal','Équilibrée'],['high','Animée']], v=>update({residentDensity:v as 'low'|'normal'|'high'}))));
        const advanced = node('details');
        advanced.append(node('summary', 'Plus de réglages'), field('Nom de l’implantation', input(recipe.name, v => update({ name: v }))), field('Centre X (m)', numberInput(recipe.center.x, x => update({ center: { ...recipe.center, x } }), b.minX, b.maxX)), field('Centre Z (m)', numberInput(recipe.center.z, z => update({ center: { ...recipe.center, z } }), b.minZ, b.maxZ)), field('Rayon (m)', numberInput(recipe.radius, radius => update({ radius }), 20, 600)), field('Orientation des rues (°)', numberInput(recipe.orientation, orientation => update({ orientation }), -360, 360)), field('Graine de l’implantation', numberInput(recipe.seed, seed => update({ seed }), 0, 0xffffffff, '1')));
        if(Object.keys(p.libraries.paths).length)advanced.append(field('Route à rejoindre',select(recipe.routeToPath??'',[['','Route la plus proche'],...Object.values(p.libraries.paths).filter(path=>!path.id.startsWith(recipe.id+'-')).map(path=>[path.id,path.id] as [string,string])],value=>update({routeToPath:value||undefined,useExisting:true}))));
        advanced.append(field('Espacement des maisons',select(recipe.layout?.density??'balanced',[['loose','Aéré'],['balanced','Naturel'],['compact','Compact']],density=>{update({layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout,density:density as 'loose'|'balanced'|'compact'}});render();})));
        form.append(advanced);
        if (step < 4)
            form.append(button('Continuer →', () => { step++; render(); }));
        form.append(button('Prévisualiser l’implantation', () => void run(calculate)), button('Varier les maisons', () => void run(async () => { recipe = { ...recipe, houseVariation: recipe.houseVariation + 1 }; await calculate(); })));
        if(recipe.layout&&recipe.layout.pattern!=='linear')form.append(button('Varier l’implantation',()=>void run(async()=>{recipe={...recipe,layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout,variation:((recipe.layout?.variation??0)+1)>>>0}};await calculate();})),button('Réinitialiser les retouches du plan',()=>{const layout={...DEFAULT_SETTLEMENT_LAYOUT,pattern:recipe.layout?.pattern??'linear',...recipe.layout};delete layout.adjustments;delete layout.modules;update({layout});void run(calculate);}));
        if (step === 4 && !plan)
            form.append(node('p', 'Recalculer l’aperçu pour afficher les contraintes et activer la création.', 'muted'));
        list.replaceChildren(node('h3', 'Implantations du projet'));
        for (const s0 of Object.values(p.libraries.settlements ?? {})) {
            const row = node('div', '', 'section-card');
            const residents=(s0.amenities??[]).filter(a=>a.role==='resident'||a.role==='host');
            row.append(node('strong', s0.recipe.name + ' · ' + s0.buildings.length + ' maisons · '+residents.length+' habitants'), button('Modifier ' + s0.recipe.name, () => { recipe = structuredClone(s0.recipe);viewAnchor={...recipe.center}; plan = null; step = 3; result.replaceChildren(); render(); }), button('Voir en 3D', () => { const b = s0.buildings[0]; if (b)
                s.selection.select({ kind: 'entity', id: b.id }); options.open3D({ ...s0.recipe.center, radius: s0.recipe.radius * .7 }); }), button('Supprimer ' + s0.recipe.name, () => void run(async () => { const ids = Object.keys(p.chunkIndex); await s.change('Supprimer ' + s0.recipe.name, ids, d => removeSettlement(d, s0.id)); plan = null; if (recipe.id === s0.id)
                recipe = fresh(); report('Implantation retirée ; retouches et éléments verrouillés conservés.'); })));
            const buildings = select('', [['', 'Choisir une maison'], ...s0.buildings.map(b => [b.id, p.entityIndex[b.id]?.name ?? b.id] as const)], id => { if (id) {
                s.selection.select({ kind: 'entity', id });
                render();
            } });
            row.append(field('Maison à modifier', buildings));
            if(residents.length){
                const registry=residentRegistry(p,s0.id),panel=node('details');
                panel.append(node('summary',`Vie locale · ${registry.residents.length} résidents avec horaires`));
                const questAudit=residentQuestReadiness(p,s0.id);
                panel.append(node('p',
                  'Quêtes : '+questAudit.dialogueActors+' PNJ avec dialogues · '+
                  questAudit.potentialSocialPairs+' paires potentielles · '+
                  questAudit.positionedWorkAnchors+' lieux professionnels positionnés.',
                  'muted'));
                panel.append(node('p',
                  'La création réelle des missions exige des trajets piétons valides et sera qualifiée dans « Jouer ici ».',
                  'muted'));
                for(const resident of registry.residents){
                    panel.append(node('p',`${resident.name} · ${resident.role} · maison ${resident.homeAnchorId??'absente'} · poste ${resident.workAnchorId??'absent'}`,'muted'),
                      button('Inspecter '+resident.name,()=>{s.selection.select({kind:'entity',id:resident.id});options.open3D();}));
                }
                for(const issue of registry.issues)panel.append(node('p',issue.message,'diagnostic WARNING'));
                row.append(panel);
            }
            const selected = s.selection.state.selected?.id, b = s0.buildings.find(b => b.id === selected);
            if (b) {
                const lock = node('input');
                lock.type = 'checkbox';
                lock.checked = b.locked;
                lock.onchange = () => void run(async () => { await s.change('Verrouiller une maison', [], d => lockSettlementBuilding(d, s0.id, b.id, lock.checked)); plan = null; });
                row.append(field('Verrouiller cette maison', lock), button('Modifier cette maison en 3D', options.open3D), button('Supprimer cette maison', () => void run(async () => { await s.change('Supprimer une maison', Object.keys(p.chunkIndex), d => removeSettlementBuilding(d, s0.id, b.id)); plan = null; })));
            }
            if(s0.amenities?.length){const picker=select('',[['','Choisir un équipement'],...s0.amenities.map(a=>[a.id,p.entityIndex[a.id]?.name??a.id] as const)],id=>{if(id){s.selection.select({kind:'entity',id});render();}});row.append(field('Équipement à modifier',picker));const a=s0.amenities.find(a=>a.id===selected);if(a){const lock=node('input');lock.type='checkbox';lock.checked=a.locked;lock.onchange=()=>void run(async()=>{await s.change('Verrouiller un équipement',[],d=>lockSettlementAmenity(d,s0.id,a.id,lock.checked));plan=null;});row.append(field('Verrouiller cet équipement',lock),button('Modifier cet équipement en 3D',options.open3D),button('Supprimer cet équipement',()=>void run(async()=>{await s.change('Supprimer un équipement',Object.keys(p.chunkIndex),d=>removeSettlementAmenity(d,s0.id,a.id));plan=null;})));}}
            list.append(row);
        }
        list.append(button('Nouvelle implantation', () => { recipe = fresh();viewAnchor={...recipe.center}; plan = null; step = 1; result.replaceChildren(); render(); }));
        draw();
    }
    placement=placementTool(canvas,{world:p.world,recipe:()=>recipe,plan:()=>plan,view:()=>view,redraw:draw,message:report,change:(r,reframe)=>{if(busy)return;recipe=r;plan=null;if(reframe){viewAnchor={...r.center};globalView=false;}result.replaceChildren(node('p','Calcul des accès et de l’implantation…'));void run(calculate);}});
    const zoom=node('nav');zoom.append(button('Agrandir le plan',()=>{viewScale=Math.min(4,viewScale*1.35);draw();}),button('Réduire le plan',()=>{viewScale=Math.max(.5,viewScale/1.35);draw();}));preview.prepend(zoom);
    const stop = s.commands.subscribe(() => { if (disposed)
        return; mapRevision++;plan = null; result.replaceChildren(node('p', 'Projet modifié : recalculer l’aperçu.')); render(); });
    void run(async () => { await s.fullDocument(); });
    return () => { disposed = true; stop(); placement?.dispose(); };
}
