/** Shared 2 m grid poses for the GLB assembler and persisted Studio entities. */
export function dockGridLayout(cells:readonly {gx:number;gz:number;rotation?:number}[]){
 const posts=new Map<string,{x:number;z:number;rotation:number}>(),tiles=[];
 for(const {gx,gz,rotation=0}of cells){if(!Number.isInteger(gx)||!Number.isInteger(gz)||!Number.isFinite(rotation))throw Error('Cellule de quai invalide');tiles.push({x:gx*2,z:gz*2,rotation});for(const dx of [-1,1])for(const dz of [-1,1]){const x=gx*2+dx,z=gz*2+dz;posts.set(x+','+z,{x,z,rotation:0});}}
 return {tiles,posts:[...posts.values()]};
}
