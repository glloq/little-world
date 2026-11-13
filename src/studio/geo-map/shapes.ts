/** G3 — "Formes" tool of the 2D map: direct editing of the archipelago generator (land
 * outlines, volcanoes, massifs, hills, basins, plateaus, ridges, valleys), presets and local
 * variations with a preview before commit. Every committed change is one transaction on
 * `world.terrain` (undoable, validated by the V3 world schema). The generator stays the
 * single terrain authority; author corrections (masks, edits) are kept untouched. */
import {node,button,field,download} from '../dom.ts';
import type {StudioSession} from '../session.ts';
import {archipelagoField,featureBounds,landmassBounds,FEATURE_LABELS,type ArchipelagoParams,type Landmass,type ReliefFeature,type PointXZ,type FeatureKind} from '../../geography/archipelago.ts';
import {archipelagoPreset,isletChainPreset,islandToArchipelago,parseArchipelago,blobOutline,ARCHIPELAGO_LIMITS} from '../../geography/archipelago-params.ts';
import {islandPreset} from '../../terrain-generator.ts';
import {setArchipelago} from '../../studio-core/geo-edits.ts';
import {ALTITUDE_RAMP} from './raster.ts';

type Target={type:'landmass'|'feature';id:string};
type Handle=Target&{vertex:number|null;x:number;z:number};
export interface ShapeEnv {
  session:StudioSession;
  toScreen(x:number,z:number):{x:number;y:number};
  scale():number;
  redraw():void;
  refreshPanel():void;
  status(message:string,error?:boolean):void;
}
type Field=[key:string,label:string,min:number,max:number,step:number];
const LAND_FIELDS:Field[]=[['coastNoiseM','Irrégularité de la côte (m)',0,600,5],['coastWavelengthM','Taille des anses et caps (m)',50,5000,10],['beachWidthM','Largeur des plages (m)',2,400,1],['shoreHeightM','Hauteur du rivage (m)',.5,80,.5],['lowlandHeightM','Altitude des plaines (m)',0,400,1],['hillHeightM','Collines de fond (m)',0,300,1],['cliffs','Falaises (0 plage → 1 falaise)',0,1,.05]];
const FEATURE_FIELDS:Record<FeatureKind,Field[]>={
  volcano:[['radiusM','Rayon (m)',20,4000,10],['heightM','Hauteur (m)',5,1400,5],['craterRadiusM','Rayon du cratère (m)',0,2000,5],['craterDepthM','Profondeur du cratère (m)',0,600,1]],
  mountain:[['radiusM','Rayon (m)',10,4000,10],['heightM','Hauteur (m)',1,1200,5],['roughness','Rugosité',0,1,.05]],
  hill:[['radiusM','Rayon (m)',10,4000,5],['heightM','Hauteur (m)',1,1200,1],['roughness','Rugosité',0,1,.05]],
  basin:[['radiusM','Rayon (m)',10,4000,5],['depthM','Profondeur (m)',.5,300,.5]],
  plateau:[['heightM','Altitude (m)',0,1200,1],['edgeM','Largeur du talus (m)',2,600,1]],
  ridge:[['widthM','Largeur (m)',5,2000,5],['heightM','Hauteur (m)',1,800,1]],
  valley:[['widthM','Largeur (m)',5,2000,5],['depthM','Profondeur (m)',.5,400,.5]],
};
const VARIABLE=new Set(['landmass','volcano','mountain','hill']);
const ADDABLE:[string,string][]=[['islet','Îlot'],['volcano','Volcan'],['mountain','Massif'],['hill','Colline'],['basin','Cuvette'],['plateau','Plateau'],['ridge','Crête'],['valley','Vallée']];

