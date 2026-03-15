import logger from './logger.js';
import { canSendGlobally } from './instanceManager.js';

const log = logger.child({ module: 'send-queue' });

/**
 * Global send queue — serializes ALL WhatsApp message sends.
 *
 * With multi-instance, the daily quota is managed per-instance in instanceManager.
 * The queue still enforces global timing (MIN_DELAY_BETWEEN_SENDS) to prevent
 * WhatsApp rate-limiting across all instances.
 */

/** @type {Array<{ fn: () => Promise<void>, label: string, priority: number, type: string }>} */
const queue = [];

let processing = false;

// ---------------------------------------------------------------------------
// Timing configuration — intentionally conservative
// ---------------------------------------------------------------------------

/** Minimum gap between ANY two WhatsApp sends (ms) */
const MIN_DELAY_BETWEEN_SENDS = 30_000; // 30 seconds

/** Delay between campaign group sends — randomized */
export const CAMPAIGN_DELAY_MIN = 120_000;  // 2 minutes
export const CAMPAIGN_DELAY_MAX = 300_000;  // 5 minutes

/** Delay before welcome batch message send — randomized */
export const WELCOME_DELAY_MIN = 60_000;   // 1 minute
export const WELCOME_DELAY_MAX = 120_000;  // 2 minutes

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

/**
 * Add a send job to the global queue.
 * @param {() => Promise<void>} fn - The async function to execute
 * @param {string} label - Human-readable label for logging
 * @param {'high'|'normal'|'low'} [priority='normal'] - Priority level
 * @param {string} [type='campaign'] - 'campaign' | 'welcome' | 'test'
 * @returns {Promise<void>} - Resolves when the job completes
 */
export function enqueue(fn, label = 'unknown', priority = 'normal', type = 'campaign') {
  const priorityNum = priority === 'high' ? 0 : priority === 'low' ? 2 : 1;

  return new Promise((resolve, reject) => {
    const job = {
      fn,
      resolve,
      reject,
      label,
      priority: priorityNum,
      type,
    };

    // Insert at correct position based on priority
    let inserted = false;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority > priorityNum) {
        queue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) queue.push(job);

    log.debug({ label, priority, type, queueSize: queue.length }, 'Job enqueued');
    processQueue();
  });
}

/**
 * Fire-and-forget enqueue — does not wait for completion.
 * @param {() => Promise<void>} fn
 * @param {string} label
 * @param {'high'|'normal'|'low'} [priority='normal']
 * @param {string} [type='welcome']
 */
export function enqueueAsync(fn, label = 'unknown', priority = 'normal', type = 'welcome') {
  enqueue(fn, label, priority, type).catch((err) => {
    log.error({ label, err: err.message }, 'Queued job failed');
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift();

    // Check global quota — welcome messages always pass, campaigns are blocked
    if (job.type === 'campaign' && !canSendGlobally()) {
      log.warn(
        { label: job.label },
        'All instances at daily limit — campaign job SKIPPED (not executed)',
      );
      // Resolve without executing — sender.js will detect canSendGlobally()=false
      // and handle remaining groups as quota_exceeded
      job.resolve();
      continue;
    }

    log.info(
      { label: job.label, type: job.type, remaining: queue.length },
      'Processing send job',
    );

    try {
      await job.fn();
      job.resolve();
    } catch (err) {
      log.error({ label: job.label, err: err.message }, 'Job execution error');
      job.reject(err);
    }

    // Conservative gap between any two sends
    if (queue.length > 0) {
      await sleep(MIN_DELAY_BETWEEN_SENDS);
    }
  }

  processing = false;
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

/**
 * Get current queue stats (for /health endpoint).
 * Daily quota info now comes from instanceManager.
 */
export function getQueueStats() {
  return {
    size: queue.length,
    processing,
  };
}
