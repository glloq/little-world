/** Deterministic construction helpers. Geometric samples only: no renderer, DOM or global state.
 * Bounded output makes every pattern one predictable CommandBus transaction. */
export interface XZ {x:number;z:number}
export interface PatternPoint extends XZ {yaw:number}
const distance=(a:XZ,b:XZ)=>Math.hypot(b.x-a.x,b.z-a.z);
const MAX=160;
export function linePattern(path:readonly XZ[],spacing:number,max=MAX):PatternPoint[]{
  if(!Number.isFinite(spacing)||spacing<.5||spacing>100)throw Error('Espacement : 0,5 à 100 m');
  if(path.length<2||path.length>100)throw Error('Tracé : 2 à 100 points');
  if(max<1||max>MAX)throw Error('Limite de répétition invalide');
  const result:PatternPoint[]=[],eps=1e-5;
  const total=path.slice(1).reduce((n,p,i)=>n+distance(path[i],p),0);
  if(total<.01)throw Error('Tracé trop court');
  if(Math.floor(total/spacing)+1>max)throw Error('Trop d’objets : augmenter l’espacement (maximum '+max+')');
  // Traverse segments with a single arc-length cursor so corner spacing is continuous.
  let segment=0,begin=0;
  for(let k=0;k<=Math.floor(total/spacing);k++){
    const wanted=k*spacing;
    while(segment<path.length-2&&begin+distance(path[segment],path[segment+1])<wanted-eps){
      begin+=distance(path[segment],path[segment+1]);segment++;
    }
    const a=path[segment],b=path[segment+1],len=distance(a,b);
    if(len<eps)continue;
    const t=Math.min(1,Math.max(0,(wanted-begin)/len)),yaw=Math.atan2(b.z-a.z,b.x-a.x);
    result.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw});
  }
  return result;
}
function insidePolygon(p:XZ,polygon:readonly XZ[]){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
/** Fill a drawn polygon with an aligned grid; never scan an unbounded number of cells. */
export function areaPattern(polygon:readonly XZ[],spacing:number,max=MAX):PatternPoint[]{
  if(!Number.isFinite(spacing)||spacing<1||spacing>100)throw Error('Espacement de grille : 1 à 100 m');
  if(polygon.length<3||polygon.length>100)throw Error('Polygone : 3 à 100 points');
  const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  if(!Number.isFinite(x0+z0+x1+z1))throw Error('Coordonnées invalides');
  // Estimate scan complexity first, even when most cells are outside a narrow polygon.
  const nx=Math.floor((x1-x0)/spacing)+1,nz=Math.floor((z1-z0)/spacing)+1;
  if(nx*nz>10000)throw Error('Zone trop grande : augmenter l’espacement');
  const result:PatternPoint[]=[];
  for(let row=0;row<nz;row++)for(let col=0;col<nx;col++){
    const q={x:x0+col*spacing,z:z0+row*spacing};
    if(!insidePolygon(q,polygon))continue;
    if(result.length>=max)throw Error('Trop d’objets : augmenter l’espacement (maximum '+max+')');
    result.push({...q,yaw:0});
  }
  if(!result.length)throw Error('Aucun point dans la zone');
  return result;
}
