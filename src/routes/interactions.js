'use strict';

const express = require('express');
const { web } = require('../clients/slack');
const { htmlToPdfBuffer } = require('../services/pdf');
const { wooGet, wooPut } = require('../services/woo');
const { getSession, hasSession, deleteSession } = require('../store/sessions');

const router = express.Router();

/**
 * /slack/interact - single endpoint for all interactive Slack actions.
 * Uses the stored session to complete multi-step workflows.
 */
router.post('/slack/interact', async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.payload);
  } catch (err) {
    return res.status(400).send('Invalid payload');
  }

  const action = payload.actions?.[0];
  if (!action?.action_id) {
    return res.status(400).send('Invalid action');
  }

  const slackUserId = payload.user?.id; // authoritative Slack user id
  const channel = payload.channel?.id;

  if (!channel) {
    return res.status(400).send('Invalid channel');
  }

  res.status(200).send(); // Acknowledge immediately

  // --- Order PDF (does NOT require session) ---
  if (action.action_id === 'orderpdf_generate') {
    try {
      const parts = (action.value || '').split('|');
      const expectedUserId = parts.length > 1 ? parts[0] : null;
      const mailIdStr = parts.length > 1 ? parts[1] : parts[0];
      const mailId = parseInt(mailIdStr, 10);

      if (expectedUserId && expectedUserId !== slackUserId) {
        await web.chat.postMessage({ channel, text: '❌ This button can only be used by the original requester.' });
        return;
      }

      if (!mailId || Number.isNaN(mailId)) {
        await web.chat.postMessage({ channel, text: '❌ Invalid mail log selection.' });
        return;
      }

      await web.chat.postMessage({ channel, text: `🛠 Generating PDF for mail log ID *${mailId}*...` });

      const mailRes = await wooGet(`/mail-log/${mailId}`);

      const html = mailRes.data?.html;
      const subject = mailRes.data?.subject || `mail-${mailId}`;

      if (!html) {
        await web.chat.postMessage({ channel, text: '❌ No HTML content found for that log.' });
        return;
      }

      const pdfBuffer = await htmlToPdfBuffer(html);
      const safeName = subject.replace(/[^\w\- ]+/g, '').slice(0, 60).trim() || `mail-${mailId}`;
      const filename = `${safeName}.pdf`;

      await web.files.uploadV2({
        channel_id: channel,
        filename,
        title: filename,
        file: pdfBuffer
      });

      await web.chat.postMessage({ channel, text: `✅ PDF uploaded: *${filename}*` });
      return;
    } catch (err) {
      console.error('ORDERPDF generation failed:', err.message);
      await web.chat.postMessage({ channel, text: '❌ Failed to generate/upload PDF.' });
      return;
    }
  }

  if (action.action_id === 'edit_order_status') {
    try {
      const parts = (action.value || '').split('|');
      const expectedUserId = parts[0];
      const orderId = parts[1];
      const targetStatusRaw = parts[2];
      const targetStatus = String(targetStatusRaw || '')
        .trim()
        .toLowerCase();

      if (!expectedUserId || expectedUserId !== slackUserId) {
        await web.chat.postMessage({ channel, text: '❌ This button can only be used by the original requester.' });
        return;
      }

      if (!orderId || Number.isNaN(Number(orderId)) || !targetStatus) {
        await web.chat.postMessage({ channel, text: '❌ Invalid status update request.' });
        return;
      }

      const currentRes = await wooGet(`/orders/${orderId}`);
      const currentStatus = String(currentRes.data?.status || '')
        .trim()
        .toLowerCase();

      if (currentStatus === targetStatus) {
        await web.chat.postMessage({
          channel,
          text: `ℹ️ Order *${orderId}* is already in *${targetStatus}* status.`
        });
        return;
      }

      await wooPut(`/orders/${orderId}`, { status: targetStatus });

      await web.chat.postMessage({
        channel,
        text: `✅ Order *${orderId}* status changed from *${currentStatus || 'unknown'}* to *${targetStatus}*.`
      });
      return;
    } catch (err) {
      console.error('Edit order status failed:', err.message);
      await web.chat.postMessage({ channel, text: '❌ Failed to update order status.' });
      return;
    }
  }

  // Everything below requires a session
  if (!slackUserId || !hasSession(slackUserId)) {
    await web.chat.postMessage({ channel, text: '❌ No session found.' });
    return;
  }

  // --- Customer Meta ---
  if (action.action_id === 'cancel_customer_meta') {
    deleteSession(slackUserId);
    await web.chat.postMessage({ channel, text: '❌ Customer meta update canceled.' });
    return;
  }

  if (action.action_id === 'save_customer_meta') {
    try {
      const state = payload.state.values;
      const customerCode = state.customer_code_block?.customer_code?.value || '';
      const customerClass = state.customer_class_block?.customer_class?.value || '';

      const session = getSession(slackUserId);
      if (!session?.customerId) {
        await web.chat.postMessage({ channel, text: '❌ Session expired.' });
        return;
      }

      await wooPut(`/customers/${session.customerId}`, {
        meta_data: [
          { key: 'customer_code', value: customerCode },
          { key: 'customer_class', value: customerClass }
        ]
      });

      await web.chat.postMessage({
        channel,
        text:
          `✅ Customer metadata updated:\n` +
          `*Customer Code:* ${customerCode || '_empty_'}\n` +
          `*Customer Class:* ${customerClass || '_empty_'}`
      });

      deleteSession(slackUserId);
      return;
    } catch (err) {
      console.error('Save customer meta failed:', err.message);
      await web.chat.postMessage({ channel, text: '❌ Failed to save customer metadata.' });
      return;
    }
  }

  // --- Draft Product ---
  if (action.action_id === 'confirm_draft') {
    const { productId, productName } = getSession(slackUserId);
    try {
      await wooPut(`/products/${productId}`, { status: 'draft' });

      await web.chat.postMessage({ channel, text: `✅ *${productName}* has been removed successfully.` });
    } catch (err) {
      console.error('Error drafting product:', err.message);
      await web.chat.postMessage({ channel, text: '❌ Failed to remove product.' });
    }

    deleteSession(slackUserId);
    return;
  }

  if (action.action_id === 'cancel_draft') {
    deleteSession(slackUserId);
    await web.chat.postMessage({ channel, text: '❌ Removal canceled.' });
    return;
  }

  // --- Price Update ---
  if (action.action_id === 'cancel_price') {
    deleteSession(slackUserId);
    await web.chat.postMessage({ channel, text: '❌ Price update canceled.' });
    return;
  }

  if (action.action_id === 'confirm_price') {
    const state = payload.state.values;
    let newPrice = null;

    try {
      for (const block of Object.values(state)) {
        const input = Object.values(block)[0];
        if (input && input.value) {
          newPrice = parseFloat(input.value);
          break;
        }
      }

      if (Number.isNaN(newPrice)) {
        await web.chat.postMessage({ channel, text: '❌ Invalid price entered.' });
        return;
      }

      const session = getSession(slackUserId);
      const { productId, variationId, isVariation } = session;

      const endpoint = isVariation
        ? `/products/${productId}/variations/${variationId}`
        : `/products/${productId}`;

      await wooPut(endpoint, { regular_price: newPrice.toString() });

      await web.chat.postMessage({
        channel,
        text: `✅ Price for *${session.sku}* updated to $${newPrice.toFixed(2)}.`
      });

      deleteSession(slackUserId);
      return;
    } catch (err) {
      console.error('Price update failed:', err.message);
      await web.chat.postMessage({ channel, text: '❌ Price update failed.' });
      return;
    }
  }

  await web.chat.postMessage({ channel, text: '⚠️ Unsupported action.' });
});

module.exports = router;
