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
