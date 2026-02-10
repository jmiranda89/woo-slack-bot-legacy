require('dotenv').config(); // Load .env variables

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { WebClient } = require('@slack/web-api');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const slackToken = process.env.SLACK_BOT_TOKEN;
const web = new WebClient(slackToken);

// WooCommerce credentials (securely loaded from .env)
const woo = {
  url: process.env.WOO_URL,
  username: process.env.WOO_USERNAME,
  password: process.env.WOO_PASSWORD
};

const sessions = {}; // Temporary session store for Slack interactions (keyed by Slack user ID)

function getWooAuthHeaders() {
  const token = Buffer.from(`${woo.username}:${woo.password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
    });
  } finally {
    await browser.close();
  }
}

// --- /draftproduct ---
app.post('/slack/command', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const sku = (text || '').trim();

  if (!sku) return res.send("❌ Please provide a SKU.");

  try {
    const response = await axios.get(`${woo.url}/wp-json/wc/v3/products`, {
      headers: getWooAuthHeaders(),
      params: { sku }
    });

    if (!response.data.length) return res.send(`❌ No product found with SKU: ${sku}`);

    const product = response.data[0];

    sessions[user_id] = {
      ...(sessions[user_id] || {}),
      productId: product.id,
      productName: product.name
    };

    await web.chat.postMessage({
      channel: channel_id,
      text: `Is this the correct product to draft?\n*${product.name}* ($${product.price})`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Product:* ${product.name}\n*Price:* $${product.price}` }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Yes" },
              style: "primary",
              value: user_id,
              action_id: "confirm_draft"
            },
            {
              type: "button",
              text: { type: "plain_text", text: "❌ No" },
              style: "danger",
              value: user_id,
              action_id: "cancel_draft"
            }
          ]
        }
      ]
    });

    return res.status(200).send();
  } catch (err) {
    console.error('Error fetching product:', err.response?.data || err.message);
    return res.send("❌ Error retrieving product.");
  }
});

// --- /findorder ---
app.post('/slack/findorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const customOrderNumber = (text || '').trim();

  res.status(200).send(`🔍 Searching for order *${customOrderNumber}*...`);

  if (!customOrderNumber) {
    await web.chat.postMessage({ channel: channel_id, text: "❌ Please provide an order number." });
    return;
  }

  try {
    let matchedOrder = null;

    for (let page = 1; page <= 3; page++) {
      const response = await axios.get(`${woo.url}/wp-json/wc/v3/orders`, {
        headers: getWooAuthHeaders(),
        params: { per_page: 100, page, orderby: 'date', order: 'desc' }
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
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Order ID:* ${matchedOrder.id}\n*Customer:* ${customerName}\n*Email:* ${customerEmail}\n*User ID:* ${customerId}`
          }
        }
      ]
    });
  } catch (err) {
    console.error("Error searching orders:", err.response?.data || err.message);
    await web.chat.postMessage({
      channel: channel_id,
      text: "❌ Failed to retrieve order due to an error."
    });
  }
});

// --- /priceupdate ---
app.post('/slack/priceupdate', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const sku = (text || '').trim();

  if (!sku) return res.send("❌ Please provide a SKU.");

  try {
    const response = await axios.get(`${woo.url}/wp-json/wc/v3/products`, {
      headers: getWooAuthHeaders(),
      params: { sku }
    });

    if (!response.data.length) return res.send(`❌ No product found with SKU: ${sku}`);

    let product = response.data[0];
    let variant = null;

    if (product.type === 'variable') {
      const variationsRes = await axios.get(`${woo.url}/wp-json/wc/v3/products/${product.id}/variations`, {
        headers: getWooAuthHeaders()
      });
      variant = variationsRes.data.find(v => v.sku === sku);
      if (!variant) return res.send(`❌ No matching variation found with SKU: ${sku}`);
    }

    const currentPrice = variant ? variant.price : product.price;

    sessions[user_id] = {
      ...(sessions[user_id] || {}),
      sku,
      productId: product.id,
      variationId: variant?.id || null,
      isVariation: !!variant,
      originalPrice: currentPrice
    };

    await web.chat.postMessage({
      channel: channel_id,
      text: `Current price for *${sku}* is $${currentPrice}.`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*SKU:* ${sku}\n*Current Price:* $${currentPrice}` } },
        {
          type: "input",
          block_id: "new_price_input",
          label: { type: "plain_text", text: "Enter new price" },
          element: { type: "plain_text_input", action_id: "new_price" }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Confirm" },
              style: "primary",
              value: user_id,
              action_id: "confirm_price"
            },
            {
              type: "button",
              text: { type: "plain_text", text: "❌ Cancel" },
              style: "danger",
              value: user_id,
              action_id: "cancel_price"
            }
          ]
        }
      ]
    });

    return res.status(200).send();
  } catch (err) {
    console.error("Error fetching SKU:", err.response?.data || err.message);
    return res.send("❌ Failed to find product.");
  }
});

