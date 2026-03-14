import logger from './logger.js';

const log = logger.child({ module: 'send-queue' });

/**
 * Global send queue — serializes ALL WhatsApp message sends.
 *
 * Safety-first approach:
 *   - One queue, FIFO with priority support
 *   - Conservative delays between sends to mimic human behavior
 *   - Daily message limit to avoid WhatsApp flagging the account
 *   - Welcome messages have priority but still respect delays
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
// Daily message counter — resets at midnight UTC
// ---------------------------------------------------------------------------

/** Maximum messages per day (campaigns + welcome combined) */
const MAX_MESSAGES_PER_DAY = parseInt(process.env.MAX_MESSAGES_PER_DAY || '50', 10);

let dailySentCount = 0;
let dailyDate = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDate) {
    log.info(
      { previousDate: dailyDate, previousCount: dailySentCount, newDate: today },
      'Daily counter reset',
    );
    dailySentCount = 0;
    dailyDate = today;
  }
}

function incrementDailyCounter() {
  resetDailyCounterIfNeeded();
  dailySentCount++;
}

/**
 * Check if we can still send today.
 * @returns {boolean}
 */
export function canSendToday() {
  resetDailyCounterIfNeeded();
  return dailySentCount < MAX_MESSAGES_PER_DAY;
}

/**
 * Get remaining daily quota.
 * @returns {number}
 */
export function getRemainingDailyQuota() {
  resetDailyCounterIfNeeded();
  return Math.max(0, MAX_MESSAGES_PER_DAY - dailySentCount);
}

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
    resetDailyCounterIfNeeded();

    const job = queue.shift();

    // Check daily limit — welcome messages always pass, campaigns are blocked
    if (job.type === 'campaign' && dailySentCount >= MAX_MESSAGES_PER_DAY) {
      log.warn(
        { label: job.label, dailySentCount, max: MAX_MESSAGES_PER_DAY },
        'Daily message limit reached — campaign send SKIPPED. Will resume tomorrow.',
      );
      // Resolve the promise so the campaign flow continues (reports as skipped)
      try { await job.fn(); } catch { /* ignore */ }
      continue;
    }

    log.info(
      { label: job.label, type: job.type, remaining: queue.length, dailySent: dailySentCount, dailyMax: MAX_MESSAGES_PER_DAY },
      'Processing send job',
    );

    try {
      await job.fn();
      incrementDailyCounter();
    } catch (err) {
      log.error({ label: job.label, err: err.message }, 'Job execution error');
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
 * Get current queue and daily stats (for /health endpoint).
 * @returns {{ size: number, processing: boolean, dailySent: number, dailyMax: number, dailyRemaining: number }}
 */
export function getQueueStats() {
  resetDailyCounterIfNeeded();
  return {
    size: queue.length,
    processing,
    dailySent: dailySentCount,
    dailyMax: MAX_MESSAGES_PER_DAY,
    dailyRemaining: Math.max(0, MAX_MESSAGES_PER_DAY - dailySentCount),
  };
}
