/**
 * Reusable low-poly props and themed borders of mini-game fields (doc 107 §décors). Pure
 * painting into a shared Painter (no mesh, no material per prop): a whole field with its
 * decoration stays ONE draw call. Animated parts (flags, windmill sails) are returned as
 * anchors and drawn by small instanced meshes owned by the view.
 */
import type {StaticBox} from '../ball/ball-physics.ts';
import type {MiniGameBorder,MiniGamePropId} from '../themes.ts';
import type {MiniGameTheme} from '../theme-palettes.ts';
import {Painter,shade,type V3} from './painter.ts';

/** Animated parts declared by painted props. */
export interface PropAnchors {
  /** Pennant flags: pole top, height of the cloth, colour and resting yaw. */flags:{x:number;y:number;z:number;yaw:number;color:number;size:number}[];
  /** Windmill sails: hub position and facing yaw. */sails:{x:number;y:number;z:number;yaw:number;size:number}[];
}
export const emptyAnchors=():PropAnchors=>({flags:[],sails:[]});
const WOOD=0x8a5a3b,DARK_WOOD=0x5b3d26,WHITE=0xf8f6ee,STONE=0x9a968c,RED=0xd8503f,GOLD=0xe8b93c;
/** Local frame helper: (u across, v forward) around (x, z) turned by yaw. */
const frame=(x:number,z:number,yaw:number)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return (u:number,v:number)=>({x:x+u*c+v*s,z:z-u*s+v*c});};

