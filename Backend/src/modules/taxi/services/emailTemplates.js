// Welcome emails sent after signup/onboarding. Only the T&C body differs
// between audiences. The T&C text is a static fallback until an admin CMS
// field exists; pass `terms` to override it.

const APP_NAME = () => process.env.APP_NAME || 'Rentol';

const DEFAULT_USER_TERMS = [
  'You must provide accurate information and keep your account credentials confidential.',
  'Fares are shown before you book. Cancellation fees may apply as displayed in the app.',
  'Use the service lawfully and treat drivers and other riders with respect.',
  'The platform may suspend accounts that violate these terms or misuse the service.',
];

const DEFAULT_DRIVER_TERMS = [
  'You must hold valid licence, vehicle and identity documents and keep them up to date.',
  'Your account is active only after admin approval of your submitted documents.',
  'A platform commission applies to completed rides and is settled through your wallet.',
  'Follow traffic laws and passenger-safety rules; violations may lead to suspension.',
];

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const toTermsList = (terms, fallback) => {
  const list = (Array.isArray(terms) ? terms : String(terms || '').split('\n'))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return list.length ? list : fallback;
};

const buildWelcomeEmail = ({ name, intro, termsTitle, terms }) => {
  const appName = APP_NAME();
  const greeting = String(name || '').trim() || 'there';
  const subject = `Welcome to ${appName}`;
  const text = [
    `Hello ${greeting},`,
    '',
    `Welcome to ${appName}! ${intro}`,
    '',
    `${termsTitle}:`,
    ...terms.map((item, index) => `${index + 1}. ${item}`),
    '',
    'By continuing to use the service you agree to these terms.',
  ].join('\n');
  const html = `
    <div style="font-family: sans-serif; max-width: 560px; padding: 20px;">
      <h2>Welcome to ${escapeHtml(appName)}</h2>
      <p>Hello ${escapeHtml(greeting)},</p>
      <p>${escapeHtml(intro)}</p>
      <h3>${escapeHtml(termsTitle)}</h3>
      <ol>${terms.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
      <p>By continuing to use the service you agree to these terms.</p>
    </div>`;

  return { subject, html, text };
};

export const buildUserWelcomeEmail = ({ name, terms } = {}) =>
  buildWelcomeEmail({
    name,
    intro: 'Your account has been created and you can start booking rides.',
    termsTitle: 'User Terms & Conditions',
    terms: toTermsList(terms, DEFAULT_USER_TERMS),
  });

export const buildDriverWelcomeEmail = ({ name, terms } = {}) =>
  buildWelcomeEmail({
    name,
    intro: 'Your registration has been submitted and is pending admin approval.',
    termsTitle: 'Driver Terms & Conditions',
    terms: toTermsList(terms, DEFAULT_DRIVER_TERMS),
  });
