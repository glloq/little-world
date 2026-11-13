/** Player interface preferences: local to this browser, never written to game saves nor to
 * authoring projects. Audio levels stay owned by the audio engine (its own storage). */
/** (Render quality keeps its historical key `little-world-quality`, owned by the game loop.) */
export interface UiPreferences {cameraSensitivity:number;invertY:boolean;reduceMotion:boolean;developer:boolean}
export const UI_PREFERENCES_KEY='little-world:ui-preferences:v1';
export const DEFAULT_PREFERENCES:UiPreferences={cameraSensitivity:1,invertY:false,reduceMotion:false,developer:false};
export function parsePreferences(value:unknown):UiPreferences{
  const v=(value&&typeof value==='object'?value:{}) as Partial<UiPreferences>,out={...DEFAULT_PREFERENCES};
  if(typeof v.cameraSensitivity==='number'&&Number.isFinite(v.cameraSensitivity))out.cameraSensitivity=Math.min(2.5,Math.max(.3,v.cameraSensitivity));
  if(typeof v.invertY==='boolean')out.invertY=v.invertY;if(typeof v.reduceMotion==='boolean')out.reduceMotion=v.reduceMotion;if(typeof v.developer==='boolean')out.developer=v.developer;
  return out;
}
export function loadPreferences(storage:Pick<Storage,'getItem'>|null=safeStorage()):UiPreferences{try{return parsePreferences(JSON.parse(storage?.getItem(UI_PREFERENCES_KEY)??'{}'));}catch{return {...DEFAULT_PREFERENCES};}}
export function savePreferences(p:UiPreferences,storage:Pick<Storage,'setItem'>|null=safeStorage()):boolean{try{storage?.setItem(UI_PREFERENCES_KEY,JSON.stringify(parsePreferences(p)));return !!storage;}catch{return false;}}
function safeStorage(){try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