/** Paints one prop standing on the ground at (x, y, z), facing `yaw` (world). */
export function paintProp(pt:Painter,id:MiniGamePropId,x:number,y:number,z:number,yaw:number,theme:MiniGameTheme,anchors:PropAnchors,size=1){
  const at=frame(x,z,yaw),s=size,flagColor=theme.flags[Math.abs(Math.round(x*7+z*3))%theme.flags.length];
  switch(id){
    case 'flag':pt.prism(x,y,z,.03*s,.025*s,1.6*s,5,WHITE);anchors.flags.push({x,y:y+1.6*s,z,yaw,color:flagColor,size:s});break;
    case 'bunting':{ // Two poles and a garland of small pennants between them.
      const a=at(-1.5*s,0),b=at(1.5*s,0),h=1.5*s;pt.prism(a.x,y,a.z,.03,.025,h,5,DARK_WOOD);pt.prism(b.x,y,b.z,.03,.025,h,5,DARK_WOOD);
      const n=8;for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,sag=(t:number)=>h-.25*s*Math.sin(t*Math.PI);
        const p0:V3=[a.x+(b.x-a.x)*t0,y+sag(t0),a.z+(b.z-a.z)*t0],p1:V3=[a.x+(b.x-a.x)*t1,y+sag(t1),a.z+(b.z-a.z)*t1],tip:V3=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2-.22*s,(p0[2]+p1[2])/2];
        pt.tri(p0,p1,tip,theme.flags[k%theme.flags.length]);}
      break;
    }
    case 'stand':{ // Three wooden steps facing the field (+v).
      for(let k=0;k<3;k++){const c=at(0,-.35*k*s);pt.block(c.x,y,c.z,2.4*s,(.3+.3*k)*s,.38*s,yaw,k%2?WOOD:shade(WOOD,1.1));}
      break;
    }
    case 'bollard':pt.prism(x,y,z,.09*s,.07*s,.5*s,6,WHITE);pt.prism(x,y+.32*s,z,.095*s,.095*s,.08*s,6,RED);break;
    case 'signpost':{pt.prism(x,y,z,.04*s,.04*s,1.1*s,5,DARK_WOOD);const c=at(0,.05);pt.block(c.x,y+.8*s,c.z,.7*s,.3*s,.05*s,yaw,WOOD,shade(WOOD,1.15));break;}
    case 'podium':{ // 2 – 1 – 3 steps, gold / silver / bronze fronts.
      for(const [u,h,c] of [[0,.6,GOLD],[-.75,.4,0xc8ccd2],[.75,.25,0xc58a4a]] as const){const p=at(u*s,0);pt.block(p.x,y,p.z,.72*s,h*s,.7*s,yaw,c,WHITE);}
      break;
    }
    case 'trophy':pt.prism(x,y,z,.12*s,.1*s,.08*s,6,DARK_WOOD);pt.prism(x,y+.08*s,z,.03*s,.03*s,.15*s,6,GOLD);pt.prism(x,y+.23*s,z,.06*s,.13*s,.18*s,8,GOLD);break;
    case 'marker':pt.prism(x,y,z,.12*s,0,.35*s,4,0xf2994a);break;
    case 'stall':{
      for(const [u,v] of [[-.8,-.5],[.8,-.5],[-.8,.5],[.8,.5]]){const p=at(u*s,v*s);pt.prism(p.x,y,p.z,.04,.04,1.6*s,4,DARK_WOOD);}
      const c=at(0,0);pt.block(c.x,y,c.z,1.6*s,.8*s,.9*s,yaw,WOOD,shade(WOOD,1.15));
      for(let k=0;k<4;k++){const p=at((-.6+k*.4)*s,0);pt.block(p.x,y+1.6*s,p.z,.4*s,.08*s,1.2*s,yaw,k%2?WHITE:RED);}
      break;
    }
    case 'fence':{const a=at(-1*s,0),b=at(1*s,0);for(const p of [a,b,at(0,0)])pt.block(p.x,y,p.z,.08*s,.75*s,.08*s,yaw,DARK_WOOD);
      for(const h of [.3,.6])pt.beam([a.x,y+h*s,a.z],[b.x,y+h*s,b.z],.03*s,4,WOOD);break;}
    case 'lamp':pt.prism(x,y,z,.05*s,.04*s,1.9*s,5,0x3a3e44);pt.prism(x,y+1.9*s,z,.12*s,.05*s,.22*s,6,0xf6e39a);pt.prism(x,y+2.12*s,z,.13*s,0,.12*s,6,0x3a3e44);break;
    case 'arch-start':case 'arch-finish':{
      const c=id==='arch-start'?0x6fcf97:0xeb5757,a=at(-1.3*s,0),b=at(1.3*s,0),h=2.2*s;
      pt.block(a.x,y,a.z,.2*s,h,.2*s,yaw,c);pt.block(b.x,y,b.z,.2*s,h,.2*s,yaw,c);
      const m=at(0,0);pt.block(m.x,y+h,m.z,2.8*s,.35*s,.22*s,yaw,c,WHITE);
      for(let k=0;k<7;k++){const p=at((-1.05+k*.35)*s,-.12*s);pt.block(p.x,y+h+.1*s,p.z,.16*s,.16*s,.02,yaw,k%2?WHITE:0x2b2b2b);} // Checker band.
      break;
    }
    case 'windmill':{
      pt.prism(x,y,z,.38*s,.26*s,.9*s,6,0xe9dcc4,0xe9dcc4);pt.prism(x,y+.9*s,z,.32*s,0,.4*s,6,RED);
      const door=at(0,.34*s);pt.block(door.x,y,door.z,.2*s,.35*s,.04,yaw,DARK_WOOD);
      const hub=at(0,.38*s);anchors.sails.push({x:hub.x,y:y+.75*s,z:hub.z,yaw,size:s});break;
    }
    case 'tunnel':{ // A half-pipe of planks over a lane (posts outside a 1.6 m lane).
      const n=6,r=1.0*s,len=1.4*s;
      for(let k=0;k<n;k++){const a0=k/n*Math.PI,a1=(k+1)/n*Math.PI,P=(a:number,v:number):V3=>{const p=at(Math.cos(a)*r,v);return [p.x,y+Math.sin(a)*r*.75,p.z];};
        pt.quad(P(a0,-len/2),P(a1,-len/2),P(a1,len/2),P(a0,len/2),k%2?WOOD:shade(WOOD,1.12));}
      break;
    }
    case 'stump':pt.prism(x,y,z,.28*s,.22*s,.35*s,7,0x7a5232,0xd9b784);break;
    case 'rock':pt.prism(x,y-.05,z,.35*s,.12*s,.32*s,5,STONE,shade(STONE,1.12));break;
    case 'mushroom':pt.prism(x,y,z,.05*s,.05*s,.18*s,5,WHITE);pt.prism(x,y+.18*s,z,.18*s,0,.14*s,7,RED);break;
    case 'driftwood':{const a=at(-.7*s,0),b=at(.7*s,.1*s);pt.beam([a.x,y+.08*s,a.z],[b.x,y+.12*s,b.z],.08*s,5,0xc8b49a);break;}
    case 'reeds':for(let k=0;k<5;k++){const p=at((k-2)*.09*s,((k*37)%5-2)*.05*s);pt.prism(p.x,y,p.z,.025*s,0,(.7+(k%3)*.18)*s,3,k%2?0x6f8f3a:0x8aa04a);}break;
    case 'snowpole':pt.prism(x,y,z,.035*s,.035*s,1.3*s,4,RED);pt.prism(x,y+.4*s,z,.04*s,.04*s,.2*s,4,WHITE);pt.prism(x,y+.85*s,z,.04*s,.04*s,.2*s,4,WHITE);break;
    case 'basalt':for(let k=0;k<3;k++){const p=at((k-1)*.22*s,(k%2)*.12*s);pt.prism(p.x,y,p.z,.12*s,.11*s,(.35+k*.15)*s,6,0x3d3836,0x55504c);}break;
    case 'barrel':pt.prism(x,y,z,.24*s,.24*s,.6*s,8,0x9a6b3c,0x7a5232);break;
    case 'crate':pt.block(x,y,z,.5*s,.5*s,.5*s,yaw,0xb9884f,0xc99a66);break;
    case 'log':{const a=at(-.6*s,0),b=at(.6*s,0);pt.beam([a.x,y+.14*s,a.z],[b.x,y+.14*s,b.z],.14*s,6,0x7a5232);break;}
  }
}
/** Paints a field wall in the theme's border style. The physics box is unchanged: every
 * style covers (or, for ropes, outlines) exactly the volume the ball collides with. */
