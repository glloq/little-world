import * as THREE from 'three';
import { FrameClock } from './frame-clock';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import './style.css';
import catalogue from '../assets/catalog.json' with { type: 'json' };
import {
  addPlacement,
  buildWorld,
  configureScene,
  removePlacement,
  type WorldView,
} from './world';
import {
  defaultWorld,
  parseWorld,
  resolveConfig,
  EditHistory,
  type WorldDefinition,
  type Placement,
  type TerrainStroke,
} from './world-data';
import {
  configureTerrain,
  insideWorld,
  terrainHeight,
  getTerrainConfig,
} from './terrain';
import { BIOMES, type BiomeId } from './biomes';
import { DEFAULT_NPCS, type NPCDefinition } from './npc';
import { createNPCSystem } from './npc-view';
import { saveLocal, loadLocal } from './editor-storage';
import { createDialogueEditor } from './dialogue-editor';
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const val = (id: string) => $(id) as HTMLInputElement;
const viewport = $('editor-viewport'),
  canvasMessage = $('editor-message');
const scene = new THREE.Scene();
configureScene(scene);
const camera = new THREE.PerspectiveCamera(51, 1, 0.2, 1600);
camera.position.set(110, 150, 100);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
viewport.append(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(-15, 8, -120);
orbit.enableDamping = true;
orbit.maxDistance = 650;
orbit.minDistance = 12;
orbit.maxPolarAngle = Math.PI / 2.01;
const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform.getHelper());
transform.showY = false;
const grid = new THREE.GridHelper(2000, 200, 0x729287, 0x9ab5a5);
grid.visible = false;
grid.position.y = 0.15;
scene.add(grid);
const brush = new THREE.Mesh(
  new THREE.RingGeometry(0.94, 1, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffe4a0,
    side: THREE.DoubleSide,
    depthTest: false,
  }),
);
brush.rotation.x = -Math.PI / 2;
brush.renderOrder = 10;
brush.visible = false;
scene.add(brush);
let draft = defaultWorld(),
  world: WorldView = buildWorld(draft.config, draft),
  npcs = createNPCSystem(scene, draft.npcs);
scene.add(world.root);
const history = new EditHistory<WorldDefinition>();
let selected = new Set<string>(),
  selectedNPC: string | null = null,
  tool = 'select',
  chosen: string | null = null,
  dirty = false,
  ready = false;
const dialogueContainer = document.createElement('div');
$('npc-properties').append(dialogueContainer);
const dialogueEditor = createDialogueEditor(dialogueContainer, {
  getNPC: () => draft.npcs.find((n) => n.id === selectedNPC),
  commit(edit) {
    const id = selectedNPC;
    checkpoint();
    edit();
    npcs.dispose();
    npcs = createNPCSystem(scene, draft.npcs);
    selectedNPC = id;
    markDirty();
    inspect();
  },
  preview() {
    const state = npcs.states.find((n) => n.definition.id === selectedNPC);
    if (state) npcs.interact(state);
  },
});
let line: { x: number; z: number }[] = [],
  lineMarkers = new THREE.Group();
scene.add(lineMarkers);
const ray = new THREE.Raycaster(),
  mouse = new THREE.Vector2();
let down = { x: 0, y: 0 },
  painting = false,
  lastPaint: THREE.Vector3 | null = null,
  dragged = false;
