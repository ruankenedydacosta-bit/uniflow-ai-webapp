// PUSH1: pushManager.subscribe({ applicationServerKey }) exige um
// Uint8Array (nunca a string base64url crua) -- conversao padrao
// documentada pelo W3C Push API / usada por toda implementacao de Web
// Push. Sem isso, subscribe() lanca InvalidAccessError em todo browser.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
