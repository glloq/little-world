/** Dedicated import-only booth at the harbour. It lists *delivered foreign lots*,
 * never generic local market stock or an invented rotating catalogue.
 */
import {el,button} from '../shared/dom.ts';
import type {ImportStandView,CargoResult} from '../../archipelago/cargo-logistics.ts';

export interface ImportStandPanelDeps {
  view():ImportStandView;
  name(itemId:string):string;
  coins():number;
  max(itemId:string):number;
  owned(itemId:string):number;
  canUse():boolean;
  buy(lotId:string,quantity:number,revision:number):CargoResult;
  notify(ok:boolean,message:string):void;
}
export function renderImportStand(body:HTMLElement,deps:ImportStandPanelDeps):void {
  body.replaceChildren();
  const accessible=deps.canUse(),data=deps.view();
  body.append(el('p','ui-group','Marchandises venues d’autres îles'),
    el('p','ui-muted','Ce comptoir vend uniquement des lots arrivés par cargo. Le bateau voyageur suit ses propres horaires.'),
    el('p','ui-shop-coins','Bourse : '+deps.coins()+' pièces'));
  if(!accessible){
    body.append(el('p','ui-alert','Rejoignez le quai pour acheter des importations. La carte permet seulement de consulter les offres.'));
  }
  if(data.offers.length===0){
    body.append(el('p','ui-empty',data.inTransit>0
      ?'Aucun lot encore livré. '+data.inTransit+' cargaison(s) en mer.'
      :'Aucune marchandise importée disponible pour le moment.'));
  }
  const list=el('section','ui-shop-section');
  for(const lot of data.offers){
    const row=el('div','ui-shop-row ui-import-row');row.dataset.importLot=lot.lotId;
    const description=el('div','ui-shop-craft-details');
    description.append(el('strong','ui-shop-name',deps.name(lot.itemId)),
      el('p','ui-muted','Origine : '+lot.originIslandId+' · cargo '+lot.shipmentId),
      el('p','ui-muted',lot.quantity+' unité(s) en stock · '+lot.unitPrice+' pièces / unité'));
    row.append(description);
    const actions=el('div','ui-row');
    const buy=(quantity:number)=>{
      const result=deps.buy(lot.lotId,quantity,data.revision);
      deps.notify(result.ok,result.ok?result.message:result.reason);
      renderImportStand(body,deps);
    };
    const one=button('Acheter',()=>buy(1),'ui-button ui-primary');
    one.disabled=!accessible||lot.quantity<1||deps.coins()<lot.unitPrice||
      deps.owned(lot.itemId)>=deps.max(lot.itemId);
    actions.append(one);
    if(lot.quantity>=2){
      const quantity=Math.min(5,lot.quantity,Math.max(0,deps.max(lot.itemId)-deps.owned(lot.itemId)));
      const many=button('Acheter ×'+Math.min(5,lot.quantity),()=>buy(Math.min(5,lot.quantity)),'ui-button');
      many.disabled=!accessible||quantity<Math.min(5,lot.quantity)||
        deps.coins()<Math.min(5,lot.quantity)*lot.unitPrice;
      actions.append(many);
    }
    row.append(actions);list.append(row);
  }
  body.append(list);
  if(data.inTransit)body.append(el('p','ui-muted',
    data.inTransit+' expédition(s) en route'+(data.nextArrivalMinute!==null?
      ' · arrivée prévue à la minute de jeu '+data.nextArrivalMinute:'')));
}