// --- /findidorder ---
app.post('/slack/findidorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const orderId = (text || '').trim();

  res.status(200).send(`🔍 Searching for WooCommerce order ID *${orderId}*...`);

  if (!orderId || isNaN(orderId)) {
    await web.chat.postMessage({ channel: channel_id, text: "❌ Please enter a valid numeric Order ID." });
    return;
  }

  try {
    const response = await axios.get(`${woo.url}/wp-json/wc/v3/orders/${orderId}`, {
      headers: getWooAuthHeaders()
    });

    const matchedOrder = response.data;
    const customerName = `${matchedOrder.billing.first_name} ${matchedOrder.billing.last_name}`;
    const customerEmail = matchedOrder.billing.email;
    const customerId = matchedOrder.customer_id;

    await web.chat.postMessage({
      channel: channel_id,
      text: `📦 Order found with WooCommerce ID *${orderId}*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Order ID:* ${matchedOrder.id}\n*Customer:* ${customerName}\n*Email:* ${customerEmail}\n*User ID:* ${customerId}`
          }
        }
      ]
    });
  } catch (err) {
    console.error("Error searching by WooCommerce ID:", err.response?.data || err.message);
    await web.chat.postMessage({
      channel: channel_id,
      text: `❌ No order found with WooCommerce ID: ${orderId}`
    });
  }
});

// --- /editorder ---
app.post('/slack/editorder', async (req, res) => {
  const { text, channel_id } = req.body;
  const orderId = (text || '').trim();

  if (!orderId || isNaN(orderId)) return res.send("❌ Please enter a valid numeric Order ID.");

  const editUrl = `${process.env.ADMIN_EDIT_URL || 'https://www.pathwaybookstore.com/wp-admin/admin.php?page=wc-orders&action=edit&id='}${orderId}`;

  await web.chat.postMessage({
    channel: channel_id,
    text: `✏️ Edit order [#${orderId}](${editUrl})`,
    unfurl_links: false
  });

  res.status(200).send();
});

// --- /customermeta (Woo Customers API only) ---
app.post('/slack/customermeta', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const email = (text || '').trim();

  res.status(200).send('🔍 Looking up customer metadata…');

  if (!email) {
    await web.chat.postMessage({ channel: channel_id, text: "❌ Please provide an email address." });
    return;
  }

  try {
    const customersRes = await axios.get(`${woo.url}/wp-json/wc/v3/customers`, {
      headers: getWooAuthHeaders(),
      params: { email, per_page: 1 }
    });

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

    sessions[user_id] = {
      ...(sessions[user_id] || {}),
      customerId,
      email
    };

    await web.chat.postMessage({
      channel: channel_id,
      text: `Customer metadata loaded for ${email}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Customer ID:* ${customerId}\n` +
              `*Customer Code:* ${customerCode || '_empty_'}\n` +
              `*Customer Class:* ${customerClass || '_empty_'}`
          }
        },
        {
          type: "input",
          block_id: "customer_code_block",
          label: { type: "plain_text", text: "Customer Code" },
          element: { type: "plain_text_input", action_id: "customer_code", initial_value: String(customerCode ?? '') }
        },
        {
          type: "input",
          block_id: "customer_class_block",
          label: { type: "plain_text", text: "Customer Class" },
          element: { type: "plain_text_input", action_id: "customer_class", initial_value: String(customerClass ?? '') }
        },
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "💾 Save" }, style: "primary", value: user_id, action_id: "save_customer_meta" },
            { type: "button", text: { type: "plain_text", text: "❌ Cancel" }, style: "danger", value: user_id, action_id: "cancel_customer_meta" }
          ]
        }
      ]
    });
  } catch (err) {
    console.error('CUSTOMERMETA ERROR:', err.response?.data || err.message);
    await web.chat.postMessage({ channel: channel_id, text: "❌ Failed to retrieve customer metadata." });
  }
});

