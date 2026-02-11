'use strict';

/**
 * Centralized environment configuration.
 * Loading dotenv here guarantees env vars are available for the rest of the app.
 */
require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3000,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  woo: {
    url: process.env.WOO_URL,
    username: process.env.WOO_USERNAME,
    password: process.env.WOO_PASSWORD
  },
  adminEditUrl:
    process.env.ADMIN_EDIT_URL ||
    'https://www.pathwaybookstore.com/wp-admin/admin.php?page=wc-orders&action=edit&id='
};

module.exports = config;
