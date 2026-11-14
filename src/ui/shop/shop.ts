/** Shop panel (counters of mines, forests, ports, markets, farms and inns). Pure view model +
 * renderer: prices and catalogues come from the economy rules; every button sends a command to
 * the gameplay controller (`trade`), which validates and applies it atomically. */
import {SHOPS,COIN,priceOf,type ShopKind} from '../../gameplay/economy.ts';
import {el,button} from '../shared/dom.ts';

export interface ShopLine {itemId:string;name:string;price:number;owned:number;canAct:boolean;reason?:string}
export interface ShopViewModel {name:string;greeting:string;coins:number;buy:ShopLine[];sell:ShopLine[]}
export function shopViewModel(kind:ShopKind,inventory:Readonly<Record<string,number>>,name:(id:string)=>string,max:(id:string)=>number):ShopViewModel{
  const shop=SHOPS[kind],coins=inventory[COIN]??0;
  const buy=shop.sells.map(id=>{const price=priceOf(id).buy??0,owned=inventory[id]??0,full=owned>=max(id);return {itemId:id,name:name(id),price,owned,canAct:price>0&&coins>=price&&!full,...(full?{reason:id.startsWith('tool:')?'Déjà possédé':'Sac plein'}:coins<price?{reason:'Pas assez de pièces'}:{})};});
  const sell=shop.buys.map(id=>{const price=priceOf(id).sell??0,owned=inventory[id]??0;return {itemId:id,name:name(id),price,owned,canAct:owned>0&&price>0,...(owned?{}:{reason:'Aucun en stock'})};});
  return {name:shop.name,greeting:shop.greeting,coins,buy,sell};
}
export interface ShopDeps {kind():ShopKind|null;inventory():Readonly<Record<string,number>>;name(id:string):string;max(id:string):number;trade(kind:ShopKind,itemId:string,quantity:number,mode:'buy'|'sell'):{ok:boolean;message?:string;reason?:string};notify(ok:boolean,text:string):void}
export function shopPanel(deps:ShopDeps){
  return {
    render(body:HTMLElement){
      const kind=deps.kind();body.replaceChildren();if(!kind){body.append(el('p','ui-empty','Aucun comptoir à proximité.'));return;}
      const vm=shopViewModel(kind,deps.inventory(),deps.name,deps.max),self=this;
      body.append(el('p','ui-muted','« '+vm.greeting+' »'),el('p','ui-shop-coins',`Bourse : ${vm.coins} pièces`));
      const act=(id:string,q:number,mode:'buy'|'sell')=>{const r=deps.trade(kind,id,q,mode);deps.notify(r.ok,r.ok?r.message??'':r.reason??'Refusé');self.render(body);};
      const table=(title:string,lines:ShopLine[],mode:'buy'|'sell')=>{
        const box=el('section','ui-shop-section');box.append(el('h3','ui-group',title));
        if(!lines.length)box.append(el('p','ui-muted','Rien pour le moment.'));
        for(const l of lines){const row=el('div','ui-shop-row');row.dataset.item=l.itemId;
          row.append(el('span','ui-shop-name',l.name),el('span','ui-shop-price',`${l.price} p.`),el('span','ui-muted',mode==='sell'?`×${l.owned}`:l.owned?'possédé ×'+l.owned:''));
          const one=button(mode==='buy'?'Acheter':'Vendre 1',()=>act(l.itemId,1,mode),'ui-button');one.disabled=!l.canAct;if(l.reason)one.title=l.reason;row.append(one);
          if(mode==='sell'&&l.owned>1){const all=button('Tout vendre',()=>act(l.itemId,l.owned,mode),'ui-button');row.append(all);}
          box.append(row);}
        return box;};
      body.append(table('Acheter',vm.buy,'buy'),table('Vendre',vm.sell,'sell'));
    },
  };
}
