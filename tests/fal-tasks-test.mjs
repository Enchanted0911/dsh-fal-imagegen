/**
 * Offline async-task test — no network, no credentials.
 *
 * Stubs `fetch` with a fake fal queue (submit → poll → COMPLETED result) and
 * drives the real host half end to end:
 *   - fal_generate_image returns immediately (queued, task_id, no images);
 *   - a detached collector finishes the job and materializes images;
 *   - fal_get_image_task returns the finished images (attachment + disk file)
 *     exactly once, then serves the stored result on later queries;
 *   - the list form of fal_get_image_task returns recent tasks;
 *   - a failing task lands in a queryable "failed" record.
 * Also unit-checks the FalTaskStore TTL / cap pruning.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, rmSync } from 'node:fs'
// ESM evaluates imports in order: the poll-interval override must load BEFORE
// lib/fal.js (via lib/index.js) reads it at module-evaluation time.
import './helpers/fal-fast-poll.mjs'
import { apply, DEFAULTS } from '../lib/index.js'
import { detectMime, imageDimensions } from '../lib/image-meta.js'
import { FalTaskStore } from '../lib/tasks.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`)
  if (!condition) failures.push(message)
}

// ------------------------------------------------------------- fake fal queue
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let sequence = 0
/** behaviors[requestId] = { polls: [statuses served], result: body or null } */
const behaviors = new Map()
const seen = { submissions: 0, statusPolls: 0, results: 0, downloads: 0 }

function schedule(requestId, { polls, result }) {
  behaviors.set(requestId, { polls: [...polls], result })
}

globalThis.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET'
  const text = String(url)
  if (method === 'POST') {
    seen.submissions += 1
    const requestId = `req-${++sequence}`
    return {
      status: 200,
      headers: { get: () => 'application/json' },
      async text() {
        return JSON.stringify({
          request_id: requestId,
          status: 'IN_QUEUE',
          queue_position: 2,
          status_url: `https://fal.test/status/${requestId}`,
          response_url: `https://fal.test/result/${requestId}`,
        })
      },
      async arrayBuffer() { return new ArrayBuffer(0) },
    }
  }
  if (text.includes('/status/')) {
    seen.statusPolls += 1
    const requestId = text.split('/status/')[1]
    const behavior = behaviors.get(requestId)
    if (behavior === undefined) throw new Error(`unexpected status poll for ${requestId}`)
    return {
      status: 200,
      headers: { get: () => 'application/json' },
      async text() {
        const status = behavior.polls.shift() ?? 'COMPLETED'
        return JSON.stringify(status === 'COMPLETED'
          ? { status }
          : { status, queue_position: status === 'IN_QUEUE' ? 2 : 1 })
      },
      async arrayBuffer() { return new ArrayBuffer(0) },
    }
  }
  if (text.includes('/result/')) {
    seen.results += 1
    const requestId = text.split('/result/')[1]
    const behavior = behaviors.get(requestId)
    if (behavior === undefined) throw new Error(`unexpected result fetch for ${requestId}`)
    if (behavior.result === null) {
      return {
        status: 200,
        headers: { get: () => 'application/json' },
        async text() { return JSON.stringify({ detail: '模型推理失败（模拟）' }) },
        async arrayBuffer() { return new ArrayBuffer(0) },
      }
    }
    return {
      status: 200,
      headers: { get: () => 'application/json' },
      async text() { return JSON.stringify(behavior.result) },
      async arrayBuffer() { return new ArrayBuffer(0) },
    }
  }
  if (text.startsWith('data:image/png')) {
    seen.downloads += 1
    return {
      status: 200,
      headers: { get: () => 'image/png' },
      async text() { return '' },
      async arrayBuffer() { return PNG_1PX.buffer.slice(PNG_1PX.byteOffset, PNG_1PX.byteOffset + PNG_1PX.byteLength) },
    }
  }
  throw new Error(`unexpected fetch: ${method} ${text}`)
}

// ------------------------------------------------------------- host setup
const saveCalls = []
let attachmentCounter = 0
const attachments = {
  async saveImages(inputs) {
    saveCalls.push(inputs.length)
    return inputs.map((input, index) => {
      attachmentCounter += 1
      const dims = imageDimensions(input.data) ?? { width: 0, height: 0 }
      return {
        attachmentId: `att-${attachmentCounter}`,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: dims.width,
        height: dims.height,
        name: input.name,
      }
    })
  },
  async readImage() { throw new Error('not used') },
}

const tools = new Map()
const ctx = {
  tools: { register: (tool) => { tools.set(tool.name, tool); return () => {} } },
  attachments,
  systemPrompt: { section: () => () => {} },
  inject: (_names, cb) => cb({ settings: { installSection: (_o, _ns, _s, _e, hooks) => { hooks.setSource(() => settings); hooks.onChange() } } }),
  effect() {},
}
const settings = { ...DEFAULTS, falKey: 'testid:testsecret', timeoutSeconds: 30, saveDir: join(root, '.test-fal-output') }
apply(ctx, { ...settings })

const generate = tools.get('fal_generate_image')
const query = tools.get('fal_get_image_task')

