/** Lightweight, authored vegetation profiles that reuse RegionVegetation V1.
 * No new mask format, textures or runtime objects. */
import type {RegionVegetation} from './region-schema.ts';
export const ECOLOGY_PROFILES={
 native:{label:'Profil du biotope',vegetation:{trees:1,shrubs:1,ground:1,deadwood:1}},
 deepForest:{label:'Forêt dense',vegetation:{trees:1.8,shrubs:1.3,ground:.5,deadwood:.9}},
 openForest:{label:'Forêt claire',vegetation:{trees:.65,shrubs:1.1,ground:1.45,deadwood:.4}},
 meadow:{label:'Prairie et fleurs',vegetation:{trees:.08,shrubs:.3,ground:1.8,deadwood:0}},
 wetland:{label:'Marais humide',vegetation:{trees:.4,shrubs:1.5,ground:1.7,deadwood:1.1}},
 rocky:{label:'Rochers et éboulis',vegetation:{trees:.08,shrubs:.2,ground:.2,deadwood:0}}
} as const;
export type EcologyProfile=keyof typeof ECOLOGY_PROFILES;
/** Preserve explicit author treeMix, unless requested otherwise by the caller. */
export function applyEcologyProfile(current:RegionVegetation,profile:EcologyProfile):RegionVegetation{
 const data=ECOLOGY_PROFILES[profile];
 if(!data)throw Error('Profil écologique inconnu');
 return {...current,...data.vegetation};
}
