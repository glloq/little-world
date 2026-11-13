import type {CompiledWater} from './profile.ts';
export function drawHydroProfile(canvas:HTMLCanvasElement,profile:CompiledWater){
 const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,p=profile.points;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f9f2';ctx.fillRect(0,0,w,h);
 if(!p.length){ctx.fillStyle='#405e48';ctx.fillText('Ajouter au moins deux points',12,24);return;}
 const min=Math.min(...p.map(v=>Math.min(v.ground,v.level)))-1,max=Math.max(...p.map(v=>Math.max(v.ground,v.level)))+1,length=p.at(-1)!.distance||1;
 for(const [key,color]of [['ground','#997347'],['level','#2387b2']] as const){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();p.forEach((v,i)=>{const x=38+v.distance/length*(w-50),y=20+(max-v[key])/(max-min)*(h-48);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}
 ctx.fillStyle='#405e48';ctx.font='11px sans-serif';ctx.fillText(max.toFixed(1)+' m',2,12);ctx.fillText(min.toFixed(1)+' m',2,h-24);ctx.fillText('Amont',38,h-6);ctx.fillText(length.toFixed(0)+' m · Aval',Math.max(42,w-100),h-6);
}
