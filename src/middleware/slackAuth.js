'use strict';

const crypto = require('crypto');
const config = require('../config');

const SLACK_TOLERANCE_SECONDS = 60 * 5;

function verifySlackRequest(req, res, next) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  if (!timestamp || !signature || !req.rawBody) {
    return res.status(401).send('Unauthorized');
  }

  const ts = Number(timestamp);
  if (Number.isNaN(ts)) {
    return res.status(401).send('Unauthorized');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SLACK_TOLERANCE_SECONDS) {
    return res.status(401).send('Unauthorized');
  }

  const base = `v0:${timestamp}:${req.rawBody.toString('utf8')}`;
  const digest = crypto.createHmac('sha256', config.slackSigningSecret).update(base).digest('hex');
  const expected = `v0=${digest}`;

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).send('Unauthorized');
  }

  return next();
}

module.exports = { verifySlackRequest };
