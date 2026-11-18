/** Shared counter panel: existing buying/selling plus optional, versioned workshop services.
 * The UI reads pure view models; every mutation goes through the gameplay controller.
 */
import {SHOPS,COIN,priceOf,type ShopKind} from '../../gameplay/economy.ts';
import type {WorkshopServiceView,WorkshopActionResult} from '../../economy/workshop-services.ts';
import {el,button} from '../shared/dom.ts';

export interface ShopLine {itemId:string;name:string;price:number;owned:number;canAct:boolean;reason?:string}
export interface ShopViewModel {name:string;greeting:string;coins:number;buy:ShopLine[];sell:ShopLine[]}
export function shopViewModel(kind:ShopKind,inventory:Readonly<Record<string,number>>,name:(id:string)=>string,max:(id:string)=>number):ShopViewModel{
  const shop=SHOPS[kind],coins=inventory[COIN]??0;
  const buy=shop.sells.map(id=>{const price=priceOf(id).buy??0,owned=inventory[id]??0,full=owned>=max(id);return {itemId:id,name:name(id),price,owned,canAct:price>0&&coins>=price&&!full,...(full?{reason:id.startsWith('tool:')?'Déjà possédé':'Sac plein'}:coins<price?{reason:'Pas assez de pièces'}:{})};});
  const sell=shop.buys.map(id=>{const price=priceOf(id).sell??0,owned=inventory[id]??0;return {itemId:id,name:name(id),price,owned,canAct:owned>0&&price>0,...(owned?{}:{reason:'Aucun en stock'})};});
  return {name:shop.name,greeting:shop.greeting,coins,buy,sell};
}
export interface ShopDeps {
  kind():ShopKind|null;
  /** The real counter entity ID, not only its kind, so jobs do not move between shops. */
  counterId?():string|null;
  inventory():Readonly<Record<string,number>>;
  name(id:string):string;
  max(id:string):number;
  trade(kind:ShopKind,itemId:string,quantity:number,mode:'buy'|'sell'):{ok:boolean;message?:string;reason?:string};
  production?:{
    list(kind:ShopKind,counterId:string):WorkshopServiceView[];
    start(kind:ShopKind,counterId:string,recipeId:string,batches:number):WorkshopActionResult;
    collect(kind:ShopKind,counterId:string,jobId:string):WorkshopActionResult;
  };
  notify(ok:boolean,text:string):void;
}
const MAX_BATCH=20;

