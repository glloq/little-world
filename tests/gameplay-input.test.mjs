import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPreventGameplayKeyDefault,shouldSuppressGameplayContextMenu,flightBoostHeld} from '../src/input/gameplay-input.ts';

test('gameplay captures Space and arrows, but leaves menus, text editing and other keys native',()=>{
  for(const code of ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
    assert.equal(shouldPreventGameplayKeyDefault(code,true,false),true,code);
    assert.equal(shouldPreventGameplayKeyDefault(code,false,false),false,code+' paused');
    assert.equal(shouldPreventGameplayKeyDefault(code,true,true),false,code+' editable');
  }
  for(const code of ['Enter','Tab','Escape','KeyI','ShiftLeft']){
    assert.equal(shouldPreventGameplayKeyDefault(code,true,false),false,code);
  }
});
test('context menu is disabled across game DOM while running, except editable fields',()=>{
  assert.equal(shouldSuppressGameplayContextMenu(true,false),true);
  assert.equal(shouldSuppressGameplayContextMenu(true,true),false);
  assert.equal(shouldSuppressGameplayContextMenu(false,false),false);
  assert.equal(shouldSuppressGameplayContextMenu(false,true),false);
});
test('Shift and mobile accelerate boost only when gliding, never the secondary mouse button',()=>{
  for(const mode of ['ground','roll','swim','dive','air','climb']){
    assert.equal(flightBoostHeld(mode,true,true),false,mode);
  }
  assert.equal(flightBoostHeld('glide',false,false),false);
  assert.equal(flightBoostHeld('glide',true,false),true);
  assert.equal(flightBoostHeld('glide',false,true),true);
});
