'use strict';

/**
 * Centralized environment configuration.
 * Loading dotenv here guarantees env vars are available for the rest of the app.
 */
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const config = {
  port: Number(process.env.PORT) || 3000,
  slackBotToken: required('SLACK_BOT_TOKEN'),
  slackSigningSecret: required('SLACK_SIGNING_SECRET'),
  woo: {
    url: required('WOO_URL').replace(/\/$/, ''),
    username: required('WOO_USERNAME'),
    password: required('WOO_PASSWORD'),
    timeoutMs: Number(process.env.WOO_TIMEOUT_MS) || 10000
  },
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 15 * 60 * 1000,
  adminEditUrl:
    process.env.ADMIN_EDIT_URL ||
    'https://www.pathwaybookstore.com/wp-admin/admin.php?page=wc-orders&action=edit&id='
};

module.exports = config;
