// Approving one's own request: nobody may, except the ONE person named on the server (SELF_APPROVER_USERNAME in .env, e.g. the
// owner / general manager). Covers every kind of request: expense claims, petty cash requests, leave, employee requests (advance…)
// and spend approvals (purchase orders / payments above the limit). The exception only lifts the "own request" rule: it never gives a
// right the role does not have. Every self-approval is in the audit log.     node --no-warnings test-self-approval.js     Fake data only.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-selfappr-'));
process.env.ZOHO_NO_SCHEDULER = '1'; process.env.SALES_NO_SCHEDULER = '1';
delete process.env.SELF_APPROVER_USERNAME;
const { server, ctx } = require('./server.js');

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api/`; const jar = {}; let who = 'boss';
  const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => null) }; };
  const as = async (u, fn) => { const p = who; who = u; try { return await fn(); } finally { who = p; } };
  const ok = (r, l) => { assert.equal(r.s, 200, `${l || ''} → ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); return r.j; };
  const refused = (r, l) => { assert.equal(r.s, 403, `${l || ''} → ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); assert.match(JSON.stringify(r.j), /own/i, l); };
  const audits = act => ctx.db.prepare('SELECT * FROM audit_log WHERE action=? ORDER BY id').all(act);
  const WPS = { person_code: '12345678901234', routing_code: '302620122', iban: 'AE070331234567890123456' };
  try {
    ok(await call('POST', 'setup', { username: 'boss', password: 'secret12', company: 'Test Co' })); ok(await call('POST', 'login', { username: 'boss', password: 'secret12' }));
    ok(await call('PUT', 'settings', { trn: '100123456700003', staff_approval_accountant_limit: 1000, po_approval_limit: 10000 }));
    const cl = ok(await call('POST', 'parties', { type: 'client', name: 'Client' })).id, sup = ok(await call('POST', 'parties', { type: 'supplier', name: 'Supplier' })).id;
    const prj = ok(await call('POST', 'projects', { name: 'Villa', client_id: cl, status: 'active' })).id;
    const E = {}; for (const n of ['Boss', 'Second Admin', 'Manager', 'Worker']) E[n] = (await call('POST', 'employees', { name: n, join_date: '2025-01-01', basic: 5000, project_id: prj, ...WPS })).j.id;
    const U = { boss: (await call('GET', 'users')).j.find(u => u.username === 'boss').id };
    for (const [u, role, e] of [['admin2', 'admin', 'Second Admin'], ['mgr', 'manager', 'Manager'], ['worker', 'viewer', 'Worker']]) { U[u] = ok(await call('POST', 'users', { username: u, password: 'secret12', role })).id; ok(await call('PUT', 'users/' + U[u], { employee_id: E[e] })); }
    ok(await call('PUT', 'users/' + U.boss, { employee_id: E.Boss }));
    for (const u of ['admin2', 'mgr', 'worker']) await as(u, async () => ok(await call('POST', 'login', { username: u, password: 'secret12' })));
    jar.boss = ''; ok(await call('POST', 'login', { username: 'boss', password: 'secret12' }));   // the link to the employee is read at sign-in

    // one of each kind of request, by `u` for themselves
    let round = 0;
    const EMP = { boss: () => E.Boss, admin2: () => E['Second Admin'], mgr: () => E.Manager, worker: () => E.Worker };
    const make = async u => {
      const own = await as(u, async () => ({
        claim: ok(await call('POST', 'me/claims', { date: '2026-11-01', description: `Fuel ${u}`, amount: 50, project_id: prj }), 'claim ' + u).id,
        petty: ok(await call('POST', 'me/petty/requests', { amount: 200, purpose: `Site cash ${u}` }), 'petty ' + u).id }));
      // leave and employee requests are filed by HR for staff (the "own" rule looks at whose request it is, not who typed it)
      const d = `2027-01-${String(2 * ++round).padStart(2, '0')}`;
      own.leave = ok(await as('boss', () => call('POST', 'hr/leave', { employee_id: EMP[u](), type: 'annual', start_date: d, end_date: d })), 'leave ' + u).id;
      own.request = ok(await as('boss', () => call('POST', 'hr/requests', { employee_id: EMP[u](), type: 'advance', amount: 300, details: 'Advance' })), 'request ' + u).id;
      return own;
    };
    const spend = async u => { const po = ok(await call('POST', 'purchase_orders', { party_id: sup, project_id: prj, status: 'draft', items: [{ description: 'Steel ' + u, qty: 1, rate: 20000 }] })).id;
      return as(u, async () => ok(await call('POST', 'spend-approvals', { kind: 'po', ref_id: po }), 'spend request ' + u).id); };
    const decideAll = async (u, r, sp) => as(u, async () => [
      await call('POST', `expense_claims/${r.claim}/decide`, { status: 'approved' }),
      await call('POST', `petty_requests/${r.petty}/decide`, { status: 'approved' }),
      await call('PUT', `hr/leave/${r.leave}/decide`, { status: 'approved' }),
      await call('PUT', `hr/requests/${r.request}/decide`, { status: 'approved' }),
      await call('PUT', `spend-approvals/${sp}`, { status: 'approved' }),
    ]);
    const LABELS = ['expense claim', 'petty cash request', 'leave', 'employee request (advance)', 'spend approval'];

    // ---- 1. nobody named: nobody approves their own, of any kind (administrators included) ----
    { const r = await make('admin2'), sp = await spend('admin2'); (await decideAll('admin2', r, sp)).forEach((x, i) => refused(x, 'admin2 own ' + LABELS[i]));
      const rb = await make('boss'), spb = await spend('boss'); (await decideAll('boss', rb, spb)).forEach((x, i) => refused(x, 'boss own, no one named: ' + LABELS[i]));
      // someone else with the right approves them as before
      (await decideAll('boss', r, sp)).forEach((x, i) => ok(x, 'boss approves admin2\'s ' + LABELS[i])); }
    console.log('✔ nobody named: no one approves their own expense claim, petty cash request, leave, employee request or spend approval — administrators included; others approve them as before');

    // ---- 2. the named person approves their own, of every kind; still nobody else ----
    process.env.SELF_APPROVER_USERNAME = ' BOSS ';                     // spaces and case do not matter
    { const rb = await make('boss'), spb = await spend('boss'), before = audits('self-approve').length;
      (await decideAll('boss', rb, spb)).forEach((x, i) => ok(x, 'boss own ' + LABELS[i]));
      assert.equal(ctx.db.prepare('SELECT status FROM expense_claims WHERE id=?').get(rb.claim).status, 'approved');
      assert.equal(ctx.db.prepare('SELECT status FROM petty_requests WHERE id=?').get(rb.petty).status, 'approved');
      assert.equal(ctx.db.prepare('SELECT status FROM leave_requests WHERE id=?').get(rb.leave).status, 'approved');
      assert.equal(ctx.db.prepare('SELECT status FROM hr_requests WHERE id=?').get(rb.request).status, 'approved');
      assert.equal(ctx.db.prepare('SELECT status FROM spend_approvals WHERE id=?').get(spb).status, 'approved');
      const sa = audits('self-approve').slice(before); assert.equal(sa.length, 5, 'each self-approval audited: ' + JSON.stringify(sa.map(a => a.tbl)));
      assert.deepEqual(sa.map(a => a.tbl).sort(), ['expense_claims', 'hr_requests', 'leave_requests', 'petty_requests', 'spend_approvals']); assert.ok(sa.every(a => a.user === 'boss'));
      // the others still cannot approve their own
      const r2 = await make('admin2'), sp2 = await spend('admin2'); (await decideAll('admin2', r2, sp2)).forEach((x, i) => refused(x, 'admin2 own, boss named: ' + LABELS[i]));
      const rm = await make('mgr'); refused(await as('mgr', () => call('POST', `expense_claims/${rm.claim}/decide`, { status: 'approved' })), 'manager own claim');
      { const x = await as('mgr', () => call('PUT', `hr/leave/${rm.leave}/decide`, { status: 'approved' })); assert.equal(x.s, 403, 'manager own leave: ' + JSON.stringify(x.j)); }
      // the approvals queue: the named person sees their own requests to approve; another administrator does not see theirs
      const qb = ok(await call('GET', 'approvals')), qa = ok(await as('admin2', () => call('GET', 'approvals')));
      assert.ok(!qa.some(s => s.employee_id === E['Second Admin']), 'admin2 is not offered their own requests');
      assert.ok(qa.some(s => s.employee_id === E.Manager) && qb.some(s => s.employee_id === E['Second Admin']), 'others\' requests are offered as before'); }
    console.log('✔ SELF_APPROVER_USERNAME named: that person approves their own requests of every kind (each one audited as self-approve); every other user still cannot; the queue matches');

    // ---- 3. the exception never adds a right the role does not have ----
    process.env.SELF_APPROVER_USERNAME = 'worker';
    { const rw = await make('worker'); const x = await as('worker', () => call('POST', `expense_claims/${rw.claim}/decide`, { status: 'approved' }));
      assert.equal(x.s, 403); assert.doesNotMatch(JSON.stringify(x.j), /own/i, 'refused for the role, not for being own');
      assert.equal((await as('worker', () => call('PUT', `hr/leave/${rw.leave}/decide`, { status: 'approved' }))).s, 403, 'viewer cannot approve leave'); }
    // a second name, a comma list or an unknown user does not widen it
    process.env.SELF_APPROVER_USERNAME = 'boss,admin2';
    { const r = await make('admin2'); refused(await as('admin2', () => call('POST', `expense_claims/${r.claim}/decide`, { status: 'approved' })), 'a list is not accepted'); }
    process.env.SELF_APPROVER_USERNAME = 'nobody-like-this';
    { const r = await make('boss'); refused(await call('POST', `expense_claims/${r.claim}/decide`, { status: 'approved' }), 'unknown name: nobody'); }
    // a disabled named user is no exception either
    process.env.SELF_APPROVER_USERNAME = 'admin2';
    { const r = await make('admin2'); assert.equal(ctx.selfApprover({ id: U.admin2, username: 'admin2' }), true, 'named and active');
      ctx.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(U.admin2); assert.equal(ctx.selfApprover({ id: U.admin2, username: 'admin2' }), false, 'named but disabled: no exception');
      assert.ok([401, 403].includes((await as('admin2', () => call('POST', `expense_claims/${r.claim}/decide`, { status: 'approved' }))).s), 'disabled user cannot'); }
    delete process.env.SELF_APPROVER_USERNAME;
    console.log('✔ the exception never gives a right the role lacks (a viewer named stays a viewer); one name only; unknown / disabled names allow nothing');

    console.log('\nSELF APPROVAL TESTS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(process.exitCode || 0), 100); }
});
