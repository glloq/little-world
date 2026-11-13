/** AUD-V2 Studio — catalogue manager. Not a DAW: list/search/filter semantic events, see expected
 * vs available takes, edit simple parameters, associate files with a condition, preview a context.
 * Every edit is one undoable transaction validated by the V2 parser. */
import {node,field,input,numberInput,select,button} from './dom.ts';
import {encodeBase64,PATCHES} from '../audio/schema.ts';
import {inspectWav} from '../audio/wav.ts';
import {AudioEngine} from '../audio/engine.ts';
import {parseAudioDefinitionV2,diagnoseAudioCatalog,eventAvailability,assetPlayable,EVENT_CATEGORIES,REPEAT_MODES,type AudioDefinitionV2,type SoundEventV2,type SoundVariantV2} from '../audio/catalog.ts';
import {SURFACES,MATERIALS,MOVEMENTS,INTENSITIES,WEATHERS,TIMES,PLACES,type SoundCondition,type SoundContext} from '../audio/context.ts';
import type {StudioSession} from './session.ts';
const CATEGORY:Record<string,string>={movement:'Déplacements',water:'Eau',boat:'Navigation',mine:'Mines',farm:'Agriculture',npc:'PNJ',fauna:'Faune',interaction:'Objets',ui:'Interface',mission:'Missions',magic:'Magie',ambience:'Ambiances',weather:'Météo',legacy:'Sons V1'};
const summary=(c:SoundCondition|undefined)=>!c?'toujours':Object.entries(c).map(([k,v])=>`${k} = ${Array.isArray(v)?v.join('/'):String(v)}`).join(' · ');
const options=(values:readonly string[],empty='—')=>[['',empty] as const,...values.map(v=>[v,v] as const)];

