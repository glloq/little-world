import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOPS,buy,sell,priceOf,economyItems,COIN,pickPower,ECONOMY_ITEMS} from '../src/gameplay/economy.ts';
import {createGathering,createFishing,parseGatherSave,ruleFor} from '../src/gameplay/gathering.ts';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {archipelagoField} from '../src/geography/archipelago.ts';
import {createGeoContext} from '../src/geography/engine.ts';
import {generateDressingCell,ITEM_STRIDE} from '../src/geography/dressing.ts';
import {SPECIES} from '../src/world-production/biotopes.ts';
import {MineGrid,MineState,parseMineSave} from '../src/mine/mine-state.ts';
import {defaultMineSettings,MINE_MATERIALS} from '../src/mine/mine-data.ts';

function purse(start={}){const inv={...start};const max=id=>ECONOMY_ITEMS.find(i=>i.id===id)?.maxQuantity??999;
  return {inv,count:id=>inv[id]??0,max,apply:changes=>{const next={...inv};for(const c of changes){next[c.itemId]=(next[c.itemId]??0)+c.quantity;if(next[c.itemId]<0||next[c.itemId]>max(c.itemId))return false;}Object.assign(inv,next);return true;}};}
test('shops sell their tools and buy local resources; transactions are atomic and validated',()=>{
  for(const shop of Object.values(SHOPS)){for(const id of shop.sells)assert.ok(priceOf(id).buy>0,shop.kind+' sells '+id);for(const id of shop.buys)assert.ok(priceOf(id).sell>0,shop.kind+' buys '+id);}
  assert.ok(SHOPS.mine.sells.includes('tool:pickaxe')&&SHOPS.forest.sells.includes('tool:axe')&&SHOPS.port.sells.includes('tool:fishing-rod'));
  const p=purse({[COIN]:40});
  const r=buy(SHOPS.mine,'tool:pickaxe',1,p);assert.ok(r.ok);assert.equal(p.inv[COIN],10);assert.equal(p.inv['tool:pickaxe'],1);
  assert.equal(buy(SHOPS.mine,'tool:pickaxe',1,p).ok,false,'one tool only / not enough coins');
  assert.equal(buy(SHOPS.mine,'tool:axe',1,p).ok,false,'catalogue checked');
  p.inv['mine:iron']=3;const s=sell(SHOPS.mine,'mine:iron',3,p);assert.ok(s.ok);assert.equal(p.inv['mine:iron'],0);assert.equal(p.inv[COIN],10+27);
  assert.equal(sell(SHOPS.mine,'mine:iron',1,p).ok,false,'nothing left to sell');
  assert.equal(sell(SHOPS.port,'mine:iron',1,p).ok,false,'port does not buy ore');
  const items=economyItems([{id:COIN,name:'Écus',category:'x',maxQuantity:5}]);assert.equal(items.find(i=>i.id===COIN).name,'Écus','project items win');
  assert.ok(pickPower(()=>false).power<pickPower(id=>id==='tool:pickaxe').power);
});
test('mining: cells have 20–500 hit points, strikes accumulate, fragments sometimes, full reward at the end, damage saved',()=>{
  for(const m of MINE_MATERIALS.filter(m=>m.diggable))assert.ok(m.hp>=20&&m.hp<=500,m.key);
  const polygon=[{x:0,z:0},{x:40,z:0},{x:40,z:40},{x:0,z:40}],zone={id:'m',name:'M',polygon,mine:defaultMineSettings(polygon,2,30,7)};
  const state=new MineState(new MineGrid(zone)),g=state.grid,level=g.levels[0];
  // A diggable wall next to the entrance corridor.
  let wall=null;for(let iz=0;iz<40&&!wall;iz++)for(let ix=0;ix<40&&!wall;ix++){if(!state.isOpen(0,ix,iz)&&g.material(0,ix,iz)>=2&&g.material(0,ix,iz)<=3&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>state.isOpen(0,ix+a,iz+b))){const open=[[1,0],[-1,0],[0,1],[0,-1]].find(([a,b])=>state.isOpen(0,ix+a,iz+b));wall={ix,iz,from:{x:ix+open[0]+.5,y:level.floorY+.1,z:iz+open[1]+.5}};}}
  assert.ok(wall,'a wall exists');const hp=MINE_MATERIALS[g.material(0,wall.ix,wall.iz)].hp,granted=[];let n=0,last;
  do{last=state.strike({requestId:'s'+n,levelId:level.id,ix:wall.ix,iz:wall.iz,from:wall.from},8,r=>{granted.push(r);return true;});n++;}while(last.ok&&last.partial&&n<200);
  assert.equal(n,Math.ceil(hp/8),'strikes = ceil(hp / power)');assert.ok(state.excavated(0,wall.ix,wall.iz));
  assert.ok(granted.length>=1,'final reward');
  const s2=new MineState(g);const w=wall;s2.strike({requestId:'a',levelId:level.id,ix:w.ix,iz:w.iz,from:w.from},2,()=>true);
  const saved=parseMineSave(JSON.parse(JSON.stringify(s2.serialize())));assert.ok(saved.damage&&Object.values(saved.damage)[0]===2);
  const s3=new MineState(g);s3.restore(saved);assert.equal(s3.damageAt(0,w.ix,w.iz),2);
});
test('gathering: trees need an axe and several strikes, give logs, stay felled until regrowth; save round-trip',()=>{
  const W=3000,L=8000,field=archipelagoField({seed:4242,seaLevel:0,width:W,length:L},archipelagoPreset(W,L));
  const ctx=createGeoContext(null,{seaLevel:0,height:field.height,site:field.site,water:(x,z,h)=>h<0?0:null,pathDistance:()=>Infinity,waterDistance:()=>Infinity});
  const inside=(x,z)=>Math.abs(x)<=W/2&&Math.abs(z)<=L/2;
  // Find a broadleaf tree.
  let tree=null;for(let cz=-60;cz<60&&!tree;cz+=3)for(let cx=-12;cx<12&&!tree;cx+=2){const c=generateDressingCell(ctx,4242,cx,cz,inside),a=c.items.oak;for(let i=0;i<a.length;i+=ITEM_STRIDE)if(SPECIES[a[i+6]]?.id==='nature.broadleaf_round'){tree={x:a[i],y:a[i+1],z:a[i+2]};break;}}
  assert.ok(tree);let time=100;const inv={};
  const g=createGathering({ctx:()=>ctx,seed:4242,inside,time:()=>time,grant:ch=>{for(const c of ch)inv[c.itemId]=(inv[c.itemId]??0)+c.quantity;return true;},has:id=>!!inv[id]});
  const at={x:tree.x-1.2,y:tree.y,z:tree.z},fwd={x:1,z:0};
  const t=g.target(at,fwd);assert.ok(t&&t.rule.action==='fell');
  assert.equal(g.act(at,fwd).ok,false,'axe required');inv['tool:axe']=1;
  let r;for(let i=0;i<t.rule.strikes;i++)r=g.act(at,fwd);assert.ok(r.done&&inv['wood:log']>=2,'logs '+inv['wood:log']);
  assert.ok(g.hiddenAt(t.cx,t.cz,t.kind,t.index),'felled tree hidden');
  const saved=parseGatherSave(JSON.parse(JSON.stringify(g.serialize())));
  const g2=createGathering({ctx:()=>ctx,seed:4242,inside,time:()=>time,grant:()=>true,has:()=>true});g2.restore(saved);assert.ok(g2.hiddenAt(t.cx,t.cz,t.kind,t.index));
  time+=t.rule.regrowSeconds+1;assert.equal(g2.hiddenAt(t.cx,t.cz,t.kind,t.index),false,'grows back');
  assert.equal(ruleFor('nature.fruit_apple','oak',true).yields.itemId,'food:apple');assert.equal(ruleFor('nature.mushrooms_patch','plant',true).yields.itemId,'forage:mushroom');
});
test('fishing: bite window, strike in time catches a fish of that water, too early catches nothing',()=>{
  let r=.5;const f=createFishing(()=>r);
  f.cast('river',{x:0,z:0},0);assert.equal(f.strike(),null,'too early');
  f.cast('river',{x:0,z:0},0);assert.equal(f.update(10),'bite');r=.1;assert.equal(f.strike(),'fish:trout');
  f.cast('sea',{x:0,z:0},0);f.update(10);assert.equal(f.update(20),'lost');
});
