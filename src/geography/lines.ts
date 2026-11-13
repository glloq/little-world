/** Distance to a set of ribbons (paths, rivers): nearest centre-line distance minus the half
 * width, shared by the runtime terrain and authoring previews (same arithmetic everywhere).
 * Segments are flattened once into typed arrays. With a finite `within`, a ribbon or segment
 * whose bounding box is farther than `within` is skipped: the result is then exact below
 * `within` only (callers compare against thresholds below it). Per ribbon the nearest segment
 * is selected on squared distances and a single Math.hypot is evaluated. */
export interface Ribbon {points:readonly {x:number;z:number}[];width:number}
export function ribbonDistance(lines:readonly Ribbon[]):(x:number,z:number,within?:number)=>number{
  const valid=lines.filter(l=>l.points.length>1),count=valid.reduce((n,l)=>n+l.points.length-1,0);
  const ax=new Float64Array(count),az=new Float64Array(count),dx=new Float64Array(count),dz=new Float64Array(count),len2=new Float64Array(count);
  const sx0=new Float64Array(count),sx1=new Float64Array(count),sz0=new Float64Array(count),sz1=new Float64Array(count);
  const start=new Int32Array(valid.length+1),half=new Float64Array(valid.length),box=new Float64Array(valid.length*4);
  let k=0;
  valid.forEach((l,i)=>{
    start[i]=k;half[i]=l.width/2;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of l.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
    box.set([minX-half[i],maxX+half[i],minZ-half[i],maxZ+half[i]],i*4);
    for(let j=1;j<l.points.length;j++,k++){const a=l.points[j-1],b=l.points[j];ax[k]=a.x;az[k]=a.z;dx[k]=b.x-a.x;dz[k]=b.z-a.z;len2[k]=dx[k]*dx[k]+dz[k]*dz[k]||1;sx0[k]=Math.min(a.x,b.x);sx1[k]=Math.max(a.x,b.x);sz0[k]=Math.min(a.z,b.z);sz1[k]=Math.max(a.z,b.z);}
  });
  start[valid.length]=k;
  return (x,z,within=Infinity)=>{
    let best=Infinity;const finite=within<Infinity;
    for(let i=0;i<valid.length;i++){
      const o=i*4;if(finite&&(x<box[o]-within||x>box[o+1]+within||z<box[o+2]-within||z>box[o+3]+within))continue;
      const reach=within+half[i];let d2=Infinity,bx=0,bz=0;
      for(let s=start[i];s<start[i+1];s++){
        if(finite&&(x<sx0[s]-reach||x>sx1[s]+reach||z<sz0[s]-reach||z>sz1[s]+reach))continue;
        const t=Math.min(1,Math.max(0,((x-ax[s])*dx[s]+(z-az[s])*dz[s])/len2[s])),ex=x-ax[s]-t*dx[s],ez=z-az[s]-t*dz[s],q=ex*ex+ez*ez;
        if(q<d2){d2=q;bx=ex;bz=ez;}
      }
      if(d2<Infinity){const d=Math.hypot(bx,bz)-half[i];if(d<best)best=d;}
    }
    return best;
  };
}
