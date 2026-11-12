const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');

export async function getDashboard({
  decisionMonth = '2026-01',
  cutoffTime = '10:00',
  refresh = false,
} = {}) {
  const params = new URLSearchParams({
    decision_month: decisionMonth,
    cutoff_time: cutoffTime,
  });

  if (refresh) params.set('refresh', 'true');

  let response;
  try {
    response = await fetch(`${API_BASE}/dashboard?${params.toString()}`);
  } catch {
    throw new Error(
      'Could not reach the WindVision backend. Check that the API is running and VITE_API_BASE points to it.'
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Dashboard request failed (${response.status}).`);
  }
  return body;
}
