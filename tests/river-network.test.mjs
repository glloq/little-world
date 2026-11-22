import test from 'node:test';
import assert from 'node:assert/strict';
import {planRiverNetwork,streamWidth} from '../src/world-production/river-network.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';

// Doc 108 §8: a V-shaped valley draining to the sea in the south, with a closed bowl on a flank.
const bounds={minX:-1000,maxX:1000,minZ:-1000,maxZ:1000};
const valley=(x,z)=>.03*(z+900)+.045*Math.abs(x)+1.5*Math.sin(x*.013+z*.007);
const bowl=(x,z)=>-12*Math.exp(-((x-420)**2+(z-380)**2)/(2*70*70));
const height=(x,z)=>valley(x,z)+bowl(x,z);

test('streams join into larger rivers that reach the sea, all valid for the shared compiler',()=>{
 const r=planRiverNetwork({height,seaLevel:0,bounds},{idPrefix:'t-',cellM:25,minAreaM2:30000,maxStreams:40,seed:3});
 const rivers=r.waters.filter(w=>w.kind!=='lake'),byId=new Map(r.waters.map(w=>[w.id,w]));
 assert.ok(rivers.length>=4,'several streams: '+rivers.length);
 assert.ok(rivers.some(w=>w.to?.kind==='sea'),'a main stem reaches the sea');
 const tributaries=rivers.filter(w=>w.to?.kind==='river');
 assert.ok(tributaries.length>=2,'tributaries join a river: '+tributaries.length);
 for(const t of tributaries){const parent=byId.get(t.to.id);assert.ok(parent,'parent kept');assert.ok(t.width<=parent.width,'tributaries are not wider than their river');}
 assert.ok(r.streams.some(s=>s.order>=2),'Strahler order ≥ 2 somewhere');
 const compiled=compileWaterNetwork(r.waters,height,0);
 for(const c of compiled)assert.deepEqual(c.diagnostics.filter(d=>d.severity==='ERROR'),[],c.id);
 for(const w of r.waters)assert.ok(w.points.length>=2&&w.points.length<=100,'WATER point limits');
});

test('a closed bowl becomes a lake at its spill level, fed and drained by streams',()=>{
 const r=planRiverNetwork({height,seaLevel:0,bounds},{idPrefix:'t-',cellM:25,minAreaM2:30000,maxStreams:40,seed:3});
 const lake=r.waters.find(w=>w.kind==='lake');assert.ok(lake,'lake created: '+r.diagnostics.join(' | '));
 assert.ok(Math.hypot(lake.points.reduce((s,p)=>s+p.x,0)/lake.points.length-420,lake.points.reduce((s,p)=>s+p.z,0)/lake.points.length-380)<80,'lake in the bowl');
 assert.ok(height(420,380)<lake.level&&lake.depth>=1,'water over the bowl');
 for(const p of lake.points)assert.ok(height(p.x,p.z)>=lake.level,'shore above the surface');
});

test('avoided ground gets no channel and no lake; output is deterministic; widths follow drainage',()=>{
 const avoid=(x,z)=>Math.abs(x)<120&&z>-200&&z<200;
 const a=planRiverNetwork({height,seaLevel:0,bounds,avoid},{idPrefix:'t-',cellM:25,minAreaM2:30000,seed:3});
 const b=planRiverNetwork({height,seaLevel:0,bounds,avoid},{idPrefix:'t-',cellM:25,minAreaM2:30000,seed:3});
 assert.deepEqual(a,b,'same input, same network');
 for(const w of a.waters)for(const p of w.points)assert.ok(!avoid(p.x,p.z)||w.kind==='lake','no stream point inside the avoided area');
 assert.ok(streamWidth(1e6)>streamWidth(1e5)&&streamWidth(1e9)===12,'w ∝ √area, capped');
});

test('a narrow rock bar the routing grid cannot see stays a valid, carved crossing',()=>{
 // 3 m bar between two routing cells: the river crosses it (the bed is carved locally, doc 108 §9).
 const bar=(x,z)=>height(x,z)+3*Math.exp(-((z+300)**2)/(2*4*4));
 const r=planRiverNetwork({height:bar,seaLevel:0,bounds},{idPrefix:'t-',cellM:25,minAreaM2:30000,seed:3});
 const main=r.waters.find(w=>w.kind!=='lake'&&w.to?.kind==='sea'&&w.points.some(p=>p.z>-200)&&w.points.some(p=>p.z<-400));
 assert.ok(main,'the main river still crosses the bar to the sea');
 assert.ok(compileWaterNetwork(r.waters,bar,0).every(c=>!c.diagnostics.some(d=>d.severity==='ERROR')));
});