// --- /orderpdf ---
// Slack usage example: /orderpdf New Order #4105
app.post('/slack/orderpdf', async (req, res) => {
  const { text, user_id, channel_id } = req.body;
  const subjectQuery = (text || '').trim();

  res.status(200).send('🔎 Searching email logs…');

  if (!subjectQuery) {
    await web.chat.postMessage({
      channel: channel_id,
      text: "❌ Please provide a subject search (ex: `New Order #4105`)."
    });
    return;
  }

  try {
    const searchRes = await axios.get(`${woo.url}/wp-json/wc/v3/mail-log/search`, {
      headers: getWooAuthHeaders(),
      params: { subject: subjectQuery, limit: 10, days: 30 }
    });

    const results = searchRes.data?.results || [];
    if (!results.length) {
      await web.chat.postMessage({
        channel: channel_id,
        text: `❌ No email logs found matching subject: *${subjectQuery}*`
      });
      return;
    }

    sessions[user_id] = {
      ...(sessions[user_id] || {}),
      orderPdf: { query: subjectQuery }
    };

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📨 Found *${results.length}* email log(s) matching:\n*${subjectQuery}*\n\nSelect one to generate a PDF:`
        }
      },
      ...results.slice(0, 10).map((row) => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${row.subject}*\n*To:* ${row.receiver}\n*Date:* ${row.timestamp}\n*Mail ID:* ${row.mail_id}`
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "📄 Generate PDF" },
          style: "primary",
          value: `${user_id}|${row.mail_id}`,
          action_id: "orderpdf_generate"
        }
      }))
    ];

    await web.chat.postMessage({
      channel: channel_id,
      text: `Email logs found for ${subjectQuery}`,
      blocks
    });
  } catch (err) {
    console.error("ORDERPDF search failed:", err.response?.data || err.message);
    await web.chat.postMessage({ channel: channel_id, text: "❌ Failed to search email logs." });
  }
});

