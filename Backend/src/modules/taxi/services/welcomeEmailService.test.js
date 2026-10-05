// node --test src/modules/taxi/services/welcomeEmailService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

const { sendWelcomeEmail } = await import('./welcomeEmailService.js');
const { buildDriverWelcomeEmail, buildUserWelcomeEmail } = await import('./emailTemplates.js');

const withFlag = async (value, fn) => {
  const previous = process.env.EMAIL_WELCOME_ENABLED;
  if (value === undefined) delete process.env.EMAIL_WELCOME_ENABLED;
  else process.env.EMAIL_WELCOME_ENABLED = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.EMAIL_WELCOME_ENABLED;
    else process.env.EMAIL_WELCOME_ENABLED = previous;
  }
};

test('flag off (default): nothing is sent and nothing throws', async () => {
  await withFlag(undefined, async () => {
    let calls = 0;
    await sendWelcomeEmail({ role: 'user', email: 'a@b.com', name: 'A' }, { send: async () => { calls += 1; } });
    assert.equal(calls, 0);
  });
});

test('flag on with a failing mail transport: resolves without throwing', async () => {
  await withFlag('true', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      await assert.doesNotReject(
        sendWelcomeEmail({ role: 'driver', email: 'a@b.com', name: 'A' }, {
          send: async () => { throw new Error('SMTP down'); },
        }),
      );
    } finally {
      console.error = originalError;
    }
  });
});

test('empty or missing email is skipped', async () => {
  await withFlag('true', async () => {
    let calls = 0;
    const send = async () => { calls += 1; };
    await sendWelcomeEmail({ role: 'user', email: '', name: 'A' }, { send });
    await sendWelcomeEmail({ role: 'user', email: '   ', name: 'A' }, { send });
    await sendWelcomeEmail({ role: 'user', name: 'A' }, { send });
    assert.equal(calls, 0);
  });
});

test('flag on sends the role-specific template', async () => {
  await withFlag('true', async () => {
    const sent = [];
    const send = async (mail) => { sent.push(mail); };
    await sendWelcomeEmail({ role: 'user', email: 'u@x.com', name: 'Uma' }, { send });
    await sendWelcomeEmail({ role: 'driver', email: 'd@x.com', name: 'Dev' }, { send });
    assert.equal(sent.length, 2);
    assert.match(sent[0].text, /User Terms/);
    assert.match(sent[1].text, /Driver Terms/);
    assert.equal(sent[0].to, 'u@x.com');
  });
});

test('templates escape the name in html and use fallback terms', () => {
  const { html, subject } = buildUserWelcomeEmail({ name: '<b>x</b>' });
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(subject.startsWith('Welcome to'));
  assert.ok(buildDriverWelcomeEmail({}).text.includes('Hello there'));
});
