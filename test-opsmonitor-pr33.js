'use strict';

const assert = require('node:assert/strict');
const { probeHealth, notifyTeams } = require('./lib/opsmonitor');

async function testConfiguredHosts() {
  const cases = [
    ['127.0.0.1', 'http://127.0.0.1:3000/api/health'],
    ['192.168.1.25', 'http://192.168.1.25:3000/api/health'],
    ['::1', 'http://[::1]:3000/api/health'],
    ['0.0.0.0', 'http://127.0.0.1:3000/api/health'],
    ['::', 'http://[::1]:3000/api/health'],
  ];
  for (const [host, expected] of cases) {
    let requested;
    const result = await probeHealth(3000, {
      host,
      fetchImpl: async url => {
        requested = url;
        return new Response(JSON.stringify({ ok: true, db: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    assert.equal(requested, expected);
    assert.equal(result.ok, true);
  }
  console.log('✔ configured HOST values map to reachable probe URLs');
}

async function testWebhookRedirectRejection() {
  let options;
  await assert.rejects(
    () => notifyTeams('down', '2026-11-21T18:00:00.000Z', {
      url: 'http://127.0.0.1:3000/teams/hook',
      extraHosts: ['127.0.0.1'],
      fetchImpl: async (_url, fetchOptions) => {
        options = fetchOptions;
        return new Response(null, {
          status: 307,
          headers: { Location: 'http://127.0.0.1:1/private' },
        });
      },
    }),
    /Microsoft 365 refused/,
  );
  assert.equal(options.redirect, 'manual');
  console.log('✔ Teams webhook redirects are not followed');
}

(async () => {
  await testConfiguredHosts();
  await testWebhookRedirectRejection();
  console.log('OPSMONITOR PR33 TESTS PASSED');
})().catch(error => {
  console.error('FAIL', error);
  process.exitCode = 1;
});
