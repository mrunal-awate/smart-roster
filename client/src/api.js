const call = async (method, path, body) => {
  const r = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  if (r.status === 204) return null;
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
};
export const api = { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p) };