export function shopPanel(deps:ShopDeps){
  let mode:'trade'|'craft'='trade',lastCounter:string|null=null;
  const batchByRecipe=new Map<string,number>();

  const report=(result:{ok:boolean;message?:string;reason?:string})=>
    deps.notify(result.ok,result.ok?result.message??'Opération effectuée':result.reason??'Action refusée');

  return {
    render(body:HTMLElement){
      const kind=deps.kind(),counterId=deps.counterId?.()??null,self=this;
      body.replaceChildren();
      if(!kind){body.append(el('p','ui-empty','Aucun comptoir à proximité.'));return;}
      if(counterId!==lastCounter){lastCounter=counterId;mode='trade';batchByRecipe.clear();}
      const inventory=deps.inventory(),vm=shopViewModel(kind,inventory,deps.name,deps.max);
      const available=!!counterId&&!!deps.production;
      const workstations=available?deps.production!.list(kind,counterId!):[];
      body.append(el('p','ui-muted','« '+vm.greeting+' »'),el('p','ui-shop-coins',`Bourse : ${vm.coins} pièces`));
      if(workstations.length){
        const tabs=el('div','ui-row ui-shop-tabs');
        for(const [tab,label] of [['trade','Acheter / vendre'],['craft','Transformer']] as const){
          const control=button(label,()=>{mode=tab;self.render(body);},'ui-button'+(mode===tab?' ui-primary':''));
          control.dataset.focusKey='shop-tab:'+tab;
          control.setAttribute('aria-pressed',String(mode===tab));tabs.append(control);
        }
        body.append(tabs);
      }else mode='trade';

      const act=(id:string,q:number,way:'buy'|'sell')=>{const r=deps.trade(kind,id,q,way);report(r);self.render(body);};
      const table=(title:string,lines:ShopLine[],way:'buy'|'sell')=>{
        const box=el('section','ui-shop-section');box.append(el('h3','ui-group',title));
        if(!lines.length)box.append(el('p','ui-muted','Rien pour le moment.'));
        for(const line of lines){
          const row=el('div','ui-shop-row');row.dataset.item=line.itemId;
          row.append(el('span','ui-shop-name',line.name),el('span','ui-shop-price',`${line.price} p.`),
            el('span','ui-muted',way==='sell'?`×${line.owned}`:line.owned?'possédé ×'+line.owned:''));
          const one=button(way==='buy'?'Acheter':'Vendre 1',()=>act(line.itemId,1,way),'ui-button');
          one.disabled=!line.canAct;if(line.reason)one.title=line.reason;row.append(one);
          if(way==='sell'&&line.owned>1){const all=button('Tout vendre',()=>act(line.itemId,line.owned,way),'ui-button');row.append(all);}
          box.append(row);
        }
        return box;
      };
      if(mode==='trade'||!available){
        body.append(table('Acheter',vm.buy,'buy'),table('Vendre',vm.sell,'sell'));
        return;
      }

      const refresh=button('Actualiser les fabrications',()=>self.render(body),'ui-button');
      body.append(refresh);
      for(const station of workstations){
        const section=el('section','ui-shop-section'),heading=el('h3','ui-group',station.title);
        section.dataset.station=station.stationId;section.append(heading);
        for(const recipe of station.recipes){
          const batches=batchByRecipe.get(recipe.recipeId)??1;
          const line=el('div','ui-shop-row');line.dataset.recipe=recipe.recipeId;
          const title=recipe.outputs.map(o=>`${o.quantity*batches} × ${deps.name(o.itemId)}`).join(' + ');
          const inputs=recipe.inputs.map(i=>`${i.quantity*batches} × ${deps.name(i.itemId)} (${inventory[i.itemId]??0} disponibles)`).join(' + ');
          const cost=recipe.serviceFeeCoins*batches,duration=recipe.durationGameMinutes*batches;
          const feasible=recipe.inputs.every(i=>(inventory[i.itemId]??0)>=i.quantity*batches)&&(inventory[COIN]??0)>=cost;
          const details=el('div','ui-shop-craft-details');
          details.append(el('strong','ui-shop-name',title),el('p','ui-muted','Ingrédients : '+inputs),
            el('p','ui-muted',`Service : ${cost} pièces · ${duration} min de jeu`));
          line.append(details);
          const controls=el('div','ui-row ui-shop-craft-actions');
          const minus=button('−',()=>{batchByRecipe.set(recipe.recipeId,Math.max(1,batches-1));self.render(body);},'ui-button','Diminuer la quantité');
          minus.disabled=batches<=1;
          const count=el('span','ui-shop-batch',String(batches));count.setAttribute('aria-label',`${batches} lots`);
          const plus=button('+',()=>{batchByRecipe.set(recipe.recipeId,Math.min(MAX_BATCH,batches+1));self.render(body);},'ui-button','Augmenter la quantité');
          plus.disabled=batches>=MAX_BATCH;
          const craft=button('Lancer',()=>{
            const outcome=deps.production!.start(kind,counterId!,recipe.recipeId,batches);
            report(outcome);self.render(body);
          },'ui-button ui-primary');
          craft.disabled=!feasible;
          if(!feasible)craft.title='Ingrédients ou pièces insuffisants';
          controls.append(minus,count,plus,craft);line.append(controls);section.append(line);
        }
        const jobs=station.jobs;
        if(jobs.length)section.append(el('h4','ui-group','Fabrications en cours et terminées'));
        for(const job of jobs){
          const row=el('div','ui-shop-row');row.dataset.job=job.jobId;
          const name=job.outputs.map(o=>`${o.quantity} × ${deps.name(o.itemId)}`).join(' + ');
          const due=job.status==='ready'?'Prêt à récupérer':`Terminé dans ${Math.max(0,job.finishesAtGameMinute-station.gameMinute)} min de jeu`;
          row.append(el('span','ui-shop-name',name),el('span','ui-muted',due));
          if(job.status==='ready'){
            const collect=button('Récupérer',()=>{
              const outcome=deps.production!.collect(kind,counterId!,job.jobId);report(outcome);self.render(body);
            },'ui-button ui-primary');
            row.append(collect);
          }
          section.append(row);
        }
        body.append(section);
      }
    },
  };
}
