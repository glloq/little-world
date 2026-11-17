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
test('native context menu is suppressed only on non-editable game surfaces while running',()=>{
  assert.equal(shouldSuppressGameplayContextMenu(true,true,false),true);
  assert.equal(shouldSuppressGameplayContextMenu(false,true,false),false);
  assert.equal(shouldSuppressGameplayContextMenu(true,false,false),false);
  assert.equal(shouldSuppressGameplayContextMenu(true,true,true),false);
});
test('Shift and right mouse share the flight boost but not ground or water actions',()=>{
  for(const mode of ['ground','roll','swim','dive','air','climb']){
    assert.equal(flightBoostHeld(mode,true,true,true),false,mode);
  }
  assert.equal(flightBoostHeld('glide',false,false,false),false);
  for(const held of [[true,false,false],[false,true,false],[false,false,true]]){
    assert.equal(flightBoostHeld('glide',...held),true,held.join(','));
  }
});
