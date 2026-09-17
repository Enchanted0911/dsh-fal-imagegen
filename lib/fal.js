/**
 * Minimal fal.ai client.
 *
 * fal is not OpenAI-compatible: requests go to `https://queue.fal.run/<slug>`
 * with `Authorization: Key <key_id>:<key_secret>`, the POST answers with a
 * queue ticket, the ticket's `status_url` is polled until COMPLETED, and the
 * ticket's `response_url` carries the endpoint's own JSON (`{ images: [...] }`
 * for the image endpoints). No SDK, no dependency — plain fetch.
 *
 * @see https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api
 */

export const FAL_QUEUE_BASE = 'https://queue.fal.run'

/**
 * Poll cadence while a request sits in the queue or runs. The interval is
 * overridable via FAL_POLL_INTERVAL_MS so offline tests can run the async
 * lifecycle quickly; production never sets it.
 */
export const POLL_INTERVAL_MS = (() => {
  const override = Number(process?.env?.FAL_POLL_INTERVAL_MS)
  return Number.isFinite(override) && override > 0 ? override : 1500
})()

/** A fal failure with a stable code so callers can explain it to the user. */
export class FalError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'FalError'
    this.code = code
  }
}

/** fal keys are `key_id:key_secret`; anything else is a configuration mistake. */
export function falKeyProblem(key) {
  const wanted = typeof key === 'string' ? key.trim() : ''
  if (wanted === '') return '尚未配置 fal API Key：请在「设置 → 插件」的 fal 生图卡片里填写 FAL_KEY。'
  if (!/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(wanted)) {
    return 'fal API Key 格式应为 key_id:key_secret（在 fal.ai 的 Keys 页面复制完整那一串，中间有冒号）。'
  }
  return undefined
}

/**
 * Submit one request to the fal queue and return its ticket without waiting.
 * This is the async entry point: the caller keeps the ticket (or a task id of
 * its own) and later polls with {@link falTicket} / {@link falResult}.
 *
 * @param options.slug - endpoint slug, e.g. openai/gpt-image-2.5/flare/text-to-image.
 * @param options.input - the endpoint input payload.
 * @param options.apiKey - FAL_KEY (`key_id:key_secret`).
 * @param options.signal - caller cancellation.
 * @param options.deadline - absolute time budget (ms) for the submission call.
 * @returns the queue ticket: { requestId, status, queuePosition, statusUrl, responseUrl }.
 */
