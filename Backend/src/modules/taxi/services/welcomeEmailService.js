import { sendEmail } from './mailService.js';
import { buildDriverWelcomeEmail, buildUserWelcomeEmail } from './emailTemplates.js';

const builders = {
  user: buildUserWelcomeEmail,
  driver: buildDriverWelcomeEmail,
};

// Never throws: a mail problem must not fail registration or onboarding.
// `send` is injectable for tests.
export const sendWelcomeEmail = async ({ role, email, name }, { send = sendEmail } = {}) => {
  const to = String(email || '').trim();

  if (process.env.EMAIL_WELCOME_ENABLED !== 'true' || !to) {
    return;
  }

  try {
    const build = builders[role];
    if (!build) {
      return;
    }

    const { subject, html, text } = build({ name });
    await send({ to, subject, text, html });
  } catch (error) {
    console.error('welcome email failed', error?.message || error);
  }
};
