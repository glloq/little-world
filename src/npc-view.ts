import * as THREE from 'three';
import { buildSquirrel } from './squirrel.ts';
import { createDialogue, type DialogueSession } from './dialogue.ts';
import {
  createNPCState,
  DEFAULT_NPCS,
  DEFAULT_NPC_OBSTACLES,
  updateNPC,
  npcVisualTier,
  validateNPCs,
  type NPCDefinition,
  type NPCPoint,
  type NPCState,
  type NavigationObstacle,
} from './npc.ts';
import type { Player } from './player.ts';
import './npc.css';

/** All DOM content is written as text, including author-provided names and dialogue. */
function createDialoguePanel() {
  const root = document.createElement('section');
  root.className = 'npc-dialogue';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Conversation');
  const name = document.createElement('h2'),
    line = document.createElement('p'),
    choices = document.createElement('div'),
    close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fermer · Échap';
  close.className = 'npc-dialogue-close';
  root.append(name, line, choices, close);
  document.body.append(root);
  let session: DialogueSession | null = null,
    npc: NPCState | null = null,
    previousFocus: HTMLElement | null = null;
  function dismiss() {
    if (npc) npc.phase = 'idle';
    session?.close();
    session = null;
    npc = null;
    root.hidden = true;
    previousFocus?.focus();
  }
  function render() {
    if (!session || session.closed) {
      dismiss();
      return;
    }
    line.textContent = session.line.text;
    choices.replaceChildren();
    for (const [i, choice] of session.choices.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.text;
      button.addEventListener('click', () => {
        session?.choose(i);
        render();
      });
      choices.append(button);
    }
    (choices.querySelector('button') ?? close).focus();
  }
  close.addEventListener('click', dismiss);
  const onKey = (e: KeyboardEvent) => {
    if (!session) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button')];
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        (current + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  return {
    open(state: NPCState) {
      if (!state.definition.dialogue) return;
      dismiss();
      previousFocus = document.activeElement as HTMLElement | null;
      npc = state;
      npc.phase = 'talk';
      session = createDialogue(state.definition.dialogue, state.flags);
      name.textContent = state.definition.name;
      root.hidden = false;
      render();
    },
    get isOpen() {
      return session !== null;
    },
    get npcId() {
      return npc?.definition.id ?? null;
    },
    get emotion() {
      return session?.line.emotion;
    },
    close: dismiss,
    dispose() {
      dismiss();
      root.remove();
      window.removeEventListener('keydown', onKey);
    },
  };
}
export function createNPCSystem(
  scene: THREE.Scene,
  definitions: readonly NPCDefinition[] = DEFAULT_NPCS,
  obstacles: readonly NavigationObstacle[] = DEFAULT_NPC_OBSTACLES,
) {
  if (!validateNPCs(definitions)) throw new Error('Liste de PNJ invalide');
  const dialogue = createDialoguePanel();
  let disposed=false;
  // Original five-part low-poly silhouette. GPU resources belong to this system,
  // are shared by every distant actor, and are disposed once when it is retired.
  const proxyGeometry = new THREE.IcosahedronGeometry(1, 0);
  const proxyFur = new THREE.MeshLambertMaterial({color:0x9d654f,flatShading:true});
  const proxyLight = new THREE.MeshLambertMaterial({color:0xb77d64,flatShading:true});
  function silhouette(definition:NPCDefinition){
    const root=new THREE.Group();root.name='NPC silhouette:'+definition.id;
    const part=(material:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
      const mesh=new THREE.Mesh(proxyGeometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);root.add(mesh);
    };
    part(proxyFur,0,.72,0,.49,.62,.41);
    part(proxyLight,0,1.45,.23,.55,.51,.46);
    part(proxyLight,.42,1.35,-.62,.46,.85,.4);
    part(proxyFur,-.42,1.98,.24,.2,.29,.15);
    part(proxyFur,.42,1.98,.24,.2,.29,.15);
    if(definition.kind==='animal')root.scale.setScalar(.58);
    root.visible=false;scene.add(root);return root;
  }
  const entries = definitions.map((definition) => {
    const state = createNPCState(definition),
      model = buildSquirrel();
    model.setAppearance(definition.appearance);
    if (definition.kind === 'animal') model.group.scale.setScalar(0.58);
    model.group.name = 'NPC:' + definition.id;
    model.group.visible=false;
    scene.add(model.group);
    const proxy=silhouette(definition);
    const head=model.group.getObjectByName('HeadJoint'),arm=model.group.getObjectByName('ArmRight');
    const player: Player = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      mode: 'ground',
      oxygen: 90,
      glideReady: false,
    };
    return { state, model, player, proxy, head, arm, appliedEmotion:definition.appearance.emotion };
  });
  function nearest(player: NPCPoint) {
    let best: (typeof entries)[number] | null = null,
      distance = 5.5;
    for (const entry of entries) {
      if (!entry.state.definition.dialogue) continue;
      const d = Math.hypot(player.x - entry.state.x, player.z - entry.state.z);
      if (d < distance) {
        distance = d;
        best = entry;
      }
    }
    return best;
  }
  return {
    dialogue,
    states: entries.map((entry) => entry.state),
    update(dt: number, time: number, position: NPCPoint) {
      if(disposed)return;
      for (const entry of entries) {
        const {state,model,player,proxy,head,arm}=entry;
        updateNPC(state, dt, position, obstacles);
        const tier=npcVisualTier(Math.hypot(position.x-state.x,position.z-state.z));
        model.group.visible=tier==='rig';proxy.visible=tier==='silhouette';
        if(tier==='hidden')continue;
        if(tier==='silhouette'){
          proxy.position.set(state.x,state.y,state.z);proxy.rotation.y=state.heading;
          continue;
        }
        player.position.set(state.x, state.y, state.z);
        // The visual model faces its local +Z; its parent supplies world heading.
        player.velocity.set(0, 0, Math.hypot(state.vx, state.vz));
        model.group.position.copy(player.position);
        model.group.rotation.y = state.heading;
        model.update(player, dt, time);
        if (state.phase === 'greet' || state.phase === 'work') {
          if (head) head.rotation.y = Math.sin(time * 1.7) * 0.12;
          if (arm) {
            arm.rotation.z = state.phase === 'greet' ? -1.6 : -0.45;
            arm.rotation.x = Math.sin(time * (state.phase === 'greet' ? 5 : 3)) * 0.25;
          }
        }
        const emotion=(dialogue.npcId===state.definition.id?dialogue.emotion:undefined)??state.definition.appearance.emotion;
        if(emotion!==entry.appliedEmotion){
          model.setAppearance({...state.definition.appearance,emotion});entry.appliedEmotion=emotion;
        }
      }
    },
    interact(position: NPCPoint): boolean {
      if(disposed)return false;
      if (dialogue.isOpen) return true;
      const entry = nearest(position);
      if (!entry) return false;
      dialogue.open(entry.state);
      return true;
    },
    prompt(position: NPCPoint): string | null {
      if(disposed)return null;
      if (dialogue.isOpen) return null;
      const entry = nearest(position);
      return entry ? '[E] Parler avec ' + entry.state.definition.name : null;
    },
    dispose() {
      if(disposed)return;disposed=true;
      dialogue.dispose();
      for (const { model, proxy } of entries) { model.dispose();proxy.removeFromParent(); }
      proxyGeometry.dispose();proxyFur.dispose();proxyLight.dispose();
    },
  };
}
