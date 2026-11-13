import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledResources} from '../tools/verify-static-build.mjs';
import {ensureWorkflowPages, waitForLegacyPages} from '../tools/pages-source.mjs';

test('Pages refuses raw source HTML and accepts the compiled Vite entry points', () => {
  assert.throws(() => compiledResources('<script type="module" src="/src/main.ts"></script>'), /compilés absents/);
  assert.throws(() => compiledResources('<script src="/src/main.ts"></script><link rel="stylesheet" href="/little-world/assets/a.css">'), /script non compilé/);
  assert.deepEqual(compiledResources('<script type="module" src="/little-world/assets/game-123.js"></script><link rel="stylesheet" crossorigin href="/little-world/assets/game-123.css">'), ['/little-world/assets/game-123.js', '/little-world/assets/game-123.css']);
});

const context = {repo: {owner: 'glloq', repo: 'little-world'}};
const core = {warning() {}, info() {}};

test('Pages legacy source is reported without attempting forbidden settings writes', async () => {
  const calls = [];
  const github = {request: async route => {
    calls.push(route);
    return {data: {build_type: 'legacy'}};
  }};
  assert.equal(await ensureWorkflowPages({github, context, core}), 'legacy');
  assert.deepEqual(calls, ['GET /repos/{owner}/{repo}/pages']);
});

test('Pages workflow source needs no competing-deployment polling', async () => {
  let calls = 0;
  const github = {request: async route => {
    assert.equal(route, 'GET /repos/{owner}/{repo}/pages'); calls++;
    return {data: {build_type: 'workflow'}};
  }};
  await waitForLegacyPages({github, context, core});
  assert.equal(calls, 1);
});

test('Pages waits until a legacy deployment completes and ignores its own workflow', async () => {
  let polls = 0; const delays = [];
  const github = {request: async route => {
    if (route.endsWith('/pages')) return {data: {build_type: 'legacy'}};
    polls++;
    return {data: {workflow_runs: [
      {id: 1, name: 'pages build and deployment', status: polls === 1 ? 'in_progress' : 'completed'},
      {id: 2, name: 'Build and deploy Little World', status: 'in_progress'},
    ]}};
  }};
  await waitForLegacyPages({github, context, core, sleep: async ms => delays.push(ms)});
  assert.equal(polls, 3);
  assert.deepEqual(delays, [10000, 10000]);
});

test('Pages waits for requeued legacy jobs and refuses to publish if they remain active', async () => {
  let polls = 0;
  const github = {request: async route => {
    if (route.endsWith('/pages')) return {data: {build_type: 'legacy'}};
    polls++;
    return {data: {workflow_runs: [{id: 3, path: 'dynamic/pages/pages-build-deployment', status: polls === 1 ? 'completed' : 'queued'}]}};
  }};
  await assert.rejects(waitForLegacyPages({github, context, core, attempts: 3, sleep: async () => {}}), /encore actif/);
  assert.equal(polls, 3);
});
