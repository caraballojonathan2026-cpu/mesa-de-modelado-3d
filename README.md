# Mesa de modelado 3D 🖤

Taller web de esculpido estilo **arcilla blanda**: escribes una *receta* JSON con pasos
de construcción y la app la reproduce pieza por pieza en 3D, con vistas, reproducción
animada y exportación a **GLB** (prioridad), OBJ, STL o JSON.

> La interfaz parece una herramienta normal para cualquier usuario, pero está
> optimizada para operación programática: todo el flujo (cargar receta, construir,
> reproducir, exportar) está expuesto en `window.Mesa` y la app acepta recetas por
> parámetro URL. Ideal para que un agente la opere desde el navegador o por consola.

Sitio publicado (GitHub Pages): `https://caraballojonathan2026-cpu.github.io/mesa-de-modelado-3d/`

## Cómo correr local

Sirve la carpeta con cualquier servidor estático, por ejemplo:

```bash
cd repo
python3 -m http.server 8080
# abre http://localhost:8080
```

> Abrir `index.html` directo como archivo funciona, pero `fetch('recetas/perro.json')`
> puede fallar por CORS en algunos navegadores; con servidor local todo funciona.

## Esquema de recetas

```json
{
  "name": "Perro de Vex",
  "steps": [
    {
      "label": "Masa principal",
      "kind": "volumen",
      "note": "Texto libre opcional",
      "items": [
        { "type": "clay", "at": [0, 0.15, -0.1], "size": [1.25, 0.95, 1.9], "color": "#cf9455" }
      ]
    }
  ]
}
```

Sistema de coordenadas: **+y arriba, +z al frente**. `size` son extensiones totales
(diámetros), no radios. `color` es hexadecimal (`#rrggbb`).

| type | campos | qué construye |
|------|--------|---------------|
| `clay` | `at [x,y,z]`, `size [sx,sy,sz]`, `color` | Elipsoide con ruido suave (arcilla orgánica, no perfecta), `roughness` 0.85 |
| `cone` | `at [x,y,z]`, `size [radio, altura]`, `color` | Cono centrado en `at` |
| `limb` | `from [x,y,z]`, `to [x,y,z]`, `radius`, `color` | Cilindro ahusado (arriba = `radius*0.8`) de `from`→`to`, con esferas en ambos extremos |
| `curve` | `points [[x,y,z], …]` (2+), `radius`, `color`, `taper?` (0..1) | Tubo por curva CatmullRom; `taper` angosta la punta |
| `eye` | `at [x,y,z]`, `size [sx,sy,sz]`, `color` | Ojo compuesto: borde hueso + iris (`color`) + pupila + brillo. Se desplaza `+z` en `size[2]/2 + 0.03` para quedar **sobre** la superficie, nunca enterrado |
| `paint` | `at [x,y,z]`, `size [sx,sy,sz]`, `color`, `rotate? [rx,ry,rz]` | Parche fino (elipsoide aplanado en z) con rotación en radianes |
| `cut` | `plane {point:[x,y,z], normal:[x,y,z]}`, `keep` ("above"\|"below"), `target?` (índice) | Recorta el ítem objetivo con un plano. `target` = índice dentro del mismo paso (si se omite, el ítem de geometría anterior). **Limitación:** el corte es visual (clipping); la exportación GLB/OBJ/STL conserva la geometría completa |
| `bone` | `name`, `at [x,y,z]`, `parent?` (nombre de otro hueso) | Define un hueso del esqueleto (jerarquía `THREE.Bone` con `SkeletonHelper` tenue). El esqueleto no se exporta |
| `glue` | `items [i0,i1,…]` (índices del mismo paso, ya construidos), `name?` | Ítem suelto: agrupa esos ítems en un `THREE.Group` para que se muevan juntos |
| `dent` | `at [x,y,z]`, `radius` (> 0), `depth`, `target?` (índice) | Hunde los vértices del ítem objetivo hacia adentro con falloff de coseno suave. `depth` negativo abulta hacia afuera |
| `stretch` | `axis [x,y,z]`, `factor`, `target?` (índice), `center? [x,y,z]` | Estira los vértices del ítem objetivo a lo largo del eje (`center` por defecto = centro del bounding box) |

Campos extra en cualquier ítem de geometría:

| campo | efecto |
|-------|--------|
| `"bone": "nombre"` | Emparenta el ítem a ese hueso (conserva su transformada mundial). **Si un ítem tiene `bone` y `glue`, el hueso manda y el glue se ignora** |
| `"glue": "nombreGrupo"` | Mete el ítem en el grupo de pegado con ese nombre (se crea si no existe) |

