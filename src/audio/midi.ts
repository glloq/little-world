/** Restricted SMF 0/1 reader. No Web MIDI, SysEx, scripts or external dependencies. */
export interface MidiNote {start:number;duration:number;note:number;velocity:number;channel:number;program:number;track:number;}
export interface MidiScore {format:0|1;ppqn:number;tracks:number;duration:number;bpm:number;notes:MidiNote[];maxPolyphony:number;programs:number[];warnings:string[];}
interface Event {tick:number;track:number;order:number;kind:'on'|'off'|'program'|'tempo';channel:number;a:number;b:number;}
export function parseMidi(bytes:Uint8Array):MidiScore {
 if(bytes.length<14||bytes.length>1_048_576)throw Error('MIDI : taille invalide (maximum 1 Mio)');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 const need=(count:number,end=bytes.length)=>{if(at+count>end)throw Error('MIDI tronqué');};
 const u8=()=>{need(1);return bytes[at++];},u16=()=>{need(2);const n=view.getUint16(at);at+=2;return n;},u32=()=>{need(4);const n=view.getUint32(at);at+=4;return n;};
 const tag=()=>String.fromCharCode(u8(),u8(),u8(),u8());
 if(tag()!=='MThd')throw Error('En-tête MIDI absent');const header=u32();if(header<6||header>1024)throw Error('En-tête MIDI invalide');need(header);
 const format=u16(),tracks=u16(),ppqn=u16();if((format!==0&&format!==1)||tracks<1||tracks>32||(format===0&&tracks!==1)||ppqn===0||(ppqn&0x8000))throw Error('MIDI : SMF type 0/1 et PPQN requis');at=8+header;
 const events:Event[]=[],ends:number[]=[],warnings:string[]=[];const warn=(message:string)=>{if(warnings.length<20&&!warnings.includes(message))warnings.push(message);};
 const vlq=(end:number)=>{let n=0;for(let i=0;i<4;i++){need(1,end);const byte=u8();n=n*128+(byte&127);if(!(byte&128))return n;}throw Error('MIDI : entier variable trop long');};
 let eventCount=0;
 for(let track=0;track<tracks;track++){
  if(tag()!=='MTrk')throw Error('Piste MIDI absente');const size=u32();need(size);const end=at+size;let tick=0,running=0,order=0,ended=false;
  while(at<end){if(++eventCount>100000)throw Error('Trop d’événements MIDI');tick+=vlq(end);if(tick>1e9)throw Error('Durée MIDI excessive');need(1,end);let status=bytes[at];if(status&128){at++;if(status<0xf0)running=status;}else{if(!running)throw Error('Running status MIDI sans événement');status=running;}
   if(status===0xff){running=0;need(1,end);const meta=u8(),length=vlq(end);need(length,end);
    if(meta===0x51){if(length!==3)throw Error('Tempo MIDI invalide');const tempo=bytes[at]*65536+bytes[at+1]*256+bytes[at+2];if(tempo<100000||tempo>3000000)throw Error('Tempo MIDI hors limites');events.push({tick,track,order:order++,kind:'tempo',channel:0,a:tempo,b:0});}
    if(meta===0x2f){if(length!==0||at!==end)throw Error('Fin de piste MIDI invalide');ended=true;break;}at+=length;continue;
   }
   if(status>=0xf0)throw Error('MIDI : SysEx et messages système non pris en charge');
   const type=status>>4,channel=status&15,count=type===12||type===13?1:2;need(count,end);const a=u8(),b=count===2?u8():0;if(a>127||b>127)throw Error('Octet MIDI invalide');
   if(channel===9&&type===9&&b>0)warn('Canal de percussion 10 affecté à la percussion douce, sans banque GM.');
   if(type===8||type===9)events.push({tick,track,order:order++,kind:type===8||b===0?'off':'on',channel,a,b});
   else if(type===12)events.push({tick,track,order:order++,kind:'program',channel,a,b});
   else if(type===11)warn(`Contrôleur CC${a} ignoré (dont sustain) ; les note-off restent actifs.`);
   else if(type===14||type===10||type===13)warn('Pitch bend et pression ignorés.');else throw Error('Message MIDI non pris en charge');
  }if(!ended)throw Error('Fin de piste MIDI absente');ends.push(tick);
 }
 if(at!==bytes.length)throw Error('Données après les pistes MIDI');
 events.sort((a,b)=>a.tick-b.tick||a.track-b.track||a.order-b.order);
 const tempos=[{tick:0,seconds:0,tempo:500000}];for(const event of events)if(event.kind==='tempo'){const last=tempos.at(-1)!;const seconds=last.seconds+(event.tick-last.tick)*last.tempo/ppqn/1e6;if(event.tick===last.tick)last.tempo=event.a;else tempos.push({tick:event.tick,seconds,tempo:event.a});}
 const secondsAt=(tick:number)=>{let lo=0,hi=tempos.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tempos[mid].tick<=tick)lo=mid;else hi=mid-1;}const t=tempos[lo];return t.seconds+(tick-t.tick)*t.tempo/ppqn/1e6;};
 const programs=new Array<number>(16).fill(0),active=new Map<string,{tick:number;event:Event;program:number}[]>(),notes:MidiNote[]=[];
 const finish=(on:{tick:number;event:Event;program:number},tick:number)=>{const start=secondsAt(on.tick),duration=Math.max(.01,secondsAt(tick)-start);if(notes.length>=20000||start+duration>1800)throw Error('MIDI : maximum 20 000 notes / 30 minutes');notes.push({start,duration,note:on.event.a,velocity:on.event.b/127,program:on.program,channel:on.event.channel,track:on.event.track});};
 for(const event of events){if(event.kind==='program')programs[event.channel]=event.a;else if(event.kind==='on'){const key=event.channel+':'+event.a,queue=active.get(key)??[];queue.push({tick:event.tick,event,program:programs[event.channel]});active.set(key,queue);}else if(event.kind==='off'){const queue=active.get(event.channel+':'+event.a),on=queue?.shift();if(on)finish(on,event.tick);else warn('Note-off sans note-on ignoré.');}}
 for(const queue of active.values())for(const on of queue){finish(on,Math.max(ends[on.event.track],on.tick+ppqn));warn('Note sans note-off refermée à la fin de sa piste.');}
 notes.sort((a,b)=>a.start-b.start||a.track-b.track||a.note-b.note);const duration=Math.max(.1,secondsAt(Math.max(...ends)),...notes.map(n=>n.start+n.duration));if(duration>1800)throw Error('MIDI de plus de 30 minutes');
 const points=notes.flatMap(n=>[{t:n.start,change:1},{t:n.start+n.duration,change:-1}]).sort((a,b)=>a.t-b.t||a.change-b.change);let poly=0,maxPolyphony=0;for(const p of points){poly+=p.change;maxPolyphony=Math.max(maxPolyphony,poly);}if(maxPolyphony>128)throw Error('Polyphonie MIDI excessive');
 return {format,ppqn,tracks,duration,bpm:60000000/tempos[0].tempo,notes,maxPolyphony,programs:[...new Set(notes.map(n=>n.program))].sort((a,b)=>a-b),warnings};
}