function info(text: string) {
  canvasMessage.textContent = text;
}
function markDirty() {
  dirty = true;
  updateControls();
}
function checkpoint() {
  history.record(draft);
}
function configure() {
  configureTerrain(draft.config, draft.terrain, draft.water, draft.paths);
}
function updateControls() {
  val('seed').value = String(draft.config.seed);
  val('density').value = String(draft.config.density);
  $('density-value').textContent = String(draft.config.density);
  const c = resolveConfig(draft.config);
  val('world-width').value = String(c.width);
  val('world-length').value = String(c.length);
  val('map-name').value = draft.name;
  $('dirty-state').textContent = dirty
    ? 'Modifications non sauvegardées'
    : 'Enregistré';
  $('object-count').textContent =
    `${draft.placements.length} objets · ${draft.npcs.length} PNJ · ${draft.terrain.length} retouches`;
  ($('undo') as HTMLButtonElement).disabled = !history.canUndo;
  ($('redo') as HTMLButtonElement).disabled = !history.canRedo;
  const list = $('object-list') as HTMLSelectElement;
  list.replaceChildren(new Option('Choisir un objet', ''));
  for (const p of draft.placements)
    list.add(
      new Option(
        `${catalogue.assets.find((a) => a.id === p.assetId)?.name ?? p.assetId} · ${p.id.slice(0, 4)}`,
        p.id,
      ),
    );
  for (const n of draft.npcs) list.add(new Option(n.name, 'npc:' + n.id));
  const layers = $('layer-list') as HTMLSelectElement;
  layers.replaceChildren();
  for (const key of ['terrain', 'biomes', 'water', 'paths'] as const)
    for (const [i, item] of draft[key].entries())
      layers.add(
        new Option(
          `${{ terrain: 'Relief', biomes: 'Biotope', water: 'Eau', paths: 'Chemin' }[key]} ${i + 1}`,
          key + ':' + item.id,
        ),
      );
}
function rebuild() {
  transform.detach();
  world.dispose();
  npcs.dispose();
  configure();
  world = buildWorld(draft.config, draft);
  scene.add(world.root);
  for (const p of draft.placements) addPlacement(world, p);
  npcs = createNPCSystem(scene, draft.npcs);
  world.update(0, orbit.target);
  selected.clear();
  selectedNPC = null;
  updateControls();
  inspect();
}
function applyEdit(edit: () => void, rebuildAll = false) {
  const before = structuredClone(draft);
  try {
    edit();
    parseWorld(draft);
    history.record(before);
    configure();
    if (rebuildAll) rebuild();
    markDirty();
  } catch (e) {
    draft = before;
    rebuild();
    info('Modification refusée : ' + String(e));
  }
}
function selectedObject() {
  return world.objects.children.find((o) =>
    selected.has(o.userData.placementId),
  );
}
function inspect() {
  const p = draft.placements.find((p) => selected.has(p.id)),
    n = draft.npcs.find((n) => n.id === selectedNPC);
  $('object-properties').hidden = !p;
  $('npc-properties').hidden = !n;
  $('selection-empty').hidden = !!p || !!n;
  if (p) {
    val('object-x').value = String(p.x);
    val('object-z').value = String(p.z);
    val('object-rotation').value = String(
      Math.round((p.rotation * 180) / Math.PI),
    );
    val('object-scale').value = String(p.scale ?? 1);
    $('active-tool').textContent =
      selected.size > 1
        ? `${selected.size} objets`
        : (catalogue.assets.find((a) => a.id === p.assetId)?.name ?? p.assetId);
  }
  if (n) {
    val('npc-name').value = n.name;
    val('npc-behavior').value = n.behavior;
    val('npc-radius').value = String(n.radius);
    val('npc-speed').value = String(n.speed);
    val('npc-greeting').value =
      n.dialogue?.lines.find((l) => l.id === n.dialogue?.start)?.text ?? '';
    val('npc-story').value =
      n.dialogue?.lines.find((l) => l.id !== n.dialogue?.start)?.text ?? '';
    val('npc-choice').value =
      n.dialogue?.lines.find((l) => l.id === n.dialogue?.start)?.choices?.[0]
        ?.text ?? '';
    $('active-tool').textContent = n.name;
  }
  dialogueEditor.refresh();
  const obj = selectedObject();
  if (obj && selected.size === 1) transform.attach(obj);
  else transform.detach();
}
function choose(id: string, add = false) {
  if (!add) selected.clear();
  selectedNPC = null;
  if (id.startsWith('npc:')) selectedNPC = id.slice(4);
  else if (id) {
    if (add && selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  inspect();
}
function setTool(value: string) {
  tool = value;
  chosen = null;
  line = [];
  clearMarkers();
  transform.detach();
  brush.visible = false;
  orbit.enabled = true;
  orbit.mouseButtons.LEFT = [
    'raise',
    'lower',
    'flatten',
    'smooth',
    'biome',
  ].includes(tool)
    ? null
    : THREE.MOUSE.ROTATE;
  orbit.mouseButtons.RIGHT = [
    'raise',
    'lower',
    'flatten',
    'smooth',
    'biome',
  ].includes(tool)
    ? THREE.MOUSE.ROTATE
    : THREE.MOUSE.PAN;
  $('brush-panel').hidden = ![
    'raise',
    'lower',
    'flatten',
    'smooth',
    'biome',
  ].includes(tool);
  $('height-label').hidden = tool !== 'flatten';
  $('biome-label').hidden = tool !== 'biome';
  $('line-panel').hidden = !['water', 'path'].includes(tool);
  $('water-level-label').hidden = tool !== 'water';
  $('water-depth-label').hidden = tool !== 'water';
  for (const b of $('tools').querySelectorAll<HTMLButtonElement>('button'))
    b.classList.toggle('selected', b.dataset.tool === value);
  $('active-tool').textContent = tools.find((t) => t[0] === tool)?.[1] ?? value;
  info(
    tool === 'select'
      ? 'Sélectionner : clic · Maj + clic pour grouper'
      : 'Outil : ' + $('active-tool').textContent,
  );
}
const tools = [
  ['select', '↖ Sélection'],
  ['raise', '↑ Élever'],
  ['lower', '↓ Abaisser'],
  ['smooth', '≈ Lisser'],
  ['flatten', '▱ Aplanir'],
  ['biome', '❀ Biotopes'],
  ['water', '〰 Eau'],
  ['path', '⋯ Chemin'],
  ['npc', '♟ PNJ'],
];
for (const [id, label] of tools) {
  const b = document.createElement('button');
  b.className = 'light-button';
  b.dataset.tool = id;
  b.textContent = label;
  b.onclick = () => setTool(id);
  $('tools').append(b);
}
for (const [id, biome] of Object.entries(BIOMES))
  ($('biome') as HTMLSelectElement).add(new Option(biome.name, id));
for (const category of new Set(catalogue.assets.map((a) => a.category)))
  ($('asset-category') as HTMLSelectElement).add(
    new Option(category, category),
  );
function renderCatalogue() {
  const search = val('asset-search').value.toLocaleLowerCase(),
    category = val('asset-category').value;
  $('catalogue').replaceChildren();
  for (const a of catalogue.assets) {
    if (
      !a.name.toLocaleLowerCase().includes(search) ||
      (category && a.category !== category)
    )
      continue;
    const b = document.createElement('button');
    b.className = 'asset-choice';
    b.textContent = a.name;
    const small = document.createElement('small');
    small.textContent = a.category;
    b.append(small);
    b.title = `${a.name} · création originale locale`;
    b.onclick = () => {
      setTool('place');
      chosen = a.id;
      b.classList.add('selected');
      $('active-tool').textContent = a.name;
      info('Cliquer sur le terrain pour placer ' + a.name);
    };
    $('catalogue').append(b);
  }
}
val('asset-search').oninput = renderCatalogue;
val('asset-category').onchange = renderCatalogue;
renderCatalogue();
function terrainHit(e: PointerEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    (-(e.clientY - r.top) / r.height) * 2 + 1,
  );
  ray.setFromCamera(mouse, camera);
  return (
    ray
      .intersectObject(world.terrain, true)
      .find(
        (h) =>
          insideWorld(h.point.x, h.point.z) &&
          Math.abs(h.point.y - terrainHeight(h.point.x, h.point.z)) < 2,
      )?.point ?? null
  );
}
function paint(pos: THREE.Vector3) {
  if (
    lastPaint &&
    lastPaint.distanceTo(pos) < Math.max(2, +val('brush-radius').value * 0.25)
  )
    return;
  if (draft.terrain.length >= 1000 || draft.biomes.length >= 500) {
    info('Limite de retouches atteinte');
    return;
  }
  const radius = +val('brush-radius').value,
    strength = +val('brush-strength').value;
  if (tool === 'biome')
    draft.biomes.push({
      id: crypto.randomUUID(),
      x: pos.x,
      z: pos.z,
      radius,
      biome: val('biome').value as BiomeId,
      density: 1,
    });
  else {
    const h =
      tool === 'smooth'
        ? (terrainHeight(pos.x - radius * 0.4, pos.z) +
            terrainHeight(pos.x + radius * 0.4, pos.z) +
            terrainHeight(pos.x, pos.z - radius * 0.4) +
            terrainHeight(pos.x, pos.z + radius * 0.4)) /
          4
        : +val('brush-height').value;
    draft.terrain.push({
      id: crypto.randomUUID(),
      x: pos.x,
      z: pos.z,
      radius,
      strength,
      mode: tool as TerrainStroke['mode'],
      height: h,
    });
  }
  configure();
  world.refreshTerrain(pos.x, pos.z, radius);
  for (const o of world.objects.children) {
    o.position.y = terrainHeight(o.position.x, o.position.z);
  }
  lastPaint = pos.clone();
  markDirty();
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  dragged = false;
  if (!ready || e.button !== 0) return;
  if (['raise', 'lower', 'flatten', 'smooth', 'biome'].includes(tool)) {
    const p = terrainHit(e);
    if (p) {
      checkpoint();
      painting = true;
      lastPaint = null;
      paint(p);
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!ready) return;
  const p = terrainHit(e);
  if (['raise', 'lower', 'flatten', 'smooth', 'biome'].includes(tool) && p) {
    brush.visible = true;
    brush.position.set(p.x, p.y + 0.2, p.z);
    brush.scale.setScalar(+val('brush-radius').value);
  } else brush.visible = false;
  if (painting && p && e.buttons === 1) paint(p);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (painting) {
    painting = false;
    lastPaint = null;
    return;
  }
  if (
    !ready ||
    e.button !== 0 ||
    dragged ||
    transform.dragging ||
    Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
  )
    return;
  if (tool === 'select') {
    terrainHit(e);
    const hits = ray.intersectObject(world.objects, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o.parent && o.parent !== world.objects) o = o.parent;
      choose(o.userData.placementId, e.shiftKey);
    } else choose('');
    return;
  }
  const p = terrainHit(e);
  if (!p) return;
  if (tool === 'place' && chosen) {
    applyEdit(() => {
      const item: Placement = {
        id: crypto.randomUUID(),
        assetId: chosen!,
        x: +p.x.toFixed(2),
        z: +p.z.toFixed(2),
        rotation: 0,
        scale: 1,
      };
      draft.placements.push(item);
      addPlacement(world, item);
    });
    info('Objet ajouté');
  }
  if (tool === 'npc') {
    applyEdit(() => {
      const n = structuredClone(DEFAULT_NPCS[0]);
      n.id = crypto.randomUUID();
      n.name = 'Habitant';
      n.x = p.x;
      n.z = p.z;
      n.behavior = 'wander';
      draft.npcs.push(n);
    }, true);
    selectedNPC = draft.npcs.at(-1)!.id;
    inspect();
    info('PNJ ajouté');
  }
  if (tool === 'water' || tool === 'path') {
    line.push({ x: p.x, z: p.z });
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffdd88 }),
    );
    dot.position.copy(p);
    dot.position.y += 1;
    lineMarkers.add(dot);
    info(`${line.length} points · Terminer le tracé pour appliquer`);
  }
});
window.addEventListener('pointerup', () => {
  painting = false;
});
function clearMarkers() {
  for (const o of [...lineMarkers.children]) {
    const m = o as THREE.Mesh;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    lineMarkers.remove(o);
  }
}
$('finish-line').onclick = () => {
  if (line.length < 2) {
    info('Ajouter au moins deux points');
    return;
  }
  const before = structuredClone(draft);
  const item = {
    id: crypto.randomUUID(),
    points: structuredClone(line),
    width: +val('line-width').value,
  };
  if (tool === 'water')
    draft.water.push({
      ...item,
      level: +val('water-level').value,
      depth: +val('water-depth').value,
    });
  else draft.paths.push(item);
  try {
    draft = parseWorld(draft);
    history.record(before);
    line = [];
    clearMarkers();
    rebuild();
    markDirty();
    info('Tracé appliqué');
  } catch (e) {
    draft = before;
    rebuild();
    info(String(e));
  }
};
$('cancel-line').onclick = () => {
  line = [];
  clearMarkers();
  info('Tracé annulé');
};
transform.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  if (e.value) {
    checkpoint();
    dragged = true;
  }
});
transform.addEventListener('objectChange', () => {
  dragged = true;
  const o = transform.object,
    p = draft.placements.find((p) => p.id === o?.userData.placementId);
  if (!o || !p) return;
  const c = getTerrainConfig();
  o.position.x = THREE.MathUtils.clamp(
    o.position.x,
    -c.width / 2 + 3,
    c.width / 2 - 3,
  );
  o.position.z = THREE.MathUtils.clamp(
    o.position.z,
    -c.length / 2 + 12,
    c.length / 2 - 14,
  );
  o.position.y = terrainHeight(o.position.x, o.position.z);
  const scale = THREE.MathUtils.clamp(o.scale.x, 0.1, 10);
  o.scale.setScalar(scale);
  p.x = o.position.x;
  p.z = o.position.z;
  p.rotation = o.rotation.y;
  p.scale = scale;
  markDirty();
});
$('move-object').onclick = () => {
  transform.setMode('translate');
  transform.showX = true;
  transform.showY = false;
  transform.showZ = true;
};
$('rotate-object').onclick = () => {
  transform.setMode('rotate');
  transform.showX = false;
  transform.showY = true;
  transform.showZ = false;
};
$('scale-object').onclick = () => {
  transform.setMode('scale');
  transform.showX = true;
  transform.showY = false;
  transform.showZ = false;
};
val('snap').onchange = () => {
  transform.setTranslationSnap(val('snap').checked ? 1 : null);
  transform.setRotationSnap(val('snap').checked ? Math.PI / 12 : null);
};
for (const id of ['object-x', 'object-z', 'object-rotation', 'object-scale'])
  val(id).onchange = () => {
    const before = structuredClone(draft);
    const p = draft.placements.find((p) => selected.has(p.id));
    if (!p) return;
    p.x = +val('object-x').value;
    p.z = +val('object-z').value;
    p.rotation = (+val('object-rotation').value * Math.PI) / 180;
    p.scale = +val('object-scale').value;
    try {
      parseWorld(draft);
      history.record(before);
      const o = selectedObject()!;
      o.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      o.rotation.y = p.rotation;
      o.scale.setScalar(p.scale);
      markDirty();
    } catch (e) {
      draft = before;
      rebuild();
      info(String(e));
    }
  };
