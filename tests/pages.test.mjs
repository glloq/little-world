import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledResources} from '../tools/verify-static-build.mjs';
import {ensureWorkflowPages} from '../tools/pages-source.mjs';

test('Pages refuses raw source HTML and accepts the compiled Vite entry points', () => {
  assert.throws(() => compiledResources('<script type="module" src="/src/main.ts"></script>'), /compilés absents/);
  assert.throws(() => compiledResources('<script src="/src/main.ts"></script><link rel="stylesheet" href="/little-world/assets/a.css">'), /script non compilé/);
  assert.deepEqual(compiledResources('<script type="module" src="/little-world/assets/game-123.js"></script><link rel="stylesheet" crossorigin href="/little-world/assets/game-123.css">'), ['/little-world/assets/game-123.js', '/little-world/assets/game-123.css']);
});

test('Pages migrates legacy publishing to workflow without changing content', async () => {
  let buildType = 'legacy'; const calls = [];
  const github = {request: async (route, options) => {
    calls.push([route, options]);
    if (route.startsWith('PUT')) buildType = options.build_type;
    return {data: {build_type: buildType}};
  }};
  const arguments_ = {github, context: {repo: {owner: 'glloq', repo: 'little-world'}}, core: {warning() {}}};
  await ensureWorkflowPages(arguments_);
  assert.equal(buildType, 'workflow');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1][1], {owner: 'glloq', repo: 'little-world', build_type: 'workflow'});
  calls.length = 0;
  await ensureWorkflowPages(arguments_);
  assert.equal(calls.length, 1);
});

test('Pages reports the exact settings repair when token cannot update source', async () => {
  const github = {request: async route => {
    if (route.startsWith('PUT')) throw new Error('403 Forbidden');
    return {data: {build_type: 'legacy'}};
  }};
  await assert.rejects(ensureWorkflowPages({github, context: {repo: {}}, core: {warning() {}}}), /Settings → Pages.*GitHub Actions.*403 Forbidden/);
});
