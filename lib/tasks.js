/**
 * Background task registry for async fal image generation.
 *
 * `fal_generate_image` submits to the fal queue, registers a task here, and
 * returns immediately with a task id; a detached collector finishes the job
 * (poll → fetch → download → attachments → disk) and writes the outcome back
 * into the record. `fal_get_image_task` reads the record, optionally waiting
 * for the collector, or finishes a stranded task itself when no collector is
 * running (e.g. after the host process restarted).
 *
 * The registry is in-memory on purpose: it lives and dies with the host
 * process. Every record keeps fal's own `request_id` + status/response URLs,
 * so a task whose collector was interrupted can still be re-finished later.
 */

/** How long a finished task stays queryable before pruning. */
const TASK_TTL_MS = 6 * 60 * 60 * 1000
/** Newest-first cap so a long session cannot grow the registry unbounded. */
const MAX_TASKS = 64

/** Opaque, host-unique task id; fal's request_id stays alongside for debugging. */
export function newTaskId(now = Date.now) {
  return `fal-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stable ISO timestamp without a locale-dependent format. */
function iso(now) {
  return new Date(now).toISOString()
}

export class FalTaskStore {
  /**
   * @param options.ttlMs - how long records stay queryable (default 6h).
   * @param options.maxEntries - newest-first cap (default 64).
   * @param options.now - clock injection for tests.
   */
  constructor({ ttlMs = TASK_TTL_MS, maxEntries = MAX_TASKS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.now = now
    this.tasks = new Map()
    this.sequence = 0
  }

  /** Register a freshly submitted task; returns the live record. */
  create(seed) {
    const now = this.now()
    this.sequence += 1
    const record = {
      task_id: newTaskId(this.now),
      seq: this.sequence,
      status: 'queued',
      model: seed.model ?? '',
      mode: seed.mode,
      request_id: seed.requestId ?? '',
      status_url: seed.statusUrl ?? '',
      response_url: seed.responseUrl ?? '',
      queue_position: seed.queuePosition,
      source: seed.source,
      created_at: iso(now),
      updated_at: iso(now),
      message: seed.message ?? '',
      error_code: undefined,
      error: undefined,
      images: [],
    }
    this.tasks.set(record.task_id, record)
    // A record with a promise attached re-fills its own slot after settling.
    record.promise = undefined
    this.prune()
    return record
  }

  /** The record by task id, or undefined. */
  get(taskId) {
    return typeof taskId === 'string' ? this.tasks.get(taskId) : undefined
  }

  /** The first record carrying `request_id` (fal's own id), or undefined. */
  findByRequestId(requestId) {
    for (const record of this.tasks.values()) {
      if (record.request_id === requestId) return record
    }
    return undefined
  }

  /** All records, newest first. */
  list() {
    return [...this.tasks.values()].sort((a, b) => b.seq - a.seq)
  }

  /** Patch one record field by field, refreshing `updated_at`. */
  update(taskId, patch) {
    const record = this.tasks.get(taskId)
    if (record === undefined) return undefined
    record.updated_at = iso(this.now())
    Object.assign(record, patch)
    return record
  }

  /** Drop expired records and enforce the newest-first cap. */
  prune() {
    const cutoff = this.now() - this.ttlMs
    for (const [taskId, record] of this.tasks) {
      if (record.updated_at === undefined || new Date(record.updated_at).getTime() < cutoff) {
        this.tasks.delete(taskId)
      }
    }
    const overflow = [...this.tasks.values()]
      .sort((a, b) => b.seq - a.seq)
      .slice(this.maxEntries)
    for (const record of overflow) this.tasks.delete(record.task_id)
  }

  clear() {
    this.tasks.clear()
  }
}

/** The trimmed view that goes into tool output and list summaries. */
export function taskSummary(record) {
  return {
    task_id: record.task_id,
    status: record.status,
    model: record.model,
    mode: record.mode,
    request_id: record.request_id,
    queue_position: record.queue_position,
    images: Array.isArray(record.images) ? record.images.length : 0,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ...record.error === undefined ? {} : { error: record.error },
  }
}