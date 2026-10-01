import { ApiFailure } from '@/api/client';

/**
 * Downloads a CSV export through the same-origin proxy (the session cookie goes with it) and
 * saves it under `fileName`.
 */
export async function downloadFile(
  path: string,
  query: Record<string, string>,
  fileName: string,
): Promise<void> {
  const search = new URLSearchParams(query).toString();
  let response: Response;
  try {
    response = await fetch(`${path}${search ? `?${search}` : ''}`, { credentials: 'same-origin' });
  } catch (cause) {
    throw new ApiFailure(0, 'NETWORK', cause instanceof Error ? cause.message : 'Network error');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiFailure(
      response.status,
      (body?.error?.code as ApiFailure['code'] | undefined) ?? 'UNKNOWN',
      body?.error?.message ?? response.statusText,
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
