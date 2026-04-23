const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Create .env.local from .env.example and fill local E2E credentials.`,
    );
  }
  return value;
}

function getBaseUrl() {
  return String(process.env.E2E_BASE_URL || 'http://127.0.0.1:8000').trim();
}

function getRoleCredentials(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole !== 'student' && normalizedRole !== 'teacher') {
    throw new Error(`Unsupported role "${role}"`);
  }

  const prefix = normalizedRole === 'student' ? 'E2E_STUDENT' : 'E2E_TEACHER';
  return {
    role: normalizedRole,
    email: requireEnv(`${prefix}_EMAIL`),
    password: requireEnv(`${prefix}_PASSWORD`),
  };
}

module.exports = {
  getBaseUrl,
  getRoleCredentials,
  requireEnv,
};