$('object-list').onchange = () => {
  setTool('select');
  choose(val('object-list').value);
  const o = selectedObject(),
    n = draft.npcs.find((n) => n.id === selectedNPC);
  if (o) orbit.target.copy(o.position);
  if (n) orbit.target.set(n.x, terrainHeight(n.x, n.z), n.z);
};
$('delete-object').onclick = () => {
  applyEdit(() => {
    for (const o of [...world.objects.children])
      if (selected.has(o.userData.placementId)) removePlacement(o);
    draft.placements = draft.placements.filter((p) => !selected.has(p.id));
    selected.clear();
  });
  inspect();
};
$('duplicate-object').onclick = () => {
  if (!selected.size) return;
  applyEdit(() => {
    const copies = draft.placements
      .filter((p) => selected.has(p.id))
      .map((p) => ({ ...p, id: crypto.randomUUID(), x: p.x + 2 }));
    if (copies.some((p) => !insideWorld(p.x, p.z))) return;
    selected = new Set(copies.map((p) => p.id));
    for (const p of copies) {
      draft.placements.push(p);
      addPlacement(world, p);
    }
  });
  inspect();
};
$('npc-apply').onclick = () => {
  const n = draft.npcs.find((n) => n.id === selectedNPC);
  if (!n) return;
  const before = structuredClone(draft);
  n.name = val('npc-name').value;
  n.behavior = val('npc-behavior').value as NPCDefinition['behavior'];
  n.radius = +val('npc-radius').value;
  n.speed = +val('npc-speed').value;
  if (n.behavior === 'patrol')
    n.path = structuredClone(
      draft.paths.at(-1)?.points ?? [
        { x: n.x, z: n.z },
        { x: n.x + 3, z: n.z },
      ],
    );
  if (n.dialogue) {
    const start = n.dialogue.lines.find((l) => l.id === n.dialogue?.start);
    if (start) {
      start.text = val('npc-greeting').value;
      if (start.choices?.[0]) start.choices[0].text = val('npc-choice').value;
    }
    const story = n.dialogue.lines.find((l) => l.id !== n.dialogue?.start);
    if (story) story.text = val('npc-story').value;
  }
  try {
    draft = parseWorld(draft);
    history.record(before);
    npcs.dispose();
    npcs = createNPCSystem(scene, draft.npcs);
    markDirty();
    info('PNJ mis à jour');
  } catch (e) {
    draft = before;
    rebuild();
    info(String(e));
  }
};
$('npc-dialogue-preview').onclick = () => {
  const n = npcs.states.find((n) => n.definition.id === selectedNPC);
  if (n) npcs.interact({ x: n.x, z: n.z });
};
$('npc-delete').onclick = () =>
  applyEdit(() => {
    draft.npcs = draft.npcs.filter((n) => n.id !== selectedNPC);
  }, true);
