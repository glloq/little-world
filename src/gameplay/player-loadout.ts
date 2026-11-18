/** Persistent player equipment beyond the legacy equippedItemId (hands).
 * Optional in V2 saves/transit; favourites may remain uninitialised until first bag view.
 */
const EQUIPMENT_ID=/^[a-zA-Z0-9:._-]{1,100}$/;

export const EQUIPMENT_FAVOURITE_COUNT=10;
export interface PlayerLoadout {
  head:string|null;
  back:string|null;
  feet:string|null;
  favorites:(string|null)[]|null;
}
export function emptyPlayerLoadout():PlayerLoadout{
  return {head:null,back:null,feet:null,favorites:null};
}
export function parsePlayerLoadout(value:unknown):PlayerLoadout{
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error('Équipement sauvegardé invalide');
  const raw=value as Record<string,unknown>;
  function slot(name:string):string|null{
    const id=raw[name];
    if(id===undefined||id===null)return null;
    if(typeof id!=='string'||!EQUIPMENT_ID.test(id))throw Error('Emplacement '+name+' invalide');
    return id;
  }
  let favorites:(string|null)[]|null=null;
  if(raw.favorites!==undefined&&raw.favorites!==null){
    if(!Array.isArray(raw.favorites)||raw.favorites.length!==EQUIPMENT_FAVOURITE_COUNT)
      throw Error('Favoris sauvegardés invalides');
    favorites=raw.favorites.map((value:unknown)=>{
      if(value===null)return null;
      if(typeof value!=='string'||!EQUIPMENT_ID.test(value))throw Error('Objet favori invalide');
      return value;
    });
    const ids=favorites.filter((id):id is string=>id!==null);
    if(new Set(ids).size!==ids.length)throw Error('Favoris dupliqués');
  }
  return {head:slot('head'),back:slot('back'),feet:slot('feet'),favorites};
}
