import type * as THREE from 'three';
export const DOCK_GRID_METERS:number;
export const DOCK_DECK_Y:number;
export function assembleDock(args:{
 cells:readonly (readonly [number,number]|{gx:number;gz:number;rotation?:number})[];
 assetBaseUrl:string;
 lod?:0|1|2;
 bollards?:{tile:[number,number];offset?:[number,number]}[];
 ramps?:{tile:[number,number];side:'north'|'east'|'south'|'west'}[];
 ladders?:{tile:[number,number];side:'north'|'east'|'south'|'west'}[];
 fascia?:boolean;
}):Promise<THREE.Group>;