$('delete-layer').onclick = () => {
  const [key, id] = val('layer-list').value.split(':');
  if (!['terrain', 'biomes', 'water', 'paths'].includes(key)) return;
  applyEdit(() => {
    const k = key as 'terrain';
    draft[k] = draft[k].filter((p) => p.id !== id);
  }, true);
};
function travelHistory(redo = false) {
  const value = redo ? history.redo(draft) : history.undo(draft);
  if (value) {
    draft = value;
    rebuild();
    markDirty();
    info(redo ? 'Modification rétablie' : 'Modification annulée');
  }
}
$('undo').onclick = () => travelHistory();
$('redo').onclick = () => travelHistory(true);
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input,textarea,select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    travelHistory(e.shiftKey);
  }
  if (e.key === 'Delete' && selected.size) $('delete-object').click();
  if (e.key === 'Escape') {
    npcs.dialogue.close();
    setTool('select');
    choose('');
  }
});
$('regenerate').onclick = () => {
  const before = structuredClone(draft);
  draft.config = {
    ...draft.config,
    seed: +val('seed').value,
    density: +val('density').value,
    width: +val('world-width').value,
    length: +val('world-length').value,
  };
  try {
    draft = parseWorld(draft);
    history.record(before);
    rebuild();
    markDirty();
    info('Vallée régénérée · retouches conservées');
  } catch (e) {
    draft = before;
    rebuild();
    info(String(e));
  }
};
val('map-name').onchange = () =>
  applyEdit(() => {
    draft.name = val('map-name').value;
  });