/** Small hypsometric preview of a generator over a rectangle (no runtime state touched). */
export function reliefThumbnail(params:ArchipelagoParams,world:{seed:number;seaLevel:number;width:number;length:number},rect:{minX:number;maxX:number;minZ:number;maxZ:number},maxPx=110):HTMLCanvasElement{
  const field=archipelagoField(world,params),w=rect.maxX-rect.minX,l=rect.maxZ-rect.minZ,step=Math.max(w,l)/maxPx,cw=Math.max(2,Math.round(w/step)),ch=Math.max(2,Math.round(l/step));
  const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d')!,img=ctx.createImageData(cw,ch);
  const stops=ALTITUDE_RAMP.map(([v,c])=>[v,[c>>16&255,c>>8&255,c&255]] as const);
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){
    const x=rect.minX+(i+.5)*step,z=rect.minZ+(j+.5)*step,h=field.height(x,z)-world.seaLevel,dx=field.height(x+step,z)-world.seaLevel-h;
    let c=stops.at(-1)![1] as readonly number[];for(let k=1;k<stops.length;k++)if(h<=stops[k][0]){const t=(h-stops[k-1][0])/(stops[k][0]-stops[k-1][0]);c=stops[k-1][1].map((v,q)=>v+(stops[k][1][q]-v)*Math.max(0,Math.min(1,t)));break;}
    const f=h<0?1:Math.max(.6,Math.min(1.3,1-dx/step*1.5)),o=(j*cw+i)*4;img.data[o]=c[0]*f;img.data[o+1]=c[1]*f;img.data[o+2]=c[2]*f;img.data[o+3]=255;
  }
  ctx.putImageData(img,0,0);canvas.className='relief-thumb';return canvas;
}
export function presetsFor(width:number,length:number):[string,string,ArchipelagoParams][]{
  return [['archipelago','Archipel volcanique (île principale + îlots)',archipelagoPreset(width,length)],['single','Île unique avec volcan',islandToArchipelago((islandPreset(width,length) as Extract<ReturnType<typeof islandPreset>,{kind:'island'}>).island,width,length)],['chain','Chapelet d’îlots',isletChainPreset(width,length)]];
}