// --- Combined /slack/interact for all buttons ---
app.post('/slack/interact', bodyParser.urlencoded({ extended: true }), async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const action = payload.actions[0];
  const slackUserId = payload.user?.id; // ✅ authoritative Slack user id
  const channel = payload.channel.id;

  res.status(200).send(); // Acknowledge immediately

  // --- Order PDF (does NOT require session) ---
  if (action.action_id === 'orderpdf_generate') {
    try {
      const parts = (action.value || '').split('|');
      const mailIdStr = parts.length > 1 ? parts[1] : parts[0];
      const mailId = parseInt(mailIdStr, 10);

      if (!mailId || isNaN(mailId)) {
        await web.chat.postMessage({ channel, text: "❌ Invalid mail log selection." });
        return;
      }

      await web.chat.postMessage({ channel, text: `🛠 Generating PDF for mail log ID *${mailId}*...` });

      const mailRes = await axios.get(`${woo.url}/wp-json/wc/v3/mail-log/${mailId}`, {
        headers: getWooAuthHeaders()
      });

      const html = mailRes.data?.html;
      const subject = mailRes.data?.subject || `mail-${mailId}`;

      if (!html) {
        await web.chat.postMessage({ channel, text: "❌ No HTML content found for that log." });
        return;
      }

      const pdfBuffer = await htmlToPdfBuffer(html);
      const safeName = subject.replace(/[^\w\- ]+/g, '').slice(0, 60).trim() || `mail-${mailId}`;
      const filename = `${safeName}.pdf`;

      await web.files.upload({
        channels: channel,
        file: pdfBuffer,
        filename,
        filetype: 'pdf',
        title: filename
      });

      await web.chat.postMessage({ channel, text: `✅ PDF uploaded: *${filename}*` });
      return;
    } catch (err) {
      console.error("ORDERPDF generation failed:", err.response?.data || err.message);
      await web.chat.postMessage({ channel, text: "❌ Failed to generate/upload PDF." });
      return;
    }
  }

  // Everything below requires a session
  if (!slackUserId || !sessions[slackUserId]) {
    await web.chat.postMessage({ channel, text: "❌ No session found." });
    return;
  }

  // --- Customer Meta ---
  if (action.action_id === 'cancel_customer_meta') {
    delete sessions[slackUserId];
    await web.chat.postMessage({ channel, text: "❌ Customer meta update canceled." });
    return;
  }

  if (action.action_id === 'save_customer_meta') {
    try {
      const state = payload.state.values;
      const customerCode = state.customer_code_block?.customer_code?.value || '';
      const customerClass = state.customer_class_block?.customer_class?.value || '';

      const session = sessions[slackUserId];
      if (!session?.customerId) {
        await web.chat.postMessage({ channel, text: "❌ Session expired." });
        return;
      }

      await axios.put(
        `${woo.url}/wp-json/wc/v3/customers/${session.customerId}`,
        {
          meta_data: [
            { key: 'customer_code', value: customerCode },
            { key: 'customer_class', value: customerClass }
          ]
        },
        { headers: getWooAuthHeaders() }
      );

      await web.chat.postMessage({
        channel,
        text:
          `✅ Customer metadata updated:\n` +
          `*Customer Code:* ${customerCode || '_empty_'}\n` +
          `*Customer Class:* ${customerClass || '_empty_'}`
      });

      delete sessions[slackUserId];
      return;
    } catch (err) {
      console.error("Save customer meta failed:", err.response?.data || err.message);
      await web.chat.postMessage({ channel, text: "❌ Failed to save customer metadata." });
      return;
    }
  }

  // --- Draft Product ---
  if (action.action_id === 'confirm_draft') {
    const { productId, productName } = sessions[slackUserId];
    try {
      await axios.put(
        `${woo.url}/wp-json/wc/v3/products/${productId}`,
        { status: 'draft' },
        { headers: getWooAuthHeaders() }
      );

      await web.chat.postMessage({ channel, text: `✅ *${productName}* has been removed successfully.` });
    } catch (err) {
      console.error('Error drafting product:', err.response?.data || err.message);
      await web.chat.postMessage({ channel, text: "❌ Failed to remove product." });
    }

    delete sessions[slackUserId];
    return;
  }

  if (action.action_id === 'cancel_draft') {
    delete sessions[slackUserId];
    await web.chat.postMessage({ channel, text: `❌ Removal canceled.` });
    return;
  }

  // --- Price Update ---
  if (action.action_id === 'cancel_price') {
    delete sessions[slackUserId];
    await web.chat.postMessage({ channel, text: `❌ Price update canceled.` });
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

      if (isNaN(newPrice)) {
        await web.chat.postMessage({ channel, text: "❌ Invalid price entered." });
        return;
      }

      const session = sessions[slackUserId];
      const { productId, variationId, isVariation } = session;

      const endpoint = isVariation
        ? `${woo.url}/wp-json/wc/v3/products/${productId}/variations/${variationId}`
        : `${woo.url}/wp-json/wc/v3/products/${productId}`;

      await axios.put(endpoint, { regular_price: newPrice.toString() }, { headers: getWooAuthHeaders() });

      await web.chat.postMessage({
        channel,
        text: `✅ Price for *${session.sku}* updated to $${newPrice.toFixed(2)}.`
      });

      delete sessions[slackUserId];
      return;
    } catch (err) {
      console.error("Price update failed:", err.response?.data || err.message);
      await web.chat.postMessage({ channel, text: "❌ Price update failed." });
      return;
    }
  }
});

app.listen(port, () => {
  console.log(`🚀 Slack bot is running on http://localhost:${port}`);
});
