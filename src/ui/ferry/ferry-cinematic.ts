/** Standalone lightweight HTML/CSS cinematic; source world remains untouched during preview. */
export function showFerryCinematic(label:string):Promise<void>{
  return new Promise(resolve=>{
    const root=document.createElement('div');root.className='ui-ferry-cinematic';
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Traversée maritime');
    const content=document.createElement('div');content.className='ui-ferry-stage';
    const big=document.createElement('div');big.className='ui-ferry-ship';
    const sail=document.createElement('span');sail.className='ui-ferry-sail';big.append(sail);
    const boat=document.createElement('div');boat.className='ui-ferry-rowboat';
    const ferryman=document.createElement('span');ferryman.className='ui-ferry-rameur';boat.append(ferryman);
    const caption=document.createElement('p');caption.className='ui-ferry-caption';caption.textContent=label;
    content.append(big,boat,caption);root.append(content);document.body.append(root);
    window.setTimeout(()=>{root.remove();resolve();},2600);
  });
}

/** Kept above the target world bootstrap until its first playable frame.
 * The original WebGL scene has been released by page navigation, so no double-world VRAM. */
export function holdFerryArrival(label:string):{finish():void;dispose():void}{
  const root=document.createElement('div');root.className='ui-ferry-cinematic ui-ferry-arrival';
  root.setAttribute('role','status');root.setAttribute('aria-live','polite');
  const stage=document.createElement('div');stage.className='ui-ferry-stage';
  const ship=document.createElement('div');ship.className='ui-ferry-ship';
  const sail=document.createElement('span');sail.className='ui-ferry-sail';ship.append(sail);
  const boat=document.createElement('div');boat.className='ui-ferry-rowboat';
  const rower=document.createElement('span');rower.className='ui-ferry-rameur';boat.append(rower);
  const caption=document.createElement('p');caption.className='ui-ferry-caption';caption.textContent=label;
  stage.append(ship,boat,caption);root.append(stage);document.body.append(root);
  return {
    finish(){root.classList.add('ui-ferry-arrival-done');window.setTimeout(()=>root.remove(),300);},
    dispose(){root.remove();}
  };
}
