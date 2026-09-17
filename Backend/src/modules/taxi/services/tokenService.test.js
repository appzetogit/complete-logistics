// node --test src/modules/taxi/services/tokenService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET = 'test-secret-for-token-service';

const { signAccessToken, verifyAccessToken } = await import('./tokenService.js');
const { ApiError } = await import('../../../utils/ApiError.js');

test('a valid token verifies, and repeats return the same payload', () => {
  const token = signAccessToken({ sub: 'user-1', role: 'user' });

  const first = verifyAccessToken(token);
  const second = verifyAccessToken(token); // served from cache

  assert.equal(first.sub, 'user-1');
  assert.equal(first.role, 'user');
  assert.deepEqual(second, first);
});

test('a tampered token is rejected and never cached', () => {
  const token = signAccessToken({ sub: 'user-2', role: 'user' });
  const forged = `${token.slice(0, -3)}xyz`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.throws(() => verifyAccessToken(forged), ApiError);
  }
});

test('a token signed with the wrong secret is rejected', () => {
  const foreign = jwt.sign({ role: 'user' }, 'a-different-secret', { subject: 'user-3' });
  assert.throws(() => verifyAccessToken(foreign), ApiError);
});

test('an expired token is rejected even after being cached while valid', async () => {
  const token = jwt.sign({ role: 'user' }, process.env.JWT_SECRET, { subject: 'user-4', expiresIn: 1 });

  assert.equal(verifyAccessToken(token).sub, 'user-4'); // cached now

  // Move past expiry: the cache must not keep it alive.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.throws(() => verifyAccessToken(token), /expired/i);
});

test('the cache is bounded and still serves recent tokens', () => {
  const recent = signAccessToken({ sub: 'user-recent', role: 'user' });
  verifyAccessToken(recent);

  for (let i = 0; i < 6000; i += 1) {
    verifyAccessToken(signAccessToken({ sub: `filler-${i}`, role: 'user' }));
  }

  // Evicted or not, a real token must still verify correctly.
  assert.equal(verifyAccessToken(recent).sub, 'user-recent');
});
