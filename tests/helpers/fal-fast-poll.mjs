/**
 * Test-only preload: speed up the fal queue poll cadence before any lib module
 * loads. ESM evaluates imports in order, so import this file BEFORE lib/fal.js
 * (i.e. before lib/index.js) — a plain assignment after the imports would be
 * too late, because fal.js reads the interval at module-evaluation time.
 */
process.env.FAL_POLL_INTERVAL_MS = '20'