export function mountAudioCatalog(host:HTMLElement,s:StudioSession,isActive:()=>boolean){
 let preview:AudioEngine|null=null,disposed=false,query='',category='',status='',selected:string|null=null,pending:{name:string;bytes:Uint8Array}|null=null,license='',origin='';
 const ctx:SoundContext={},feedback=node('p','','muted');feedback.setAttribute('role','status');
 const data=()=>s.document.world.audio as AudioDefinitionV2;
 const stop=()=>{if(preview)void preview.dispose();preview=null;};
 const engine=async()=>{const e=preview??(preview=new AudioEngine(data(),undefined,{baseUrl:import.meta.env.BASE_URL}));await e.unlock();return e;};
 const apply=async(label:string,edit:(d:AudioDefinitionV2)=>void)=>{try{const next=structuredClone(data());edit(next);const valid=parseAudioDefinitionV2(next);await s.change(label,[],d=>{d.world.audio=valid;});}catch(e){feedback.textContent=String(e instanceof Error?e.message:e);}};
 const state=(d:AudioDefinitionV2,id:string)=>{const a=eventAvailability(d,id);return a.available?{key:'ok',text:`${a.available}/${a.expected} prises`}:a.viaFallback?{key:'fallback',text:`repli → ${a.viaFallback}`}:{key:'missing',text:a.expected?`0/${a.expected} — à produire`:'aucune prise'};};
 function eventList(d:AudioDefinitionV2){
  const list=node('div','','feature-list'),q=query.trim().toLowerCase();
  const rows=Object.values(d.events).filter(e=>(!category||e.category===category)&&(!q||e.id.toLowerCase().includes(q)||(e.description??'').toLowerCase().includes(q))&&(!status||state(d,e.id).key===status));
  for(const e of rows.slice(0,25)){const st=state(d,e.id),row=node('div','','feature-row');row.dataset.event=e.id;row.append(node('strong',e.id),node('span',CATEGORY[e.category]??e.category,'chip'),node('span',st.text,'chip'+(st.key==='ok'?' active':st.key==='missing'?' warn':' pending')),node('span',e.description??'','muted'),button(selected===e.id?'Fermer':'Modifier '+e.id,()=>{selected=selected===e.id?null:e.id;render();}));list.append(row);if(selected===e.id)list.append(editor(d,e));}
  if(rows.length>25)list.append(node('p',`${rows.length-25} autres événements : affinez par recherche, catégorie ou état.`,'muted'));if(!rows.length)list.append(node('p','Aucun événement ne correspond.','muted'));
  return {list,count:rows.length};
 }
 function editor(d:AudioDefinitionV2,e:SoundEventV2){
  const card=node('div','','audio-preview'),set=(label:string,patch:(x:SoundEventV2)=>void)=>void apply(label+' — '+e.id,next=>patch(next.events[e.id]));
  card.append(node('strong','Réglages de '+e.id),
   field('Volume',numberInput(e.gain,v=>set('Volume',x=>{x.gain=v;}),0,1,'0.05')),field('Hauteur',numberInput(e.pitch,v=>set('Hauteur',x=>{x.pitch=v;}),.5,2,'0.05')),
   field('Variation de hauteur (± demi-tons, max 2)',numberInput(e.pitchJitter,v=>set('Variation de hauteur',x=>{x.pitchJitter=v;}),0,2,'0.1')),field('Variation de volume (± fraction)',numberInput(e.gainJitter,v=>set('Variation de volume',x=>{x.gainJitter=v;}),0,.5,'0.05')),
   field('Délai minimal entre deux lectures (ms)',numberInput(e.cooldownMs,v=>set('Délai minimal',x=>{x.cooldownMs=Math.round(v);}),0,60000,'10')),field('Priorité (0–10)',numberInput(e.priority,v=>set('Priorité',x=>{x.priority=v;}),0,10,'1')),
   field('Instances simultanées max',numberInput(e.maxInstances,v=>set('Polyphonie',x=>{x.maxInstances=Math.round(v);}),1,16,'1')),field('Portée (m)',numberInput(e.radius,v=>set('Portée',x=>{x.radius=v;}),1,200,'1')),
   field('Répétition',select(e.repeat,REPEAT_MODES.map(m=>[m,{random:'Aléatoire pondéré','avoid-repeat':'Éviter la même prise',shuffle:'Sac mélangé',sequence:'Séquence'}[m]] as const),v=>set('Répétition',x=>{x.repeat=v as SoundEventV2['repeat'];}))));
  const loop=node('input');loop.type='checkbox';loop.checked=e.loop;loop.onchange=()=>set('Boucle',x=>{x.loop=loop.checked;});const spatial=node('input');spatial.type='checkbox';spatial.checked=e.spatial;spatial.onchange=()=>set('Spatialisation',x=>{x.spatial=spatial.checked;});
  card.append(field('Lecture en boucle',loop),field('Son positionné dans le monde',spatial));
  if(e.fallback)card.append(node('p','Repli si aucune prise disponible : '+e.fallback,'muted'));
  card.append(node('h4',`Prises (${e.variants.length})`));
  e.variants.forEach((v,i)=>{const a=d.assets[v.assetId],row=node('div','','feature-row');row.append(node('strong',v.assetId),node('span',a.status,'chip'+(assetPlayable(a)?' active':'')),node('span','condition : '+summary(v.when),'muted'),node('span',`licence : ${a.license} · ${a.source}`,'muted'),button('Retirer la prise '+v.assetId,()=>set('Retirer une prise',x=>{x.variants.splice(i,1);})));card.append(row);});
  // Associate a file: an existing playable resource or a new licensed WAV, optionally under a condition.
  const playable=Object.values(d.assets).filter(a=>a.kind!=='midi'&&assetPlayable(a));let assetId=playable[0]?.id??'',surface='',material='',intensity='',wet=false;
  const wetBox=node('input');wetBox.type='checkbox';wetBox.onchange=()=>{wet=wetBox.checked;};
  const condition=():SoundVariantV2['when']=>{const c:SoundCondition={};if(surface)c.surface=[surface as never];if(material)c.material=[material as never];if(intensity)c.intensity=[intensity as never];if(wet)c.wet=true;return Object.keys(c).length?c:undefined;};
  const file=node('input');file.type='file';file.accept='.wav';file.setAttribute('aria-label','Fichier WAV de la prise');file.onchange=()=>void (async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>1_048_576)throw Error('Fichier limité à 1 Mio');const bytes=new Uint8Array(await f.arrayBuffer()),w=inspectWav(bytes);pending={name:f.name,bytes};feedback.textContent=`WAV inspecté : ${w.duration.toFixed(2)} s, ${w.channels} canal/canaux, ≈ ${Math.round(w.duration*48000*w.channels*4/1024)} Kio PCM décodés.`;}catch(err){pending=null;feedback.textContent=String(err instanceof Error?err.message:err);}})();
  card.append(node('h4','Associer une prise'),field('Ressource existante',select(assetId,playable.map(a=>[a.id,`${a.id} (${a.status})`] as const),v=>assetId=v)),
   field('Surface',select('',options(SURFACES,'toutes'),v=>surface=v)),field('Matière',select('',options(MATERIALS,'toutes'),v=>material=v)),field('Intensité',select('',options(INTENSITIES,'toutes'),v=>intensity=v)),field('Sol mouillé uniquement',wetBox),
   button('Ajouter la ressource choisie',()=>{if(!assetId){feedback.textContent='Aucune ressource disponible : importez un WAV.';return;}const when=condition();void set('Associer une prise',x=>{x.variants.push({assetId,weight:1,...(when?{when}:{})});});}),
   file,field('Licence de redistribution',input(license,v=>license=v)),field('Auteur / provenance',input(origin,v=>origin=v)),
   button('Importer et associer le WAV',()=>{if(!pending){feedback.textContent='Choisissez un WAV PCM valide.';return;}if(!license.trim()||!origin.trim()){feedback.textContent='Renseignez licence et provenance avant l’import.';return;}const take=pending,id='audio:'+crypto.randomUUID(),when=condition(),w=inspectWav(take.bytes);
    void apply('Importer une prise — '+e.id,next=>{next.assets[id]={id,name:take.name,kind:'sample',format:'wav',status:'GENERATED',license:license.trim(),source:origin.trim(),usage:e.bus==='ambience'?'ambience':'sfx',bytesBase64:encodeBase64(take.bytes),duration:Math.round(w.duration*1e4)/1e4,channels:w.channels as 1|2,sampleRate:w.sampleRate,estimatedDecodedBytes:Math.ceil(w.duration*48000)*w.channels*4};next.events[e.id].variants.push({assetId:id,weight:1,...(when?{when}:{})});}).then(()=>{pending=null;feedback.textContent='Prise importée (incluse dans l’archive du projet) et associée.';});}));
  return card;
 }
 function contextPreview(d:AudioDefinitionV2){
  const card=node('div','','audio-preview'),result=node('p','','muted'),ids=Object.keys(d.events);let eventId=selected??ids[0]??'';
  const pick=<K extends keyof SoundContext>(key:K,values:readonly string[],label:string)=>field(label,select(String(ctx[key]??''),options(values,'non précisé'),v=>{if(v)(ctx as Record<string,unknown>)[key]=v;else delete ctx[key];}));
  const wet=node('input');wet.type='checkbox';wet.checked=!!ctx.wet;wet.onchange=()=>{if(wet.checked)ctx.wet=true;else delete ctx.wet;};
  card.append(node('strong','Prévisualiser un contexte'),field('Événement à prévisualiser',select(eventId,ids.map(id=>[id,id] as const),v=>eventId=v)),pick('surface',SURFACES,'Contexte — surface'),pick('material',MATERIALS,'Contexte — matière'),pick('movement',MOVEMENTS,'Contexte — mouvement'),pick('intensity',INTENSITIES,'Contexte — intensité'),pick('weather',WEATHERS,'Contexte — météo'),pick('time',TIMES,'Contexte — moment'),pick('place',PLACES,'Contexte — lieu'),field('Contexte — mouillé',wet),
   button('Écouter dans ce contexte',async()=>{try{const e=await engine(),r=e.resolve(eventId,ctx);if(!r.ok){result.textContent=r.reason==='unknown-event'?'Événement inconnu.':`Silence : aucune ressource disponible (${r.path.join(' → ')}).`;return;}result.textContent=`Prise « ${r.sound.asset.id} » via ${r.sound.path.join(' → ')} · condition ${summary(r.sound.variant.when)} · gain ${r.sound.gain.toFixed(2)} · hauteur ×${r.sound.pitch.toFixed(2)}`;await e.playEvent(eventId,{context:ctx});}catch(err){result.textContent=String(err);}},'primary-button'),result);
  return card;
 }
 function render(){
  if(disposed||!isActive()||s.document.world.audio?.schemaVersion!==2)return;const d=data(),diagnostics=diagnoseAudioCatalog(d),planned=Object.values(d.assets).filter(a=>a.status==='PLANNED').length,playableEvents=Object.keys(d.events).filter(id=>eventAvailability(d,id).playable).length;
  const panel=node('section','','section-card');panel.append(node('div','AUDIO V2 · CATALOGUE CONTEXTUEL','kicker'),node('h2','Sons, musiques et ambiances'),
   node('p',`${Object.keys(d.events).length} événements (${playableEvents} audibles aujourd’hui), ${Object.keys(d.music.cues).length} thèmes musicaux, ${Object.keys(d.ambience).length} profils d’ambiance · ${planned} ressources encore à produire (statut PLANNED, jamais jouées).`,'muted'),button('Arrêter l’écoute',stop));
  const patches=node('div','','row');for(const id of d.patchIds)patches.append(button('Écouter '+PATCHES[id].name,async()=>{(await engine()).audition(id);}));panel.append(node('h3','Palette de timbres MIDI'),patches);
  const search=input(query,v=>{query=v;render();},'search');search.setAttribute('aria-label','Rechercher un événement');search.placeholder='footstep, mine, pluie…';
  const {list,count}=eventList(d);panel.append(node('h3','Événements sonores'),field('Rechercher un événement',search),
   field('Catégorie',select(category,[['','Toutes'],...EVENT_CATEGORIES.map(c=>[c,CATEGORY[c]??c] as const)],v=>{category=v;render();})),
   field('État des ressources',select(status,[['','Tous'],['ok','Prises disponibles'],['fallback','Repli provisoire'],['missing','Ressource manquante']],v=>{status=v;render();})),node('p',`${count} événement(s)`,'muted'),list);
  panel.append(contextPreview(d));
  const music=node('div','','feature-list');for(const c of Object.values(d.music.cues)){const ok=c.scoreIds.filter(id=>assetPlayable(d.assets[d.scores[id].assetId]));const row=node('div','','feature-row');row.append(node('strong',c.id),node('span',c.kind==='stinger'?'jingle':'boucle','chip'),node('span',ok.length?`${ok.length}/${c.scoreIds.length} partition(s)`:'à produire','chip'+(ok.length?' active':'')),node('span',`priorité ${c.priority} · ${summary(c.when)}${c.silence?` · silence ${c.silence.join('–')} s`:''}`,'muted'));if(ok.length)row.append(button('Écouter '+c.id,async()=>{const e=await engine();e.requestScore(ok[0]);}));music.append(row);}
  panel.append(node('h3','Profils musicaux'),music);
  const amb=node('div','','feature-list');for(const p of Object.values(d.ambience)){const row=node('div','','feature-row');row.append(node('strong',p.id),node('span',p.global?'global':p.exclusive?'lieu exclusif':'lieu','chip'),node('span',summary(p.when),'muted'));
   for(const l of p.layers){const ok=eventAvailability(d,l.eventId).playable;row.append(field(`${p.id} / ${l.id} (${l.role}${ok?'':', à produire'})`,numberInput(l.gain,v=>void apply('Volume de couche — '+p.id,next=>{next.ambience[p.id].layers.find(x=>x.id===l.id)!.gain=v;}),0,1,'0.05')));}amb.append(row);}
  panel.append(node('h3','Profils d’ambiance'),node('p','Couches : fond, météo, source localisée, événements ponctuels. Seules les plus prioritaires jouent selon le budget.','muted'),amb);
  const emitIds=Object.keys(d.events);let soundId=emitIds.find(id=>d.events[id].loop)??emitIds[0]??'',radius=30;
  panel.append(node('h3','Émetteurs'),field('Son de l’émetteur',select(soundId,emitIds.map(id=>[id,id] as const),v=>soundId=v)),field('Portée audio (m)',numberInput(radius,v=>radius=v,1,200)),
   button('Lier le son à l’entité sélectionnée',()=>{const id=s.selection.state.selected?.id;if(!id||!s.document.entityIndex[id]){feedback.textContent='Sélectionnez un objet ou un personnage sur la carte.';return;}void apply('Ajouter un émetteur audio',next=>{next.emitters.push({id:'emitter:'+crypto.randomUUID(),entityId:id,soundId,radius,loop:true,priority:1});});}));
  for(const e of d.emitters)panel.append(button('Supprimer l’émetteur '+e.id,()=>void apply('Supprimer un émetteur',next=>{next.emitters=next.emitters.filter(x=>x.id!==e.id);})));
  const warn=diagnostics.filter(x=>x.level!=='info');const diag=node('details');diag.append(node('summary',`Diagnostics (${warn.length} avertissement(s), ${diagnostics.length-warn.length} informations)`));for(const x of diagnostics.slice(0,80))diag.append(node('p',`${x.level==='warning'?'⚠ ':''}${x.message}`,'muted'));
  panel.append(diag,feedback,node('p','Import : WAV PCM court (≤ 8 s, 1 Mio) avec licence et provenance, inclus dans l’archive du projet. Les ressources de la bibliothèque Little World sont des fichiers statiques du jeu chargés à la demande.','muted'));
  host.replaceChildren(panel);
 }
 const unbind=s.commands.subscribe(t=>{if(t.patches.some(p=>p.path[0]==='world'&&p.path[1]==='audio')){stop();render();}});render();
 return {dispose(){disposed=true;unbind();stop();}};
}
