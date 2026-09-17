# dsh-fal-imagegen

**Idiomas:** [English](README.md) · [中文](README.zh.md) · **Español** · [العربية](README.ar.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Generación de imágenes nativa con [fal.ai](https://fal.ai) para DeepSeek Harness (DSH): una tarjeta de configuración bilingüe para tu FAL_KEY y los valores predeterminados, más herramientas de agente que hablan el protocolo de fal de punta a punta — sin pasarelas compatibles con OpenAI en medio.

## Características

- **Protocolo fal nativo** — `POST https://queue.fal.run/<slug>` con `Authorization: Key <key_id>:<key_secret>`, sondeo del ticket de cola (`status_url` → `response_url`), consumo de `{ images: [{ url, width, height }] }`.
- **Generación asíncrona por defecto** — `fal_generate_image` envía el trabajo a la cola de fal y devuelve de inmediato un `task_id`; un recolector en segundo plano lo termina, y `fal_get_image_task` consulta el progreso y entrega las imágenes terminadas (opcionalmente esperando hasta 120 s por consulta). Pasa `wait=true` si prefieres el comportamiento bloqueante anterior.
- **Tarjeta de configuración que sigue el idioma de DSH** — "fal 生图" / "fal imagegen" en Configuración → Plugins: interruptor principal, FAL_KEY, endpoints de texto-a-imagen / imagen-a-imagen, tamaño, calidad, formato de salida, tiempo de espera, directorio de salida y un interruptor de anuncio en el prompt del sistema. La tarjeta replica el estilo de las tarjetas de plugin integradas (plegable, etiqueta de cambios sin guardar, restablecimiento por campo, guardar/descartar) y su texto sigue el idioma propio de DSH (Configuración → General → Idioma): chino cuando DSH está en chino, inglés para cualquier otro idioma de DSH, con inglés como respaldo cuando nada coincide. Sin conmutador aparte: siempre se lee como parte de la interfaz que la rodea.
- **Herramientas de agente**:

  | herramienta | propósito |
  | --- | --- |
  | `fal_generate_image` | texto-a-imagen, asíncrona por defecto: `prompt` / `model` / `size` / `quality` / `count` / `wait` → devuelve un `task_id` |
  | `fal_get_image_task` | consulta de tareas en segundo plano: progreso, espera e imágenes terminadas (por `task_id` o `request_id` de fal; omite ambos para listar tareas recientes) |
  | `fal_edit_image` | imagen-a-imagen, síncrona: `prompt` + una fuente (referencia de adjunto o `image_path` en disco) |
  | `fal_list_image_models` | lista los alias integrados, los valores predeterminados actuales y el directorio de salida |

- **Resultados reutilizables** — cada imagen se adjunta a la conversación (se muestra junto a la llamada de herramienta) **y** se escribe en disco bajo `<DSH_HOME>/fal-imagegen`; el `path` devuelto se puede pasar directamente a `image_path` de `fal_edit_image`.
- **Alias de modelos verificados** — cada alias integrado se comprobó contra el esquema de endpoints de fal; los slugs desconocidos que contienen "/" se pasan tal cual, y un slug de texto-a-imagen claro se rechaza para edición en lugar de enviar una petición rota.

## Generación asíncrona

`fal_generate_image` ya no bloquea un turno del agente en la cola de fal:

1. La herramienta envía el trabajo y responde `{ status: "queued", task_id, request_id, message, next_action, images: [] }` en cuanto fal lo acepta.
2. Un recolector en segundo plano sondea la cola, descarga las imágenes, las guarda como adjuntos y las copia al directorio de salida — todo en segundo plano.
3. `fal_get_image_task` (`task_id` obligatorio, o el `request_id` de fal) informa `queued / running / completed / failed`. Con `wait_seconds` (0–120) bloquea hasta ese tiempo; en `completed`, el resultado lleva el `images[]` completo con `attachment_id` + `path` local y muestra las imágenes junto a la llamada.
4. Sin id, la herramienta lista las tareas recientes (`task_id`, estado, modelo, número de imágenes).

Notas: los registros de tareas viven en el proceso del host actual (se conservan ~6 h, las 64 más recientes); una tarea cuyo tiempo de espera en segundo plano se agotó se reintenta automáticamente en su siguiente consulta; `fal_edit_image` se mantiene síncrona porque su resultado suele ser la entrada del siguiente paso.

## Alias de modelos

| alias | endpoint texto-a-imagen | endpoint imagen-a-imagen | parámetro de tamaño | nivel de calidad |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare` (predeterminado; también acepta `gpt-image-2.5` / `gpt-image-2.5-flash`) | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | compatible |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | compatible |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | compatible |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | compatible |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | omitido |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | omitido |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | omitido |

## Configuración

| campo | predeterminado | significado |
| --- | --- | --- |
| `enabled` | `true` | interruptor principal (herramientas + anuncio en el prompt) |
| `falKey` | vacío | FAL_KEY, `key_id:key_secret` (copia la cadena completa desde fal.ai → Keys) |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | endpoint texto-a-imagen |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | endpoint imagen-a-imagen |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`, un par de píxeles `WxH` o `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max` (se omite automáticamente en endpoints sin nivel documentado) |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | presupuesto total de una petición (envío + cola + obtención) |
| `saveDir` | vacío | directorio de salida; vacío = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | anunciar el plugin en cada prompt del sistema |

La tarjeta edita los mismos ajustes que la sección `dsh-fal-imagegen:` de `~/.dsh/settings.yaml`. FAL_KEY es un campo de contraseña: dejarlo en blanco conserva la clave actual (la clave se redacta en todas las vistas de red).

## Instalación

### npm (recomendado)

`dsh-fal-imagegen@0.2.0` está publicado:

```sh
# Perfiles gestionados por CLI (web / headless / personalizado):
dsh plugin --profile web add dsh-fal-imagegen
# reinicia el proceso correspondiente después
```

El **perfil de escritorio** lo gestiona la app DSH Desktop (`dsh plugin --profile desktop` está rechazado): instala por Configuración → Plugins → mercado, o regístralo manualmente en `~/.dsh/profiles/desktop/package.json` (dependencia + `dsh-fal-imagegen` en `dsh.profile.bundles`) y reinicia DSH Desktop por completo.

Después de instalar, rellena FAL_KEY en Configuración → Plugins → 插件配置 → la tarjeta "fal 生图", o escribe la sección `dsh-fal-imagegen:` de `~/.dsh/settings.yaml`.

### desde git (alternativa)

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### desde el código fuente

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# vincúlalo a un perfil — dependencia + entrada dsh.profile.bundles — y reinicia DSH Desktop
```

Los paquetes de ejecución (`@deepseek-ai/dsh-tools`, `dsh-attachment`, `dsh-settings`, `schemastery`) vienen del harness; el `node_modules/` de este árbol solo existe para que las pruebas offline carguen fuera del harness.

## Desarrollo

Pruebas offline (sin clave, sin red):

```sh
node tests/fal-manifest-test.mjs             # contrato del manifiesto: fila del patch, exports, dsh.client, id del wrapper
node tests/fal-client-test.mjs               # mitad del navegador: registro de slots, estados de la tarjeta, ops de guardado, conmutador bilingüe
node tests/fal-settings-roundtrip-test.mjs   # ambas mitades: escrituras de la tarjeta → lectura del host, restablecimiento, interruptores
node tests/fal-schema-test.mjs               # esquemas de parámetros y salidas de las herramientas
node tests/fal-tasks-test.mjs                # ruta asíncrona: envío → fin en segundo plano → consulta, con una cola fal falsa
```

Pruebas en vivo (gastan créditos de fal):

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # simulación del host: generar + editar + adjuntos + fallos
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # solo el cliente fal (una generación)
```

Efecto de los cambios en una instalación vinculada: la mitad del navegador (`lib/client.js`) aplica al recargar la página; los cambios de la mitad del host y los del manifiesto `package.json` requieren reiniciar DSH Desktop.

## Fuente del catálogo del mercado

El mercado comunitario de DSH no tiene fuente por defecto; este repositorio incluye una fuente de catálogo conforme al contrato v1 bajo `catalog/` (véase `catalog/entry.mjs`). Despliega la forma Cloudflare Pages y registra la URL del manifiesto en Configuración → Plugins → mercado → Fuentes:

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# luego añade https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json como fuente
```

## Limitaciones

- Los endpoints que documentan `aspect_ratio` (nano-banana / gemini) degradan los tamaños de píxel explícitos a `auto`.
- La generación gasta créditos de fal, y el contenido de las imágenes lo produce el modelo alojado en fal.