`target`/`items` son índices dentro del **mismo paso** y deben apuntar a ítems ya
construidos (índice menor al actual) y de geometría (`clay`, `cone`, `limb`,
`curve`, `eye`, `paint`); si no, la validación da un error claro con índice.

La pestaña **Comandos** valida la receta y lista errores claros con índice, por ejemplo:
`steps[7].items[1]: eye requiere 'at'`.

Hay recetas de ejemplo en `recetas/`: `perro.json` ("Perro de Vex", 10 pasos),
`demo-herramientas.json` (6 pasos que muestran `cut`, `bone`, `glue`, `dent` y
`stretch` en acción) y `test-brush.json` (pinceles de esculpido).

La pestaña **Pasos** también lista los huesos y grupos de pegado de la receta.

## Nuevos comandos (v1.2.0)

La mesa sigue siendo arcilla por recetas (blobs), no malla topológica editable;
las herramientas de Blender se adaptan honestamente a ese modelo.

| type | campos | qué hace |
|------|--------|----------|
| `sculpt` | `brush` (ver lista), `at [x,y,z]`, `radius` (> 0), `strength`, `target?` + opcionales `dir`, `axis`, `angle` (rad), `value` (0..1), `color`, `filter` ("smooth"\|"inflate"\|"sharpen"), `box_min`/`box_max`, `tolerance` | Motor único de deformación por vértices en espacio mundo con falloff de coseno suave y máscara por geometría (atributo `mask` que resiste otros pinceles). Cada pincel es una variante (ver tabla de pinceles) |
| `transform` | `target?`, `move? [x,y,z]`, `rotate? [rx,ry,rz]` (rad), `scale?` (número o `[sx,sy,sz]`), `pivot?` ("own"\|"cursor"\|[x,y,z]) | Mover / rotar / escalar por vértices (cubre move, rotate, scale, transform). Requiere al menos una operación |
| `primitive` | `shape` ("cube"\|"sphere"\|"cylinder"\|"cone"\|"torus"), `at`, `size` (número o `[..]`), `color` | Primitiva como ítem de geometría (cubre "add cube" y más) |
| `bevel` | `amount`, `target?` | **Aproximación:** suavizado + inflado leve (sin topología de bordes en blobs) |
| `extrude` | `dir [x,y,z]`, `distance`, `target?`, `name?` | Clona el ítem desplazado y pega original+copia en un grupo |
| `inset` | `at`, `radius` (> 0), `depth`, `target?` | Hundido de fondo plano (dent con meseta) |
| `knife` | igual que `cut` | Alias de `cut` |
| `loop_cut` | igual que `cut` | **Mapeado a `cut`:** en blobs no hay loops de aristas |
| `spin` | `axis [x,y,z]`, `angle` (rad), `target?`, `steps?` (≥ 1, defecto 4), `center? [x,y,z]` | Duplicados radiales pegados en un grupo |
| `shear` | `axis [x,y,z]`, `factor`, `target?` | Cizalla: desplaza a lo largo de `axis` proporcional a la altura sobre el centro |
| `shrink_fatten` | `amount`, `target?` | A lo largo de las normales (negativo = encoger) |

### Pinceles de `sculpt` (nombres `snake_case`)

Unidades de `strength` según el pincel: unidades de mundo para los de
desplazamiento (draw, inflate, grab…), radianes para `rotate` (torsión),
0..1 aprox. para `smooth`/`slide_relax`, y `angle` (radianes) para `pose`.
`at`/`radius` definen la zona (falloff de coseno suave); la máscara
(`mask`, `box_mask`, `mask_by_color`) protege vértices de otros pinceles.

draw, draw_sharp, clay, clay_strips, clay_thumb, layer (≈una pasada),
inflate, blob, crease, smooth, flatten, fill (≈suavizar+inflar),
scrape (≈aplanar), pinch, grab, elastic_deform, snake_hook, thumb, pose
(rota la zona `angle` radianes sobre `axis`), nudge, rotate (torsión),
slide_relax, mask (pinta máscara con `value`), paint (vertex colors),
smear, box_mask, mask_by_color, mesh_filter (`filter`: smooth/inflate/sharpen
global), color_filter, simplify (≈smooth fuerte), multires_eraser (≈smooth),
multires_smear (≈smear), draw_face_sets (≈paint), edit_face_set (≈paint),
box_face_set, line_project (≈flatten por `dir`), box_trim (6 planos de recorte
visual, como `cut`), box_hide (colapsa vértices en caja hacia su centro),
boundary (≈smooth), cloth (≈smooth + micro ruido).

### Mapeo Blender → mesa (v1.2.0)

