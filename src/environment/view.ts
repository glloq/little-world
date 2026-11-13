import * as THREE from 'three';
import type {WorldClock} from './clock.ts';
import type {ClimateHistory} from './climate.ts';
import {applySkyLighting,type SkyLighting as Lighting} from './sky-lighting.ts';
import './view.css';
/** One shared lighting state and one bounded local GPU rain batch. No mesh traversal. */
export function createEnvironmentView(scene:THREE.Scene,lighting:Lighting,clock:WorldClock,climate:ClimateHistory){
 const background=new THREE.Color();scene.background=background;scene.fog=null;
 const count=192,positions=new Float32Array(count*3);let seed=climate.definition.weatherSeed;
 for(let i=0;i<positions.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;positions[i]=(seed/4294967296)*24-12;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const uniforms={time:{value:0},anchor:{value:new THREE.Vector3()}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,vertexShader:`uniform float time;uniform vec3 anchor;void main(){vec3 p=position;p.y=mod(position.y-time*16.0,24.0)-4.0;p.x+=sin(time*.4)*.4;vec4 view=modelViewMatrix*vec4(p+anchor,1.0);gl_Position=projectionMatrix*view;gl_PointSize=clamp(35.0/-view.z,1.0,3.0);}`,fragmentShader:`void main(){if(abs(gl_PointCoord.x-.5)>.2)discard;gl_FragColor=vec4(.72,.83,.88,.55);}`});
 const rain=new THREE.Points(geometry,material);rain.frustumCulled=false;rain.visible=false;rain.renderOrder=2;scene.add(rain);
 const panel=document.createElement('details');panel.className='environment-controls';const summary=document.createElement('summary'),timeLabel=document.createElement('span'),weatherLabel=document.createElement('span'),label=document.createElement('label'),rate=document.createElement('select');summary.textContent='Heure et météo';label.textContent='Vitesse du monde';rate.setAttribute('aria-label','Vitesse du monde');for(const [value,text]of [['0','Pause'],['1','×1'],['60','×60'],['240','×240']])rate.add(new Option(text,value));rate.value='1';rate.onchange=()=>clock.setRate(Number(rate.value));label.append(rate);panel.append(summary,timeLabel,weatherLabel,label);document.body.append(panel);
 let visualTime=0,lastLabel='';
 function update(dt:number,position:{x:number;y:number;z:number},detail:number){
  const state=climate.state(clock.time);applySkyLighting(lighting,background,state.sunAltitude,state.dayPhase,state.cloudCover);
  visualTime+=Math.max(0,Math.min(dt,.25));uniforms.time.value=visualTime;uniforms.anchor.value.set(position.x,position.y,position.z);rain.visible=state.weather==='rain'&&detail<2;geometry.setDrawRange(0,detail===1?96:count);
  const minutes=Math.floor(state.dayPhase*1440),text=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')} · ${state.weather}`;
  if(text!==lastLabel){lastLabel=text;timeLabel.textContent=text.split(' · ')[0];weatherLabel.textContent={clear:'Temps clair',cloudy:'Ciel couvert',rain:'Pluie'}[state.weather]+` · ${state.temperatureC} °C`;panel.dataset.weather=state.weather;panel.dataset.time=String(clock.time);}
  if(Number(rate.value)!==clock.rate)rate.value=String(clock.rate);
 }
 return {update,get metrics(){return {time:clock.time,rate:clock.rate,weather:climate.state(clock.time).weather,rainParticles:rain.visible?geometry.drawRange.count:0};},dispose(){panel.remove();rain.removeFromParent();geometry.dispose();material.dispose();}};
}
