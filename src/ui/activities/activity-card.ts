/** Contextual activity card (mine / farm plot). View models are built from the business
 * previews (dig check, farm preview, mine navigation): the card never decides whether a rock
 * can be dug or a crop is ripe, and never simulates growth. DOM is rewritten only when the
 * rendered content changes. */
import {CROPS} from '../../farm/farm-data.ts';
import {el,button} from '../shared/dom.ts';

export interface MiningViewModel {title:string;exit?:{label:string;distance:number;relativeAngle:number};passage?:string;wall?:{material:string;resource?:string;ok:boolean;reason?:string}}
export interface FarmingViewModel {plotId:string;name:string;crop?:string;stage:string;growth?:number;moisture:number;action:{label:string;ok:boolean;reason?:string};choices:{id:string;name:string;selected:boolean}[]}
const STAGES:Record<string,string>={empty:'Parcelle vide',seeded:'Semée',growing:'En croissance',mature:'Mûre — prête à récolter',failed:'Desséchée'};
export function miningViewModel(nav:{mineName:string;levelName:string;levelIndex:number;levelCount:number;passage:{label:string}|null;exit:{label:string;distance:number;angle:number}|null},yaw:number,wall?:{materialName:string;ok:boolean;reason?:string;rewardName?:string}|null):MiningViewModel{
  const rel=nav.exit?Math.atan2(Math.sin(nav.exit.angle-yaw),Math.cos(nav.exit.angle-yaw)):0;
  return {title:`${nav.mineName} · ${nav.levelName} (${nav.levelIndex+1}/${nav.levelCount})`,...(nav.exit?{exit:{label:nav.exit.label,distance:nav.exit.distance,relativeAngle:rel}}:{}),...(nav.passage?{passage:nav.passage.label}:{}),
    ...(wall?{wall:{material:wall.materialName,...(wall.rewardName?{resource:wall.rewardName}:{}),ok:wall.ok,...(wall.reason?{reason:wall.reason}:{})}}:{})};
}
export function farmingViewModel(view:{plotId:string;cropId:string|null;stage:string;growth:number;moisture:number;selectedCrop:string;zone:{name:string;farm:{crops:string[]}}},preview:{intent:{label:string};ok:boolean;reason?:string}):FarmingViewModel{
  return {plotId:view.plotId,name:view.zone.name,...(view.cropId?{crop:CROPS[view.cropId].name}:{}),stage:STAGES[view.stage]??view.stage,...(view.cropId?{growth:view.growth}:{}),moisture:view.moisture,
    action:{label:preview.intent.label,ok:preview.ok,...(preview.reason?{reason:preview.reason}:{})},choices:view.stage==='empty'?view.zone.farm.crops.map(id=>({id,name:CROPS[id].name,selected:id===view.selectedCrop})):[]};
}
const bar=(label:string,value:number)=>{const wrap=el('div','ui-meter'),track=el('span','ui-meter-track'),fill=el('span','ui-meter-fill');fill.style.width=Math.round(value*100)+'%';track.append(fill);wrap.append(el('span','',`${label} : ${Math.round(value*100)} %`),track);wrap.setAttribute('role','meter');wrap.setAttribute('aria-valuenow',String(Math.round(value*100)));wrap.setAttribute('aria-valuemin','0');wrap.setAttribute('aria-valuemax','100');wrap.setAttribute('aria-label',label);return wrap;};
export function activityCard(host:HTMLElement,onChooseCrop:(plotId:string,cropId:string)=>void){
  const card=el('aside','ui-activity-card hide');card.setAttribute('aria-label','Activité en cours');host.append(card);let key='';
  return {
    update(mine:MiningViewModel|null,farm:FarmingViewModel|null){
      const next=JSON.stringify([mine&&{...mine,exit:mine.exit&&{...mine.exit,distance:Math.round(mine.exit.distance),relativeAngle:Math.round(mine.exit.relativeAngle*8/Math.PI)}},farm&&{...farm,growth:farm.growth===undefined?undefined:Math.round(farm.growth*100),moisture:Math.round(farm.moisture*100)}]);
      if(next===key)return;key=next;card.replaceChildren();card.classList.toggle('hide',!mine&&!farm);card.dataset.kind=mine?'mine':farm?'farm':'';
      if(mine){card.append(el('strong','',mine.title));
        if(mine.exit){const line=el('p','ui-exit'),arrow=el('span','ui-arrow','↑');arrow.style.transform=`rotate(${-mine.exit.relativeAngle}rad)`;arrow.setAttribute('aria-hidden','true');line.append(arrow,document.createTextNode(` ${mine.exit.label} : ${Math.round(mine.exit.distance)} m`));card.append(line);}
        if(mine.passage)card.append(el('p','ui-muted','Passage : '+mine.passage));
        if(mine.wall)card.append(el('p',mine.wall.ok?'':'ui-warn-text',`Paroi : ${mine.wall.material}${mine.wall.resource?' → '+mine.wall.resource:''}${mine.wall.ok?'':' · '+(mine.wall.reason??'')}`));}
      if(farm){card.append(el('strong','',farm.name),el('p','',farm.crop?`${farm.crop} · ${farm.stage}`:farm.stage));
        if(farm.growth!==undefined)card.append(bar('Croissance',farm.growth));card.append(bar('Humidité du sol',farm.moisture));
        card.append(el('p',farm.action.ok?'':'ui-warn-text',farm.action.ok?'[E] '+farm.action.label:`${farm.action.label} · ${farm.action.reason}`));
        if(farm.choices.length){const row=el('div','ui-row ui-crops');row.setAttribute('aria-label','Choisir la culture');for(const c of farm.choices){const b=button(c.name,()=>onChooseCrop(farm.plotId,c.id),'ui-chip');b.setAttribute('aria-pressed',String(c.selected));row.append(b);}card.append(row);}}
    },
  };
}
