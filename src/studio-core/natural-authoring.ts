/** Relief used while re-editing a tunnel: omit only its own authored excavation.
 * Prevents repeated saves from digging 25 cm deeper on each edit.
 * Other terrain corrections, water-bed carving and tunnels remain untouched. */
import type {ProjectDocument} from './types.ts';
import {projectGeographyInput,geographyFromInput} from './geo-context.ts';
export function naturalUnexcavatedHeight(project:ProjectDocument,entityId:string):((x:number,z:number)=>number)|null {
  const prefix='natural:'+entityId+':',input=projectGeographyInput(project);
  const untouched=input.edits.filter(edit=>!edit.id.startsWith(prefix));
  if(untouched.length===input.edits.length)return null;
  return geographyFromInput({...input,edits:untouched}).ctx.height;
}
