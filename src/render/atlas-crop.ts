/** Offline alpha bounds in UV coordinates (WebGL bottom-up), with a filtering gutter.
 * The original atlas pixels and ground anchors are unchanged. Empty tiles keep their quad. */
export function atlasCrops(data:Uint8ClampedArray,width:number,height:number,tile:number,columns:number,count:number):number[][]{
 const crops:number[][]=[];
 for(let index=0;index<count;index++){
  const ox=index%columns*tile,oy=height-(Math.floor(index/columns)+1)*tile;
  let minX=tile,minY=tile,maxX=-1,maxY=-1;
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++)if(data[((oy+y)*width+ox+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  crops.push(maxX<0?[0,0,1,1]:[Math.max(0,minX-1)/tile,Math.max(0,tile-maxY-2)/tile,Math.min(tile,maxX+2)/tile,Math.min(tile,tile-minY+1)/tile]);
 }
 return crops;
}