export function createShapeTool(env:ShapeEnv){
  const s=env.session,p=s.document,b=p.world.bounds,width=b.maxX-b.minX,length=b.maxZ-b.minZ;
  const world=()=>({seed:p.world.seed,seaLevel:p.world.seaLevel,width,length});
  const current=():ArchipelagoParams|null=>p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago:null;
  let selected:Target|null=null,vertex:number|null=null,adding:string|null=null,preview:ArchipelagoParams|null=null;
  let drag:{handle:Handle;start:PointXZ;base:ArchipelagoParams;moved:boolean}|null=null;
  let variation:{target:Target;candidate:ArchipelagoParams;variant:number}|null=null,pending:{label:string;params:ArchipelagoParams}|null=null;
  const shown=()=>preview??current();
  const clampPoint=(q:PointXZ)=>({x:Math.round(Math.max(b.minX+1,Math.min(b.maxX-1,q.x))*10)/10,z:Math.round(Math.max(b.minZ+1,Math.min(b.maxZ-1,q.z))*10)/10});
  const find=(a:ArchipelagoParams,t:Target)=>t.type==='landmass'?a.landmasses.find(l=>l.id===t.id):a.features.find(f=>f.id===t.id);
  function commit(label:string,next:ArchipelagoParams,done?:string){
    try{parseArchipelago(structuredClone(next),{width,length});}catch(e){env.status(String(e instanceof Error?e.message:e),true);preview=null;env.redraw();return;}
    void s.change(label,[],d=>setArchipelago(d,next)).then(()=>{preview=null;env.status(done??label+' · une opération dans l’historique.');env.refreshPanel();env.redraw();}).catch(e=>{preview=null;env.status(String(e instanceof Error?e.message:e),true);env.redraw();});
  }
  function pointsOf(a:ArchipelagoParams,t:Target):PointXZ[]|null{
    const v=find(a,t);if(!v)return null;if(t.type==='landmass')return (v as Landmass).outline;
    const f=v as ReliefFeature;return f.kind==='plateau'?f.polygon:f.kind==='ridge'||f.kind==='valley'?f.points:null;
  }
  function handles(a:ArchipelagoParams):Handle[]{
    const out:Handle[]=[];
    for(const l of a.landmasses)l.outline.forEach((q,i)=>out.push({type:'landmass',id:l.id,vertex:i,x:q.x,z:q.z}));
    for(const f of a.features){
      if(f.kind==='plateau')f.polygon.forEach((q,i)=>out.push({type:'feature',id:f.id,vertex:i,x:q.x,z:q.z}));
      else if(f.kind==='ridge'||f.kind==='valley')f.points.forEach((q,i)=>out.push({type:'feature',id:f.id,vertex:i,x:q.x,z:q.z}));
      else out.push({type:'feature',id:f.id,vertex:null,x:f.x,z:f.z});
    }
    return out;
  }
  function hit(sx:number,sy:number):Handle|null{
    const a=current();if(!a)return null;let best:Handle|null=null,bd=10;
    for(const h of handles(a)){const q=env.toScreen(h.x,h.z),d=Math.hypot(q.x-sx,q.y-sy)-(selected&&h.id===selected.id?2:0);if(d<bd){bd=d;best=h;}}
    return best;
  }
  /** Nearest edge of the selected outline/line (for vertex insertion). */
  function edgeAt(q:PointXZ):{t:Target;index:number}|null{
    const a=current();if(!a||!selected)return null;const pts=pointsOf(a,selected);if(!pts)return null;const closed=selected.type==='landmass'||(find(a,selected) as ReliefFeature).kind==='plateau';
    let best=-1,bd=14/env.scale();const n=closed?pts.length:pts.length-1;
    for(let i=0;i<n;i++){const u=pts[i],v=pts[(i+1)%pts.length],dx=v.x-u.x,dz=v.z-u.z,t=Math.max(0,Math.min(1,((q.x-u.x)*dx+(q.z-u.z)*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(q.x-u.x-t*dx,q.z-u.z-t*dz);if(d<bd){bd=d;best=i;}}
    return best<0?null:{t:selected,index:best+1};
  }
  function moved(base:ArchipelagoParams,h:Handle,dx:number,dz:number):ArchipelagoParams{
    const next=structuredClone(base),v=find(next,h);if(!v)return next;
    if(h.vertex!==null){const pts=pointsOf(next,h)!;pts[h.vertex]=clampPoint({x:pts[h.vertex].x+dx,z:pts[h.vertex].z+dz});}
    else{const f=v as {x:number;z:number};const q=clampPoint({x:f.x+dx,z:f.z+dz});f.x=q.x;f.z=q.z;}
    return next;
  }
  function uniqueId(a:ArchipelagoParams,kind:string){const ids=new Set([...a.landmasses.map(l=>l.id),...a.features.map(f=>f.id)]);let i=1;while(ids.has(kind+'-'+i))i++;return kind+'-'+i;}
  function addAt(kind:string,q:PointXZ){
    const a=current();if(!a)return;const next=structuredClone(a),s0=Math.min(width,length),r=(v:number)=>Math.round(v),c=clampPoint(q);
    if(kind==='islet'){if(next.landmasses.length>=ARCHIPELAGO_LIMITS.landmasses){env.status('12 terres au maximum.',true);return;}const id=uniqueId(next,'islet');next.landmasses.push({id,name:'Îlot '+(next.landmasses.length),outline:blobOutline(c.x,c.z,s0*.06,s0*.045,12,next.landmasses.length).map(clampPoint),coastNoiseM:r(s0*.015),coastWavelengthM:r(s0*.08),beachWidthM:20,shoreHeightM:3,lowlandHeightM:8,hillHeightM:6,cliffs:.4});selected={type:'landmass',id};}
    else{
      if(next.features.length>=ARCHIPELAGO_LIMITS.features){env.status('64 formes au maximum.',true);return;}
      const id=uniqueId(next,kind),line=(dx:number)=>[clampPoint({x:c.x-dx,z:c.z-dx*.4}),c,clampPoint({x:c.x+dx,z:c.z+dx*.4})];
      const f:ReliefFeature=kind==='volcano'?{id,kind,x:c.x,z:c.z,radiusM:r(s0*.15),heightM:r(s0*.08),craterRadiusM:r(s0*.02),craterDepthM:r(s0*.01)}
        :kind==='mountain'?{id,kind,x:c.x,z:c.z,radiusM:r(s0*.12),heightM:r(s0*.05),roughness:.5}:kind==='hill'?{id,kind,x:c.x,z:c.z,radiusM:r(s0*.06),heightM:r(s0*.012),roughness:.3}
        :kind==='basin'?{id,kind,x:c.x,z:c.z,radiusM:r(s0*.04),depthM:4}:kind==='plateau'?{id,kind,polygon:blobOutline(c.x,c.z,s0*.07,s0*.05,8,1).map(clampPoint),heightM:r(s0*.012),edgeM:r(s0*.02)}
        :kind==='ridge'?{id,kind,points:line(s0*.1),widthM:r(s0*.05),heightM:r(s0*.025)}:{id,kind:'valley',points:line(s0*.1),widthM:r(s0*.05),depthM:r(s0*.012)};
      next.features.push(f);selected={type:'feature',id};
    }
    adding=null;commit('Ajouter : '+(ADDABLE.find(k=>k[0]===kind)?.[1]??kind),next);
  }
  function remove(){
    const a=current();if(!a||!selected)return;const next=structuredClone(a),pts=pointsOf(next,selected);
    if(vertex!==null&&pts){const closed=selected.type==='landmass'||(find(next,selected) as ReliefFeature).kind==='plateau';if(pts.length<=(closed?3:2)){env.status('Nombre minimal de points atteint.',true);return;}pts.splice(vertex,1);vertex=null;commit('Retirer un point',next);return;}
    if(selected.type==='landmass'){if(next.landmasses.length<=1){env.status('Il faut au moins une terre.',true);return;}next.landmasses=next.landmasses.filter(l=>l.id!==selected!.id);}
    else next.features=next.features.filter(f=>f.id!==selected!.id);
    selected=null;commit('Supprimer une forme',next);
  }
  return {
    get active(){return !!current();},
    get selection(){return selected;},
    draw(g:CanvasRenderingContext2D){
      const a=shown();if(!a)return;g.save();
      const path=(pts:PointXZ[],close:boolean)=>{g.beginPath();pts.forEach((q,i)=>{const v=env.toScreen(q.x,q.z);if(i)g.lineTo(v.x,v.y);else g.moveTo(v.x,v.y);});if(close)g.closePath();};
      for(const l of a.landmasses){const on=selected?.id===l.id;g.strokeStyle=on?'#c0562e':'#2f4b3bcc';g.lineWidth=on?2.5:1.5;g.setLineDash(on?[]:[6,4]);path(l.outline,true);g.stroke();}
      g.setLineDash([]);
      for(const f of a.features){
        const on=selected?.id===f.id;g.strokeStyle=on?'#c0562e':f.kind==='valley'||f.kind==='basin'?'#2f7fb8':'#6b4a2b';g.lineWidth=on?2.5:1.5;
        if(f.kind==='plateau')path(f.polygon,true);else if(f.kind==='ridge'||f.kind==='valley')path(f.points,false);
        else{const c=env.toScreen(f.x,f.z);g.beginPath();g.arc(c.x,c.y,f.radiusM*env.scale(),0,Math.PI*2);if(f.kind==='volcano'){g.moveTo(c.x+f.craterRadiusM*env.scale(),c.y);g.arc(c.x,c.y,f.craterRadiusM*env.scale(),0,Math.PI*2);}}
        g.stroke();
        const label=env.toScreen(...(('x' in f)?[f.x,f.z]:[(f.kind==='plateau'?f.polygon:f.points)[0].x,(f.kind==='plateau'?f.polygon:f.points)[0].z]) as [number,number]);
        g.fillStyle='#1f2f27';g.font='11px system-ui';g.fillText(FEATURE_LABELS[f.kind],label.x+8,label.y-8);
      }
      for(const h of handles(a)){const q=env.toScreen(h.x,h.z),on=selected?.id===h.id,sel=on&&vertex===h.vertex;g.fillStyle=sel?'#c0562e':on?'#fff4e8':'#ffffff';g.strokeStyle=on?'#c0562e':'#2f4b3b';g.lineWidth=1.5;
        if(h.vertex===null){g.beginPath();g.arc(q.x,q.y,6,0,Math.PI*2);g.fill();g.stroke();}else{g.fillRect(q.x-3.5,q.y-3.5,7,7);g.strokeRect(q.x-3.5,q.y-3.5,7,7);}}
      g.restore();
    },
    pointerDown(sx:number,sy:number,q:PointXZ):boolean{
      const a=current();if(!a)return false;
      if(adding){addAt(adding,q);return true;}
      const h=hit(sx,sy);if(!h){if(selected){selected=null;vertex=null;variation=null;env.refreshPanel();env.redraw();}return false;}
      if(selected?.id!==h.id)variation=null;selected={type:h.type,id:h.id};vertex=h.vertex;drag={handle:h,start:q,base:structuredClone(a),moved:false};env.refreshPanel();env.redraw();return true;
    },
    pointerMove(q:PointXZ):boolean{
      if(!drag)return false;const dx=q.x-drag.start.x,dz=q.z-drag.start.z;if(Math.hypot(dx,dz)*env.scale()>3)drag.moved=true;
      if(drag.moved){preview=moved(drag.base,drag.handle,dx,dz);env.redraw();}return true;
    },
    pointerUp():boolean{
      if(!drag)return false;const d=drag;drag=null;
      if(d.moved&&preview)commit(d.handle.vertex===null?'Déplacer une forme':'Modifier un contour',preview);
      return true;
    },
    dblclick(q:PointXZ):boolean{
      const a=current(),e=edgeAt(q);if(!a||!e)return false;const next=structuredClone(a),pts=pointsOf(next,e.t)!;
      if(pts.length>=(e.t.type==='landmass'?ARCHIPELAGO_LIMITS.outline:ARCHIPELAGO_LIMITS.line)){env.status('Nombre maximal de points atteint.',true);return true;}
      pts.splice(e.index,0,clampPoint(q));vertex=e.index;commit('Ajouter un point',next);return true;
    },
    key(e:KeyboardEvent):boolean{
      if((e.key==='Delete'||e.key==='Backspace')&&selected){remove();return true;}
      if(e.key==='Escape'&&(drag||adding||selected||preview)){drag=null;adding=null;preview=null;selected=null;vertex=null;variation=null;env.refreshPanel();env.redraw();return true;}
      return false;
    },
    panel():HTMLElement{
      const box=node('div','','shape-panel'),a=current();
      if(!a){
        const t=p.world.terrain;box.append(node('p',t?.kind==='island'?'Ce monde utilise le générateur « île unique ». Convertissez-le en archipel pour éditer ses contours et ses formes (même volcan, côte approchée).':'La vallée historique n’a pas de formes paramétriques. Vous pouvez la remplacer par un archipel : vos retouches restent conservées mais le relief de base change.','muted'));
        box.append(button(t?.kind==='island'?'Convertir en archipel éditable':'Remplacer par un archipel',()=>{const next=t?.kind==='island'?islandToArchipelago((t as Extract<typeof t,{kind:'island'}>).island,width,length):archipelagoPreset(width,length);if(t?.kind!=='island'&&!confirm('Remplacer le relief de base par un archipel ? (annulable avec Ctrl+Z)'))return;commit('Convertir en archipel',next,'Relief converti : formes éditables sur la carte.');},'primary-button'));
        return box;
      }
      box.append(node('p',adding?'Cliquez sur la carte pour placer : '+(ADDABLE.find(k=>k[0]===adding)?.[1]):'Glisser une poignée : déplacer · double-clic sur un contour : ajouter un point · Suppr : retirer.','muted'));
      const add=node('div','','chip-row');for(const [kind,label]of ADDABLE){const c=button('+ '+label,()=>{adding=adding===kind?null:kind;env.refreshPanel();},'chip'+(adding===kind?' active':''));c.dataset.add=kind;add.append(c);}box.append(add);
      const target=selected&&find(a,selected);
      if(selected&&target){
        const isLand=selected.type==='landmass',kind=isLand?'landmass':(target as ReliefFeature).kind,fields=isLand?LAND_FIELDS:FEATURE_FIELDS[kind as FeatureKind];
        const card=node('div','','section-card shape-card');card.append(node('strong',isLand?(target as Landmass).name:FEATURE_LABELS[kind as FeatureKind]),node('div',selected.id,'muted'));
        if(isLand){const name=node('input');name.value=(target as Landmass).name;name.onchange=()=>{const next=structuredClone(a);(find(next,selected!) as Landmass).name=name.value.trim()||'Terre';commit('Renommer une terre',next);};card.append(field('Nom',name));}
        for(const [key,label,min,max,step]of fields){
          const value=(target as unknown as Record<string,number>)[key],range=node('input'),out=node('span',String(value),'range-value');range.type='range';range.min=String(min);range.max=String(max);range.step=String(step);range.value=String(value);
          range.oninput=()=>{out.textContent=range.value;};range.onchange=()=>{const next=structuredClone(a);(find(next,selected!) as unknown as Record<string,number>)[key]=Number(range.value);commit('Régler : '+label.replace(/ \(.*/,''),next);};
          const l=node('label',label);l.append(range,out);card.append(l);
        }
        if(VARIABLE.has(kind))card.append(button('Varier (aperçu)',()=>{const v=((target as {variant?:number}).variant??0)+1+Math.floor(Math.random()*997);const next=structuredClone(a);(find(next,selected!) as {variant?:number}).variant=v;variation={target:selected!,candidate:next,variant:v};env.refreshPanel();}));
        if(variation&&variation.target.id===selected.id){
          const rect=isLand?landmassBounds(target as Landmass,40):featureBounds(target as ReliefFeature),pad=40,r={minX:rect.minX-pad,maxX:rect.maxX+pad,minZ:rect.minZ-pad,maxZ:rect.maxZ+pad};
          const pair=node('div','','thumb-pair'),before=node('figure'),after=node('figure');before.append(reliefThumbnail(a,world(),r),node('figcaption','Actuel'));after.append(reliefThumbnail(variation.candidate,world(),r),node('figcaption','Variante '+variation.variant));pair.append(before,after);
          card.append(pair,button('Appliquer cette variante',()=>{const v=variation!;variation=null;commit('Varier une forme',v.candidate);},'primary-button'),button('Annuler l’aperçu',()=>{variation=null;env.refreshPanel();}));
        }
        card.append(button(vertex!==null?'Retirer ce point':'Supprimer cette forme',remove));box.append(card);
      }
      const presets=node('details','','presets');presets.append(node('summary','Presets de relief'));
      for(const [id,label,params]of presetsFor(width,length)){const b2=button(label,()=>{pending={label,params};env.refreshPanel();});b2.dataset.preset=id;presets.append(b2);}
      const file=node('input');file.type='file';file.accept='application/json,.json';file.className='hide';
      file.onchange=()=>{const f=file.files?.[0];if(!f)return;void f.text().then(text=>{const data=JSON.parse(text);if(data?.format!=='little-world-relief-preset'||data.version!==1)throw Error('Fichier de preset de relief inconnu');pending={label:'Preset importé',params:parseArchipelago(data.archipelago,{width,length})};env.refreshPanel();}).catch(e=>env.status(String(e instanceof Error?e.message:e),true));};
      presets.append(button('Exporter le relief (preset JSON)',()=>download('relief-preset.json',JSON.stringify({format:'little-world-relief-preset',version:1,archipelago:a},null,1),'application/json')),button('Importer un preset…',()=>file.click()),file);
      if(pending){presets.open=true;const card=node('div','','section-card');card.append(node('strong','Aperçu : '+pending.label),reliefThumbnail(pending.params,world(),b,150),node('p','Remplace le relief de base. Vos retouches, masques et contenus sont conservés ; une seule opération annulable.','muted'),
        button('Appliquer ce relief',()=>{const v=pending!;pending=null;selected=null;commit('Appliquer un preset de relief',v.params);},'primary-button'),button('Annuler',()=>{pending=null;env.refreshPanel();}));presets.append(card);}
      const general=node('details');general.append(node('summary','Réglages généraux'));
      for(const [key,label,min,max,step]of [['seabedDepthM','Profondeur du fond marin (m)',2,200,1],['detailM','Détail local (m)',0,20,.5]] as Field[]){const range=node('input'),out=node('span',String((a as unknown as Record<string,number>)[key]),'range-value');range.type='range';range.min=String(min);range.max=String(max);range.step=String(step);range.value=String((a as unknown as Record<string,number>)[key]);range.oninput=()=>{out.textContent=range.value;};range.onchange=()=>{const next=structuredClone(a);(next as unknown as Record<string,number>)[key]=Number(range.value);commit('Régler : '+label.replace(/ \(.*/,''),next);};const l=node('label',label);l.append(range,out);general.append(l);}
      box.append(presets,general);
      return box;
    },
    cancel(){drag=null;preview=null;adding=null;},
  };
}
export type ShapeTool=ReturnType<typeof createShapeTool>;
