/**
 * Global activity indicator for Studio waits that cannot report stages
 * (opening a template, compiling a playtest, exporting) — doc 105. The banner
 * is painted BEFORE the work starts (two animation frames), fades in after
 * 200 ms so short operations do not flicker, and shows the elapsed time.
 */
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
let depth=0;
export async function withBusy<T>(label:string,work:()=>Promise<T>|T):Promise<T>{
 const banner=document.createElement('div');banner.className='studio-busy';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const text=document.createElement('span'),time=document.createElement('span'),bar=document.createElement('div');
 text.textContent=label;time.className='studio-busy-time';bar.className='studio-busy-bar';banner.append(text,time,bar);
 document.body.append(banner);depth++;document.body.setAttribute('aria-busy','true');
 const started=performance.now(),timer=setInterval(()=>{time.textContent=(Math.round((performance.now()-started)/100)/10)+' s';},200);
 try{await frame();await frame();return await work();}
 finally{clearInterval(timer);banner.remove();if(--depth===0)document.body.removeAttribute('aria-busy');}
}
