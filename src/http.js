export async function postJson(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Endpoint returned HTTP ${response.status}.`);
  }

  return payload;
}

export async function fetchJson(endpoint) {
  const response = await fetch(endpoint);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Endpoint returned HTTP ${response.status}.`);
  }

  return payload;
}
