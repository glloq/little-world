#!/usr/bin/env node
/** OPT gate helper: compare two capture folders of the OPT suite (same file names).
 * Reports, per image, the share of pixels whose max channel difference exceeds THRESHOLD
 * (default 16/255) and the mean absolute difference. Wind, rain and water animate with
 * time, so compare B against the A/A noise floor of the same scene, never against zero.
 * Usage: node tools/perf/compare-captures.mjs <dirA> <dirB> [out.json] */
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const [a,b,out]=process.argv.slice(2);if(!a||!b)throw Error('usage: compare-captures <dirA> <dirB> [out.json]');
const threshold=Number(process.env.THRESHOLD??16);
const files=(await readdir(a)).filter(f=>f.endsWith('.png')&&existsSync(resolve(b,f))).sort();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const page=await browser.newPage(),rows=[];
try{
  for(const f of files){
    const [da,db]=await Promise.all([readFile(resolve(a,f)),readFile(resolve(b,f))]);
    rows.push({file:f,...await page.evaluate(async({a,b,threshold})=>{
      const load=async s=>{const bm=await createImageBitmap(await (await fetch('data:image/png;base64,'+s)).blob()),c=new OffscreenCanvas(bm.width,bm.height),x=c.getContext('2d');x.drawImage(bm,0,0);return x.getImageData(0,0,bm.width,bm.height);};
      const [ia,ib]=await Promise.all([load(a),load(b)]);if(ia.width!==ib.width||ia.height!==ib.height)return {error:'size'};
      let over=0,sum=0;const n=ia.width*ia.height;
      for(let i=0;i<n*4;i+=4){const d=Math.max(Math.abs(ia.data[i]-ib.data[i]),Math.abs(ia.data[i+1]-ib.data[i+1]),Math.abs(ia.data[i+2]-ib.data[i+2]));sum+=d;if(d>threshold)over++;}
      return {pixelsOverPct:+(over/n*100).toFixed(3),meanAbsDiff:+(sum/n).toFixed(3)};
    },{a:da.toString('base64'),b:db.toString('base64'),threshold})});
  }
}finally{await browser.close();}
console.table(rows);
if(out)await writeFile(out,JSON.stringify({threshold,a:resolve(a),b:resolve(b),rows},null,2)+'\n');
