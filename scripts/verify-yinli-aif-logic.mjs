import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/sidebar/yinli-helpers.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true
  }
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} },
  URL,
  console
};
sandbox.exports = sandbox.module.exports;

vm.runInNewContext(compiled, sandbox, {
  filename: 'yinli-helpers.cjs'
});

const {
  getAifAccountLabel,
  getMissingStrategySignalIds,
  getYinliSignalReplyUrl,
  normalizeAifAccount
} = sandbox.module.exports;

const accountFromVerify = normalizeAifAccount(
  { success: true, user: { email: 'owner@example.com', credits: 18 } },
  'aif_live_123456'
);
assert.equal(getAifAccountLabel(accountFromVerify), 'owner@example.com');

const fallbackAccount = normalizeAifAccount({ success: true, status: 'ok' }, 'aif_live_abcdef');
assert.equal(getAifAccountLabel(fallbackAccount), '身份代码 ...abcdef');

const redditSignal = {
  id: 1,
  source: 'reddit',
  url: 'https://www.reddit.com/r/SaaS/comments/abc123/founder_question/?utm_source=share'
};
assert.equal(
  getYinliSignalReplyUrl(redditSignal),
  'https://www.reddit.com/r/SaaS/comments/abc123/founder_question/'
);

const wrappedRedditSignal = {
  id: 2,
  source: 'reddit',
  url: 'https://service.example/redirect?url=https%3A%2F%2Freddit.com%2Fr%2Fstartups%2Fcomments%2Fxyz789%2Flaunch_help'
};
assert.equal(
  getYinliSignalReplyUrl(wrappedRedditSignal),
  'https://reddit.com/r/startups/comments/xyz789/launch_help'
);

const pollutedRedditSignal = {
  id: 3,
  source: 'reddit',
  url: 'https://possibility.work/posts/abc123'
};
assert.equal(getYinliSignalReplyUrl(pollutedRedditSignal), null);

assert.deepEqual(
  getMissingStrategySignalIds([
    { id: 11, strategies: [{ content: 'ready' }] },
    { id: 12, strategies: [] },
    { id: 13 }
  ]),
  [12, 13]
);

console.log('Yinli/AIF helper logic verified');
