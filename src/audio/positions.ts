type Position={x:number;y:number;z:number};
/** Firefox versions without AudioListener AudioParams retain the standard legacy methods.
 * With `time`, the listener glides (time constant 70 ms) between the 200 ms scene updates,
 * so panning does not step at speed or during fast camera orbits. */
export function positionListener(listener:AudioListener,position:Position,forward:Position,time?:number){
 const set=(param:AudioParam,value:number)=>{if(time!==undefined)param.setTargetAtTime(value,time,.07);else param.value=value;};
 if(listener.positionX){set(listener.positionX,position.x);set(listener.positionY,position.y);set(listener.positionZ,position.z);}else listener.setPosition(position.x,position.y,position.z);
 if(listener.forwardX){set(listener.forwardX,forward.x);set(listener.forwardY,forward.y);set(listener.forwardZ,forward.z);}else listener.setOrientation(forward.x,forward.y,forward.z,0,1,0);
}
export function positionPanner(panner:PannerNode,position:Position,time?:number){
 if(panner.positionX){for(const axis of ['x','y','z'] as const){const param=axis==='x'?panner.positionX:axis==='y'?panner.positionY:panner.positionZ;if(time!==undefined)param.setTargetAtTime(position[axis],time,.03);else param.value=position[axis];}}else panner.setPosition(position.x,position.y,position.z);
}
