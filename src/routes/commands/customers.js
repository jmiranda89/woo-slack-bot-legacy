'use strict';

const { web } = require('../../clients/slack');
const { wooGet } = require('../../services/woo');
const { updateSession } = require('../../store/sessions');

function registerCustomerCommands(router) {
  /**
   * /customermeta - Read and update custom Woo customer metadata.
   */
  router.post('/slack/customermeta', (req, res) => {
    const { text, user_id, channel_id } = req.body;
    const email = (text || '').trim();

    res.status(200).send('🔍 Looking up customer metadata...');

    (async () => {
      try {
        if (!email) {
          await web.chat.postMessage({ channel: channel_id, text: '❌ Please provide an email address.' });
          return;
        }

        const customersRes = await wooGet('/customers', { email, per_page: 1 });

        if (!Array.isArray(customersRes.data) || !customersRes.data.length) {
          await web.chat.postMessage({
            channel: channel_id,
            text: `❌ No WooCommerce customer found with email: ${email}`
          });
          return;
        }

        const customer = customersRes.data[0];
        const customerId = customer.id;

        const metaMap = {};
        (customer.meta_data || []).forEach((m) => {
          if (m && m.key) metaMap[m.key] = m.value;
        });

        const customerCode = metaMap.customer_code || '';
        const customerClass = metaMap.customer_class || '';

        updateSession(user_id, {
          customerId,
          email
        });

        await web.chat.postMessage({
          channel: channel_id,
          text: `Customer metadata loaded for ${email}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  `*Customer ID:* ${customerId}\n` +
                  `*Customer Code:* ${customerCode || '_empty_'}\n` +
                  `*Customer Class:* ${customerClass || '_empty_'}`
              }
            },
            {
              type: 'input',
              block_id: 'customer_code_block',
              label: { type: 'plain_text', text: 'Customer Code' },
              element: {
                type: 'plain_text_input',
                action_id: 'customer_code',
                initial_value: String(customerCode ?? '')
              }
            },
            {
              type: 'input',
              block_id: 'customer_class_block',
              label: { type: 'plain_text', text: 'Customer Class' },
              element: {
                type: 'plain_text_input',
                action_id: 'customer_class',
                initial_value: String(customerClass ?? '')
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '💾 Save' },
                  style: 'primary',
                  value: user_id,
                  action_id: 'save_customer_meta'
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Cancel' },
                  style: 'danger',
                  value: user_id,
                  action_id: 'cancel_customer_meta'
                }
              ]
            }
          ]
        });
      } catch (err) {
        console.error('CUSTOMERMETA ERROR:', err.message);
        await web.chat.postMessage({ channel: channel_id, text: '❌ Failed to retrieve customer metadata.' });
      }
    })();

    return undefined;
  });
}

module.exports = { registerCustomerCommands };
