/* Mesa de modelado 3D — app.js
 * Sitio estático (GitHub Pages). Three.js vía CDN con importmap.
 * La UI parece una herramienta normal, pero todo está expuesto en
 * window.Mesa para operación programática.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// ===== VALIDATOR (inicio: lógica pura, sin DOM ni THREE) =====
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ITEM_TYPES = ['clay', 'cone', 'limb', 'curve', 'eye', 'paint',
  'cut', 'bone', 'glue', 'dent', 'stretch',
  'sculpt', 'transform', 'primitive',
  'bevel', 'extrude', 'inset', 'knife', 'loop_cut', 'spin', 'shear', 'shrink_fatten'];
const GEOMETRY_TYPES = ['clay', 'cone', 'limb', 'curve', 'eye', 'paint', 'primitive'];
const TOOL_TYPES = ['cut', 'bone', 'glue', 'dent', 'stretch',
  'sculpt', 'transform', 'bevel', 'extrude', 'inset', 'knife', 'loop_cut', 'spin', 'shear', 'shrink_fatten'];
// Herramientas que operan sobre un ítem de geometría del mismo paso (target?).
const TARGETED_TOOLS = ['cut', 'dent', 'stretch', 'knife', 'loop_cut',
  'sculpt', 'transform', 'bevel', 'extrude', 'inset', 'spin', 'shear', 'shrink_fatten'];
const GEO_LIST_TXT = 'clay, cone, limb, curve, eye, paint, primitive';

// Pinceles del comando sculpt: [nombre snake_case, etiqueta en español]
const BRUSHES = [
  ['draw', 'Dibujar'], ['draw_sharp', 'Dibujar nítido'], ['clay', 'Arcilla'],
  ['clay_strips', 'Tiras de arcilla'], ['clay_thumb', 'Pulgar de arcilla'],
  ['layer', 'Capa (≈dibujar con tope)'], ['inflate', 'Inflar'], ['blob', 'Gota'],
  ['crease', 'Pliegue'], ['smooth', 'Suavizar'], ['flatten', 'Aplanar'],
  ['fill', 'Rellenar (≈suavizar+inflar)'], ['scrape', 'Raspar (≈aplanar)'],
  ['pinch', 'Pellizcar'], ['grab', 'Agarrar'], ['elastic_deform', 'Deformar elástico'],
  ['snake_hook', 'Gancho serpiente'], ['thumb', 'Pulgar (arrastrar)'], ['pose', 'Posar (rotar zona)'],
  ['nudge', 'Empujar suave'], ['rotate', 'Torcer'], ['slide_relax', 'Relajar'],
  ['mask', 'Máscara'], ['paint', 'Pintar'], ['smear', 'Emborronar'],
  ['box_mask', 'Máscara en caja'], ['mask_by_color', 'Máscara por color'],
  ['mesh_filter', 'Filtro de malla'], ['color_filter', 'Filtro de color'],
  ['simplify', 'Simplificar (≈suavizar fuerte)'], ['multires_eraser', 'Borrador (≈suavizar)'],
  ['multires_smear', 'Emborronar (≈smear)'], ['draw_face_sets', 'Pintar región'],
  ['edit_face_set', 'Editar región (≈pintar)'], ['box_face_set', 'Región en caja'],
  ['line_project', 'Proyectar línea (≈aplanar)'], ['box_trim', 'Recortar en caja (≈cut)'],
  ['box_hide', 'Ocultar en caja (≈colapsar)'], ['boundary', 'Borde (≈suavizar)'],
  ['cloth', 'Tela (≈suavizar+ruido)'],
];
const BRUSH_NAMES = BRUSHES.map(b => b[0]);
const PRIMITIVE_SHAPES = ['cube', 'sphere', 'cylinder', 'cone', 'torus'];
const PAINT_BRUSHES = ['paint', 'draw_face_sets', 'edit_face_set', 'box_face_set', 'color_filter', 'mask_by_color'];
const BOX_BRUSHES = ['box_mask', 'box_face_set', 'box_trim', 'box_hide'];

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function isVec3(x) { return Array.isArray(x) && x.length === 3 && x.every(isNum); }
function isVec2(x) { return Array.isArray(x) && x.length === 2 && x.every(isNum); }

function checkField(item, path, field, kind) {
  const v = item[field];
  if (v === undefined) return `${path}: ${item.type || '?'} requiere '${field}'`;
  if (kind === 3 && !isVec3(v)) return `${path}: '${field}' debe ser [x, y, z] numérico`;
  if (kind === 2 && !isVec2(v)) return `${path}: '${field}' debe ser [a, b] numérico`;
  if (kind === 'num' && !isNum(v)) return `${path}: '${field}' debe ser un número`;
  if (kind === 'str' && (typeof v !== 'string' || !v.trim()))
    return `${path}: '${field}' debe ser un texto no vacío`;
  if (kind === 'keep' && v !== 'above' && v !== 'below')
    return `${path}: 'keep' debe ser "above" o "below"`;
  if (kind === 'intarr' && (!Array.isArray(v) || v.length === 0 || !v.every(x => Number.isInteger(x) && x >= 0)))
    return `${path}: '${field}' debe ser un arreglo de enteros ≥ 0`;
  if (kind === 'plane') {
    if (!v || typeof v !== 'object' || !isVec3(v.point) || !isVec3(v.normal))
      return `${path}: 'plane' debe ser {point:[x,y,z], normal:[x,y,z]}`;
    const nn = v.normal;
    if (nn[0] === 0 && nn[1] === 0 && nn[2] === 0)
      return `${path}: 'plane.normal' no puede ser [0,0,0]`;
  }
  if (kind === 'color' && (typeof v !== 'string' || !HEX_COLOR.test(v)))
    return `${path}: 'color' debe ser un hexadecimal como "#cf9455"`;
  if (kind === 'brush' && !BRUSH_NAMES.includes(v))
    return `${path}: 'brush' desconocido '${v}' (válidos: ${BRUSH_NAMES.join(', ')})`;
  if (kind === 'shape' && !PRIMITIVE_SHAPES.includes(v))
    return `${path}: 'shape' debe ser uno de: ${PRIMITIVE_SHAPES.join(', ')}`;
  if (kind === 'sizeval') {
    const okSize = (isNum(v) && v > 0) ||
      (Array.isArray(v) && v.length >= 2 && v.length <= 3 && v.every(x => isNum(x) && x > 0));
    if (!okSize)
      return `${path}: 'size' debe ser un número > 0 o un arreglo [.., ..] con valores > 0`;
  }
  if (kind === 'filter' && !['smooth', 'inflate', 'sharpen'].includes(v))
    return `${path}: 'filter' debe ser "smooth", "inflate" o "sharpen"`;
  if (kind === 'pivotv' && !(v === 'own' || v === 'cursor' || isVec3(v)))
    return `${path}: 'pivot' debe ser "own", "cursor" o [x, y, z]`;
  if (kind === 'int1' && (!Number.isInteger(v) || v < 1))
    return `${path}: '${field}' debe ser un entero ≥ 1`;
  if (kind === '01' && (!isNum(v) || v < 0 || v > 1))
    return `${path}: '${field}' debe estar entre 0 y 1`;
  if (kind === 'points') {
    if (!Array.isArray(v) || v.length < 2 || !v.every(isVec3))
      return `${path}: 'points' debe ser un arreglo de 2+ puntos [x, y, z]`;
  }
  return null;
}

function validateItem(item, path, idx, items) {
  const errors = [];
  if (!item || typeof item !== 'object') return [`${path}: el ítem debe ser un objeto`];
  if (!ITEM_TYPES.includes(item.type))
    return [`${path}: type desconocido '${item.type}' (válidos: ${ITEM_TYPES.join(', ')})`];
  const req = {
    clay:    [['at', 3], ['size', 3], ['color', 'color']],
    cone:    [['at', 3], ['size', 2], ['color', 'color']],
    limb:    [['from', 3], ['to', 3], ['radius', 'num'], ['color', 'color']],
    curve:   [['points', 'points'], ['radius', 'num'], ['color', 'color']],
    eye:     [['at', 3], ['size', 3], ['color', 'color']],
    paint:   [['at', 3], ['size', 3], ['color', 'color']],
    cut:     [['plane', 'plane'], ['keep', 'keep']],
    knife:   [['plane', 'plane'], ['keep', 'keep']],
    loop_cut:[['plane', 'plane'], ['keep', 'keep']],
    bone:    [['name', 'str'], ['at', 3]],
    glue:    [['items', 'intarr']],
    dent:    [['at', 3], ['radius', 'num'], ['depth', 'num']],
    stretch: [['axis', 3], ['factor', 'num']],
    sculpt:  [['brush', 'brush'], ['at', 3], ['radius', 'num'], ['strength', 'num']],
    transform: [],
    primitive: [['shape', 'shape'], ['at', 3], ['size', 'sizeval'], ['color', 'color']],
    bevel:   [['amount', 'num']],
    extrude: [['dir', 3], ['distance', 'num']],
    inset:   [['at', 3], ['radius', 'num'], ['depth', 'num']],
    spin:    [['axis', 3], ['angle', 'num']],
    shear:   [['axis', 3], ['factor', 'num']],
    shrink_fatten: [['amount', 'num']],
  }[item.type];
  for (const [field, kind] of req) {
    const e = checkField(item, path, field, kind);
    if (e) errors.push(e);
  }
  if (item.type === 'curve' && item.taper !== undefined && !isNum(item.taper))
    errors.push(`${path}: 'taper' debe ser un número`);
  if (item.type === 'paint' && item.rotate !== undefined && !isVec3(item.rotate))
    errors.push(`${path}: 'rotate' debe ser [rx, ry, rz] en radianes`);
  // campos opcionales de las herramientas
  if (TARGETED_TOOLS.includes(item.type) && item.target !== undefined
      && (!Number.isInteger(item.target) || item.target < 0))
    errors.push(`${path}: 'target' debe ser un entero ≥ 0`);
  if (item.type === 'bone' && item.parent !== undefined
      && (typeof item.parent !== 'string' || !item.parent.trim()))
    errors.push(`${path}: 'parent' debe ser el nombre de un hueso (texto)`);
  if (item.type === 'glue' && item.name !== undefined
      && (typeof item.name !== 'string' || !item.name.trim()))
    errors.push(`${path}: 'name' debe ser un texto no vacío`);
  if (item.type === 'stretch' && item.center !== undefined && !isVec3(item.center))
    errors.push(`${path}: 'center' debe ser [x, y, z] numérico`);
  if (item.type === 'dent' && isNum(item.radius) && item.radius <= 0)
    errors.push(`${path}: 'radius' debe ser mayor a 0`);
  // sculpt: campos según el pincel
  if (item.type === 'sculpt') {
    const b = item.brush;
    if (isNum(item.radius) && item.radius <= 0)
      errors.push(`${path}: 'radius' debe ser mayor a 0`);
    if (item.dir !== undefined && !isVec3(item.dir))
      errors.push(`${path}: 'dir' debe ser [x, y, z] numérico`);
    if (item.axis !== undefined && !isVec3(item.axis))
      errors.push(`${path}: 'axis' debe ser [x, y, z] numérico`);
    if (item.angle !== undefined && !isNum(item.angle))
      errors.push(`${path}: 'angle' debe ser un número (radianes)`);
    if (item.value !== undefined) {
      const e = checkField(item, path, 'value', '01'); if (e) errors.push(e);
    }
    if (item.tolerance !== undefined && (!isNum(item.tolerance) || item.tolerance < 0))
      errors.push(`${path}: 'tolerance' debe ser ≥ 0`);
    if (PAINT_BRUSHES.includes(b)) {
      const e = checkField(item, path, 'color', 'color'); if (e) errors.push(e);
    }
    if (BOX_BRUSHES.includes(b)) {
      for (const f of ['box_min', 'box_max']) {
        const e = checkField(item, path, f, 3); if (e) errors.push(e);
      }
    }
    if (b === 'mesh_filter') {
      const e = checkField(item, path, 'filter', 'filter'); if (e) errors.push(e);
    }
  }
  // transform: al menos una operación
  if (item.type === 'transform') {
    if (item.move === undefined && item.rotate === undefined && item.scale === undefined)
      errors.push(`${path}: 'transform' requiere al menos uno de 'move', 'rotate' o 'scale'`);
    if (item.move !== undefined && !isVec3(item.move))
      errors.push(`${path}: 'move' debe ser [x, y, z] numérico`);
    if (item.rotate !== undefined && !isVec3(item.rotate))
      errors.push(`${path}: 'rotate' debe ser [rx, ry, rz] en radianes`);
    if (item.scale !== undefined && !(isNum(item.scale) || isVec3(item.scale)))
      errors.push(`${path}: 'scale' debe ser un número o [sx, sy, sz]`);
    if (item.pivot !== undefined) {
      const e = checkField(item, path, 'pivot', 'pivotv'); if (e) errors.push(e);
    }
  }
  if (item.type === 'extrude' && item.name !== undefined
      && (typeof item.name !== 'string' || !item.name.trim()))
    errors.push(`${path}: 'name' debe ser un texto no vacío`);
  if (item.type === 'spin') {
    if (item.steps !== undefined) {
      const e = checkField(item, path, 'steps', 'int1'); if (e) errors.push(e);
    }
    if (item.center !== undefined && !isVec3(item.center))
      errors.push(`${path}: 'center' debe ser [x, y, z] numérico`);
    if (item.name !== undefined && (typeof item.name !== 'string' || !item.name.trim()))
      errors.push(`${path}: 'name' debe ser un texto no vacío`);
  }
  if (item.type === 'inset' && isNum(item.radius) && item.radius <= 0)
    errors.push(`${path}: 'radius' debe ser mayor a 0`);
  // campos 'bone' / 'glue' en cualquier ítem de geometría
  if (GEOMETRY_TYPES.includes(item.type)) {
    if (item.bone !== undefined && (typeof item.bone !== 'string' || !item.bone.trim()))
      errors.push(`${path}: 'bone' debe ser el nombre de un hueso (texto)`);
    if (item.glue !== undefined && (typeof item.glue !== 'string' || !item.glue.trim()))
      errors.push(`${path}: 'glue' debe ser el nombre de un grupo (texto)`);
  }
  // las herramientas apuntan a ítems del mismo paso ya construidos
  if (TARGETED_TOOLS.includes(item.type)) {
    const e = checkTargetRef(item, path, idx, items);
    if (e) errors.push(e);
  }
  if (item.type === 'glue' && Array.isArray(item.items)) {
    item.items.forEach(mi => {
      if (!Number.isInteger(mi) || mi < 0 || mi >= idx)
        errors.push(`${path}: 'items' contiene el índice ${mi}: debe ser un ítem ya construido (entero < ${idx})`);
      else if (!GEOMETRY_TYPES.includes(items[mi] && items[mi].type))
        errors.push(`${path}: 'items' contiene el índice ${mi}: debe apuntar a un ítem de geometría`);
    });
  }
  return errors;
}

// Verifica que 'target' exista, sea anterior y sea geometría.
// Si se omite, aplica al ítem de geometría anterior del paso.
function checkTargetRef(item, path, idx, items) {
  if (item.target === undefined) {
    for (let k = idx - 1; k >= 0; k--) {
      if (items[k] && GEOMETRY_TYPES.includes(items[k].type)) return null;
    }
    return `${path}: '${item.type}' sin 'target' y no hay un ítem de geometría anterior en el paso`;
  }
  if (!Number.isInteger(item.target) || item.target < 0) return null; // ya reportado arriba
  if (item.target >= idx)
    return `${path}: 'target' (${item.target}) debe apuntar a un ítem ya construido (índice < ${idx})`;
  const tgt = items[item.target];
  if (!tgt || !GEOMETRY_TYPES.includes(tgt.type))
    return `${path}: 'target' (${item.target}) debe apuntar a un ítem de geometría (${GEO_LIST_TXT})`;
  return null;
}

// validateRecipe(obj) -> string[] (lista de errores; vacía = válida)
function validateRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe))
    return ['la receta debe ser un objeto JSON'];
  if (typeof recipe.name !== 'string' || !recipe.name.trim())
    errors.push("la receta requiere 'name' (texto no vacío)");
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0)
    return errors.concat(["la receta requiere 'steps' como arreglo no vacío"]);
  recipe.steps.forEach((st, i) => {
    const sp = `steps[${i}]`;
    if (!st || typeof st !== 'object') { errors.push(`${sp}: debe ser un objeto`); return; }
    if (typeof st.label !== 'string' || !st.label.trim())
      errors.push(`${sp}: requiere 'label' (texto no vacío)`);
    if (!Array.isArray(st.items))
      errors.push(`${sp}: requiere 'items' como arreglo`);
    else
      st.items.forEach((it, j) => errors.push(...validateItem(it, `${sp}.items[${j}]`, j, st.items)));
  });
  errors.push(...validateBoneRefs(recipe));
  return errors;
}

// Segunda pasada: coherencia de huesos en toda la receta
// (nombres únicos, referencias existentes, sin ciclos, sin uso antes de definir)
function validateBoneRefs(recipe) {
  const errors = [];
  const defs = new Map(); // name -> {step, idx, parent}
  recipe.steps.forEach((st, si) => {
    (st.items || []).forEach((it, j) => {
      if (!it || it.type !== 'bone') return;
      if (typeof it.name === 'string' && it.name.trim()) {
        if (defs.has(it.name))
          errors.push(`steps[${si}].items[${j}]: ya existe un hueso llamado "${it.name}"`);
        else
          defs.set(it.name, { step: si, idx: j, parent: it.parent });
      }
    });
  });
  recipe.steps.forEach((st, si) => {
    (st.items || []).forEach((it, j) => {
      if (!it || typeof it !== 'object') return;
      const at = `steps[${si}].items[${j}]`;
      if (it.type === 'bone' && typeof it.parent === 'string' && it.parent.trim()) {
        const d = defs.get(it.parent.trim());
        if (!d) errors.push(`${at}: 'parent' hace referencia a un hueso inexistente "${it.parent}"`);
        else if (d.step > si) errors.push(`${at}: 'parent' "${it.parent}" se define después (paso ${d.step + 1})`);
      }
      if (GEOMETRY_TYPES.includes(it.type) && typeof it.bone === 'string' && it.bone.trim()) {
        const d = defs.get(it.bone.trim());
        if (!d) errors.push(`${at}: 'bone' hace referencia a un hueso inexistente "${it.bone}"`);
        else if (d.step > si) errors.push(`${at}: el hueso "${it.bone}" se usa antes de definirse (se define en el paso ${d.step + 1})`);
      }
    });
  });
  defs.forEach((d, name) => {
    const seen = new Set([name]);
    let p = d.parent;
    while (typeof p === 'string' && p.trim()) {
      if (seen.has(p)) { errors.push(`el hueso "${name}" forma un ciclo de parentesco con "${p}"`); break; }
      seen.add(p);
      const pd = defs.get(p);
      p = pd ? pd.parent : null;
    }
  });
  return errors;
}
// ===== VALIDATOR (fin) =====

// ---------- estado ----------
const STORE_KEY = 'mesa-de-modelado-3d';
const store = {
  recipe: null,
  stepGroups: [],   // stepGroups[s] = [THREE.Group, ...] (alineado con ítems)
  stepExtras: [],   // stepExtras[s] = [grupos extra: clones de extrude/spin]
  currentStep: -1,
  playing: false,
  playToken: 0,
  listeners: {},
  bones: {},        // name -> THREE.Bone
  boneList: [],     // {name, parent, step} para la UI
  glueList: [],     // {name, step, members[]} para la UI
  skeletonRoot: null,
  cursorPos: [0, 0, 0],
};
function on(evt, cb) { (store.listeners[evt] = store.listeners[evt] || []).push(cb); }
function emit(evt, data) { (store.listeners[evt] || []).forEach(cb => { try { cb(data); } catch (e) { console.warn(e); } }); }

// ---------- escena ----------
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true; // necesario para la herramienta cut
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);
scene.fog = new THREE.Fog(0xf4f1ea, 16, 34);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const VIEWS = {
  iso:    { pos: [4.4, 3.4, 5.8],  tgt: [0, 0.4, 0] },
  frente: { pos: [0, 0.7, 7.6],    tgt: [0, 0.4, 0] },
  lado:   { pos: [7.6, 0.7, 0],    tgt: [0, 0.4, 0] },
  arriba: { pos: [0, 9.0, 0.02],   tgt: [0, 0, 0] },
};
function setView(name) {
  const v = VIEWS[name] || VIEWS.iso;
  camera.position.set(...v.pos);
  controls.target.set(...v.tgt);
  controls.update();
  document.querySelectorAll('.views button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
}

// luces: hemisferio + direccional con sombras suaves
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7a66, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(5, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
sun.shadow.camera.far = 30;
sun.shadow.radius = 5;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
fill.position.set(-6, 3, -4);
scene.add(fill);

// piso: shadow catcher + grid tenue en y ≈ -1.3
const FLOOR_Y = -1.3;
const shadowCatcher = new THREE.Mesh(
  new THREE.CircleGeometry(10, 48),
  new THREE.ShadowMaterial({ opacity: 0.22 })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = FLOOR_Y;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);
const grid = new THREE.GridHelper(20, 20, 0xd6c9b4, 0xe7ddca);
grid.position.y = FLOOR_Y + 0.001;
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

const modelRoot = new THREE.Group();
scene.add(modelRoot);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);

// ---------- constructores de ítems ----------
// Convención: `size` son extensiones totales (diámetros), no radios.

function clayNoise(x, y, z, s) {
  return Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.7) * Math.sin(z * 3.4 + s * 0.6)
       + 0.5 * Math.sin(x * 6.7 + s * 2.1) * Math.sin(y * 5.9 + s * 0.9) * Math.sin(z * 6.2 + s * 1.3);
}

function clayMaterial(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness: 0 });
}

function shadowed(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

// clay: elipsoide con desplazamiento de ruido suave ("arcilla blanda")
function buildClay(item, seed) {
  const [sx, sy, sz] = item.size;
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const amp = 0.04; // sutil: ±~6% del radio
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + amp * clayNoise(v.x, v.y, v.z, seed);
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  geo.computeVertexNormals();
  const m = shadowed(new THREE.Mesh(geo, clayMaterial(item.color)));
  m.scale.set(sx / 2, sy / 2, sz / 2);
  m.position.set(item.at[0], item.at[1], item.at[2]);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// cone: size = [radio, altura], centrado en `at`
function buildCone(item) {
  const [r, h] = item.size;
  const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, 40, 1), clayMaterial(item.color)));
  m.position.set(item.at[0], item.at[1], item.at[2]);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// limb: cilindro ahusado (arriba = radius*0.8) de from→to + esferas en los extremos
function buildLimb(item) {
  const from = new THREE.Vector3(item.from[0], item.from[1], item.from[2]);
  const to = new THREE.Vector3(item.to[0], item.to[1], item.to[2]);
  const dir = to.clone().sub(from);
  const len = Math.max(dir.length(), 0.0001);
  dir.normalize();
  const mat = clayMaterial(item.color);
  const g = new THREE.Group();
  const cyl = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(item.radius * 0.8, item.radius, len, 28, 1), mat));
  cyl.position.copy(from).add(to).multiplyScalar(0.5);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const s1 = shadowed(new THREE.Mesh(new THREE.SphereGeometry(item.radius, 24, 18), mat));
  s1.position.copy(from);
  const s2 = shadowed(new THREE.Mesh(new THREE.SphereGeometry(item.radius * 0.8, 24, 18), mat));
  s2.position.copy(to);
  g.add(cyl, s1, s2);
  return g;
}

// curve: tubo a lo largo de una CatmullRom; taper angosta la punta (0..1)
function buildCurve(item) {
  const pts = item.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const TUB = 64, RAD = 16;
  const geo = new THREE.TubeGeometry(curve, TUB, item.radius, RAD, false);
  if (item.taper) {
    const pos = geo.attributes.position;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= TUB; i++) {
      const t = i / TUB;
      curve.getPoint(t, c);
      const s = Math.max(1 - item.taper * t, 0.05);
      for (let j = 0; j <= RAD; j++) {
        const idx = i * (RAD + 1) + j;
        v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(s).add(c);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
  }
  const m = shadowed(new THREE.Mesh(geo, clayMaterial(item.color)));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// eye: ojo compuesto que SIEMPRE queda sobre la superficie frontal (+z).
// Se desplaza +z en size[2]/2 + 0.03 respecto a `at` para no quedar enterrado.
function buildEye(item) {
  const [sx, sy, sz] = item.size;
  const g = new THREE.Group();
  const rim = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.55 })));
  rim.scale.set(sx, sy, sz * 0.5);
  const iris = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 28, 20),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(item.color), roughness: 0.35 })));
  iris.scale.set(sx * 0.58, sy * 0.58, sz * 0.32);
  iris.position.z = sz * 0.30;
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.3 }));
  pupil.scale.set(sx * 0.30, sy * 0.32, sz * 0.22);
  pupil.position.z = sz * 0.44;
  const gr = Math.min(sx, sy) * 0.12;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glow.scale.set(gr * 2, gr * 2, gr * 1.2);
  glow.position.set(-sx * 0.14, sy * 0.16, sz * 0.52);
  g.add(rim, iris, pupil, glow);
  g.position.set(item.at[0], item.at[1], item.at[2] + sz / 2 + 0.03);
  return g;
}

// paint: parche fino (elipsoide aplanado en z) con rotación opcional [rx,ry,rz]
function buildPaint(item) {
  const [sx, sy, sz] = item.size;
  const m = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(item.color), roughness: 0.9, metalness: 0 })));
  m.scale.set(sx / 2, sy / 2, sz / 2);
  if (item.rotate) m.rotation.set(item.rotate[0], item.rotate[1], item.rotate[2]);
  m.position.set(item.at[0], item.at[1], item.at[2]);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const BUILDERS = { clay: buildClay, cone: buildCone, limb: buildLimb, curve: buildCurve, eye: buildEye, paint: buildPaint, primitive: buildPrimitive };

function buildItem(item, seed) {
  const fn = BUILDERS[item.type];
  if (!fn) { console.warn('Tipo de ítem desconocido:', item.type); return new THREE.Group(); }
  try {
    return fn(item, seed);
  } catch (e) {
    console.warn('No se pudo construir el ítem', item, e);
    return new THREE.Group();
  }
}

// primitive: cube | sphere | cylinder | cone | torus (cubre "add cube" y más).
// `size`: número (diámetro/lado) o arreglo. Es geometría: las herramientas
// pueden apuntarle con 'target'.
function buildPrimitive(item) {
  const sz = item.size;
  const arr = Array.isArray(sz) ? sz : [sz, sz, sz];
  const A = i => (arr[i] !== undefined ? arr[i] : arr[0]);
  let geo;
  switch (item.shape) {
    case 'cube': geo = new THREE.BoxGeometry(A(0), A(1), A(2)); break;
    case 'sphere': geo = new THREE.SphereGeometry(A(0) / 2, 48, 32); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(A(0), A(0), A(1), 40); break;
    case 'cone': geo = new THREE.ConeGeometry(A(0), A(1), 40); break;
    case 'torus': geo = new THREE.TorusGeometry(A(0), A(1) !== undefined ? A(1) : A(0) * 0.35, 24, 64); break;
    default: geo = new THREE.BoxGeometry(A(0), A(1), A(2));
  }
  const m = shadowed(new THREE.Mesh(geo, clayMaterial(item.color)));
  m.position.set(item.at[0], item.at[1], item.at[2]);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------- motor de esculpido (comando sculpt) ----------
// Un solo engine de deformación por vértices en espacio mundo, con máscara
// por geometría (atributo Float32 'mask' que resiste otros pinceles).
// Cada pincel Blender pedido es una variante de este engine.
function ensureMaskAttr(geo) {
  let a = geo.attributes.mask;
  if (!a) {
    a = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1);
    geo.setAttribute('mask', a);
  }
  return a;
}
function ensureColorAttr(mesh, hex) {
  const geo = mesh.geometry;
  let c = geo.attributes.color;
  if (!c) {
    const base = (mesh.material && mesh.material.color) ? mesh.material.color.clone() : new THREE.Color(0xffffff);
    if (hex) base.set(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = base.r; arr[i * 3 + 1] = base.g; arr[i * 3 + 2] = base.b; }
    c = new THREE.BufferAttribute(arr, 3);
    geo.setAttribute('color', c);
    if (!mesh.userData.vcolCloned) {
      mesh.material = mesh.material.clone();
      mesh.userData.vcolCloned = true;
    }
    mesh.material.vertexColors = true;
    mesh.material.needsUpdate = true;
  }
  return geo.attributes.color;
}
function neighborsOf(geo) {
  if (geo.userData.nbrs) return geo.userData.nbrs;
  const n = geo.attributes.position.count;
  const sets = Array.from({ length: n }, () => []);
  const idx = geo.index;
  if (idx) {
    const seen = Array.from({ length: n }, () => new Set());
    for (let f = 0; f < idx.count; f += 3) {
      const a = idx.getX(f), b = idx.getX(f + 1), c = idx.getX(f + 2);
      seen[a].add(b); seen[a].add(c);
      seen[b].add(a); seen[b].add(c);
      seen[c].add(a); seen[c].add(b);
    }
    for (let i = 0; i < n; i++) sets[i] = [...seen[i]];
  }
  geo.userData.nbrs = sets;
  return sets;
}

function sculptMesh(o, item) {
  const geo = o.geometry;
  const posA = geo.attributes.position, norA = geo.attributes.normal;
  if (!posA || !norA) return;
  const count = posA.count;
  o.updateWorldMatrix(true, false);
  const W = new Float32Array(count * 3), Nn = new Float32Array(count * 3);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    _v.fromBufferAttribute(posA, i); _w.copy(_v); o.localToWorld(_w);
    _n.fromBufferAttribute(norA, i).transformDirection(o.matrixWorld);
    W[i * 3] = _w.x; W[i * 3 + 1] = _w.y; W[i * 3 + 2] = _w.z;
    Nn[i * 3] = _n.x; Nn[i * 3 + 1] = _n.y; Nn[i * 3 + 2] = _n.z;
  }
  const brush = item.brush;
  const maskA = ensureMaskAttr(geo);
  const M = maskA.array;
  const at = new THREE.Vector3(item.at[0], item.at[1], item.at[2]);
  const radius = item.radius;
  const strength = item.strength || 0;
  const value = item.value !== undefined ? item.value : 1;
  let dirV = null;
  if (item.dir) {
    dirV = new THREE.Vector3(item.dir[0], item.dir[1], item.dir[2]);
    if (dirV.lengthSq() < 1e-12) dirV = null; else dirV.normalize();
  }
  const axisV = item.axis
    ? new THREE.Vector3(item.axis[0], item.axis[1], item.axis[2]).normalize()
    : new THREE.Vector3(0, 1, 0);
  const D = new Float32Array(count * 3);
  const fallCos = d => (d < radius ? 0.5 * (1 + Math.cos(Math.PI * d / radius)) : 0);
  const fallR = (d, r) => (d < r ? 0.5 * (1 + Math.cos(Math.PI * d / r)) : 0);
  const inRadius = cb => {
    for (let i = 0; i < count; i++) {
      const dx = W[i * 3] - at.x, dy = W[i * 3 + 1] - at.y, dz = W[i * 3 + 2] - at.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) cb(i, d, fallCos(d));
    }
  };
  // ayudantes de desplazamiento (espacio mundo, respetando máscara)
  const pushNormal = (mult, sharp) => inRadius((i, d, f) => {
    const ff = sharp ? f * f : f;
    const k = strength * mult * ff * (1 - M[i]); if (!k) return;
    D[i * 3] += Nn[i * 3] * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k; D[i * 3 + 2] += Nn[i * 3 + 2] * k;
  });
  const pushDir = (dv, mult, pw) => inRadius((i, d, f) => {
    const k = strength * mult * Math.pow(f, pw || 1) * (1 - M[i]); if (!k) return;
    D[i * 3] += dv.x * k; D[i * 3 + 1] += dv.y * k; D[i * 3 + 2] += dv.z * k;
  });
  const smoothPass = (mult, tangent) => {
    const nb = neighborsOf(geo);
    inRadius((i, d, f) => {
      const list = nb[i]; if (!list.length) return;
      let ax = 0, ay = 0, az = 0;
      for (const j of list) { ax += W[j * 3]; ay += W[j * 3 + 1]; az += W[j * 3 + 2]; }
      const il = 1 / list.length;
      let sx = ax * il - W[i * 3], sy = ay * il - W[i * 3 + 1], sz = az * il - W[i * 3 + 2];
      if (tangent) {
        const dot = sx * Nn[i * 3] + sy * Nn[i * 3 + 1] + sz * Nn[i * 3 + 2];
        sx -= Nn[i * 3] * dot; sy -= Nn[i * 3 + 1] * dot; sz -= Nn[i * 3 + 2] * dot;
      }
      const k = Math.min(1, strength * mult * f) * (1 - M[i]);
      D[i * 3] += sx * k; D[i * 3 + 1] += sy * k; D[i * 3 + 2] += sz * k;
    });
  };
  const rotateZone = angOf => {
    inRadius((i, d, f) => {
      const a = angOf(f) * (1 - M[i]); if (!a) return;
      const px = W[i * 3] - at.x, py = W[i * 3 + 1] - at.y, pz = W[i * 3 + 2] - at.z;
      const c = Math.cos(a), s = Math.sin(a);
      const ux = axisV.x, uy = axisV.y, uz = axisV.z;
      const dot = ux * px + uy * py + uz * pz;
      D[i * 3] += (px * c + (uy * pz - uz * py) * s + ux * dot * (1 - c)) - px;
      D[i * 3 + 1] += (py * c + (uz * px - ux * pz) * s + uy * dot * (1 - c)) - py;
      D[i * 3 + 2] += (pz * c + (ux * py - uy * px) * s + uz * dot * (1 - c)) - pz;
    });
  };

  switch (brush) {
    // --- máscara (no mueven vértices) ---
    case 'mask':
      inRadius((i, d, f) => { M[i] = Math.min(1, Math.max(0, M[i] + value * f)); });
      maskA.needsUpdate = true; return;
    case 'box_mask': {
      const mn = item.box_min, mx = item.box_max;
      for (let i = 0; i < count; i++) {
        const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2];
        if (x >= mn[0] && x <= mx[0] && y >= mn[1] && y <= mx[1] && z >= mn[2] && z <= mx[2])
          M[i] = Math.min(1, Math.max(0, value));
      }
      maskA.needsUpdate = true; return;
    }
    case 'mask_by_color': {
      const cA = geo.attributes.color; if (!cA) return;
      const t = new THREE.Color(item.color);
      const tol = item.tolerance !== undefined ? item.tolerance : 0.15;
      for (let i = 0; i < count; i++) {
        const dd = Math.hypot(cA.getX(i) - t.r, cA.getY(i) - t.g, cA.getZ(i) - t.b);
        if (dd < tol) M[i] = Math.min(1, Math.max(0, value * (1 - dd / tol)));
      }
      maskA.needsUpdate = true; return;
    }
    // --- color (no mueven vértices) ---
    case 'paint': case 'draw_face_sets': case 'edit_face_set': {
      const cA = ensureColorAttr(o, item.color);
      const t = new THREE.Color(item.color);
      inRadius((i, d, f) => {
        const k = Math.min(1, strength * f) * (1 - M[i]); if (!k) return;
        cA.setXYZ(i,
          cA.getX(i) + (t.r - cA.getX(i)) * k,
          cA.getY(i) + (t.g - cA.getY(i)) * k,
          cA.getZ(i) + (t.b - cA.getZ(i)) * k);
      });
      cA.needsUpdate = true; return;
    }
    case 'box_face_set': {
      const cA = ensureColorAttr(o, item.color);
      const t = new THREE.Color(item.color);
      const mn = item.box_min, mx = item.box_max;
      for (let i = 0; i < count; i++) {
        const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2];
        if (x >= mn[0] && x <= mx[0] && y >= mn[1] && y <= mx[1] && z >= mn[2] && z <= mx[2]) {
          const k = Math.min(1, strength) * (1 - M[i]); if (!k) continue;
          cA.setXYZ(i,
            cA.getX(i) + (t.r - cA.getX(i)) * k,
            cA.getY(i) + (t.g - cA.getY(i)) * k,
            cA.getZ(i) + (t.b - cA.getZ(i)) * k);
        }
      }
      cA.needsUpdate = true; return;
    }
    case 'color_filter': {
      const cA = ensureColorAttr(o, item.color);
      const t = new THREE.Color(item.color);
      const k = Math.min(1, Math.max(0, strength));
      for (let i = 0; i < count; i++)
        cA.setXYZ(i,
          cA.getX(i) + (t.r - cA.getX(i)) * k,
          cA.getY(i) + (t.g - cA.getY(i)) * k,
          cA.getZ(i) + (t.b - cA.getZ(i)) * k);
      cA.needsUpdate = true; return;
    }
    // --- recorte visual en caja (como cut, pero volumétrico) ---
    case 'box_trim': {
      const mn = item.box_min, mx = item.box_max;
      const planes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -mn[0]),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), mx[0]),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -mn[1]),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), mx[1]),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -mn[2]),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), mx[2]),
      ];
      o.material = o.material.clone();
      o.material.clippingPlanes = (o.material.clippingPlanes || []).concat(planes);
      o.material.clipShadows = true;
      o.material.needsUpdate = true;
      return;
    }
    // --- filtro global sobre todo el target ---
    case 'mesh_filter': {
      const fm = item.filter;
      if (fm === 'smooth' || fm === 'sharpen') {
        const nb = neighborsOf(geo);
        for (let i = 0; i < count; i++) {
          const list = nb[i]; if (!list.length) continue;
          let ax = 0, ay = 0, az = 0;
          for (const j of list) { ax += W[j * 3]; ay += W[j * 3 + 1]; az += W[j * 3 + 2]; }
          const il = 1 / list.length;
          const sx = ax * il - W[i * 3], sy = ay * il - W[i * 3 + 1], sz = az * il - W[i * 3 + 2];
          const k = strength * (1 - M[i]);
          const sgn = fm === 'smooth' ? 1 : -1;
          D[i * 3] += sx * k * sgn; D[i * 3 + 1] += sy * k * sgn; D[i * 3 + 2] += sz * k * sgn;
        }
      } else { // inflate
        for (let i = 0; i < count; i++) {
          const k = strength * (1 - M[i]);
          D[i * 3] += Nn[i * 3] * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k; D[i * 3 + 2] += Nn[i * 3 + 2] * k;
        }
      }
      break;
    }
    // --- desplazamiento ---
    case 'draw': if (dirV) pushDir(dirV, 1, 1); else pushNormal(1, false); break;
    case 'draw_sharp': pushNormal(1, true); break;
    case 'inflate': pushNormal(1, false); break;
    case 'clay': pushNormal(1, false); smoothPass(0.3, false); break;
    case 'clay_strips': {
      const da = dirV || new THREE.Vector3(1, 0, 0);
      inRadius((i, d, f) => {
        const rx = W[i * 3] - at.x, ry = W[i * 3 + 1] - at.y, rz = W[i * 3 + 2] - at.z;
        const along = rx * da.x + ry * da.y + rz * da.z;
        const px = rx - along * da.x, py = ry - along * da.y, pz = rz - along * da.z;
        const dp = Math.sqrt(px * px + py * py + pz * pz);
        const ff = fallR(Math.abs(along), radius * 1.6) * fallR(dp, radius * 0.7);
        const k = strength * ff * (1 - M[i]); if (!k) return;
        D[i * 3] += Nn[i * 3] * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k; D[i * 3 + 2] += Nn[i * 3 + 2] * k;
      });
      break;
    }
    case 'clay_thumb': case 'layer': {
      // tope aplanado (layer: aproximación de una sola pasada)
      inRadius((i, d, f) => {
        const ff = Math.max(0, 1 - (d / radius) * (d / radius));
        const k = strength * ff * (1 - M[i]); if (!k) return;
        D[i * 3] += Nn[i * 3] * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k; D[i * 3 + 2] += Nn[i * 3 + 2] * k;
      });
      break;
    }
    case 'blob': {
      inRadius((i, d, f) => {
        const ff = Math.sqrt(Math.max(0, 1 - (d / radius) * (d / radius)));
        const k = strength * ff * (1 - M[i]); if (!k) return;
        D[i * 3] += Nn[i * 3] * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k; D[i * 3 + 2] += Nn[i * 3 + 2] * k;
      });
      break;
    }
    case 'crease': pushNormal(-1, true); break;
    case 'smooth': case 'multires_eraser': case 'boundary': smoothPass(1, false); break;
    case 'simplify': smoothPass(2, false); break;
    case 'slide_relax': smoothPass(1, true); break;
    case 'flatten': case 'scrape': case 'line_project': {
      let anx = 0, any = 0, anz = 0, cnt = 0;
      inRadius((i, d, f) => { anx += Nn[i * 3]; any += Nn[i * 3 + 1]; anz += Nn[i * 3 + 2]; cnt++; });
      let pn = dirV ? dirV.clone() : new THREE.Vector3(anx, any, anz);
      if (pn.lengthSq() < 1e-12) pn.set(0, 1, 0); else pn.normalize();
      inRadius((i, d, f) => {
        const k = Math.min(1, strength * f) * (1 - M[i]); if (!k) return;
        const dist = (W[i * 3] - at.x) * pn.x + (W[i * 3 + 1] - at.y) * pn.y + (W[i * 3 + 2] - at.z) * pn.z;
        D[i * 3] -= pn.x * dist * k; D[i * 3 + 1] -= pn.y * dist * k; D[i * 3 + 2] -= pn.z * dist * k;
      });
      break;
    }
    case 'fill': smoothPass(0.5, false); pushNormal(0.5, false); break;
    case 'pinch': {
      inRadius((i, d, f) => {
        const k = strength * f * (1 - M[i]); if (!k) return;
        let dx = at.x - W[i * 3], dy = at.y - W[i * 3 + 1], dz = at.z - W[i * 3 + 2];
        const l = Math.hypot(dx, dy, dz); if (l < 1e-9) return;
        D[i * 3] += dx / l * k; D[i * 3 + 1] += dy / l * k; D[i * 3 + 2] += dz / l * k;
      });
      break;
    }
    case 'grab': pushDir(dirV || new THREE.Vector3(0, 1, 0), 1, 1); break;
    case 'nudge': pushDir(dirV || new THREE.Vector3(0, 1, 0), 0.6, 1); break;
    case 'elastic_deform': pushDir(dirV || new THREE.Vector3(0, 1, 0), 1, 0.5); break;
    case 'snake_hook': pushDir(dirV || new THREE.Vector3(0, 1, 0), 1, 2); break;
    case 'smear': case 'multires_smear': pushDir(dirV || new THREE.Vector3(1, 0, 0), 1, 1); break;
    case 'thumb': pushDir(dirV || new THREE.Vector3(1, 0, 0), 1, 1); pushNormal(0.3, false); break;
    case 'pose': rotateZone(f => (item.angle || 0) * f); break;
    case 'rotate': rotateZone(f => strength * f); break;
    case 'box_hide': {
      const mn = item.box_min, mx = item.box_max;
      const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
      const k = Math.min(0.95, Math.max(0, strength));
      for (let i = 0; i < count; i++) {
        const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2];
        if (x >= mn[0] && x <= mx[0] && y >= mn[1] && y <= mx[1] && z >= mn[2] && z <= mx[2]) {
          D[i * 3] += (cx - x) * k; D[i * 3 + 1] += (cy - y) * k; D[i * 3 + 2] += (cz - z) * k;
        }
      }
      break;
    }
    case 'cloth': {
      smoothPass(0.6, false);
      inRadius((i, d, f) => {
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const r2 = (h - Math.floor(h)) - 0.5;
        const k = strength * 0.15 * f * (1 - M[i]);
        D[i * 3] += Nn[i * 3] * r2 * k; D[i * 3 + 1] += Nn[i * 3 + 1] * k * r2; D[i * 3 + 2] += Nn[i * 3 + 2] * r2 * k;
      });
      break;
    }
    default:
      console.warn('Pincel no implementado:', brush); return;
  }
  // volcar desplazamientos acumulados
  const wv = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    if (D[i * 3] === 0 && D[i * 3 + 1] === 0 && D[i * 3 + 2] === 0) continue;
    wv.set(W[i * 3] + D[i * 3], W[i * 3 + 1] + D[i * 3 + 1], W[i * 3 + 2] + D[i * 3 + 2]);
    o.worldToLocal(wv);
    posA.setXYZ(i, wv.x, wv.y, wv.z);
  }
  posA.needsUpdate = true;
  geo.computeVertexNormals();
  geo.boundingBox = null;
  geo.boundingSphere = null;
}
function applySculpt(group, item) {
  if (!group) return;
  group.updateWorldMatrix(true, true);
  group.traverse(o => { if (o.isMesh) sculptMesh(o, item); });
}

// ---------- transform: move / rotate / scale por vértices (espacio mundo) ----------
// pivot: "own" (defecto, centro del bbox), "cursor" (Mesa.setCursor) o [x,y,z].
function applyTransform(group, item) {
  if (!group) return;
  group.updateWorldMatrix(true, true);
  let centerW;
  if (Array.isArray(item.pivot)) centerW = new THREE.Vector3(item.pivot[0], item.pivot[1], item.pivot[2]);
  else if (item.pivot === 'cursor') centerW = new THREE.Vector3(store.cursorPos[0], store.cursorPos[1], store.cursorPos[2]);
  else centerW = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const mv = item.move ? new THREE.Vector3(item.move[0], item.move[1], item.move[2]) : null;
  const eu = item.rotate ? new THREE.Euler(item.rotate[0], item.rotate[1], item.rotate[2]) : null;
  let sc = null;
  if (item.scale !== undefined)
    sc = Array.isArray(item.scale)
      ? new THREE.Vector3(item.scale[0], item.scale[1], item.scale[2])
      : new THREE.Vector3(item.scale, item.scale, item.scale);
  if (!mv && !eu && !sc) return;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const posA = o.geometry.attributes.position;
    if (!posA) return;
    for (let i = 0; i < posA.count; i++) {
      v.fromBufferAttribute(posA, i); w.copy(v); o.localToWorld(w);
      w.sub(centerW);
      if (sc) w.multiply(sc);
      if (eu) w.applyEuler(eu);
      w.add(centerW);
      if (mv) w.add(mv);
      o.worldToLocal(w);
      posA.setXYZ(i, w.x, w.y, w.z);
    }
    posA.needsUpdate = true;
    o.geometry.computeVertexNormals();
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}

// ---------- modelado: bevel / extrude / inset / spin / shear / shrink_fatten ----------
// bevel: aproximación honesta — sin topología de bordes en blobs: suavizado + inflado leve.
function applyBevel(group, item) {
  if (!group) return;
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3()).toArray();
  const r = Math.max(box.getSize(new THREE.Vector3()).length(), 0.001);
  const amt = Math.max(0, item.amount);
  applySculpt(group, { brush: 'smooth', at: c, radius: r, strength: Math.min(1, amt * 2) });
  applySculpt(group, { brush: 'inflate', at: c, radius: r, strength: amt * 0.25 });
}
// inset: hundido de fondo plano (dent con meseta).
function applyInset(group, item) {
  if (!group || !(item.radius > 0)) return;
  const centerW = new THREE.Vector3(item.at[0], item.at[1], item.at[2]);
  group.updateWorldMatrix(true, true);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
    if (!pos || !nor) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); w.copy(v); o.localToWorld(w);
      const d = w.distanceTo(centerW);
      if (d < item.radius) {
        const f = d < item.radius * 0.65 ? 1
          : 0.5 * (1 + Math.cos(Math.PI * (d - item.radius * 0.65) / (item.radius * 0.35)));
        n.fromBufferAttribute(nor, i).transformDirection(o.matrixWorld);
        w.addScaledVector(n, -item.depth * f);
        o.worldToLocal(w);
        pos.setXYZ(i, w.x, w.y, w.z);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.boundingBox = null;
    geo.boundingSphere = null;
  });
}
// shear: desplaza a lo largo de `axis` proporcional a la altura (eje Y) sobre el centro.
function applyShear(group, item) {
  if (!group) return;
  const axis = new THREE.Vector3(item.axis[0], item.axis[1], item.axis[2]);
  if (axis.lengthSq() < 1e-12) return;
  axis.normalize();
  group.updateWorldMatrix(true, true);
  const centerW = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const posA = o.geometry.attributes.position;
    if (!posA) return;
    for (let i = 0; i < posA.count; i++) {
      v.fromBufferAttribute(posA, i); w.copy(v); o.localToWorld(w);
      w.addScaledVector(axis, (w.y - centerW.y) * item.factor);
      o.worldToLocal(w);
      posA.setXYZ(i, w.x, w.y, w.z);
    }
    posA.needsUpdate = true;
    o.geometry.computeVertexNormals();
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}
// shrink_fatten: a lo largo de las normales (negativo = encoger).
function applyShrinkFatten(group, item) {
  if (!group || !item.amount) return;
  group.updateWorldMatrix(true, true);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const posA = o.geometry.attributes.position, norA = o.geometry.attributes.normal;
    if (!posA || !norA) return;
    for (let i = 0; i < posA.count; i++) {
      v.fromBufferAttribute(posA, i); w.copy(v); o.localToWorld(w);
      n.fromBufferAttribute(norA, i).transformDirection(o.matrixWorld);
      w.addScaledVector(n, item.amount);
      o.worldToLocal(w);
      posA.setXYZ(i, w.x, w.y, w.z);
    }
    posA.needsUpdate = true;
    o.geometry.computeVertexNormals();
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}
// Registra un grupo extra (clones de extrude/spin) para visibilidad por pasos.
function trackExtra(si, g) {
  store.stepExtras[si].push(g);
  g.traverse(o => { if (o.userData) o.userData.inExtra = true; });
}
// extrude: clona el ítem desplazado por dir*distance y pega original+copia.
function extrudeGroup(group, item, si, j, extras) {
  if (!group) return;
  const dir = new THREE.Vector3(item.dir[0], item.dir[1], item.dir[2]);
  if (dir.lengthSq() < 1e-12) return;
  dir.normalize();
  const clone = group.clone(true);
  clone.position.addScaledVector(dir, item.distance);
  clone.updateMatrixWorld(true);
  modelRoot.add(clone);
  const name = (item.name && item.name.trim()) || `extruido-p${si + 1}i${j + 1}`;
  let gg = findGlueGroup(name);
  if (!gg) {
    gg = new THREE.Group();
    gg.name = name; gg.userData.isGlue = true;
    modelRoot.add(gg);
  }
  gg.attach(group); gg.attach(clone);
  trackExtra(si, gg);
  store.glueList.push({ name, step: si, members: [`paso ${si + 1}, original ítem ${j + 1}`, `paso ${si + 1}, copia extruida`] });
}
// spin: duplicados radiales alrededor de `axis` por `center`, pegados en grupo.
function spinGroup(group, item, si, j, extras) {
  if (!group) return;
  const axis = new THREE.Vector3(item.axis[0], item.axis[1], item.axis[2]);
  if (axis.lengthSq() < 1e-12) return;
  axis.normalize();
  const steps = Math.max(1, item.steps || 4);
  const center = item.center
    ? new THREE.Vector3(item.center[0], item.center[1], item.center[2])
    : new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const clones = [];
  const m4 = new THREE.Matrix4(), t1 = new THREE.Matrix4(), t2 = new THREE.Matrix4(),
        r = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let s = 1; s <= steps; s++) {
    const c = group.clone(true);
    q.setFromAxisAngle(axis, item.angle * s);
    r.makeRotationFromQuaternion(q);
    t1.makeTranslation(center.x, center.y, center.z);
    t2.makeTranslation(-center.x, -center.y, -center.z);
    m4.copy(t1).multiply(r).multiply(t2);
    c.applyMatrix4(m4);
    modelRoot.add(c);
    clones.push(c);
  }
  const name = (item.name && item.name.trim()) || `giro-p${si + 1}i${j + 1}`;
  let gg = findGlueGroup(name);
  if (!gg) {
    gg = new THREE.Group();
    gg.name = name; gg.userData.isGlue = true;
    modelRoot.add(gg);
  }
  gg.attach(group);
  clones.forEach(c => gg.attach(c));
  trackExtra(si, gg);
  store.glueList.push({ name, step: si, members: [`paso ${si + 1}, ítem ${j + 1} + ${steps} copias radiales`] });
}

// ---------- construcción y reproducción ----------
function disposeGroup(g) {
  g.traverse(o => {
    if (o.isMesh || o.isLine || o.isPoints) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
}

function clearModel() {
  clearSelection();
  for (let i = modelRoot.children.length - 1; i >= 0; i--) {
    const c = modelRoot.children[i];
    modelRoot.remove(c);
    disposeGroup(c);
  }
  store.stepGroups = [];
  store.stepExtras = [];
  store.bones = {};
  store.boneList = [];
  store.glueList = [];
  store.skeletonRoot = null;
  store.currentStep = -1;
}

// ---------- herramientas: cut / bone / glue / dent / stretch ----------

// Resuelve el índice del ítem objetivo dentro del mismo paso.
// Si se omite 'target', aplica al ítem de geometría anterior. -1 = no hay.
function resolveTarget(items, j, item) {
  if (item.target === undefined) {
    for (let k = j - 1; k >= 0; k--)
      if (items[k] && GEOMETRY_TYPES.includes(items[k].type)) return k;
    return -1;
  }
  return item.target;
}

// cut: recorte VISUAL con un plano (clipping). Cada mesh recibe su propio
// material clonado para que el corte no afecte a otros ítems.
// NOTA: la exportación (GLB/OBJ/STL) conserva la geometría completa.
function applyCut(group, item) {
  if (!group) return;
  const normal = new THREE.Vector3(item.plane.normal[0], item.plane.normal[1], item.plane.normal[2]);
  if (normal.lengthSq() < 1e-8) return;
  normal.normalize();
  const point = new THREE.Vector3(item.plane.point[0], item.plane.point[1], item.plane.point[2]);
  const plane = item.keep === 'above'
    ? new THREE.Plane(normal.clone(), -normal.dot(point))
    : new THREE.Plane(normal.clone().negate(), normal.dot(point));
  group.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.clippingPlanes = [plane];
      o.material.clipShadows = true;
      o.material.needsUpdate = true;
    }
  });
}

// dent: hunde la superficie hacia adentro (vértices, en espacio mundo,
// con falloff de coseno suave). depth negativo = abulta hacia afuera.
function applyDent(group, item) {
  if (!group || !(item.radius > 0)) return;
  const centerW = new THREE.Vector3(item.at[0], item.at[1], item.at[2]);
  group.updateWorldMatrix(true, true);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
    if (!pos || !nor) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      w.copy(v); o.localToWorld(w);
      const d = w.distanceTo(centerW);
      if (d < item.radius) {
        const falloff = 0.5 * (1 + Math.cos(Math.PI * d / item.radius));
        n.fromBufferAttribute(nor, i).transformDirection(o.matrixWorld);
        w.addScaledVector(n, -item.depth * falloff);
        o.worldToLocal(w);
        pos.setXYZ(i, w.x, w.y, w.z);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.boundingBox = null;
    geo.boundingSphere = null;
  });
}

// stretch: estira los vértices a lo largo de un eje (espacio mundo).
// center por defecto = centro del bounding box del ítem.
function applyStretch(group, item) {
  if (!group) return;
  const axis = new THREE.Vector3(item.axis[0], item.axis[1], item.axis[2]);
  if (axis.lengthSq() < 1e-8) return;
  axis.normalize();
  group.updateWorldMatrix(true, true);
  const centerW = item.center
    ? new THREE.Vector3(item.center[0], item.center[1], item.center[2])
    : new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  const k = item.factor - 1;
  if (k === 0) return;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry, pos = geo.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      w.copy(v); o.localToWorld(w);
      w.addScaledVector(axis, w.clone().sub(centerW).dot(axis) * k);
      o.worldToLocal(w);
      pos.setXYZ(i, w.x, w.y, w.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.boundingBox = null;
    geo.boundingSphere = null;
  });
}

function memberLabel(it, j) {
  return `ítem ${j + 1} (${(it && it.type) || '?'})`;
}

function registerGlueMember(name, si, label) {
  let e = store.glueList.find(x => x.name === name);
  if (!e) { e = { name, step: si, members: [] }; store.glueList.push(e); }
  e.members.push(`paso ${si + 1}, ${label}`);
}

function findGlueGroup(name) {
  let found = null;
  modelRoot.traverse(o => {
    if (!found && o.isGroup && o.userData.isGlue && o.name === name) found = o;
  });
  return found;
}

// Construye un paso: primero la geometría, luego las herramientas en orden
// (deformación por vértices antes de re-emparentar; cut por materiales;
// huesos; glue). Devuelve {groups, extras}: groups alineado con los ítems,
// extras con los grupos extra (clones de extrude/spin).
function buildStepItems(items, si) {
  const n = items.length;
  const groups = new Array(n);
  const extras = [];
  store.stepExtras[si] = extras;
  // 1. geometría (las herramientas dejan un marcador vacío para no romper índices)
  items.forEach((it, j) => {
    groups[j] = GEOMETRY_TYPES.includes(it.type)
      ? buildItem(it, si * 131 + j * 17 + 7)
      : new THREE.Group();
    if (GEOMETRY_TYPES.includes(it.type))
      groups[j].userData.itemRef = { step: si, idx: j, type: it.type };
  });
  groups.forEach(g => modelRoot.add(g));
  modelRoot.updateMatrixWorld(true);

  // 2. deformación por vértices (antes de re-emparentar a huesos/grupos)
  items.forEach((it, j) => {
    const t = it.type;
    const g = groups[resolveTarget(items, j, it)];
    if (t === 'dent') applyDent(g, it);
    else if (t === 'stretch') applyStretch(g, it);
    else if (t === 'sculpt') applySculpt(g, it);
    else if (t === 'transform') applyTransform(g, it);
    else if (t === 'bevel') applyBevel(g, it);
    else if (t === 'inset') applyInset(g, it);
    else if (t === 'shear') applyShear(g, it);
    else if (t === 'shrink_fatten') applyShrinkFatten(g, it);
    else if (t === 'extrude') extrudeGroup(g, it, si, j, extras);
    else if (t === 'spin') spinGroup(g, it, si, j, extras);
  });
  // 3. cut / knife / loop_cut (materiales)
  items.forEach((it, j) => {
    if (it.type !== 'cut' && it.type !== 'knife' && it.type !== 'loop_cut') return;
    applyCut(groups[resolveTarget(items, j, it)], it);
  });
  // 4. huesos: crearlos todos primero, luego resolver el parentesco
  const hasBoneField = it => {
    const nm = (typeof it.bone === 'string' && it.bone.trim()) ? it.bone.trim() : null;
    return (nm && store.bones[nm]) || null;
  };
  const stepBones = [];
  items.forEach(it => {
    if (it.type !== 'bone') return;
    const b = new THREE.Bone();
    b.name = it.name;
    b.position.set(it.at[0], it.at[1], it.at[2]);
    store.skeletonRoot.add(b);
    store.bones[it.name] = b;
    store.boneList.push({ name: it.name, parent: it.parent || null, step: si });
    stepBones.push(it);
  });
  store.skeletonRoot.updateMatrixWorld(true);
  stepBones.forEach(it => {
    const b = store.bones[it.name];
    const pName = (typeof it.parent === 'string' && it.parent.trim()) ? it.parent.trim() : null;
    const p = pName && store.bones[pName];
    if (p && p !== b) p.attach(b); // attach conserva la transformada mundial
  });
  // 5. glue: primero los ítems sueltos {type:"glue"}, luego los campos "glue".
  //    Si un ítem tiene "bone" y "glue", el hueso manda y el glue se ignora.
  items.forEach((it, j) => {
    if (it.type !== 'glue') return;
    const name = (it.name && it.name.trim()) || `grupo-${si + 1}-${j + 1}`;
    let gg = findGlueGroup(name);
    if (!gg) {
      gg = new THREE.Group();
      gg.name = name; gg.userData.isGlue = true;
      modelRoot.add(gg);
    }
    it.items.forEach(mi => {
      const mg = groups[mi];
      if (mg && !hasBoneField(items[mi])) {
        gg.attach(mg);
        registerGlueMember(name, si, memberLabel(items[mi], mi));
      }
    });
  });
  items.forEach((it, j) => {
    if (!GEOMETRY_TYPES.includes(it.type)) return;
    const g = groups[j];
    const bone = hasBoneField(it);
    if (bone) {
      bone.attach(g);
    } else if (typeof it.glue === 'string' && it.glue.trim()) {
      const name = it.glue.trim();
      let gg = findGlueGroup(name);
      if (!gg) {
        gg = new THREE.Group();
        gg.name = name; gg.userData.isGlue = true;
        modelRoot.add(gg);
      }
      gg.attach(g);
      registerGlueMember(name, si, memberLabel(it, j));
    }
  });
  return { groups, extras };
}

// build(): construye todo y lo muestra completo
function build() {
  stop();
  clearModel();
  if (!store.recipe) { updateStepUI(); return; }
  store.skeletonRoot = new THREE.Group();
  store.skeletonRoot.name = 'esqueleto';
  modelRoot.add(store.skeletonRoot);
  store.recipe.steps.forEach((st, si) => {
    const { groups, extras } = buildStepItems(st.items, si);
    groups.forEach(g => { g.visible = true; });
    extras.forEach(g => { g.visible = true; });
    store.stepGroups.push(groups);
  });
  // visualización tenue del esqueleto (se retira al exportar)
  if (Object.keys(store.bones).length > 0) {
    const helper = new THREE.SkeletonHelper(store.skeletonRoot);
    helper.material.transparent = true;
    helper.material.opacity = 0.35;
    store.skeletonRoot.add(helper);
  }
  store.currentStep = store.recipe.steps.length - 1;
  updateStepUI();
  emit('build', {
    steps: store.recipe.steps.length,
    bones: Object.keys(store.bones),
    glueGroups: store.glueList.map(g => g.name),
  });
  save();
}

function eachGroup(fn) {
  store.stepGroups.forEach((groups, si) => groups.forEach(g => {
    if (g.userData.inExtra) return; // ya cubierto por su grupo extra
    fn(g, si);
  }));
  (store.stepExtras || []).forEach((extras, si) => extras.forEach(g => fn(g, si)));
}

// setStep(n): muestra los ítems de los pasos 0..n (n en base 0)
function setStep(n) {
  const N = store.recipe ? store.recipe.steps.length : 0;
  if (N === 0) { store.currentStep = -1; updateStepUI(); return store.currentStep; }
  if (store.playing) stop();
  n = Math.max(0, Math.min(N - 1, n | 0));
  store.currentStep = n;
  eachGroup((g, si) => { g.visible = si <= n; g.scale.setScalar(1); });
  updateStepUI();
  emit('step', n);
  saveSoon();
  return n;
}
function getStep() { return store.currentStep; }

const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const delay = ms => new Promise(r => setTimeout(r, ms));

function animateScales(groups, ms, token) {
  return new Promise(resolve => {
    const t0 = performance.now();
    (function frame(now) {
      if (token !== store.playToken) return resolve();
      const t = Math.min((now - t0) / ms, 1);
      const s = Math.max(easeOutBack(t), 0.001);
      groups.forEach(g => g.scale.setScalar(s));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    })(t0);
  });
}

// play(): reproduce la construcción paso a paso desde el inicio
async function play() {
  if (!store.recipe || store.playing || store.recipe.steps.length === 0) return;
  store.playing = true;
  const token = ++store.playToken;
  emit('play');
  updatePlayUI();
  eachGroup(g => { g.visible = false; g.scale.setScalar(1); });
  const N = store.recipe.steps.length;
  for (let s = 0; s < N; s++) {
    if (token !== store.playToken) return;
    // visibles del paso: grupos propios (sin los ya cubiertos por extras) + extras
    const vis = store.stepGroups[s].filter(g => !g.userData.inExtra)
      .concat(store.stepExtras[s] || []);
    vis.forEach(g => { g.visible = true; g.scale.setScalar(0.001); });
    await animateScales(vis, 380, token);
    if (token !== store.playToken) return;
    store.currentStep = s;
    updateStepUI();
    emit('step', s);
    await delay(300);
  }
  store.playing = false;
  updatePlayUI();
  emit('stop');
  saveSoon();
}

function stop() {
  if (!store.playing && store.playToken === 0) return;
  store.playToken++;
  if (store.playing) {
    store.playing = false;
    eachGroup(g => g.scale.setScalar(1));
    updatePlayUI();
    emit('stop');
  }
}

// ---------- selección por clic, cursor 3D y medición ----------
// Click (sin arrastrar) selecciona el mesh bajo el puntero y lo resalta.
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let downPos = null;
let selected = null; // {group, saved:Map(material->emissiveHex)}

function findItemRef(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.itemRef) return { ref: o.userData.itemRef, group: o };
    o = o.parent;
  }
  return null;
}
function clearSelection() {
  if (selected) {
    selected.saved.forEach((hex, m) => { m.emissive.setHex(hex); });
    selected = null;
  }
  emit('select', null);
}
function selectGroup(g) {
  clearSelection();
  if (!g) return false;
  const saved = new Map();
  g.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive) {
      if (!saved.has(o.material)) saved.set(o.material, o.material.emissive.getHex());
      o.material.emissive.setHex(0x7a4a1e);
      o.material.emissiveIntensity = 0.45;
    }
  });
  selected = { group: g, saved };
  emit('select', g.userData.itemRef || null);
  return true;
}
renderer.domElement.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 6) return; // fue un arrastre de órbita, no un clic
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(modelRoot.children, true);
  for (const h of hits) {
    const f = findItemRef(h.object);
    if (f) { selectGroup(f.group); return; }
  }
  clearSelection();
});
function apiSelect(si, idx) {
  let found = null;
  modelRoot.traverse(o => {
    if (!found && o.userData && o.userData.itemRef &&
        o.userData.itemRef.step === si && o.userData.itemRef.idx === idx) found = o;
  });
  return selectGroup(found);
}
function apiSelectedName() {
  if (!selected) return null;
  const r = selected.group.userData.itemRef || {};
  return `paso ${(r.step || 0) + 1}, ítem ${(r.idx || 0) + 1} (${r.type || '?'})`;
}
// Cursor 3D (cruz visible). Lo usa pivot:"cursor" en transform.
const cursorGroup = new THREE.Group();
{
  const cmat = new THREE.LineBasicMaterial({ color: 0xb4713c, depthTest: false });
  const s = 0.35;
  const mk = (a, b) => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), cmat);
  cursorGroup.add(mk([-s, 0, 0], [s, 0, 0]), mk([0, -s, 0], [0, s, 0]), mk([0, 0, -s], [0, 0, s]));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xb4713c, depthTest: false }));
  cursorGroup.add(dot);
  cursorGroup.renderOrder = 999;
  cursorGroup.visible = false;
  scene.add(cursorGroup);
}
function apiSetCursor(p) {
  store.cursorPos = [p[0], p[1], p[2]];
  cursorGroup.position.set(p[0], p[1], p[2]);
  cursorGroup.visible = true;
  return store.cursorPos.slice();
}
// Medición: dibuja la línea y muestra la distancia en el readout.
let measureLine = null;
function apiMeasure(a, b) {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  if (measureLine) {
    scene.remove(measureLine);
    measureLine.geometry.dispose();
    measureLine = null;
  }
  const g = new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])]);
  measureLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xb4713c, depthTest: false }));
  measureLine.renderOrder = 998;
  scene.add(measureLine);
  const el = document.getElementById('measureReadout');
  if (el) {
    el.textContent = `📏 ${d.toFixed(2)} unidades`;
    el.classList.remove('hidden');
  }
  return d;
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const btnBuild = $('btnBuild'), btnPlay = $('btnPlay'), btnStop = $('btnStop');
const stepSlider = $('stepSlider'), stepCounter = $('stepCounter');
const recipeText = $('recipeText'), errorList = $('errorList'), stepsList = $('stepsList');
const emptyHint = $('emptyHint');
const rigInfo = $('rigInfo'), bonesList = $('bonesList'), glueList = $('glueList');

function stepsCount() { return store.recipe ? store.recipe.steps.length : 0; }

function updateStepUI() {
  const N = stepsCount();
  stepSlider.max = Math.max(N - 1, 0);
  stepSlider.value = Math.max(store.currentStep, 0);
  stepSlider.disabled = N === 0;
  stepCounter.textContent = N === 0 ? 'Paso 0/0' : `Paso ${store.currentStep + 1}/${N}`;
  emptyHint.classList.toggle('hidden', N !== 0);
  [...stepsList.children].forEach((li, i) => li.classList.toggle('current', i === store.currentStep));
}

function updatePlayUI() {
  btnPlay.disabled = store.playing || stepsCount() === 0;
  btnStop.disabled = !store.playing;
  btnBuild.disabled = store.playing;
}

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'modelo') { resize(); }
}

function buildStepsList() {
  stepsList.innerHTML = '';
  if (!store.recipe) return;
  store.recipe.steps.forEach((st, i) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = `${i + 1}. ${st.label}`;
    li.appendChild(b);
    if (st.kind) {
      const k = document.createElement('span');
      k.className = 'kind';
      k.textContent = st.kind;
      li.appendChild(k);
    }
    if (st.note) {
      const p = document.createElement('p');
      p.textContent = st.note;
      li.appendChild(p);
    }
    li.addEventListener('click', () => { setStep(i); switchTab('modelo'); });
    stepsList.appendChild(li);
  });
  buildRigInfo();
  updateStepUI();
}

// Lista huesos y grupos de pegado detectados en la receta (pestaña Pasos)
function buildRigInfo() {
  bonesList.innerHTML = '';
  glueList.innerHTML = '';
  const bones = [], glueMap = new Map();
  if (store.recipe) {
    store.recipe.steps.forEach((st, si) => {
      (st.items || []).forEach((it, j) => {
        if (!it || typeof it !== 'object') return;
        if (it.type === 'bone' && it.name) {
          bones.push({ name: it.name, parent: it.parent || null, step: si });
        }
        if (it.type === 'glue') {
          const nm = (it.name && String(it.name).trim()) || `grupo-${si + 1}-${j + 1}`;
          if (!glueMap.has(nm)) glueMap.set(nm, []);
          (it.items || []).forEach(mi => glueMap.get(nm).push(`paso ${si + 1}, ítem ${mi + 1}`));
        } else if (GEOMETRY_TYPES.includes(it.type) && typeof it.glue === 'string' && it.glue.trim()) {
          const nm = it.glue.trim();
          if (!glueMap.has(nm)) glueMap.set(nm, []);
          glueMap.get(nm).push(`paso ${si + 1}, ítem ${j + 1}`);
        }
      });
    });
  }
  bones.forEach(b => {
    const li = document.createElement('li');
    li.textContent = `🦴 ${b.name}` + (b.parent ? ` ← ${b.parent}` : '') + ` (paso ${b.step + 1})`;
    bonesList.appendChild(li);
  });
  glueMap.forEach((members, name) => {
    const li = document.createElement('li');
    li.textContent = `🔗 ${name}: ${members.join('; ')}`;
    glueList.appendChild(li);
  });
  rigInfo.classList.toggle('hidden', bones.length === 0 && glueMap.size === 0);
}

function showErrors(errors) {
  errorList.innerHTML = '';
  errors.forEach(e => {
    const d = document.createElement('div');
    d.className = 'err';
    d.textContent = e;
    errorList.appendChild(d);
  });
}
function showOk(msg) {
  errorList.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'ok';
  d.textContent = msg;
  errorList.appendChild(d);
}

function syncTextarea() {
  if (store.recipe) recipeText.value = JSON.stringify(store.recipe, null, 2);
}

// ---------- recetas: cargar / validar ----------
function loadRecipe(input) {
  let obj;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); }
    catch (e) { const errors = ['JSON inválido: ' + e.message]; emit('error', errors); return { ok: false, errors }; }
  } else obj = input;
  const errors = validateRecipe(obj);
  if (errors.length) { emit('error', errors); return { ok: false, errors }; }
  store.recipe = obj;
  syncTextarea();
  buildStepsList();
  build();
  updatePlayUI();
  emit('load', obj);
  save();
  refreshToolTargets();
  return { ok: true, errors: [] };
}
function getRecipe() { return store.recipe; }

function loadFromTextarea() {
  const res = loadRecipe(recipeText.value);
  if (res.ok) showOk(`Receta "${store.recipe.name}" cargada: ${store.recipe.steps.length} pasos.`);
  else showErrors(res.errors);
  return res;
}

// ---------- exportaciones ----------
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function recipeFileBase() {
  const n = (store.recipe && store.recipe.name) || 'modelo';
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'modelo';
}

// Deja el modelo completo y normalizado para exportar, luego restaura la vista.
function withExportReady(fn) {
  const wasPlaying = store.playing;
  if (wasPlaying) stop();
  const prev = store.currentStep;
  eachGroup(g => { g.visible = true; g.scale.setScalar(1); });
  // el esqueleto de visualización no se exporta; el cut es visual
  // (la geometría exportada conserva su forma completa)
  const skel = store.skeletonRoot;
  if (skel && skel.parent) skel.parent.remove(skel);
  // el atributo 'mask' del esculpido es interno: se retira y se restaura
  const masked = [];
  modelRoot.traverse(o => {
    if (o.isMesh && o.geometry.attributes.mask) {
      masked.push([o.geometry, o.geometry.attributes.mask]);
      o.geometry.deleteAttribute('mask');
    }
  });
  modelRoot.updateMatrixWorld(true);
  const out = fn();
  masked.forEach(([g, a]) => g.setAttribute('mask', a));
  if (skel) modelRoot.add(skel);
  if (skel) modelRoot.add(skel);
  if (prev >= 0) setStep(prev);
  else eachGroup((g, si) => { g.visible = false; });
  updateStepUI();
  return out;
}

function exportGLB() {
  if (!store.recipe) return Promise.reject(new Error('No hay receta cargada'));
  emit('export', 'glb');
  return withExportReady(() => new Promise((resolve, reject) => {
    new GLTFExporter().parse(modelRoot,
      res => {
        const blob = new Blob([res], { type: 'model/gltf-binary' });
        downloadBlob(blob, recipeFileBase() + '.glb');
        resolve(blob);
      },
      err => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true });
  }));
}

function exportOBJ() {
  if (!store.recipe) throw new Error('No hay receta cargada');
  emit('export', 'obj');
  return withExportReady(() => {
    const text = new OBJExporter().parse(modelRoot);
    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, recipeFileBase() + '.obj');
    return blob;
  });
}

function exportSTL() {
  if (!store.recipe) throw new Error('No hay receta cargada');
  emit('export', 'stl');
  return withExportReady(() => {
    const data = new STLExporter().parse(modelRoot, { binary: true });
    const blob = new Blob([data], { type: 'model/stl' });
    downloadBlob(blob, recipeFileBase() + '.stl');
    return blob;
  });
}

function exportJSON() {
  if (!store.recipe) throw new Error('No hay receta cargada');
  emit('export', 'json');
  const blob = new Blob([JSON.stringify(store.recipe, null, 2)], { type: 'application/json' });
  downloadBlob(blob, recipeFileBase() + '.json');
  return blob;
}

// ---------- persistencia ----------
let saveTimer = null;
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ recipe: store.recipe, step: store.currentStep }));
  } catch (e) { /* almacenamiento no disponible */ }
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------- cableado ----------
btnBuild.addEventListener('click', () => { build(); updatePlayUI(); });
btnPlay.addEventListener('click', () => play());
btnStop.addEventListener('click', () => stop());
stepSlider.addEventListener('input', () => setStep(parseInt(stepSlider.value, 10)));

