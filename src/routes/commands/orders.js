'use strict';

const { web } = require('../../clients/slack');
const config = require('../../config');
const { wooGet } = require('../../services/woo');

const STATUS_ALIASES = {
  pendingpayment: 'pending',
  pending_payment: 'pending'
};

function normalizeStatus(status) {
  const raw = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return STATUS_ALIASES[raw] || raw;
}

function statusLabel(status) {
  const value = normalizeStatus(status);
  if (value === 'pending') return 'Pending payment';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildStatusButtons(userId, orderId, currentStatus) {
  const current = normalizeStatus(currentStatus);
  const candidates = ['pending', 'processing', 'completed', 'on-hold', 'cancelled', 'refunded', 'failed'];
  const elements = candidates
    .filter((status) => status !== current)
    .slice(0, 5)
    .map((status) => ({
      type: 'button',
      text: { type: 'plain_text', text: `Set ${statusLabel(status)}` },
      style: status === 'completed' ? 'primary' : undefined,
      value: `${userId}|${orderId}|${status}`,
      action_id: `edit_order_status_${status.replace(/[^a-z0-9]/g, '_')}`
    }));

  return elements;
}

function getStripeMeta(order) {
  const meta = Array.isArray(order.meta_data) ? order.meta_data : [];
  const stripePairs = meta
    .filter((item) => item && typeof item.key === 'string' && item.key.toLowerCase().includes('stripe'))
    .slice(0, 8)
    .map((item) => `• ${item.key}: ${String(item.value ?? '')}`);

  return stripePairs.length ? stripePairs.join('\n') : '• No Stripe meta found';
}

function registerOrderCommands(router) {
  /**
   * /findorder - Find order by custom order number.
   */
  router.post('/slack/findorder', (req, res) => {
    const { text, channel_id } = req.body;
    const customOrderNumber = (text || '').trim();

    res.status(200).send(`🔍 Searching for order *${customOrderNumber}*...`);

    (async () => {
      try {
        if (!customOrderNumber) {
          await web.chat.postMessage({ channel: channel_id, text: '❌ Please provide an order number.' });
          return;
        }

        let matchedOrder = null;

        for (let page = 1; page <= 3; page++) {
          const response = await wooGet('/orders', {
            per_page: 100,
            page,
            orderby: 'date',
            order: 'desc'
          });

          for (const order of response.data) {
            const match = order.meta_data?.find(
              (meta) => meta.key === '_alg_wc_custom_order_number' && meta.value?.toString() === customOrderNumber
            );
            if (match) {
              matchedOrder = order;
              break;
            }
          }

          if (matchedOrder) break;
        }

        if (!matchedOrder) {
          await web.chat.postMessage({
            channel: channel_id,
            text: `❌ No order found with custom number: ${customOrderNumber}`
          });
          return;
        }

        const customerName = `${matchedOrder.billing.first_name} ${matchedOrder.billing.last_name}`;
        const customerEmail = matchedOrder.billing.email;
        const customerId = matchedOrder.customer_id;

        await web.chat.postMessage({
          channel: channel_id,
          text: `📦 Order found for *${customOrderNumber}*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Order ID:* ${matchedOrder.id}\n*Customer:* ${customerName}\n*Email:* ${customerEmail}\n*User ID:* ${customerId}`
              }
            }
          ]
        });
      } catch (err) {
        console.error('Error searching orders:', err.message);
        await web.chat.postMessage({
          channel: channel_id,
          text: '❌ Failed to retrieve order due to an error.'
        });
      }
    })();

    return undefined;
  });

  /**
   * /findidorder - Find order by WooCommerce ID.
   */
  router.post('/slack/findidorder', (req, res) => {
    const { text, channel_id } = req.body;
    const orderId = (text || '').trim();

    res.status(200).send(`🔍 Searching for WooCommerce order ID *${orderId}*...`);

    (async () => {
      try {
        if (!orderId || Number.isNaN(Number(orderId))) {
          await web.chat.postMessage({ channel: channel_id, text: '❌ Please enter a valid numeric Order ID.' });
          return;
        }

        const response = await wooGet(`/orders/${orderId}`);

        const matchedOrder = response.data;
        const customerName = `${matchedOrder.billing.first_name} ${matchedOrder.billing.last_name}`;
        const customerEmail = matchedOrder.billing.email;
        const customerId = matchedOrder.customer_id;

        await web.chat.postMessage({
          channel: channel_id,
          text: `📦 Order found with WooCommerce ID *${orderId}*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Order ID:* ${matchedOrder.id}\n*Customer:* ${customerName}\n*Email:* ${customerEmail}\n*User ID:* ${customerId}`
              }
            }
          ]
        });
      } catch (err) {
        console.error('Error searching by WooCommerce ID:', err.message);
        await web.chat.postMessage({
          channel: channel_id,
          text: `❌ No order found with WooCommerce ID: ${orderId}`
        });
      }
    })();

    return undefined;
  });

  /**
   * /editorder - Provide admin edit link for an order.
   */
  router.post('/slack/editorder', (req, res) => {
    const { text, channel_id } = req.body;
    const orderId = (text || '').trim();

    if (!orderId || Number.isNaN(Number(orderId))) return res.send('❌ Please enter a valid numeric Order ID.');

    const editUrl = `${config.adminEditUrl}${orderId}`;

    (async () => {
      try {
        await web.chat.postMessage({
          channel: channel_id,
          text: `✏️ Edit order [#${orderId}](${editUrl})`,
          unfurl_links: false
        });
      } catch (err) {
        console.error('Error posting edit order link:', err.message);
      }
    })();

    return res.status(200).send();
  });

  /**
   * /findcustomid - Find custom order number from a WooCommerce order ID.
   */
  router.post('/slack/findcustomid', (req, res) => {
    const { text, channel_id } = req.body;
    const orderId = (text || '').trim();

    res.status(200).send(`🔍 Looking up custom order number for Woo order ID *${orderId}*...`);

    (async () => {
      try {
        if (!orderId || Number.isNaN(Number(orderId))) {
          await web.chat.postMessage({
            channel: channel_id,
            text: '❌ Please enter a valid numeric WooCommerce Order ID.'
          });
          return;
        }

        const orderRes = await wooGet(`/orders/${orderId}`);

        const order = orderRes.data;
        const customMeta = order.meta_data?.find((m) => m.key === '_alg_wc_custom_order_number');

        if (!customMeta || customMeta.value == null) {
          await web.chat.postMessage({
            channel: channel_id,
            text: `⚠️ No custom order number found on Woo order ID *${orderId}*.`
          });
          return;
        }

        const customOrderNumber = customMeta.value.toString();
        const customerName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim();
        const customerEmail = order.billing?.email || '';

        await web.chat.postMessage({
          channel: channel_id,
          text: `✅ Custom order number found for Woo order ID *${orderId}*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text:
                  `*Woo Order ID:* ${orderId}\n` +
                  `*Custom Order Number:* *${customOrderNumber}*\n` +
                  (customerName ? `*Customer:* ${customerName}\n` : '') +
                  (customerEmail ? `*Email:* ${customerEmail}\n` : '')
              }
            }
          ]
        });
      } catch (err) {
        console.error('FINDCUSTOMID error:', err.message);
        await web.chat.postMessage({
          channel: channel_id,
          text: `❌ Could not find order ID *${orderId}* or failed to retrieve order.`
        });
      }
    })();

    return undefined;
  });

  /**
   * /editorderstatus - Fetch order details and allow status updates.
   */
  router.post('/slack/editorderstatus', (req, res) => {
    const { text, user_id, channel_id } = req.body;
    const orderId = (text || '').trim();

    res.status(200).send(`🔍 Loading order *${orderId}*...`);

    (async () => {
      try {
        if (!orderId || Number.isNaN(Number(orderId))) {
          await web.chat.postMessage({ channel: channel_id, text: '❌ Please enter a valid numeric Order ID.' });
          return;
        }

        const orderRes = await wooGet(`/orders/${orderId}`);
        const order = orderRes.data;
        const billing = order.billing || {};
        const customerName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'N/A';
        const status = normalizeStatus(order.status);
        const buttons = buildStatusButtons(user_id, order.id, status);

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `*Order ID:* ${order.id}\n` +
                `*Status:* ${statusLabel(status)}\n` +
                `*Customer:* ${customerName}\n` +
                `*Email:* ${billing.email || 'N/A'}\n` +
                `*Total:* ${order.currency || ''} ${order.total || '0.00'}\n` +
                `*Payment Method:* ${order.payment_method_title || order.payment_method || 'N/A'}\n` +
                `*Transaction ID:* ${order.transaction_id || 'N/A'}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Stripe Data:*\n${getStripeMeta(order)}`
            }
          }
        ];

        if (buttons.length) {
          blocks.push({
            type: 'actions',
            elements: buttons
          });
        }

        await web.chat.postMessage({
          channel: channel_id,
          text: `Order ${order.id} status and payment details`,
          blocks
        });
      } catch (err) {
        console.error('EDITORDERSTATUS error:', err.message);
        await web.chat.postMessage({
          channel: channel_id,
          text: `❌ Could not find order ID *${orderId}* or failed to retrieve order details.`
        });
      }
    })();

    return undefined;
  });
}

module.exports = { registerOrderCommands };
