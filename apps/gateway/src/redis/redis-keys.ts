// Gateway-local redis keys not part of the shared cross-app contract.
export { keyMeta, usageCounter, rateLimit, usageQueue } from '@gw/shared';

/** Queue of key status changes (e.g. exhaustion) to sync back to Postgres. */
export const KEY_STATUS_QUEUE = 'key:status:queue';
