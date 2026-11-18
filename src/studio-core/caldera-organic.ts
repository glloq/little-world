/** Broken volcanic crown: unequal angular sectors, variable widths and wandering inner/outer coasts. */
import type {PointXZ} from '../geography/archipelago.ts';
import {roundOutline} from './organic-outlines.ts';
export function dominantCaldera(random:()=>number,world:(x:number,z:number)=>PointXZ,diversity:number){
 const count=4+Math.floor(random()*3),phase=random()*Math.PI*2,majorShare=.58+random()*.08,weights=Array.from({length:count-1},()=>.55+random()*1.3),total=weights.reduce((a,b)=>a+b,0),broad=0,thin=2,out=[];let cursor=phase;
 const ring=(a:number)=>.285+.025*Math.sin(a*2+phase)+.012*Math.sin(a*3-phase);
 for(let i=0;i<count;i++){
  const sector=(i===0?majorShare:weights[i-1]/total*(1-majorShare))*Math.PI*2,gap=sector*(i===0?.025+random()*.025:.2+random()*.18),start=cursor+gap*.4,end=cursor+sector-gap*.6,mid=(start+end)/2;
  const width=i===broad?.105+random()*.025:i===thin?.023:.03+random()*.045,bulge=random()*6.28,asym=.8+random()*.4,outline:PointXZ[]=[];
  for(const side of [1,-1])for(let j=0;j<40;j++){
   const t=side===1?j/39:1-j/39,a=start+(end-start)*t,taper=.52+.48*Math.sin(Math.PI*t)**.65,
    waviness=1+diversity*(.22*Math.sin(t*Math.PI*2+bulge)+.12*Math.sin(t*Math.PI*5-bulge)),rad=ring(a)+side*width*taper*waviness*(side===1?1:asym);
   outline.push(world(Math.cos(a)*rad,Math.sin(a)*rad));
  }
  out.push({outline:roundOutline(outline,64,3),center:world(Math.cos(mid)*ring(mid),Math.sin(mid)*ring(mid)),width,points:Array.from({length:12},(_,j)=>{const a=start+(end-start)*(j/11*.72+.14);return world(Math.cos(a)*ring(a),Math.sin(a)*ring(a));}),height:.25+random()*.75});cursor+=sector;
 }
 return out;
}

export function organicCaldera(random:()=>number,world:(x:number,z:number)=>PointXZ,diversity:number){
 const count=5+Math.floor(random()*4),phase=random()*Math.PI*2,weights=Array.from({length:count},()=>.55+random()*1.3),total=weights.reduce((a,b)=>a+b,0),broad=Math.floor(random()*count),thin=(broad+2)%count,out=[];let cursor=phase;
 const ring=(a:number)=>.285+.025*Math.sin(a*2+phase)+.012*Math.sin(a*3-phase);
 for(let i=0;i<count;i++){
  const sector=weights[i]/total*Math.PI*2,gap=sector*(.14+random()*.25),start=cursor+gap*.4,end=cursor+sector-gap*.6,mid=(start+end)/2;
  const width=i===broad?.095:i===thin?.023:.03+random()*.045,bulge=random()*6.28,asym=.8+random()*.4,outline:PointXZ[]=[];
  for(const side of [1,-1])for(let j=0;j<40;j++){
   const t=side===1?j/39:1-j/39,a=start+(end-start)*t,taper=.52+.48*Math.sin(Math.PI*t)**.65,
    waviness=1+diversity*(.22*Math.sin(t*Math.PI*2+bulge)+.12*Math.sin(t*Math.PI*5-bulge)),rad=ring(a)+side*width*taper*waviness*(side===1?1:asym);
   outline.push(world(Math.cos(a)*rad,Math.sin(a)*rad));
  }
  out.push({outline:roundOutline(outline,64,3),center:world(Math.cos(mid)*ring(mid),Math.sin(mid)*ring(mid)),width,points:Array.from({length:12},(_,j)=>{const a=start+(end-start)*(j/11*.72+.14);return world(Math.cos(a)*ring(a),Math.sin(a)*ring(a));}),height:.25+random()*.75});cursor+=sector;
 }
 return out;
}
