// Only provider-owned HTTPS links are actionable in receipts and redirects.
export function safeAsaasUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (url.hostname !== 'asaas.com' && !url.hostname.endsWith('.asaas.com')) return null;
    return url.href;
  } catch { return null; }
}
