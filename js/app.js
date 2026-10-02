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
const ITEM_TYPES = ['clay', 'cone', 'limb', 'curve', 'eye', 'paint', 'cut', 'bone', 'glue', 'dent', 'stretch'];
const GEOMETRY_TYPES = ['clay', 'cone', 'limb', 'curve', 'eye', 'paint'];
const TOOL_TYPES = ['cut', 'bone', 'glue', 'dent', 'stretch'];

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
    bone:    [['name', 'str'], ['at', 3]],
    glue:    [['items', 'intarr']],
    dent:    [['at', 3], ['radius', 'num'], ['depth', 'num']],
    stretch: [['axis', 3], ['factor', 'num']],
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
  if (['cut', 'dent', 'stretch'].includes(item.type) && item.target !== undefined
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
  // campos 'bone' / 'glue' en cualquier ítem de geometría
  if (GEOMETRY_TYPES.includes(item.type)) {
    if (item.bone !== undefined && (typeof item.bone !== 'string' || !item.bone.trim()))
      errors.push(`${path}: 'bone' debe ser el nombre de un hueso (texto)`);
    if (item.glue !== undefined && (typeof item.glue !== 'string' || !item.glue.trim()))
      errors.push(`${path}: 'glue' debe ser el nombre de un grupo (texto)`);
  }
  // las herramientas apuntan a ítems del mismo paso ya construidos
  if (['cut', 'dent', 'stretch'].includes(item.type)) {
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
    return `${path}: 'target' (${item.target}) debe apuntar a un ítem de geometría (clay, cone, limb, curve, eye, paint)`;
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
  stepGroups: [],   // stepGroups[s] = [THREE.Group, ...]
  currentStep: -1,
  playing: false,
  playToken: 0,
  listeners: {},
  bones: {},        // name -> THREE.Bone
  boneList: [],     // {name, parent, step} para la UI
  glueList: [],     // {name, step, members[]} para la UI
  skeletonRoot: null,
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

const BUILDERS = { clay: buildClay, cone: buildCone, limb: buildLimb, curve: buildCurve, eye: buildEye, paint: buildPaint };

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
  for (let i = modelRoot.children.length - 1; i >= 0; i--) {
    const c = modelRoot.children[i];
    modelRoot.remove(c);
    disposeGroup(c);
  }
  store.stepGroups = [];
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
// (dent/stretch por vértices antes de re-emparentar; cut por materiales;
// huesos; glue). Devuelve un arreglo alineado con los ítems del paso.
function buildStepItems(items, si) {
  const n = items.length;
  const groups = new Array(n);
  // 1. geometría (las herramientas dejan un marcador vacío para no romper índices)
  items.forEach((it, j) => {
    groups[j] = GEOMETRY_TYPES.includes(it.type)
      ? buildItem(it, si * 131 + j * 17 + 7)
      : new THREE.Group();
  });
  groups.forEach(g => modelRoot.add(g));
  modelRoot.updateMatrixWorld(true);

  // 2. dent / stretch (vértices; antes de re-emparentar a huesos/grupos)
  items.forEach((it, j) => {
    if (it.type !== 'dent' && it.type !== 'stretch') return;
    const g = groups[resolveTarget(items, j, it)];
    if (it.type === 'dent') applyDent(g, it); else applyStretch(g, it);
  });
  // 3. cut (materiales)
  items.forEach((it, j) => {
    if (it.type !== 'cut') return;
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
  return groups;
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
    const groups = buildStepItems(st.items, si);
    groups.forEach(g => { g.visible = true; });
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
  store.stepGroups.forEach((groups, si) => groups.forEach(g => fn(g, si)));
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
    const groups = store.stepGroups[s];
    groups.forEach(g => { g.visible = true; g.scale.setScalar(0.001); });
    await animateScales(groups, 380, token);
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
  modelRoot.updateMatrixWorld(true);
  const out = fn();
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

// ---------- API programática ----------
window.Mesa = {
  version: '1.1.0',
  loadRecipe, getRecipe, build, play, stop, setStep, getStep,
  exportGLB, exportOBJ, exportSTL, exportJSON,
  setView, on,
};

// ---------- init ----------
async function init() {
  setView('iso');
  resize();
  updateStepUI();
  updatePlayUI();

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
