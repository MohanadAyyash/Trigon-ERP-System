'use strict';

const G = require('./m365graph');

const HEALTH_TIMEOUT_MS = 5000;

function probeHost(bindHost) {
  let host = String(bindHost || '').trim();
  if (!host || host === '0.0.0.0' || host === '*') return '127.0.0.1';
  if (host === '::' || host === '::0' || host === '[::]') return '::1';
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  try {
    new URL(`http://${host.includes(':') ? `[${host}]` : host}:1/`);
    return host;
  } catch {
    return '127.0.0.1';
  }
}

async function probeHealth(port, { host = '0.0.0.0', fetchImpl = globalThis.fetch, timeout = HEALTH_TIMEOUT_MS } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local health-check port');
  const probeHostName = probeHost(host);
  const urlHost = probeHostName.includes(':') ? `[${probeHostName}]` : probeHostName;
  let response;
  try {
    response = await fetchImpl(`http://${urlHost}:${port}/api/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    return { ok: false, detail: 'No response from the local health endpoint' };
  }
  if (!response.ok) return { ok: false, detail: `Health endpoint returned HTTP ${response.status}` };
  try {
    const body = await response.json();
    return body?.ok === true && body?.db === 'ok'
      ? { ok: true, detail: 'Health endpoint and database are responding' }
      : { ok: false, detail: 'Health endpoint reported an unhealthy server or database' };
  } catch {
    return { ok: false, detail: 'Health endpoint returned an unreadable response' };
  }
}

async function notifyTeams(event, time, {
  url = process.env.M365_TEAMS_WEBHOOK_URL,
  extraHosts = String(process.env.M365_TEAMS_EXTRA_HOSTS || '').split(',').map(x => x.trim()).filter(Boolean),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!url) return { skipped: 'Teams webhook not configured' };
  if (!['down', 'recovered'].includes(event)) throw new Error('Invalid health notification event');
  if (!G.teamsUrlOk(url, extraHosts)) throw new Error('Teams webhook URL is not an allowed Microsoft destination');

  const down = event === 'down';
  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: down ? 'Trigon ERP is not responding' : 'Trigon ERP has recovered', weight: 'Bolder', size: 'Medium', wrap: true },
      { type: 'FactSet', facts: [
        { title: 'Monitor', value: 'Local health check' },
        { title: 'Status', value: down ? 'Unhealthy' : 'Healthy again' },
        { title: 'Time', value: time },
      ] },
    ],
  };
  await G.call(url, {
    method: 'POST',
    redirect: 'manual',
    json: { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }] },
    expect: 'text',
    idempotent: false,
    timeout: 10_000,
    fetchImpl,
  });
  return { sent: true };
}

module.exports = { probeHealth, notifyTeams };
