'use strict';

const { web } = require('../../clients/slack');
const { wooGet } = require('../../services/woo');
const { updateSession } = require('../../store/sessions');

function registerPdfCommands(router) {
  /**
   * /orderpdf - Search mail logs and prompt the user to generate a PDF.
   */
  router.post('/slack/orderpdf', (req, res) => {
    const { text, user_id, channel_id } = req.body;
    const subjectQuery = (text || '').trim();

    res.status(200).send('🔎 Searching email logs...');

    (async () => {
      try {
        if (!subjectQuery) {
          await web.chat.postMessage({
            channel: channel_id,
            text: '❌ Please provide a subject search (ex: `New Order #4105`).'
          });
          return;
        }

        const searchRes = await wooGet('/mail-log/search', {
          subject: subjectQuery,
          limit: 10,
          days: 30
        });

        const results = searchRes.data?.results || [];
        if (!results.length) {
          await web.chat.postMessage({
            channel: channel_id,
            text: `❌ No email logs found matching subject: *${subjectQuery}*`
          });
          return;
        }

        updateSession(user_id, {
          orderPdf: { query: subjectQuery }
        });

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📨 Found *${results.length}* email log(s) matching:\n*${subjectQuery}*\n\nSelect one to generate a PDF:`
            }
          },
          ...results.slice(0, 10).map((row) => ({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${row.subject}*\n*To:* ${row.receiver}\n*Date:* ${row.timestamp}\n*Mail ID:* ${row.mail_id}`
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: '📄 Generate PDF' },
              style: 'primary',
              value: `${user_id}|${row.mail_id}`,
              action_id: 'orderpdf_generate'
            }
          }))
        ];

        await web.chat.postMessage({
          channel: channel_id,
          text: `Email logs found for ${subjectQuery}`,
          blocks
        });
      } catch (err) {
        console.error('ORDERPDF search failed:', err.message);
        await web.chat.postMessage({ channel: channel_id, text: '❌ Failed to search email logs.' });
      }
    })();

    return undefined;
  });
}

module.exports = { registerPdfCommands };
