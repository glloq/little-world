import type { ChunkSourceV3, ProjectDocument } from './types.ts';
import { parseProjectHeader } from './schema.ts';
import type { CommandJournal } from './commands.ts';
import { defaultStudioContext, parseStudioContext, type StudioContext } from './context.ts';

export const STUDIO_DATABASE='little-world-studio-v3';
const DB_VERSION=2;
const stores=['projects','chunks','journals','contexts','checkpoints','checkpointChunks'] as const;
interface HeaderRecord {document:Omit<ProjectDocument,'chunks'>;revision:number;updatedAt:number;checkpointId:string|null;}
interface ChunkRecord {projectId:string;chunkId:string;source:ChunkSourceV3;}
interface CheckpointRecord {id:string;projectId:string;header:HeaderRecord;context:StudioContext;journal:CommandJournal|null;createdAt:number;}
export interface StoredProject {document:ProjectDocument;revision:number;context:StudioContext;journal:CommandJournal|null;checkpointId:string|null;}
export interface ProjectSummary {projectId:string;worldId:string;name:string;revision:number;updatedAt:number;}
export interface SaveOptions {expectedRevision:number;context?:StudioContext;journal?:CommandJournal|null;checkpoint?:boolean;}
export class ProjectRevisionError extends Error {constructor(){super('Le projet a été modifié dans un autre onglet. Rechargez ou exportez votre copie avant de continuer.');}}
export class ProjectStorageError extends Error {}
const range=(projectId:string)=>IDBKeyRange.bound([projectId,''],[projectId,'\uffff']);
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function completion(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new ProjectStorageError('Échec de stockage'));tx.onabort=()=>reject(tx.error??new ProjectStorageError('Transaction de stockage annulée'));});}
function headerOnly(document:ProjectDocument):Omit<ProjectDocument,'chunks'> {const {chunks:_,...header}=document;return header;}
function emptyJournal(document:ProjectDocument):CommandJournal{return {schemaVersion:1,projectId:document.manifest.projectId,worldId:document.manifest.worldId,sequence:0,undo:[],redo:[]};}
function contextFor(document:ProjectDocument,context?:StudioContext):StudioContext {
  const result=context?parseStudioContext(context):defaultStudioContext(document.manifest.projectId,document.manifest.worldId);
  if(result.projectId!==document.manifest.projectId||result.worldId!==document.manifest.worldId)throw new ProjectStorageError('Contexte d’un autre projet');return result;
}
function checkJournal(document:ProjectDocument,journal:CommandJournal|null|undefined):void {
  if(journal&&(journal.schemaVersion!==1||journal.projectId!==document.manifest.projectId||journal.worldId!==document.manifest.worldId||!Number.isSafeInteger(journal.sequence)||journal.sequence<0||!Array.isArray(journal.undo)||!Array.isArray(journal.redo)))throw new ProjectStorageError('Journal incompatible avec ce projet');
}
/** Authoring-only database. Runtime/player saves never open this namespace. */
export class ProjectStore {
  private db:Promise<IDBDatabase>|null=null;
  private databaseName:string;
  constructor(databaseName=STUDIO_DATABASE){this.databaseName=databaseName;}
  private open():Promise<IDBDatabase> {
    if(!this.db)this.db=new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(new ProjectStorageError('IndexedDB indisponible ; exportez le projet pour le conserver'));return;}
      const r=indexedDB.open(this.databaseName,DB_VERSION);
      r.onupgradeneeded=()=>{for(const name of stores)if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);const projects=r.transaction!.objectStore('projects');if(!projects.indexNames.contains('identityRevision'))projects.createIndex('identityRevision',['document.manifest.projectId','revision'],{unique:true});};
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};
      r.onerror=()=>{this.db=null;reject(r.error);};
      r.onblocked=()=>{this.db=null;reject(new ProjectStorageError('Fermez les autres onglets Studio pour mettre à jour le stockage'));};
    });return this.db;
  }
  async list():Promise<ProjectSummary[]> {
    const db=await this.open(),tx=db.transaction('projects','readonly'),done=completion(tx);
    const values=await request(tx.objectStore('projects').getAll()) as HeaderRecord[];await done;
    return values.map(v=>({projectId:v.document.manifest.projectId,worldId:v.document.manifest.worldId,name:v.document.manifest.name,revision:v.revision,updatedAt:v.updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  async create(document:ProjectDocument,options:{context?:StudioContext;journal?:CommandJournal|null}={}):Promise<StoredProject> {
    // Full import validation is the caller's preflight responsibility; header validation does not hydrate chunks.
    parseProjectHeader({...headerOnly(document),chunks:{}});
    const context=contextFor(document,options.context),journal=options.journal??emptyJournal(document);checkJournal(document,journal);
    const db=await this.open(),tx=db.transaction([...stores],'readwrite'),done=completion(tx);
    try{
      const id=document.manifest.projectId;
      if(await request(tx.objectStore('projects').get(id)))throw new ProjectStorageError('Un projet porte déjà cet identifiant');
      const copy={...document,manifest:{...document.manifest,revision:0}};
      const checkpointId=crypto.randomUUID();
      const header:HeaderRecord={document:headerOnly(copy),revision:0,updatedAt:Date.now(),checkpointId};
      tx.objectStore('projects').add(header,id);tx.objectStore('contexts').put(context,id);tx.objectStore('journals').put(journal,id);
      tx.objectStore('checkpoints').put({id:checkpointId,projectId:id,header,context,journal,createdAt:Date.now()} satisfies CheckpointRecord,[id,checkpointId]);
      for(const [chunkId,source] of Object.entries(document.chunks)){
        const record={projectId:id,chunkId,source} satisfies ChunkRecord;
        tx.objectStore('chunks').put(record,[id,chunkId]);tx.objectStore('checkpointChunks').put(record,[id,checkpointId,chunkId]);
      }
      await done;document.manifest.revision=0;
      return {document,revision:0,context,journal,checkpointId};
    }catch(error){try{tx.abort();}catch{/* already complete */}await done.catch(()=>{});throw error;}
  }
  async loadProject(projectId:string):Promise<StoredProject> {
    const db=await this.open(),tx=db.transaction(['projects','contexts','journals'],'readonly'),done=completion(tx);
    const [header,context,journal]=await Promise.all([
      request(tx.objectStore('projects').get(projectId)) as Promise<HeaderRecord|undefined>,
      request(tx.objectStore('contexts').get(projectId)) as Promise<StudioContext|undefined>,
      request(tx.objectStore('journals').get(projectId)) as Promise<CommandJournal|undefined>,
    ]);await done;
    if(!header)throw new ProjectStorageError('Projet introuvable');
    const document=parseProjectHeader({...header.document,chunks:{}});
    return {document,revision:header.revision,context:contextFor(document,context),journal:journal??null,checkpointId:header.checkpointId};
  }
  async loadChunks(projectId:string,ids:readonly string[],expectedRevision?:number):Promise<Record<string,ChunkSourceV3>> {
    if(!ids.length)return {};
    const db=await this.open(),tx=db.transaction(['chunks','projects'],'readonly'),done=completion(tx),result:Record<string,ChunkSourceV3>={};
    // Index lookup verifies the snapshot without cloning the global header/index.
    const revision=expectedRevision===undefined?Promise.resolve(projectId):request(tx.objectStore('projects').index('identityRevision').getKey([projectId,expectedRevision]));
    const rows=await Promise.all([...new Set(ids)].map(id=>request(tx.objectStore('chunks').get([projectId,id])) as Promise<ChunkRecord|undefined>));const identity=await revision;await done;if(identity!==projectId)throw new ProjectRevisionError();
    rows.forEach((row,i)=>{if(!row)throw new ProjectStorageError('Source de secteur introuvable : '+[...new Set(ids)][i]);result[row.chunkId]=row.source;});return result;
  }
  async loadAll(projectId:string):Promise<StoredProject> {
    // A single readonly transaction keeps header + chunks + journal mutually consistent during concurrent saves.
    const db=await this.open(),tx=db.transaction(['projects','chunks','contexts','journals'],'readonly'),done=completion(tx);
    const [header,rows,context,journal]=await Promise.all([
      request(tx.objectStore('projects').get(projectId)) as Promise<HeaderRecord|undefined>,
      request(tx.objectStore('chunks').getAll(range(projectId))) as Promise<ChunkRecord[]>,
      request(tx.objectStore('contexts').get(projectId)) as Promise<StudioContext|undefined>,
      request(tx.objectStore('journals').get(projectId)) as Promise<CommandJournal|undefined>,
    ]);await done;if(!header)throw new ProjectStorageError('Projet introuvable');
    const document=parseProjectHeader({...header.document,chunks:Object.fromEntries(rows.map(r=>[r.chunkId,r.source]))});
    return {document,revision:header.revision,context:contextFor(document,context),journal:journal??null,checkpointId:header.checkpointId};
  }
  async saveChanges(document:ProjectDocument,dirtyChunkIds:readonly string[],options:SaveOptions):Promise<number> {
    const id=document.manifest.projectId,context=options.context?contextFor(document,options.context):undefined;
    checkJournal(document,options.journal);
    const dirty=[...new Set(dirtyChunkIds)];
    const sourceHeader=structuredClone(headerOnly(document));
    const changedSources=Object.fromEntries(dirty.filter(chunkId=>document.chunkIndex[chunkId]).map(chunkId=>[chunkId,structuredClone(document.chunks[chunkId])]));
    for(const chunkId of dirty)if(document.chunkIndex[chunkId]&&!document.chunks[chunkId])throw new ProjectStorageError('Charger le secteur avant de le sauvegarder : '+chunkId);
    const db=await this.open(),tx=db.transaction([...stores],'readwrite'),done=completion(tx);
    try{
      const previous=await request(tx.objectStore('projects').get(id)) as HeaderRecord|undefined;
      if(!previous)throw new ProjectStorageError('Projet introuvable');
      if(previous.revision!==options.expectedRevision)throw new ProjectRevisionError();
      const revision=previous.revision+1;
      const snapshot={...sourceHeader,manifest:{...sourceHeader.manifest,revision},chunks:{}};
      const checkpointId=options.checkpoint?crypto.randomUUID():previous.checkpointId;
      const header:HeaderRecord={document:headerOnly(snapshot),revision,updatedAt:Date.now(),checkpointId};
      tx.objectStore('projects').put(header,id);
      if(context)tx.objectStore('contexts').put(context,id);
      if(options.journal!==undefined)tx.objectStore('journals').put(options.journal,id);
      for(const chunkId of dirty){
        if(!sourceHeader.chunkIndex[chunkId])tx.objectStore('chunks').delete([id,chunkId]);
        else tx.objectStore('chunks').put({projectId:id,chunkId,source:changedSources[chunkId]} satisfies ChunkRecord,[id,chunkId]);
      }
      if(options.checkpoint){
        // Periodic checkpoint copies authored source records in IndexedDB, never GPU data and never on every gesture.
        const [rows,savedContext,savedJournal]=await Promise.all([
          request(tx.objectStore('chunks').getAll(range(id))) as Promise<ChunkRecord[]>,
          request(tx.objectStore('contexts').get(id)) as Promise<StudioContext|undefined>,
          request(tx.objectStore('journals').get(id)) as Promise<CommandJournal|undefined>,
        ]);
        tx.objectStore('checkpoints').put({id:checkpointId!,projectId:id,header,context:savedContext??contextFor(document),journal:savedJournal??null,createdAt:Date.now()} satisfies CheckpointRecord,[id,checkpointId!]);
        for(const row of rows)tx.objectStore('checkpointChunks').put(row,[id,checkpointId!,row.chunkId]);
        // Keep the latest two checkpoints; bounded storage even during long authoring sessions.
        const old=await request(tx.objectStore('checkpoints').getAll(range(id))) as CheckpointRecord[];
        const expired=old.sort((a,b)=>b.createdAt-a.createdAt).slice(2);
        for(const item of expired){tx.objectStore('checkpoints').delete([id,item.id]);tx.objectStore('checkpointChunks').delete(IDBKeyRange.bound([id,item.id,''],[id,item.id,'\uffff']));}
      }
      await done;document.manifest.revision=revision;return revision;
    }catch(error){try{tx.abort();}catch{/* already complete */}await done.catch(()=>{});throw error;}
  }
  async loadCheckpoint(projectId:string,checkpointId:string):Promise<StoredProject> {
    const db=await this.open(),tx=db.transaction(['checkpoints','checkpointChunks'],'readonly'),done=completion(tx);
    const [record,rows]=await Promise.all([
      request(tx.objectStore('checkpoints').get([projectId,checkpointId])) as Promise<CheckpointRecord|undefined>,
      request(tx.objectStore('checkpointChunks').getAll(IDBKeyRange.bound([projectId,checkpointId,''],[projectId,checkpointId,'\uffff']))) as Promise<ChunkRecord[]>,
    ]);await done;if(!record)throw new ProjectStorageError('Checkpoint absent ou expiré');
    const document=parseProjectHeader({...record.header.document,chunks:Object.fromEntries(rows.map(r=>[r.chunkId,r.source]))});
    return {document,revision:record.header.revision,context:contextFor(document,record.context),journal:record.journal,checkpointId};
  }
  async close():Promise<void>{if(this.db)(await this.db).close();this.db=null;}
}
