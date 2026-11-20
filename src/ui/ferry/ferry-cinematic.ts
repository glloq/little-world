/** A lightweight crossing scene shared by departure, arrival and the Studio preview. */
function ferryScene(label:string,islandId:string|undefined,arriving:boolean){
  const root=document.createElement('div');
  root.className='ui-ferry-cinematic'+(arriving?' ui-ferry-arrival':'');
  if(islandId)root.dataset.island=islandId;
  root.setAttribute('role',arriving?'status':'dialog');
  if(arriving)root.setAttribute('aria-live','polite');
  else{
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','Traversée maritime');
  }
  const stage=document.createElement('div');stage.className='ui-ferry-stage';
  const scenery=document.createElement('div');scenery.className='ui-ferry-scenery';
  scenery.setAttribute('aria-hidden','true');
  const coast=document.createElement('span');coast.className='ui-ferry-coast';
  const waves=document.createElement('span');waves.className='ui-ferry-waves';
  const ship=document.createElement('div');ship.className='ui-ferry-ship';
  const sail=document.createElement('span');sail.className='ui-ferry-sail';ship.append(sail);
  const boat=document.createElement('div');boat.className='ui-ferry-rowboat';
  const rower=document.createElement('span');rower.className='ui-ferry-rameur';boat.append(rower);
  scenery.append(coast,waves,ship,boat);
  const caption=document.createElement('p');caption.className='ui-ferry-caption';caption.textContent=label;
  stage.append(scenery,caption);root.append(stage);document.body.append(root);
  return root;
}

export function showFerryCinematic(label:string,islandId?:string):Promise<void>{
  const root=ferryScene(label,islandId,false);
  return new Promise(resolve=>{
    window.setTimeout(()=>{root.remove();resolve();},2600);
  });
}

/** The arrival stays above the destination until its first playable frame. */
export function holdFerryArrival(label:string,islandId?:string):{finish():void;dispose():void}{
  const root=ferryScene(label,islandId,true);
  return {
    finish(){root.classList.add('ui-ferry-arrival-done');window.setTimeout(()=>root.remove(),300);},
    dispose(){root.remove();}
  };
}
