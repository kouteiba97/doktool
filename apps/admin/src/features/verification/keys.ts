/** Cache key of the queue. */
export const queueKey = ['admin', 'verification', 'queue'] as const;

/** Cache key of one case. */
export const caseKey = (id: string) => ['admin', 'verification', 'case', id] as const;
