import logger from './logger.js';

const log = logger.child({ module: 'send-queue' });

/**
 * Global send queue — serializes ALL WhatsApp message sends.
 * Prevents campaign sends, welcome messages, and test sends from
 * interleaving and triggering WhatsApp anti-spam detection.
 *
 * Architecture:
 *   - One queue, FIFO
 *   - Each job is a function that returns a Promise
 *   - Configurable delay between jobs (anti-spam)
 *   - Campaign sends push one job PER GROUP (not one per campaign)
 *     so welcome messages can be interleaved without starvation
 */

/** @type {Array<{ fn: () => Promise<void>, label: string, priority: number }>} */
const queue = [];

let processing = false;

/** Minimum delay between any two WhatsApp sends (ms) */
const MIN_DELAY_BETWEEN_SENDS = 3_000; // 3 seconds

/** Delay between campaign group sends (ms) — randomized on top */
export const CAMPAIGN_DELAY_MIN = 30_000;
export const CAMPAIGN_DELAY_MAX = 60_000;

/** Delay before welcome message send (ms) — randomized */
export const WELCOME_DELAY_MIN = 2_000;
export const WELCOME_DELAY_MAX = 5_000;

/**
 * Add a send job to the global queue.
 * @param {() => Promise<void>} fn - The async function to execute
 * @param {string} label - Human-readable label for logging
 * @param {'high'|'normal'|'low'} [priority='normal'] - Priority level
 * @returns {Promise<void>} - Resolves when the job completes
 */
export function enqueue(fn, label = 'unknown', priority = 'normal') {
  const priorityNum = priority === 'high' ? 0 : priority === 'low' ? 2 : 1;

  return new Promise((resolve, reject) => {
    const job = {
      fn: async () => {
        try {
          await fn();
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      label,
      priority: priorityNum,
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

    log.debug({ label, priority, queueSize: queue.length }, 'Job enqueued');
    processQueue();
  });
}

/**
 * Fire-and-forget enqueue — does not wait for completion.
 * @param {() => Promise<void>} fn
 * @param {string} label
 * @param {'high'|'normal'|'low'} [priority='normal']
 */
export function enqueueAsync(fn, label = 'unknown', priority = 'normal') {
  enqueue(fn, label, priority).catch((err) => {
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
    log.debug({ label: job.label, remaining: queue.length }, 'Processing job');

    try {
      await job.fn();
    } catch (err) {
      log.error({ label: job.label, err: err.message }, 'Job execution error');
    }

    // Minimum gap between any two sends
    if (queue.length > 0) {
      await sleep(MIN_DELAY_BETWEEN_SENDS);
    }
  }

  processing = false;
}

/**
 * Get current queue depth (for monitoring).
 * @returns {{ size: number, processing: boolean }}
 */
export function getQueueStats() {
  return { size: queue.length, processing };
}
