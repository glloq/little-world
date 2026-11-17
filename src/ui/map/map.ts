/** World map (M). A light 2D raster of the existing relief/water functions, computed once and
 * progressively (a few ms per frame, never a second Three.js scene or a duplicated world), then
 * cached. Zoom (wheel, + / −), pan (drag, arrows), general / local views, player position and
 * heading, markers (mines, plots, inhabitants, active missions). « Visited » marks are session
 * interface state: no save contract stores discoveries yet, so nothing is persisted. */
import {el,button} from '../shared/dom.ts';
import type {WaypointStore} from './waypoints.ts';

export interface MapMarker {id:string;kind:'mine'|'farm'|'npc'|'quest'|'poi'|'waypoint';label:string;x:number;z:number;active?:boolean}
export interface MapDeps {bounds:{minX:number;maxX:number;minZ:number;maxZ:number};height(x:number,z:number):number;water(x:number,z:number):number|null;seaLevel:number;markers():MapMarker[];player():{x:number;z:number;yaw:number}}
/** Raster of the world (z grows downwards, north = −Z at the top), filled row by row. */
export function createMapRaster(deps:Pick<MapDeps,'bounds'|'height'|'water'|'seaLevel'>,maxSide=256){
  const b=deps.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,scale=maxSide/Math.max(w,d),width=Math.max(8,Math.round(w*scale)),height=Math.max(8,Math.round(d*scale)),data=new Uint8ClampedArray(width*height*4),reliefData=new Uint8ClampedArray(width*height*4);
  let row=0;const heights=new Float32Array(width*2);
  const sample=(i:number,j:number)=>{const x=b.minX+(i+.5)/width*w,z=b.minZ+(j+.5)/height*d;return {x,z,h:deps.height(x,z)};};
  return {width,height,data,reliefData,get done(){return row>=height;},get progress(){return row/height;},
    /** Compute rows until the budget is spent; returns true when the raster is complete. */
    step(budgetMs:number){const t0=performance.now(),startRow=row;
      // At least one row per call (progress is guaranteed), then as many as the budget allows.
      while(row<height&&(performance.now()-t0<budgetMs||row===startRow)){
        for(let i=0;i<width;i++){const {x,z,h}=sample(i,row),wl=deps.water(x,z),o=(row*width+i)*4,prev=row?heights[(row-1)%2*width+i]:h;heights[row%2*width+i]=h;
          if(wl!==null&&wl>h+.05){const depth=Math.min(1,(wl-h)/8);data[o]=110-50*depth;data[o+1]=172-50*depth;data[o+2]=196-30*depth;}
          else{const e=Math.max(0,Math.min(1,(h-deps.seaLevel)/120)),shade=Math.max(-.2,Math.min(.2,(prev-h)*.08));const lo=e<.5?e*2:1,hi=e<.5?0:(e-.5)*2,r=146+44*lo+18*hi,g=184-12*lo+20*hi,bl=118+14*lo+60*hi;data[o]=r*(1+shade);data[o+1]=g*(1+shade);data[o+2]=bl*(1+shade);}
          data[o+3]=255;
          // The elevation map reuses the terrain sample: no extra terrain pass.
          const level=Math.max(0,Math.min(1,(h-deps.seaLevel+35)/180)),slope=Math.max(-.15,Math.min(.15,(prev-h)*.025));
          const contour=Math.abs((h-deps.seaLevel)%20)<1.3?.78:1;
          const grey=Math.round((55+190*Math.max(0,Math.min(1,level+slope)))*contour);
          reliefData[o]=grey;reliefData[o+1]=Math.min(255,grey+10);reliefData[o+2]=Math.min(255,grey+5);reliefData[o+3]=255;}
        row++;}
      return row>=height;}};
}
export type MapRaster=ReturnType<typeof createMapRaster>;