document.querySelectorAll('.views button').forEach(b =>
  b.addEventListener('click', () => setView(b.dataset.view)));

document.querySelectorAll('.tabs button').forEach(b =>
  b.addEventListener('click', () => switchTab(b.dataset.tab)));

const exportDropdown = $('exportDropdown');
$('btnExportMenu').addEventListener('click', e => {
  e.stopPropagation();
  exportDropdown.classList.toggle('hidden');
});
document.addEventListener('click', e => {
  if (!e.target.closest('.export-menu')) exportDropdown.classList.add('hidden');
});
exportDropdown.querySelectorAll('button').forEach(b =>
  b.addEventListener('click', () => {
    exportDropdown.classList.add('hidden');
    const kind = b.dataset.export;
    try {
      const r = { glb: exportGLB, obj: exportOBJ, stl: exportSTL, json: exportJSON }[kind]();
      if (r && typeof r.catch === 'function') r.catch(err => showErrors(['Exportación falló: ' + err.message]));
    } catch (err) { showErrors(['Exportación falló: ' + err.message]); }
  }));

$('btnValidate').addEventListener('click', () => {
  let obj;
  try { obj = JSON.parse(recipeText.value); }
  catch (e) { showErrors(['JSON inválido: ' + e.message]); return; }
  const errors = validateRecipe(obj);
  if (errors.length) showErrors(errors);
  else showOk(`Receta válida: "${obj.name}" con ${obj.steps.length} pasos. Pulsa Construir o cárgala con el editor.`);
});

