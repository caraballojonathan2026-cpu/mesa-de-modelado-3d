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

Hay recetas de ejemplo en `recetas/`: `perro.json` ("Perro de Vex", 10 pasos) y
`demo-herramientas.json` (6 pasos que muestran `cut`, `bone`, `glue`, `dent` y
`stretch` en acción).

La pestaña **Pasos** también lista los huesos y grupos de pegado de la receta.

## API `window.Mesa`

```js
Mesa.version;                    // "1.1.0"
Mesa.loadRecipe(obj | jsonString) // → { ok, errors[] }
Mesa.getRecipe();                // receta actual (objeto) o null
Mesa.build();                    // construye y muestra todo
Mesa.play();                     // reproduce la construcción paso a paso
Mesa.stop();                     // detiene la reproducción
Mesa.setStep(n);                 // muestra pasos 0..n (base 0) → n aplicado
Mesa.getStep();                  // paso actual (base 0)
Mesa.setView('iso'|'frente'|'lado'|'arriba');
Mesa.on('load'|'build'|'play'|'stop'|'step'|'error'|'export', cb);
await Mesa.exportGLB();          // descarga .glb binario → Promise<Blob>
Mesa.exportOBJ();                // descarga .obj → Blob
Mesa.exportSTL();                // descarga .stl binario → Blob
Mesa.exportJSON();               // descarga la receta .json → Blob
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
