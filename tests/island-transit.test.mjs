import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArchipelagoRegistry} from '../src/archipelago/registry.ts';
const listing={schemaVersion:1,islands:[
{id:'volcano-island',name:'Volcan',description:'4 × 3 km',portLevel:0,manifest:'maps/island/manifest.json'},
{id:'forest-valley',name:'Forêt',description:'Référence',portLevel:0,manifest:'archipelago/worlds/forest-valley/manifest.json'},
]};
test('published island registry validates an independent compiled island path',()=>{
 const x=parseArchipelagoRegistry(listing);
 assert.equal(x.islands.length,2);
 assert.throws(()=>parseArchipelagoRegistry({...listing,islands:[{...listing.islands[1],manifest:'archipelago/worlds/../../evil/manifest.json'}]}));
 assert.throws(()=>parseArchipelagoRegistry({...listing,islands:[{...listing.islands[1],manifest:'https://foreign.example/manifest.json'}]}));
});