const COLORS:Record<MapMarker['kind'],string>={mine:'#7a4f2e',farm:'#c9952f',npc:'#3b6fa0',quest:'#c4472f',poi:'#46745c',waypoint:'#a24f76'};
const ICONS:Record<MapMarker['kind'],string>={mine:'⛏',farm:'✿',npc:'●',quest:'!',poi:'⌂',waypoint:'◆'};
const FILTERS:[MapMarker['kind'],string][]=[['quest','Missions'],['waypoint','Repères'],['poi','Lieux'],['mine','Mines'],['farm','Parcelles'],['npc','Habitants']];
/** The exact same raster object can be used simultaneously by map and minimap. */
export function mapPanel(deps:MapDeps,raster:MapRaster=createMapRaster(deps),waypoints?:WaypointStore){
  let frame=0,canvas:HTMLCanvasElement|null=null,ppm=0,cx=0,cz=0,visited=new Set<string>();
  let image:HTMLCanvasElement|null=null,reliefImage:HTMLCanvasElement|null=null,addMode=false,reliefMode=false,sidebarOpen=false;
  let focusTarget:{x:number;z:number;label:string}|null=null,resizeObserver:ResizeObserver|null=null;
  const enabled=new Set<MapMarker['kind']>(FILTERS.map(([kind])=>kind));
  const b=deps.bounds;
  const fit=()=>{if(!canvas)return;ppm=Math.min(canvas.width/(b.maxX-b.minX),canvas.height/(b.maxZ-b.minZ))*.95;cx=(b.minX+b.maxX)/2;cz=(b.minZ+b.maxZ)/2;};
  const local=()=>{if(!canvas)return;const p=deps.player();ppm=Math.min(canvas.width,canvas.height)/310;cx=p.x;cz=p.z;};
  const toScreen=(x:number,z:number)=>({x:(x-cx)*ppm+canvas!.width/2,y:(z-cz)*ppm+canvas!.height/2});
  const fromScreen=(x:number,y:number)=>({x:cx+(x-canvas!.width/2)/ppm,z:cz+(y-canvas!.height/2)/ppm});
  const visibleMarkers=()=>deps.markers().filter(m=>enabled.has(m.kind));
  const distance=(x:number,z:number)=>{const p=deps.player();return Math.round(Math.hypot(x-p.x,z-p.z))+' m';};
  let details:HTMLElement|null=null,form:HTMLElement|null=null,pointList:HTMLElement|null=null;
  function draw(){
    if(!canvas)return;const g=canvas.getContext('2d');if(!g)return;
    g.fillStyle='#bcd8dc';g.fillRect(0,0,canvas.width,canvas.height);
    if(raster.done){
      image??=document.createElement('canvas');
      if(image.width!==raster.width||image.height!==raster.height){image.width=raster.width;image.height=raster.height;}
      if(!image.dataset.ready){image.getContext('2d')?.putImageData(new ImageData(raster.data,raster.width,raster.height),0,0);image.dataset.ready='1';}
      reliefImage??=document.createElement('canvas');
      if(reliefImage.width!==raster.width||reliefImage.height!==raster.height){reliefImage.width=raster.width;reliefImage.height=raster.height;}
      if(!reliefImage.dataset.ready){reliefImage.getContext('2d')?.putImageData(new ImageData(raster.reliefData,raster.width,raster.height),0,0);reliefImage.dataset.ready='1';}
      const a=toScreen(b.minX,b.minZ),c=toScreen(b.maxX,b.maxZ);
      g.imageSmoothingEnabled=true;g.drawImage(reliefMode?reliefImage:image,a.x,a.y,c.x-a.x,c.y-a.y);
    }
    const p=deps.player(),markers=visibleMarkers(),active=markers.find(m=>m.active);
    if(active){const a=toScreen(active.x,active.z),s=toScreen(p.x,p.z);g.save();g.strokeStyle='#b34e79';g.lineWidth=2;g.setLineDash([6,5]);g.beginPath();g.moveTo(s.x,s.y);g.lineTo(a.x,a.y);g.stroke();g.restore();}
    for(const m of markers){
      if(Math.hypot(m.x-p.x,m.z-p.z)<35)visited.add(m.id);
      const s=toScreen(m.x,m.z);if(s.x<-20||s.y<-20||s.x>canvas.width+20||s.y>canvas.height+20)continue;
      g.fillStyle=COLORS[m.kind];g.globalAlpha=visited.has(m.id)||m.kind==='quest'||m.kind==='waypoint'?1:.8;
      g.beginPath();g.arc(s.x,s.y,m.active?10:m.kind==='npc'?5:8,0,Math.PI*2);g.fill();g.globalAlpha=1;
      g.fillStyle='#fff';g.font='bold 10px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(ICONS[m.kind],s.x,s.y+.5);
      if(ppm>.5||m.kind==='quest'||m.active){g.fillStyle='#22382e';g.font='11px system-ui';g.fillText(m.label+(visited.has(m.id)?' ✓':''),s.x,s.y-15);}
    }
    if(focusTarget){const q=toScreen(focusTarget.x,focusTarget.z);g.save();g.strokeStyle='#ec572f';g.lineWidth=3;g.beginPath();g.arc(q.x,q.y,14,0,Math.PI*2);g.stroke();g.fillStyle='#402d20';g.font='bold 13px system-ui';g.textAlign='center';g.fillText(focusTarget.label,q.x,q.y-20);g.restore();}
    const s=toScreen(p.x,p.z);g.save();g.translate(s.x,s.y);g.rotate(Math.PI-p.yaw);
    g.fillStyle='#ffffff';g.strokeStyle='#1f5f4b';g.lineWidth=2.5;
    g.beginPath();g.moveTo(0,-11);g.lineTo(8,9);g.lineTo(0,4);g.lineTo(-8,9);g.closePath();g.fill();g.stroke();g.restore();
    canvas.dataset.player=`${Math.round(p.x)},${Math.round(p.z)}`;canvas.dataset.progress=raster.done?'1':raster.progress.toFixed(2);
    canvas.dataset.markers=String(markers.length);canvas.dataset.visited=String(visited.size);
  }
  function loop(){frame=0;if(!canvas?.isConnected)return;const done=raster.step(6);draw();if(!done)frame=requestAnimationFrame(loop);}
  function renderPointList(){
    if(!pointList||!details)return;
    pointList.replaceChildren();
    const all=visibleMarkers().filter(m=>m.kind!=='npc').sort((a,c)=>Number(!!c.active)-Number(!!a.active)||Math.hypot(a.x-deps.player().x,a.z-deps.player().z)-Math.hypot(c.x-deps.player().x,c.z-deps.player().z));
    for(const m of all.slice(0,80)){
      const row=el('div','ui-map-entry'),name=el('span','',`${ICONS[m.kind]} ${m.label} · ${distance(m.x,m.z)}`);
      const follow=button(m.active?'Ne plus suivre':'Viser',()=>{
        if(m.kind==='waypoint'){waypoints?.activate(m.active?null:m.id);}
        else if(waypoints){const selected=waypoints.add(m.label,m.x,m.z);if(!selected){details!.textContent='Limite de repères atteinte : 24.';return;}}
        draw();renderPointList();
      },'ui-button',m.active?'Désactiver ce repère':'Choisir cette destination');
      row.append(name,follow);
      if(m.kind==='waypoint')row.append(button('×',()=>{waypoints?.remove(m.id);draw();renderPointList();},'ui-button','Supprimer le repère'));
      pointList.append(row);
    }
    if(!all.length)pointList.append(el('p','ui-empty','Aucun lieu affiché pour ces filtres.'));
    const goal=waypoints?.active;details.textContent=goal?`Destination : ${goal.label} · ${distance(goal.x,goal.z)}`:'Aucune destination sélectionnée.';
  }
  function markAt(pos:{x:number;z:number}){
    if(!form)return;
    form.replaceChildren();const text=el('p','ui-muted',`Nouveau repère · X ${pos.x.toFixed(0)}, Z ${pos.z.toFixed(0)}`);
    const label=el('input');label.type='text';label.maxLength=48;label.value='Mon repère';label.setAttribute('aria-label','Nom du repère');
    const confirm=button('Enregistrer',()=>{
      const created=waypoints?.add(label.value,pos.x,pos.z);
      if(created){form?.replaceChildren();addMode=false;draw();renderPointList();}
      else form?.append(el('p','ui-alert','Nom invalide ou 24 repères déjà enregistrés.'));
    },'ui-button ui-primary');
    const cancel=button('Annuler',()=>{addMode=false;form?.replaceChildren();});
    form.append(text,label,confirm,cancel);label.focus();
  }
  return {
    render(body:HTMLElement){
      body.replaceChildren();const view=el('canvas','ui-map-canvas');canvas=view;canvas.setAttribute('aria-label','Carte du monde');canvas.tabIndex=0;
      canvas.width=Math.max(320,Math.round(window.innerWidth*.93));canvas.height=Math.max(240,Math.round(window.innerHeight*.78));fit();if(focusTarget){cx=focusTarget.x;cz=focusTarget.z;}
      const zoom=(f:number,ax=view.width/2,ay=view.height/2)=>{const wx=(ax-canvas!.width/2)/ppm+cx,wz=(ay-canvas!.height/2)/ppm+cz;ppm=Math.min(16,Math.max(.02,ppm*f));cx=wx-(ax-canvas!.width/2)/ppm;cz=wz-(ay-canvas!.height/2)/ppm;draw();};
      canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas!.getBoundingClientRect();zoom(e.deltaY<0?1.25:.8,(e.clientX-rect.left)*canvas!.width/rect.width,(e.clientY-rect.top)*canvas!.height/rect.height);},{passive:false});
      let drag:{x:number;y:number;distance:number}|null=null;
      const localPointer=(e:PointerEvent)=>{const r=canvas!.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas!.width/r.width,y:(e.clientY-r.top)*canvas!.height/r.height};};
      canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,distance:0};canvas!.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.distance+=Math.hypot(dx,dy);
        if(drag.distance>4&&!addMode){const k=canvas!.width/canvas!.getBoundingClientRect().width;cx-=dx*k/ppm;cz-=dy*k/ppm;draw();}
        drag.x=e.clientX;drag.y=e.clientY;
      });
      canvas.addEventListener('pointerup',e=>{if(drag&&drag.distance<5){const pos=localPointer(e);if(addMode){const world=fromScreen(pos.x,pos.y);markAt(world);}
        else{const near=visibleMarkers().map(m=>({m,d:Math.hypot(toScreen(m.x,m.z).x-pos.x,toScreen(m.x,m.z).y-pos.y)})).filter(v=>v.d<13).sort((a,b)=>a.d-b.d)[0];if(near){details!.textContent=near.m.label+' · '+distance(near.m.x,near.m.z);}}}
        drag=null;});
      canvas.addEventListener('pointercancel',()=>{drag=null;});
      canvas.addEventListener('keydown',e=>{const step=60/ppm;if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='ArrowLeft')cx-=step;else if(e.key==='ArrowRight')cx+=step;else if(e.key==='ArrowUp')cz-=step;else if(e.key==='ArrowDown')cz+=step;else if(e.key==='0')fit();else return;e.preventDefault();e.stopPropagation();draw();});
      const layout=el('div','ui-map-layout'),main=el('div','ui-map-main'),side=el('aside','ui-map-sidebar');
      const tools=el('div','ui-row ui-map-tools');
      const mapTool=(symbol:string,name:string,handler:()=>void)=>button(symbol,handler,'ui-button ui-map-tool',name);
      tools.append(mapTool('⤢','Vue générale',()=>{focusTarget=null;fit();draw();}),mapTool('◎','Autour de moi',()=>{focusTarget=null;local();draw();}),mapTool('+','Zoomer',()=>zoom(1.25)),mapTool('−','Dézoomer',()=>zoom(.8)));
      if(waypoints)tools.append(mapTool('⌖','Placer un repère',()=>{addMode=true;form?.replaceChildren(el('p','ui-muted','Cliquez sur la carte pour placer un repère.'));}));
      const reliefToggle=mapTool('▥','Afficher les dénivelés',()=>{reliefMode=!reliefMode;reliefToggle.setAttribute('aria-pressed',String(reliefMode));reliefToggle.setAttribute('aria-label',reliefMode?'Afficher la carte normale':'Afficher les dénivelés');draw();});
      reliefToggle.setAttribute('aria-pressed',String(reliefMode));tools.append(reliefToggle);
      const settingsToggle=mapTool('☷','Options de carte',()=>{sidebarOpen=!sidebarOpen;layout.classList.toggle('ui-map-options-open',sidebarOpen);settingsToggle.setAttribute('aria-expanded',String(sidebarOpen));});
      settingsToggle.setAttribute('aria-expanded',String(sidebarOpen));tools.append(settingsToggle);
      const filters=el('div','ui-map-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Éléments visibles sur la carte');
      for(const [kind,name] of FILTERS){const l=el('label','ui-map-filter'),input=el('input'),symbol=el('span','ui-map-filter-symbol',ICONS[kind]);
        input.type='checkbox';input.checked=enabled.has(kind);input.setAttribute('aria-label',name);l.title=name;
        input.onchange=()=>{if(input.checked)enabled.add(kind);else enabled.delete(kind);draw();renderPointList();};
        l.append(input,symbol);filters.append(l);}
      form=el('div','ui-row ui-map-form');details=el('p','ui-map-target');pointList=el('div','ui-map-points');
      const legend=el('p','ui-muted ui-map-help','Glisser : déplacer · Molette : zoom · Clic : lieu');
      side.append(el('h3','ui-group','Affichage'),filters,details,el('h3','ui-group','Lieux et repères'),pointList,legend);
      main.append(tools,form,view);layout.append(main,side);layout.classList.toggle('ui-map-options-open',sidebarOpen);body.append(layout);
      resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{if(!canvas?.isConnected)return;const rect=canvas.getBoundingClientRect();if(rect.width<100||rect.height<100)return;
        const w=Math.round(rect.width),h=Math.round(rect.height);if(canvas.width===w&&canvas.height===h)return;
        const ratio=w/Math.max(1,canvas.width);canvas.width=w;canvas.height=h;ppm*=ratio;draw();});
      resizeObserver.observe(view);
      renderPointList();cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);
    },
    close(){cancelAnimationFrame(frame);resizeObserver?.disconnect();resizeObserver=null;frame=0;canvas=null;form=null;details=null;pointList=null;addMode=false;focusTarget=null;},
    focus(x:number,z:number,label:string){focusTarget={x,z,label};if(canvas){cx=x;cz=z;draw();}},
    get raster(){return raster;},
  };
}