$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { recipeText.value = String(rd.result || ''); loadFromTextarea(); switchTab('modelo'); };
  rd.onerror = () => showErrors(['No se pudo leer el archivo.']);
  rd.readAsText(f);
  e.target.value = '';
});

$('btnExportJson').addEventListener('click', () => {
  try { exportJSON(); }
  catch (err) { showErrors([err.message]); }
});

async function loadExampleFile(path, label) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    recipeText.value = await r.text();
    loadFromTextarea();
    switchTab('modelo');
  } catch (e) {
    showErrors(['No se pudo cargar ' + label + ' automáticamente (' + e.message + '). ' +
      'Abre este sitio con un servidor local o usa Importar .json con ' + path + '.']);
    switchTab('comandos');
  }
}
$('btnExample').addEventListener('click', () => loadExampleFile('recetas/perro.json', 'el ejemplo del perro'));
$('btnDemoTools').addEventListener('click', () => loadExampleFile('recetas/demo-herramientas.json', 'la demo de herramientas'));

// ---------- panel táctil de herramientas ----------
// Los botones aplican comandos de receta al último paso (la receta sigue
// siendo la fuente de verdad: todo queda guardado y exportable).
function toolStatus(msg, ok) {
  const el = $('toolStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'tool-status' + (msg ? (ok ? ' ok' : ' err') : '');
}
function toolTargets() {
  const out = [];
  if (store.recipe) {
    const si = store.recipe.steps.length - 1;
    store.recipe.steps[si].items.forEach((it, j) => {
      if (it && GEOMETRY_TYPES.includes(it.type)) out.push({ j, label: `ítem ${j + 1} (${it.type})` });
    });
  }
  return out;
}
function refreshToolTargets() {
  const opts = toolTargets();
  ['mvTarget', 'scTarget', 'mdTarget'].forEach(id => {
    const s = $(id);
    if (!s) return;
    s.innerHTML = '';
    if (!opts.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '(sin geometría en el último paso)';
      s.appendChild(o);
      return;
    }
    opts.forEach(t => {
      const o = document.createElement('option');
      o.value = t.j;
      o.textContent = t.label;
      s.appendChild(o);
    });
  });
}
// Añade un comando de receta al último paso y reconstruye.
function applyTool(type, params) {
  if (!ITEM_TYPES.includes(type)) return { ok: false, errors: [`type desconocido '${type}'`] };
  const clean = {};
  for (const k in params) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  const recipe = store.recipe
    ? JSON.parse(JSON.stringify(store.recipe))
    : { name: 'Modelo', steps: [{ label: 'Herramientas', items: [] }] };
  const si = recipe.steps.length - 1;
  recipe.steps[si].items.push(Object.assign({ type }, clean));
  const errors = validateRecipe(recipe);
  if (errors.length) {
    showErrors(errors);
    switchTab('comandos');
    return { ok: false, errors };
  }
  const res = loadRecipe(recipe);
  if (res.ok) { refreshToolTargets(); save(); }
  return res;
}
function gnum(id, def) {
  const el = $(id);
  if (!el) return def;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : def;
}
function gvec(ix, iy, iz, dx, dy, dz) {
  return [gnum(ix, dx), gnum(iy, dy), gnum(iz, dz)];
}
const DIR_BRUSHES = ['draw', 'grab', 'snake_hook', 'smear', 'multires_smear', 'thumb',
  'nudge', 'elastic_deform', 'flatten', 'scrape', 'line_project', 'clay_strips'];

document.querySelectorAll('.toolcats button').forEach(b => b.addEventListener('click', () => {
  const cat = b.dataset.cat;
  const panel = $('toolPanel');
  const wasOpen = !panel.classList.contains('hidden') && !$('panel-' + cat).classList.contains('hidden');
  document.querySelectorAll('.toolcats button').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tool-form').forEach(f => f.classList.add('hidden'));
  if (wasOpen) { panel.classList.add('hidden'); return; }
  b.classList.add('active');
  panel.classList.remove('hidden');
  $('panel-' + cat).classList.remove('hidden');
  refreshToolTargets();
  toolStatus('');
}));

$('btnApplyMove').addEventListener('click', () => {
  const t = $('mvTarget').value;
  if (t === '') { toolStatus('Elige un ítem objetivo.', false); return; }
  const p = { target: parseInt(t, 10) };
  const mv = gvec('mvMX', 'mvMY', 'mvMZ', 0, 0, 0);
  if (mv.some(x => x !== 0)) p.move = mv;
  const rt = gvec('mvRX', 'mvRY', 'mvRZ', 0, 0, 0).map(d => d * Math.PI / 180);
  if (rt.some(x => x !== 0)) p.rotate = rt;
  const sc = gvec('mvSX', 'mvSY', 'mvSZ', 1, 1, 1);
  if (sc.some(x => x !== 1)) p.scale = sc;
  const pv = $('mvPivot').value;
  if (pv === 'custom') p.pivot = gvec('mvPX', 'mvPY', 'mvPZ', 0, 0, 0);
  else if (pv !== 'own') p.pivot = pv;
  const r = applyTool('transform', p);
  toolStatus(r.ok ? '✔ Movimiento aplicado al último paso.' : '✘ ' + (r.errors[0] || 'error'), r.ok);
});

$('btnApplySculpt').addEventListener('click', () => {
  const t = $('scTarget').value;
  if (t === '') { toolStatus('Elige un ítem objetivo.', false); return; }
  const brush = $('scBrush').value;
  const p = {
    target: parseInt(t, 10), brush,
    at: gvec('scX', 'scY', 'scZ', 0, 0, 0),
    radius: gnum('scRadius', 0.5), strength: gnum('scStrength', 0.2),
  };
  if (DIR_BRUSHES.includes(brush)) p.dir = gvec('scDX', 'scDY', 'scDZ', 0, 1, 0);
  if (brush === 'pose' || brush === 'rotate') p.axis = gvec('scAX', 'scAY', 'scAZ', 0, 1, 0);
  if (brush === 'pose') p.angle = gnum('scAngle', 15) * Math.PI / 180;
  if (PAINT_BRUSHES.includes(brush)) p.color = $('scColor').value;
  if (brush === 'mask') p.value = gnum('scValue', 1);
  if (brush === 'mesh_filter') p.filter = $('scFilter').value;
  if (BOX_BRUSHES.includes(brush)) {
    p.box_min = gvec('scMinX', 'scMinY', 'scMinZ', -0.5, -0.5, -0.5);
    p.box_max = gvec('scMaxX', 'scMaxY', 'scMaxZ', 0.5, 0.5, 0.5);
  }
  if (brush === 'mask_by_color') p.tolerance = gnum('scTol', 0.15);
  const r = applyTool('sculpt', p);
  toolStatus(r.ok ? `✔ Pincel ${brush} aplicado.` : '✘ ' + (r.errors[0] || 'error'), r.ok);
});

$('btnApplyModel').addEventListener('click', () => {
  const t = $('mdTarget').value;
  const op = $('mdOp').value;
  if (t === '') { toolStatus('Elige un ítem objetivo.', false); return; }
  const p = { target: parseInt(t, 10) };
  if (op === 'bevel' || op === 'shrink_fatten') p.amount = gnum('mdAmount', 0.1);
  else if (op === 'extrude') { p.dir = gvec('mdDX', 'mdDY', 'mdDZ', 0, 1, 0); p.distance = gnum('mdDist', 0.5); }
  else if (op === 'inset' || op === 'dent') {
    p.at = gvec('mdIX', 'mdIY', 'mdIZ', 0, 0, 0);
    p.radius = gnum('mdRadius', 0.4); p.depth = gnum('mdDepth', 0.2);
  }
  else if (op === 'knife' || op === 'cut' || op === 'loop_cut') {
    p.plane = { point: gvec('mdPPX', 'mdPPY', 'mdPPZ', 0, 0, 0), normal: gvec('mdPNX', 'mdPNY', 'mdPNZ', 1, 0, 0) };
    p.keep = $('mdKeep').value;
  }
  else if (op === 'spin') {
    p.axis = gvec('mdAX', 'mdAY', 'mdAZ', 0, 1, 0);
    p.angle = gnum('mdAngle', 90) * Math.PI / 180;
    p.steps = Math.max(1, Math.round(gnum('mdSteps', 4)));
  }
  else if (op === 'shear') { p.axis = gvec('mdAX', 'mdAY', 'mdAZ', 1, 0, 0); p.factor = gnum('mdFactor', 0.3); }
  else if (op === 'stretch') { p.axis = gvec('mdAX', 'mdAY', 'mdAZ', 0, 1, 0); p.factor = gnum('mdFactor', 1.5); }
  const r = applyTool(op, p);
  toolStatus(r.ok ? `✔ ${op} aplicado.` : '✘ ' + (r.errors[0] || 'error'), r.ok);
});

$('btnApplyPrim').addEventListener('click', () => {
  const raw = $('prSize').value.trim();
  let size;
  if (raw.includes(',')) {
    size = raw.split(',').map(s => parseFloat(s.trim()));
    if (size.some(x => !Number.isFinite(x) || x <= 0)) { toolStatus('Medida inválida: usa "1" o "1,2,1".', false); return; }
  } else {
    size = parseFloat(raw);
    if (!Number.isFinite(size) || size <= 0) { toolStatus('Medida inválida: usa "1" o "1,2,1".', false); return; }
  }
  const p = {
    shape: $('prShape').value,
    at: gvec('prX', 'prY', 'prZ', 0, 1, 0),
    size, color: $('prColor').value,
  };
  const r = applyTool('primitive', p);
  toolStatus(r.ok ? `✔ Primitiva ${p.shape} añadida.` : '✘ ' + (r.errors[0] || 'error'), r.ok);
});

// ---------- API programática ----------
window.Mesa = {
  version: '1.2.0',
  loadRecipe, getRecipe, build, play, stop, setStep, getStep,
  exportGLB, exportOBJ, exportSTL, exportJSON,
  setView, on,
  applyTool,
  sculpt: p => applyTool('sculpt', p || {}),
  transform: p => applyTool('transform', p || {}),
  primitive: p => applyTool('primitive', p || {}),
  select: apiSelect,
  selectedName: apiSelectedName,
  setCursor: apiSetCursor,
  measure: apiMeasure,
};

// ---------- init ----------
async function init() {
  setView('iso');
  resize();
  updateStepUI();
  updatePlayUI();
  // poblar el selector de pinceles (nombres snake_case + etiqueta)
  const scBrush = $('scBrush');
  if (scBrush) {
    BRUSHES.forEach(([name, label]) => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = `${name} — ${label}`;
      scBrush.appendChild(o);
    });
  }

  const params = new URLSearchParams(location.search);
  let loaded = false;

  if (params.has('recipe')) {
    try {
      const r = await fetch(params.get('recipe'));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const res = loadRecipe(await r.text());
      loaded = res.ok;
      if (!res.ok) { showErrors(res.errors); switchTab('comandos'); }
    } catch (e) {
      showErrors(['No se pudo descargar ?recipe=: ' + e.message]);
      switchTab('comandos');
    }
  } else {
    const saved = loadSaved();
    if (saved && saved.recipe) {
      const res = loadRecipe(saved.recipe);
      loaded = res.ok;
      if (loaded && Number.isInteger(saved.step)) setStep(saved.step);
    }
  }

  if (!loaded) {
    try {
      const r = await fetch('recetas/perro.json');
      if (r.ok) { const res = loadRecipe(await r.text()); loaded = res.ok; }
    } catch (e) { /* file:// u otro: se muestra el aviso de receta vacía */ }
  }

  if (params.has('step') && loaded) {
    const n = parseInt(params.get('step'), 10);
    if (Number.isInteger(n)) setStep(n);
  }
  updatePlayUI();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

init();
