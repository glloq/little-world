import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompositionClient,CompositionCancelled} from '../src/studio-core/composition-client.ts';
import {composeWorld,COMPOSITION_STAGES} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements} from '../src/studio-core/map-requirements.ts';
import {previewWorldRecomposition} from '../src/studio-core/world-recomposition.ts';

const small=()=>({...newIslandRequirements(),width:1200,length:900,welcomeVillage:'none',maritimePort:false});
const id={projectId:'cc',worldId:'cc'};

test('client (inline fallback) reports every stage and returns the same plan as composeWorld', async () => {
 const client=createCompositionClient(null),seen=[];
 const plan=await client.compose(small(),{identity:id,onProgress:p=>seen.push(p.stage)});
 assert.deepEqual(seen,COMPOSITION_STAGES.map(s=>s.id));
 const direct=composeWorld(small(),undefined,id);
 assert.deepEqual(plan.project,direct.project);assert.equal(client.busy,false);
});

test('latest request wins: an outdated generation is cancelled', async () => {
 const client=createCompositionClient(null);
 const first=client.compose(small(),{identity:id}),second=client.compose({...small(),seed:77},{identity:id});
 await assert.rejects(first,e=>e instanceof CompositionCancelled);
 assert.equal((await second).project.world.seed,77);
});

test('recomposition preview runs through the client and replaces surf/dive data guarded', async () => {
 const r={...small(),underwater:{shelf:'narrow',reefs:1,holes:1,trench:false,diveSites:true}};
 const p=composeWorld(r,'R',id).project;
 const client=createCompositionClient(null),stages=[];
 const preview=await client.recompose(p,{...r,seed:r.seed+1},'full',{onProgress:q=>stages.push(q.label)});
 assert.ok(stages.some(l=>l.startsWith('Référence'))&&stages.some(l=>l.startsWith('Nouveau plan')));
 assert.equal(preview.project.world.seed,r.seed+1);
 const edited=structuredClone(p);edited.libraries.diveSites={...(edited.libraries.diveSites??{})};
 const site=Object.values(edited.libraries.diveSites)[0];
 if(site){site.name='Récif renommé';assert.throws(()=>previewWorldRecomposition(edited,{...r,seed:r.seed+1}),/plongée/);}
});