val('density').oninput = () => {
  $('density-value').textContent = val('density').value;
};
$('clear').onclick = () => {
  if (draft.placements.length)
    applyEdit(() => {
      draft.placements = [];
    }, true);
};
$('save').onclick = async () => {
  try {
    const snapshot = parseWorld(draft);
    await saveLocal(snapshot);
    if (JSON.stringify(snapshot) === JSON.stringify(draft)) dirty = false;
    updateControls();
    info('Brouillon enregistré dans IndexedDB');
  } catch (e) {
    info('Sauvegarde impossible : ' + String(e));
  }
};
$('export').onclick = () => {
  try {
    const d = parseWorld(draft),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'little-world-valley.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    info('Carte exportée');
  } catch (e) {
    info(String(e));
  }
};
$('import').onclick = () => val('import-file').click();
val('import-file').onchange = async () => {
  const f = val('import-file').files?.[0];
  if (!f) return;
  try {
    if (f.size > 2_000_000) throw Error('Fichier trop grand');
    const value = parseWorld(JSON.parse(await f.text()));
    checkpoint();
    draft = value;
    rebuild();
    markDirty();
    info('Carte importée');
  } catch (e) {
    info('Import refusé : ' + String(e));
  }
  val('import-file').value = '';
};
$('play-preview').onclick = () => {
  try {
    const value = parseWorld(draft);
    sessionStorage.setItem('little-world-preview', JSON.stringify(value));
    sessionStorage.setItem('little-world-editor-return', JSON.stringify(value));
    location.href = import.meta.env.BASE_URL + '?preview=1';
  } catch (e) {
    info('Test impossible : ' + String(e));
  }
};
$('top-view').onclick = () => {
  camera.position.set(
    orbit.target.x,
    orbit.target.y + 220,
    orbit.target.z + 0.01,
  );
  orbit.update();
};
$('perspective-view').onclick = () => {
  camera.position.copy(orbit.target).add(new THREE.Vector3(90, 110, 100));
  orbit.update();
};
val('show-grid').onchange = () => {
  grid.visible = val('show-grid').checked;
};
function resize() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();
async function initialize() {
  try {
    const back = sessionStorage.getItem('little-world-editor-return');
    if (back) {
      draft = parseWorld(JSON.parse(back));
      sessionStorage.removeItem('little-world-editor-return');
      dirty = true;
    } else {
      const saved = await loadLocal();
      if (saved) draft = saved;
    }
    rebuild();
    info('Prêt : choisir un outil ou un objet');
  } catch (e) {
    info('Restauration impossible : ' + String(e));
  } finally {
    ready = true;
    updateControls();
  }
}
setTool('select');
void initialize();
window.addEventListener('beforeunload', (e) => {
  if (dirty && !sessionStorage.getItem('little-world-editor-return')) {
    e.preventDefault();
    e.returnValue = '';
  }
});
const editorClock = new FrameClock();
let time = 0,
  metricTime = 0;
document.addEventListener('visibilitychange', () => editorClock.reset());
function animate(now: number) {
  const frame = editorClock.advance(now, !document.hidden);
  if (!frame.render) {
    requestAnimationFrame(animate);
    return;
  }
  const dt = frame.renderDelta;
  time += dt;
  orbit.update();
  world.update(dt, orbit.target);
  npcs.update(dt, time, orbit.target);
  renderer.render(scene, camera);
  if (time - metricTime > 0.8) {
    $('editor-metrics').textContent =
      `${world.stats.active} secteurs actifs · ${world.stats.resident} en cache · ${renderer.info.render.calls} appels`;
    metricTime = time;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
