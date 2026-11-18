/** Presentation-only constraints. The market revalidates each submitted request. */
export interface TradeLine {
  itemId:string;name:string;price:number;owned:number;available?:number;
}
export type TradeWay='buy'|'sell';
export function tradeLimit(line:TradeLine,way:TradeWay,coins:number,coinMax:number,itemMax:number):number{
  if(!Number.isFinite(line.price)||line.price<=0)return 0;
  const available=Math.max(0,line.available??99);
  const space=way==='buy'?Math.max(0,itemMax-line.owned):Math.max(0,line.owned);
  const funds=way==='buy'?Math.floor(coins/line.price):Math.floor(Math.max(0,coinMax-coins)/line.price);
  return Math.max(0,Math.min(99,available,space,Math.max(0,funds)));
}
export function ownedBuybackLines<T extends TradeLine>(offers:readonly T[]):T[]{
  return offers.filter(line=>line.owned>0&&line.price>0);
}
export function selectedSaleTotal(lines:readonly TradeLine[],selection:ReadonlyMap<string,number>):number{
  return lines.reduce((total,line)=>total+line.price*(selection.get(line.itemId)??0),0);
}