// --------------------------------------------------------- 1) async submit
schedule('req-1', {
  polls: ['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'],
  result: { images: [{ url: `data:image/png;base64,${PNG_1PX.toString('base64')}`, width: 1, height: 1 }] },
})
const started = Date.now()
const submitted = await generate.execute({ prompt: 'a tiny orange cat', count: 1 }, { signal: undefined })
const elapsed = Date.now() - started
check(submitted.status === 'queued', `submit answers immediately with status queued (${JSON.stringify(submitted.status)})`)
check(typeof submitted.task_id === 'string' && submitted.task_id.startsWith('fal-'), `submit carries a task_id (${submitted.task_id})`)
check(submitted.request_id === 'req-1' && submitted.model === 'openai/gpt-image-2.5/flare/text-to-image', 'submit records fal request + model')
check(Array.isArray(submitted.images) && submitted.images.length === 0, 'submit returns no images (async)')
check(elapsed < 1000, `submit does not block on the queue (returned in ${elapsed}ms)`)

// The detached collector must finish on its own, without any query.
let finished = null
for (let attempt = 0; attempt < 100; attempt += 1) {
  const listed = await query.execute({}, { signal: undefined })
  if (listed.status === 'ok' && (listed.tasks?.[0]?.status === 'completed' || listed.tasks?.[0]?.status === 'failed')) {
    finished = listed.tasks[0]
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 10))
}
check(finished !== null, 'background collector finishes the task without a query')
check(finished?.status === 'completed', `collector completes the job (${finished?.status})`)

// ---------------------------------------------------------- 2) query result
const done = await query.execute({ task_id: submitted.task_id, wait_seconds: 5 }, { signal: undefined })
check(done.status === 'completed', `query returns status completed (${done.status})`)
check(done.images.length === 1, `query returns the image ref (${done.images.length})`)
const ref = done.images[0]
check(typeof ref.attachment_id === 'string' && ref.attachment_id.startsWith('att-'), 'image carries an attachment id')
check(typeof ref.path === 'string' && ref.path !== '', 'image carries a local path')
check(existsSync(ref.path), `image file exists (${ref.path})`)
const onDisk = readFileSync(ref.path)
check(detectMime(onDisk) === 'image/png', 'disk file has PNG magic')
check(JSON.stringify(imageDimensions(onDisk)) === JSON.stringify({ width: 1, height: 1 }), `disk file decodes to the expected dimensions (${JSON.stringify(imageDimensions(onDisk))})`)

// The stored result is served again — no second download / attachment batch.
const again = await query.execute({ task_id: submitted.task_id, wait_seconds: 0 }, { signal: undefined })
check(again.status === 'completed' && again.images.length === 1, 'repeat query serves the stored result')
check(saveCalls.length === 1, `materialization ran exactly once (saveCalls=${saveCalls.length})`)
check(seen.results === 1 && seen.downloads === 0, `result fetched once; data-URI images decode inline (results=${seen.results}, downloads=${seen.downloads})`)

// Listing without ids summarizes the registry.
const list = await query.execute({}, { signal: undefined })
check(list.status === 'ok' && Array.isArray(list.tasks) && list.tasks.length === 1, 'list form reports recent tasks')
check(list.tasks[0].task_id === submitted.task_id && list.tasks[0].images === 1, 'list summary carries task_id and image count')

// request_id lookup also resolves the record.
const byRequest = await query.execute({ request_id: 'req-1' }, { signal: undefined })
check(byRequest.status === 'completed' && byRequest.task_id === submitted.task_id, 'query by fal request_id resolves the same task')

// -------------------------------------------------------------- 3) failure
schedule('req-2', {
  polls: ['IN_QUEUE', 'COMPLETED'],
  result: null, // fal answers { detail: ... } → generation failure
})
const failed = await query.execute({ task_id: 'nope' }, { signal: undefined }).catch(() => undefined)
check(failed === undefined, 'unknown task_id refuses with a throw')
const submitted2 = await generate.execute({ prompt: 'boom please' }, { signal: undefined })
let failedRec = null
for (let attempt = 0; attempt < 100; attempt += 1) {
  const answer = await query.execute({ task_id: submitted2.task_id, wait_seconds: 5 }, { signal: undefined })
  if (answer.status === 'failed') { failedRec = answer; break }
  await new Promise((resolve) => setTimeout(resolve, 10))
}
check(failedRec !== null, 'failing task lands in a queryable failed record')
check(typeof failedRec?.error === 'string' && failedRec.error.includes('生成失败'), `failure explains itself (${failedRec?.error?.slice(0, 40)}…)`)
check(saveCalls.length === 1, 'failed task materializes nothing')

// Leave no test artifacts behind.
rmSync(join(root, '.test-fal-output'), { recursive: true, force: true })

// ------------------------------------------------------------- 4) store TTL
let clock = 1_000_000
const store = new FalTaskStore({ now: () => clock })
store.create({ model: 'a', requestId: 'r1' })
store.create({ model: 'a', requestId: 'r2' })
store.create({ model: 'a', requestId: 'r3' })
check(store.list().length === 3, 'store keeps every recent record')
clock += 7 * 60 * 60 * 1000 // beyond the 6h TTL
store.prune()
check(store.list().length === 0, 'store prunes expired records')
const capped = new FalTaskStore({ now: () => clock, maxEntries: 2 })
capped.create({ model: 'a', requestId: 'b1' })
clock += 1
capped.create({ model: 'a', requestId: 'b2' })
clock += 1
capped.create({ model: 'a', requestId: 'b3' })
const ids = capped.list().map((record) => record.request_id)
check(ids.length === 2 && ids[0] === 'b3' && ids[1] === 'b2', `store caps at maxEntries newest-first (${ids.join(',')})`)

console.log(failures.length === 0 ? '\nASYNC TASKS TEST PASSED' : `\nASYNC TASKS TEST FAILED (${failures.length})`)
process.exitCode = failures.length === 0 ? 0 : 1