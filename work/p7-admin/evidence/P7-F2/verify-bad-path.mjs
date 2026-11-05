import { authorize } from '/tmp/bot-wt/P7-F2/app/sdk/src/admin/authority.mjs';
import { createAdminConsumer } from '/tmp/bot-wt/P7-F2/app/ui/main/admin/consumer.ts';
import { AdminChannel } from '/tmp/bot-wt/P7-F2/app/sdk/src/admin/channel.mjs';
const req = { requestId: 'r-test', generation: 3, sessionId: 's', turnId: 't', originRef: 'host-issued', action: 'install', target: 'gh-x', params: {} };
let failures = 0;
function check(name, actual, valid) { console.log(JSON.stringify({ name, actual, passed: valid })); if (!valid) failures++; }
const normal = authorize({ turnClass: 'user', action: 'install', target: 'gh-x', humanUtteranceOfGrant: '装 gh-x' });
check('positive control', normal, normal.decision === 'allow');
const neg = authorize({ turnClass: 'user', action: 'install', target: 'gh-x', humanUtteranceOfGrant: '先别装 gh-x' });
check('先别装', neg, neg.decision === 'deny');
for (const action of ['create', 'restart']) {
  const text = action === 'create' ? '建一个 bot。不要建 bot' : '重启 bot。不要重启 bot';
  const result = authorize({ turnClass: 'user', action, humanUtteranceOfGrant: text });
  check(`same-action negation priority: ${action}`, result, result.decision !== 'allow');
}
const mandateResult = authorize({ turnClass: 'delegated', action: 'install', target: 'gh-x', mandate: { id: 'm', actions: ['install'], scopes: { plugins: ['gh-x'] }, grantUtterance: '装 gh-x。不要装 gh-x' } });
check('negated Mandate grant', mandateResult, mandateResult.decision !== 'allow');
for (const action of ['install', 'constructor', 'toString', 'hasOwnProperty', '__proto__']) {
  try {
    const result = await createAdminConsumer().dispatch({ ...req, action });
    check(`empty consumer: ${action}`, result, result?.error?.code === 'pbots/admin-unavailable');
  } catch (error) { check(`empty consumer: ${action}`, { threw: String(error) }, false); }
}
const channel = new AdminChannel({ timeoutMs: 100 });
const sub = { peer: 'test-main', generation: 3, queue: [] };
channel.attach(sub);
const p = channel.request({ sessionId: 's', turnId: 't', originRef: 'host-issued', action: 'install', target: 'gh-x' }).catch(e => e);
const id = sub.queue[0].requestId;
channel.detach();
const detached = await p;
check('stream detach unknown', { code: detached.code, details: detached.details, pending: channel.pendingCount() }, detached.details?.outcome === 'unknown' && channel.pendingCount() === 0);
try { channel.respond(id, { value: { ok: true } }, 'test-main'); check('late response rejected', 'accepted', false); }
catch (error) { check('late response rejected', { code: error.code }, error.code === 'pbots/forbidden'); }
console.log(`FAILED_CHECKS=${failures}`);
process.exitCode = failures ? 1 : 0;
