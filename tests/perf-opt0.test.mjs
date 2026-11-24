import test from 'node:test';
import assert from 'node:assert/strict';
const {BENCH_ROUTES,createBenchRoute,buildCurve}=await import('../src/render/bench-route.ts');
const {PerfSampler,createUploadCounter}=await import('../src/render/perf-sampler.ts');

const flat=()=>0,hill=(x,z)=>Math.max(0,200-Math.hypot(x+300,z+300)/2);

test('bench route pose is a pure function of the tick', ()=>{
  for(const name of Object.keys(BENCH_ROUTES)){
    const a=createBenchRoute(BENCH_ROUTES[name],hill),b=createBenchRoute(BENCH_ROUTES[name],hill);
    for(const tick of [0,1,47,300,1234,a.periodTicks+5]){
      const pa={...a.at(tick)},pb={...b.at(tick)};
      assert.deepEqual(pa,pb,name+' tick '+tick);
      for(const v of Object.values(pa))if(typeof v==='number')assert.ok(Number.isFinite(v),name);
    }
  }
});

test('path routes move at their nominal speed and stay continuous', ()=>{
  const r=BENCH_ROUTES.flight,run=createBenchRoute(r,flat);
  let prev={...run.at(100)};
  for(let t=101;t<400;t++){
    const p={...run.at(t)},step=Math.hypot(p.x-prev.x,p.z-prev.z);
    assert.ok(Math.abs(step-r.speed/30)<.05,`step ${step} at ${t}`);
    assert.ok(Math.abs(Math.hypot(p.vx,p.vz)-r.speed)<r.speed*.2);
    prev=p;
  }
  assert.equal(run.at(10).mode,'glide');
});

test('glide line keeps clearance over the relief', ()=>{
  const c=buildCurve(BENCH_ROUTES.flight,hill);
  for(let i=0;i<c.xs.length;i++)assert.ok(c.ys[i]>=hill(c.xs[i],c.zs[i])+15-1e-9);
});

test('out-and-back routes reverse instead of jumping', ()=>{
  const run=createBenchRoute(BENCH_ROUTES.boat,flat),lap=Math.round(run.length/BENCH_ROUTES.boat.speed*30);
  const before={...run.at(lap-1)},after={...run.at(lap+1)};
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<1);
  assert.ok(Math.sign(before.vx)!==Math.sign(after.vx));
});

test('station routes hold each station for its tick count', ()=>{
  const r=BENCH_ROUTES.zones,run=createBenchRoute(r,flat);
  assert.equal(run.at(0).phase,0);assert.equal(run.at(r.stations[0].ticks).phase,1);
  assert.equal(run.at(r.stations[0].ticks).x,r.stations[1].x);
  assert.equal(run.periodTicks,r.stations.reduce((n,s)=>n+s.ticks,0));
});

test('PerfSampler keeps GPU results and long-frame counts separately', ()=>{
  const p=new PerfSampler(8);
  for(const f of [33,33,60,120,33])p.record(f,1,2,3);
  p.recordGpu(4);p.recordGpu(NaN);p.recordGpu(6);
  const s=p.snapshot();
  assert.equal(s.longFrames,2);assert.equal(s.over100,1);assert.equal(s.gpuSamples,2);
  assert.equal(s.gpuMs.max,6);assert.equal(s.frameMs.max,120);
  assert.equal(new PerfSampler(4).snapshot().gpuMs,null);
});

test('upload counter counts buffer and texture bytes, then restores the context', ()=>{
  const calls=[];
  const gl={RED:1,RG:2,RGB:3,RGBA:4,FLOAT:10,UNSIGNED_BYTE:11,HALF_FLOAT:12,
    bufferData(...a){calls.push(a);},bufferSubData(...a){calls.push(a);},texImage2D(...a){calls.push(a);},texSubImage2D(...a){calls.push(a);}};
  const original=gl.bufferData,c=createUploadCounter(gl);
  gl.bufferData(0,new Float32Array(16),0);gl.bufferData(0,256,0);
  gl.bufferSubData(0,0,new Float32Array(100),10,20);
  gl.texSubImage2D(0,0,0,0,8,4,gl.RGBA,gl.FLOAT,new Float32Array(128));
  gl.texImage2D(0,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,{width:16,height:16});
  assert.equal(c.stats.bufferBytes,64+256+80);
  assert.equal(c.stats.textureBytes,8*4*16+16*16*4);
  assert.equal(calls.length,5);
  c.dispose();assert.equal(gl.bufferData,original);
});

