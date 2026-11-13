import type {ComponentMap,EntityDefinitionV3} from './types.ts';
/** Materialize resolved components on an instance and remove their superseded field overrides. */
export function materializeComponents(source:EntityDefinitionV3,components:ComponentMap):EntityDefinitionV3 {
 const result=structuredClone(source);for(const [key,value]of Object.entries(components))if(value===undefined)throw Error('Composant explicite attendu : '+key);
 result.components={...result.components,...structuredClone(components)};
 if(result.overrides)result.overrides=result.overrides.filter(o=>!Object.hasOwn(components,o.component));return result;
}
