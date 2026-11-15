/** Guided world creation: shape presets remain native editable Geography Engine parameters.
 * No separate generator or asset duplication. */
import {createProject,parseProject} from './schema.ts';
import {archipelagoPreset,isletChainPreset,islandToArchipelago,parseArchipelago} from '../geography/archipelago-params.ts';
import {islandPreset} from '../terrain-generator.ts';
import type {ProjectDocument} from './types.ts';
export type WorldStartMode='island'|'archipelago'|'chain'|'calm';
export interface WorldStartOptions {name:string;mode:WorldStartMode;width:number;length:number;seed:number;cliffs:number;volcano:boolean}
export function createGuidedWorld(options:WorldStartOptions):ProjectDocument {
  const {name,mode,width,length,seed,volcano}=options;
  if(!name.trim()||name.length>100)throw Error('Nom de monde requis (100 caractères maximum)');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(length)||width<500||length<500||width>8000||length>8000)throw Error('Dimensions : 500 à 8 000 m');
  if(!Number.isSafeInteger(seed)||seed<1||seed>9999999)throw Error('Graine invalide');
  if(!Number.isFinite(options.cliffs)||options.cliffs<0||options.cliffs>1)throw Error('Falaises : valeur de 0 à 1');
  const arch=mode==='chain'?isletChainPreset(width,length):
    mode==='island'?islandToArchipelago((islandPreset(width,length) as Extract<ReturnType<typeof islandPreset>,{kind:'island'}>).island,width,length):
    archipelagoPreset(width,length);
  if(mode==='calm')arch.features=[];
  if(!volcano)arch.features=arch.features.filter(f=>f.kind!=='volcano');
  for(const land of arch.landmasses)land.cliffs=options.cliffs;
  const validated=parseArchipelago(arch,{width,length});
  const project=createProject({name:name.trim(),width,length,seed,terrain:{kind:'archipelago',version:1,archipelago:validated}});
  return parseProject(project);
}
