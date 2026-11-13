type Position={x:number;y:number;z:number};
/** Firefox versions without AudioListener AudioParams retain the standard legacy methods. */
export function positionListener(listener:AudioListener,position:Position,forward:Position){
 if(listener.positionX){listener.positionX.value=position.x;listener.positionY.value=position.y;listener.positionZ.value=position.z;}else listener.setPosition(position.x,position.y,position.z);
 if(listener.forwardX){listener.forwardX.value=forward.x;listener.forwardY.value=forward.y;listener.forwardZ.value=forward.z;}else listener.setOrientation(forward.x,forward.y,forward.z,0,1,0);
}
export function positionPanner(panner:PannerNode,position:Position,time?:number){
 if(panner.positionX){for(const axis of ['x','y','z'] as const){const param=axis==='x'?panner.positionX:axis==='y'?panner.positionY:panner.positionZ;if(time!==undefined)param.setTargetAtTime(position[axis],time,.03);else param.value=position[axis];}}else panner.setPosition(position.x,position.y,position.z);
}
