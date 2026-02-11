'use strict';

const express = require('express');
const { web } = require('../clients/slack');
const config = require('../config');
const { wooGet, wooPut } = require('../services/woo');
const { updateSession } = require('../store/sessions');

const router = express.Router();

/**
 * /draftproduct - Slack slash command entrypoint.
 * Looks up a product by SKU and prompts the user to confirm drafting it.
 */
router.post('/slack/command', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const sku = (text || '').trim();

  if (!sku) return res.send('❌ Please provide a SKU.');

  try {
    const response = await wooGet('/products', { sku });

    if (!response.data.length) return res.send(`❌ No product found with SKU: ${sku}`);

    const product = response.data[0];

    updateSession(user_id, {
      productId: product.id,
      productName: product.name
    });

    await web.chat.postMessage({
      channel: channel_id,
      text: `Is this the correct product to draft?\n*${product.name}* ($${product.price})`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Product:* ${product.name}\n*Price:* $${product.price}` }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Yes' },
              style: 'primary',
              value: user_id,
              action_id: 'confirm_draft'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ No' },
              style: 'danger',
              value: user_id,
              action_id: 'cancel_draft'
            }
          ]
        }
      ]
    });

    return res.status(200).send();
  } catch (err) {
    console.error('Error fetching product:', err.response?.data || err.message);
    return res.send('❌ Error retrieving product.');
  }
});

/**
 * /findorder - Find order by custom order number.
 */
router.post('/slack/findorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const customOrderNumber = (text || '').trim();

  res.status(200).send(`🔍 Searching for order *${customOrderNumber}*...`);

  if (!customOrderNumber) {
    await web.chat.postMessage({ channel: channel_id, text: '❌ Please provide an order number.' });
    return;
  }

  try {
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
    console.error('Error searching orders:', err.response?.data || err.message);
    await web.chat.postMessage({
      channel: channel_id,
      text: '❌ Failed to retrieve order due to an error.'
    });
  }
});

/**
 * /priceupdate - Update product/variation price by SKU.
 */
router.post('/slack/priceupdate', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const sku = (text || '').trim();

  if (!sku) return res.send('❌ Please provide a SKU.');

  try {
    const response = await wooGet('/products', { sku });

    if (!response.data.length) return res.send(`❌ No product found with SKU: ${sku}`);

    const product = response.data[0];
    let variant = null;

    if (product.type === 'variable') {
      const variationsRes = await wooGet(`/products/${product.id}/variations`);
      variant = variationsRes.data.find((v) => v.sku === sku);
      if (!variant) return res.send(`❌ No matching variation found with SKU: ${sku}`);
    }

    const currentPrice = variant ? variant.price : product.price;

    updateSession(user_id, {
      sku,
      productId: product.id,
      variationId: variant?.id || null,
      isVariation: !!variant,
      originalPrice: currentPrice
    });

    await web.chat.postMessage({
      channel: channel_id,
      text: `Current price for *${sku}* is $${currentPrice}.`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*SKU:* ${sku}\n*Current Price:* $${currentPrice}` } },
        {
          type: 'input',
          block_id: 'new_price_input',
          label: { type: 'plain_text', text: 'Enter new price' },
          element: { type: 'plain_text_input', action_id: 'new_price' }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Confirm' },
              style: 'primary',
              value: user_id,
              action_id: 'confirm_price'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Cancel' },
              style: 'danger',
              value: user_id,
              action_id: 'cancel_price'
            }
          ]
        }
      ]
    });

    return res.status(200).send();
  } catch (err) {
    console.error('Error fetching SKU:', err.response?.data || err.message);
    return res.send('❌ Failed to find product.');
  }
});

/**
 * /findidorder - Find order by WooCommerce ID.
 */
router.post('/slack/findidorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const orderId = (text || '').trim();

  res.status(200).send(`🔍 Searching for WooCommerce order ID *${orderId}*...`);

  if (!orderId || Number.isNaN(Number(orderId))) {
    await web.chat.postMessage({ channel: channel_id, text: '❌ Please enter a valid numeric Order ID.' });
    return;
  }

  try {
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
    console.error('Error searching by WooCommerce ID:', err.response?.data || err.message);
    await web.chat.postMessage({
      channel: channel_id,
      text: `❌ No order found with WooCommerce ID: ${orderId}`
    });
  }
});

/**
 * /editorder - Provide admin edit link for an order.
 */
router.post('/slack/editorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const orderId = (text || '').trim();

  if (!orderId || Number.isNaN(Number(orderId))) return res.send('❌ Please enter a valid numeric Order ID.');

  const editUrl = `${config.adminEditUrl}${orderId}`;

  await web.chat.postMessage({
    channel: channel_id,
    text: `✏️ Edit order [#${orderId}](${editUrl})`,
    unfurl_links: false
  });

  res.status(200).send();
});

/**
 * /customermeta - Read and update custom Woo customer metadata.
 */
router.post('/slack/customermeta', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const email = (text || '').trim();

  res.status(200).send('🔍 Looking up customer metadata…');

  if (!email) {
    await web.chat.postMessage({ channel: channel_id, text: '❌ Please provide an email address.' });
    return;
  }

  try {
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
    console.error('CUSTOMERMETA ERROR:', err.response?.data || err.message);
    await web.chat.postMessage({ channel: channel_id, text: '❌ Failed to retrieve customer metadata.' });
  }
});

/**
 * /orderpdf - Search mail logs and prompt the user to generate a PDF.
 */
router.post('/slack/orderpdf', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const subjectQuery = (text || '').trim();

  res.status(200).send('🔎 Searching email logs…');

  if (!subjectQuery) {
    await web.chat.postMessage({
      channel: channel_id,
      text: '❌ Please provide a subject search (ex: `New Order #4105`).'
    });
    return;
  }

  try {
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
    console.error('ORDERPDF search failed:', err.response?.data || err.message);
    await web.chat.postMessage({ channel: channel_id, text: '❌ Failed to search email logs.' });
  }
});

/**
 * /findcustomid - Find custom order number from a WooCommerce order ID.
 */
router.post('/slack/findcustomid', async (req, res) => {
  const { text, channel_id } = req.body;
  const orderId = (text || '').trim();

  res.status(200).send(`🔍 Looking up custom order number for Woo order ID *${orderId}*...`);

  if (!orderId || Number.isNaN(Number(orderId))) {
    await web.chat.postMessage({
      channel: channel_id,
      text: '❌ Please enter a valid numeric WooCommerce Order ID.'
    });
    return;
  }

  try {
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
    console.error('FINDCUSTOMID error:', err.response?.data || err.message);
    await web.chat.postMessage({
      channel: channel_id,
      text: `❌ Could not find order ID *${orderId}* or failed to retrieve order.`
    });
  }
});

module.exports = router;
