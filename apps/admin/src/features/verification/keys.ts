export const queueKey = ['admin', 'verification', 'queue'] as const;

export const caseKey = (id: string) => ['admin', 'verification', 'case', id] as const;