export function paintBorder(pt:Painter,b:StaticBox,border:MiniGameBorder,theme:MiniGameTheme){
  const long=b.hx>=b.hz,len=2*Math.max(b.hx,b.hz),h=b.maxY-b.minY-1,base=b.minY+1,ax=long?{x:b.cos,z:-b.sin}:{x:b.sin,z:b.cos};
  const end=(t:number):V3=>[b.cx+ax.x*t*len/2,0,b.cz+ax.z*t*len/2];
  switch(border){
    case 'logs':{const n=Math.max(1,Math.round(h/.35)),r=h/(2*n);pt.box({...b,maxY:base},theme.side);
      for(let k=0;k<n;k++){const y=base+r*(2*k+1),a=end(-1),c=end(1);pt.beam([a[0],y,a[2]],[c[0],y,c[2]],r,6,k%2?theme.wall:theme.cap);}break;}
    case 'rope':{const n=Math.max(2,Math.ceil(len/1.4));
      for(let k=0;k<=n;k++){const p=end(-1+2*k/n);pt.prism(p[0],b.minY+.9,p[2],.045,.04,h+.12,5,theme.wall,theme.cap);}
      for(const y of [base+h*.45,base+h]){const a=end(-1),c=end(1);pt.beam([a[0],y,a[2]],[c[0],y,c[2]],.02,4,0xd9c7a0);}
      pt.box({...b,maxY:base+.03},theme.side);break;}
    case 'stone':case 'basalt':{const n=Math.max(1,Math.round(len/.6)),seg=len/n,rows=Math.max(1,Math.round(h/.25));
      for(let k=0;k<n;k++)for(let r=0;r<rows;r++){const off=(r%2?.5:0)*seg,t0=Math.max(0,k*seg-off),t1=Math.min(len,(k+1)*seg-off);if(t1-t0<.05)continue;
        const c=(t0+t1)/2-len/2,cx=b.cx+ax.x*c,cz=b.cz+ax.z*c;
        pt.box({...b,cx,cz,hx:long?(t1-t0)/2:b.hx,hz:long?b.hz:(t1-t0)/2,minY:r?base+h*r/rows:b.minY,maxY:base+h*(r+1)/rows},(k+r)%2?theme.wall:shade(theme.wall,1.08),theme.cap);}
      break;}
    case 'snowbank':pt.box(b,theme.wall,theme.cap);pt.beam(end(-1).map((v,i)=>i===1?b.maxY:v) as V3,end(1).map((v,i)=>i===1?b.maxY:v) as V3,Math.min(b.hx,b.hz)*1.4,6,theme.cap);break;
    case 'planks':case 'wood':{const n=Math.max(1,Math.round(len/(border==='planks'?.3:.9))),seg=len/n;
      for(let k=0;k<n;k++){const c=-len/2+seg*(k+.5),cx=b.cx+ax.x*c,cz=b.cz+ax.z*c;
        pt.box({...b,cx,cz,hx:long?seg/2:b.hx,hz:long?b.hz:seg/2},k%2?theme.wall:shade(theme.wall,.92),theme.cap);}
      break;}
    default:pt.box(b,theme.wall,theme.cap);
  }
}
