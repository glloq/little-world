import test from 'node:test';
import assert from 'node:assert/strict';
import { MouseDragOrbit } from '../src/camera-drag.ts';

test('camera cannot rotate merely by moving the mouse',()=>{
  const drag=new MouseDragOrbit();
  assert.equal(drag.active,false);
  assert.equal(drag.move(1,0,100,100),null);
  assert.equal(drag.move(1,0,160,145),null);
  assert.equal(drag.active,false);
});
test('camera orbits only while the left mouse button is held',()=>{
  const drag=new MouseDragOrbit();
  assert.equal(drag.begin(2,2,100,100),false,'right button is not an orbit control');
  assert.equal(drag.begin(2,0,100,100),true);
  assert.equal(drag.active,true);
  assert.equal(drag.move(5,1,120,125),null,'unrelated pointer ignored');
  assert.deepEqual(drag.move(2,1,120,125),{dx:20,dy:25});
  assert.deepEqual(drag.move(2,1,130,115),{dx:10,dy:-10});
  drag.end(2);
  assert.equal(drag.active,false);
  assert.equal(drag.move(2,0,140,160),null);
});
test('release away from canvas and loss of focus cancel rotation',()=>{
  const drag=new MouseDragOrbit();
  drag.begin(3,0,20,30);
  assert.equal(drag.move(3,0,60,40),null);
  assert.equal(drag.active,false);
  drag.begin(4,0,10,20);
  drag.cancel();
  assert.equal(drag.move(4,1,20,30),null);
});