export async function falSubmit({ slug, input, apiKey, signal, deadline }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const problem = falKeyProblem(key)
  if (problem !== undefined) throw new FalError(problem, 'fal-key-missing')

  const headers = { authorization: `Key ${key}`, 'content-type': 'application/json' }
  const submitted = await falFetch(`${FAL_QUEUE_BASE}/${slug}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  }, { signal, deadline, label: `提交请求到 fal（${slug}）` })

  if (submitted.status === 401 || submitted.status === 403) {
    throw new FalError('fal 拒绝了这次请求：API Key 无效或没有该模型的权限。', 'fal-unauthorized')
  }
  if (submitted.status === 404) {
    throw new FalError(`fal 上没有这个端点：${slug}`, 'fal-endpoint-not-found')
  }
  if (submitted.status === 422 || submitted.status === 400) {
    throw new FalError(`fal 拒绝了请求参数（HTTP ${submitted.status}）：${clip(submitted.text)}`, 'fal-bad-request')
  }
  if (submitted.status >= 500) {
    throw new FalError(`fal 服务端错误（HTTP ${submitted.status}）：${clip(submitted.text)}`, 'fal-server-error')
  }
  if (submitted.json === undefined || typeof submitted.json !== 'object') {
    throw new FalError(`fal 返回了无法解析的响应：${clip(submitted.text)}`, 'fal-bad-response')
  }

  const ticket = submitted.json
  const requestId = typeof ticket.request_id === 'string' ? ticket.request_id : ''
  const statusUrl = typeof ticket.status_url === 'string' && ticket.status_url !== ''
    ? ticket.status_url
    : `${FAL_QUEUE_BASE}/${slug}/requests/${requestId}/status`
  const responseUrl = typeof ticket.response_url === 'string' && ticket.response_url !== ''
    ? ticket.response_url
    : `${FAL_QUEUE_BASE}/${slug}/requests/${requestId}`
  return {
    requestId,
    status: typeof ticket.status === 'string' ? ticket.status : 'IN_QUEUE',
    queuePosition: typeof ticket.queue_position === 'number' ? ticket.queue_position : undefined,
    statusUrl,
    responseUrl,
  }
}

/**
 * Poll one queue ticket once and return its current status.
 *
 * @param options.requestId - fal's request id (for messages only).
 * @param options.statusUrl - the ticket's status_url.
 * @param options.apiKey - FAL_KEY (`key_id:key_secret`).
 * @param options.signal - caller cancellation.
 * @param options.deadline - absolute time budget (ms) for this poll.
 * @returns { status, queuePosition } — status is fal's own (IN_QUEUE / IN_PROGRESS / COMPLETED / …).
 */
export async function falTicket({ requestId, statusUrl, apiKey, signal, deadline }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const problem = falKeyProblem(key)
  if (problem !== undefined) throw new FalError(problem, 'fal-key-missing')

  const polled = await falFetch(statusUrl, {
    method: 'GET',
    headers: { authorization: `Key ${key}` },
  }, { signal, deadline, label: '查询 fal 队列状态' })
  if (polled.status >= 400) {
    throw new FalError(`查询 fal 队列状态失败（HTTP ${polled.status}）：${clip(polled.text)}`, 'fal-status-failed')
  }
  const body = polled.json
  if (typeof body !== 'object' || body === null) {
    throw new FalError(`fal 状态响应无法解析：${clip(polled.text)}`, 'fal-bad-response')
  }
  return {
    status: typeof body.status === 'string' ? body.status : 'IN_QUEUE',
    queuePosition: typeof body.queue_position === 'number' ? body.queue_position : undefined,
  }
}

/**
 * Fetch a queue ticket's final result body. Only call after the ticket reports
 * COMPLETED (or a terminal state); a still-pending ticket fails with
 * `fal-not-ready` instead of guessing.
 *
 * @param options.requestId - fal's request id (for messages only).
 * @param options.responseUrl - the ticket's response_url.
 * @param options.apiKey - FAL_KEY (`key_id:key_secret`).
 * @param options.signal - caller cancellation.
 * @param options.deadline - absolute time budget (ms) for the fetch.
 * @returns { requestId, response } — the raw endpoint response body.
 */
export async function falResult({ requestId, responseUrl, apiKey, signal, deadline }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const problem = falKeyProblem(key)
  if (problem !== undefined) throw new FalError(problem, 'fal-key-missing')

  const result = await falFetch(responseUrl, {
    method: 'GET',
    headers: { authorization: `Key ${key}` },
  }, { signal, deadline, label: '取回 fal 结果' })
  if (result.status >= 400) {
    throw new FalError(`取回 fal 结果失败（HTTP ${result.status}）：${clip(result.text)}`, 'fal-result-failed')
  }
  const response = result.json
  if (typeof response !== 'object' || response === null) {
    throw new FalError(`fal 结果无法解析：${clip(result.text)}`, 'fal-bad-response')
  }
  if (typeof response.status === 'string' && response.status !== 'COMPLETED' && response.images === undefined) {
    throw new FalError(`fal 任务 ${requestId} 还没出结果（当前状态 ${response.status}），稍后再查。`, 'fal-not-ready')
  }
  const failure = describeFalFailure(response)
  if (failure !== undefined) throw new FalError(failure, 'fal-generation-failed')

  return { requestId, response }
}

/**
 * Submit one request, wait for the queue to finish, and return the endpoint's
 * own response body (the synchronous convenience path, assembled from
 * {@link falSubmit} + {@link falTicket} + {@link falResult}).
 *
 * @param options.slug - endpoint slug, e.g. openai/gpt-image-2.5/flare/text-to-image.
 * @param options.input - the endpoint input payload.
 * @param options.apiKey - FAL_KEY (`key_id:key_secret`).
 * @param options.timeoutMs - total budget for submit + queue + result.
 * @param options.signal - caller cancellation.
 * @param options.onProgress - optional ({ status, queuePosition }) observer.
 * @returns { requestId, response } — the raw endpoint response body.
 */
export async function falRun({ slug, input, apiKey, timeoutMs, signal, onProgress }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 300_000)
  const ticket = await falSubmit({ slug, input, apiKey: key, signal, deadline })
  let status = ticket.status
  let queuePosition = ticket.queuePosition
  while (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
    if (Date.now() >= deadline) {
      throw new FalError(`fal 请求超时（${Math.round(timeoutMs / 1000)}s，任务 ${ticket.requestId} 仍在 ${status}）。可以调大设置里的超时秒数，或稍后用同一个 request_id 重试。`, 'fal-timeout')
    }
    await falSleep(POLL_INTERVAL_MS, signal)
    const ticked = await falTicket({
      requestId: ticket.requestId,
      statusUrl: ticket.statusUrl,
      apiKey: key,
      signal,
      deadline,
    })
    status = ticked.status
    if (ticked.queuePosition !== undefined) queuePosition = ticked.queuePosition
    onProgress?.({ status, queuePosition, requestId: ticket.requestId })
  }
  return falResult({
    requestId: ticket.requestId,
    responseUrl: ticket.responseUrl,
    apiKey: key,
    signal,
    deadline,
  })
}

/** fal reports failures inside the response body rather than by HTTP status. */
function describeFalFailure(response) {
  const detail = response.detail
  if (typeof detail === 'string' && detail.trim() !== '') return `fal 生成失败：${detail}`
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    const message = typeof first === 'object' && first !== null && typeof first.msg === 'string' ? first.msg : JSON.stringify(first)
    return `fal 生成失败：${message}`
  }
  if (typeof response.error === 'string' && response.error.trim() !== '') return `fal 生成失败：${response.error}`
  return undefined
}

/** Download one produced image; data URIs are decoded without a round trip. */
export async function falFetchBytes(url, { signal, deadline } = {}) {
  const wanted = typeof url === 'string' ? url.trim() : ''
  if (wanted === '') throw new FalError('fal 返回的图片地址为空。', 'fal-image-missing')
  if (wanted.startsWith('data:')) {
    const comma = wanted.indexOf(',')
    if (comma < 0) throw new FalError('fal 返回的 data URI 无效。', 'fal-image-invalid')
    const header = wanted.slice(5, comma)
    const payload = wanted.slice(comma + 1)
    const bytes = header.includes(';base64') ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload))
    return { bytes, contentType: header.split(';')[0] || undefined }
  }
  const response = await falFetch(wanted, { method: 'GET' }, { signal, deadline, label: '下载 fal 生成的图片', raw: true })
  if (response.status >= 400) {
    throw new FalError(`下载 fal 图片失败（HTTP ${response.status}）。`, 'fal-image-download-failed')
  }
  return { bytes: response.bytes, contentType: response.contentType }
}

const MAX_ERROR_BODY = 400

function clip(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length <= MAX_ERROR_BODY ? text : `${text.slice(0, MAX_ERROR_BODY)}…`
}

/**
 * One fetch with the caller's cancellation, the remaining time budget, and a
 * readable transport-failure message.
 */
async function falFetch(url, init, { signal, deadline, label, raw = false }) {
  const remaining = deadline === undefined ? undefined : deadline - Date.now()
  if (remaining !== undefined && remaining <= 0) {
    throw new FalError(`${label} 超时。`, 'fal-timeout')
  }
  const timeouts = remaining === undefined ? [] : [AbortSignal.timeout(Math.max(1, remaining))]
  const combined = signal === undefined || signal === null
    ? (timeouts[0] ?? undefined)
    : (typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, ...timeouts]) : signal)

  let response
  try {
    response = await fetch(url, { ...init, signal: combined })
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new FalError(`${label} 被中断或超时。`, 'fal-aborted')
    }
    throw new FalError(`${label} 失败：${error instanceof Error ? error.message : String(error)}`, 'fal-network')
  }

  if (raw) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { status: response.status, bytes, contentType: response.headers.get('content-type') ?? undefined }
  }
  const text = await response.text()
  let json
  try {
    json = text === '' ? undefined : JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: response.status, text, json, contentType: response.headers.get('content-type') ?? undefined }
}

/** Sleep that honors cancellation. */
export function falSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FalError('请求已取消。', 'fal-aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new FalError('请求已取消。', 'fal-aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