**Generales / viewport:** select box → clic en un mesh lo selecciona (resaltado;
`Mesa.select(paso, ítem)`, `Mesa.selectedName()`); Cursor → `Mesa.setCursor([x,y,z])`
(cruz visible; lo usa `pivot:"cursor"`); Move/Rotate/Scale/Transform → `transform`;
Measure → `Mesa.measure(a, b)` (línea + readout con la distancia); Add Cube →
`primitive`; Annotate → **no aplica** (es anotación de viewport, sin equivalente en
recetas).

**Modeling:** Extrude Region → `extrude`; Bevel → `bevel` (aproximación);
Loop Cut → `loop_cut` (mapeado a `cut`, sin loops en blobs); Knife → `knife`;
Spin → `spin`; Smooth → `sculpt`/`smooth`; Edge Slide → **no aplica** (sin aristas
en blobs); Shrink/Fatten → `shrink_fatten`; Shear → `shear`; Rip Region →
**no aplica** (requiere topología de malla); Insert Faces / Poly Build →
**no aplican** (la mesa construye por blobs, no por caras).

**Sculpting:** todos los pinceles listados arriba via `sculpt` + `brush`;
las adaptaciones están marcadas con (≈…) en la lista de pinceles.

### Panel táctil

En la pestaña **Modelo**, la barra ✥ Mover | 🖌 Esculpir | 🧱 Modelar | ➕ Primitiva
abre un panel con formulario (botones y campos grandes, usables en Android y
clicables por automatización: ids `toolCatMove`, `toolCatSculpt`, `toolCatModel`,
`toolCatPrim`, `btnApplyMove`, `btnApplySculpt`, `btnApplyModel`, `btnApplyPrim`).
Cada aplicación añade el comando al **último paso** de la receta y reconstruye:
la receta sigue siendo la fuente de verdad (todo queda guardado/exportado).

## API `window.Mesa`

```js
Mesa.version;                    // "1.2.0"
Mesa.loadRecipe(obj | jsonString) // → { ok, errors[] }
Mesa.getRecipe();                // receta actual (objeto) o null
Mesa.build();                    // construye y muestra todo
Mesa.play();                     // reproduce la construcción paso a paso
Mesa.stop();                     // detiene la reproducción
Mesa.setStep(n);                 // muestra pasos 0..n (base 0) → n aplicado
Mesa.getStep();                  // paso actual (base 0)
Mesa.setView('iso'|'frente'|'lado'|'arriba');
Mesa.on('load'|'build'|'play'|'stop'|'step'|'error'|'export'|'select', cb);
await Mesa.exportGLB();          // descarga .glb binario → Promise<Blob>
Mesa.exportOBJ();                // descarga .obj → Blob
Mesa.exportSTL();                // descarga .stl binario → Blob
Mesa.exportJSON();               // descarga la receta .json → Blob
// herramientas (v1.2.0): añaden el comando al último paso y reconstruyen
Mesa.applyTool(type, params);    // → { ok, errors[] }
Mesa.sculpt(params);             // = applyTool('sculpt', params)
Mesa.transform(params);          // = applyTool('transform', params)
Mesa.primitive(params);          // = applyTool('primitive', params)
Mesa.select(paso, item);         // selecciona por índices base 0 → bool
Mesa.selectedName();             // "paso 3, ítem 2 (clay)" o null
Mesa.setCursor([x, y, z]);       // muestra la cruz del cursor 3D
Mesa.measure([x1,y1,z1], [x2,y2,z2]); // → distancia (dibuja línea + readout)
```

Parámetros URL:

- `?recipe=<URL absoluta a un .json>` — descarga y carga la receta al iniciar.
- `?step=n` — después de cargar, salta al paso `n` (base 0).

Ejemplo: `?recipe=https://ejemplo.com/mi-modelo.json&step=4`

La receta y el paso actual se autoguardian en `localStorage` bajo la clave
`mesa-de-modelado-3d` y se restauran al recargar.

Las 5 herramientas (`cut`, `bone`, `glue`, `dent`, `stretch`) son parte del
lenguaje de recetas, así que `window.Mesa` las soporta automáticamente:
`loadRecipe` las valida, `build`/`play`/`setStep` las aplican y la pestaña
**Pasos** lista los huesos y grupos detectados.

## Estructura

```
repo/
├── index.html        # UI (es-419): Modelo | Comandos | Pasos
├── css/style.css     # estilos, usable en móvil
├── js/app.js         # Three.js (CDN importmap) + lenguaje de recetas + window.Mesa
├── recetas/perro.json# receta de ejemplo ("Perro de Vex")
├── recetas/demo-herramientas.json # demo de cut/bone/glue/dent/stretch
├── README.md
└── .nojekyll         # para GitHub Pages
```

Three.js 0.160.0 por CDN (`unpkg`), con `OrbitControls`, `GLTFExporter`,
`OBJExporter` y `STLExporter`.
