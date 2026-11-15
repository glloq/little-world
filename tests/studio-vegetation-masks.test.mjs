import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {regionCells,paintMask,protectedCells} from '../src/studio-core/geo-edits.ts';
import {maskCell} from '../src/geography/layers.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
test('exclusion géographique : peinture native occupation et restauration sélective',()=>{
 const p=createProject({name:'Mask',width:500,length:500,chunkSizeM:64,seed:42});
 const circles=regionCells(p,{kind:'circle',x:0,z:0,radius:8});
 assert.ok(circles.size);
 const n=paintMask(p,'occupation','x',circles);assert.ok(n>0);
 parseProject(structuredClone(p));
 const before=projectGeography(p).ctx.mask('occupation',0,0);
 assert.equal(before,'x');
 paintMask(p,'occupation','.',new Map([...circles].map(([id,cells])=>[id,cells.filter(i=>p.chunks[id]?.layers?.occupation?.[i]==='x')])));
 assert.equal(projectGeography(p).ctx.mask('occupation',0,0),undefined);
});
test('protected geographic edits are skipped when exclusion is painted',()=>{
 const p=createProject({name:'Protected',width:500,length:500,chunkSizeM:64});
 const region=regionCells(p,{kind:'circle',x:0,z:0,radius:10});
 const [id,ids]=[...region.entries()][0];const chosen=ids[0];
 paintMask(p,'occupation','r',new Map([[id,[chosen]]]));
 const free=protectedCells(p,'occupation',region);
 paintMask(p,'occupation','x',free);
 assert.equal(p.chunks[id].layers.occupation[chosen],'r');
});
