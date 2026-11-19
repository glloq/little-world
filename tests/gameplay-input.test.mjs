import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPreventGameplayKeyDefault,shouldSuppressGameplayContextMenu,flightBoostHeld,flightPitchIntent} from '../src/input/gameplay-input.ts';

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
test('camera pitch controls glider only during an active view drag',()=>{
 assert.equal(flightPitchIntent('glide',false,-.77),0);
 assert.equal(flightPitchIntent('air',true,-.77),0);
 assert.equal(flightPitchIntent('glide',true,-.77),1);
 assert.equal(flightPitchIntent('glide',true,.77),-1);
 assert.equal(flightPitchIntent('glide',true,0),0);
 assert.equal(flightPitchIntent('glide',true,NaN),0);
 assert.equal(flightPitchIntent('glide',true,1.5),-1);
});
test('Shift / touch acceleration can launch while still, double-jump in air and power glide',()=>{
  for(const mode of ['roll','swim','dive','climb']){
    assert.equal(flightBoostHeld(mode,true,true),false,mode);
  }
  for(const mode of ['ground','air','glide']){
    assert.equal(flightBoostHeld(mode,false,false),false,mode);
    assert.equal(flightBoostHeld(mode,true,false),true,mode);
    assert.equal(flightBoostHeld(mode,false,true),true,mode);
  }
});
