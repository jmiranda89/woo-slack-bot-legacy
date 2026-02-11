# Woo Slack Bot V2

Slack bot that connects to WooCommerce to draft products, update prices, find orders, and generate order PDFs from mail logs.

## Features
- Draft a product by SKU with confirmation in Slack.
- Find orders by custom order number or WooCommerce order ID.
- Update product or variation price by SKU.
- Edit order link shortcut.
- Read and update customer metadata.
- Generate PDF from WooCommerce mail logs and upload to Slack.

## Requirements
- Node.js (LTS recommended)
- Slack app with slash commands + interactive components enabled
- WooCommerce REST API credentials
- WordPress plugin from this repo installed on the WooCommerce store

## Install
```bash
npm install
```

## Configure
Create a `.env` file in the project root with the following variables:

```
PORT=3000
SLACK_BOT_TOKEN=...
SLACK_SIGNING_SECRET=...
WOO_URL=https://yourstore.example
WOO_USERNAME=...
WOO_PASSWORD=...
WOO_TIMEOUT_MS=10000
SESSION_TTL_MS=900000
ADMIN_EDIT_URL=https://yourstore.example/wp-admin/admin.php?page=wc-orders&action=edit&id=
```

Notes:
- `ADMIN_EDIT_URL` is optional; the default points to the Pathway Bookstore admin edit URL.
- `WOO_URL` should be the base site URL (no trailing slash).
- `WOO_TIMEOUT_MS` controls Woo API request timeout (default: 10000).
- `SESSION_TTL_MS` controls in-memory session TTL in ms (default: 15 minutes).

## Run
```bash
npm start
```

The app listens on `http://localhost:<PORT>`.
Health check endpoint: `GET /healthz`

## Slack Endpoints
Configure these endpoints in your Slack app:

- `/slack/command` (slash command: draft product by SKU)
- `/slack/findorder` (slash command: find by custom order number)
- `/slack/priceupdate` (slash command: update price by SKU)
- `/slack/findidorder` (slash command: find by Woo ID)
- `/slack/editorder` (slash command: admin edit link)
- `/slack/editorderstatus` (slash command: inspect order/payment details and change status)
- `/slack/customermeta` (slash command: customer metadata)
- `/slack/orderpdf` (slash command: search mail logs and generate PDF)
- `/slack/interact` (interactive actions endpoint)

## WordPress Plugin
This repo includes a reusable WordPress plugin at:

- `/Users/jmiranda89/GitHub/woo-slack-bot-legacy/WordpressPlugin/woo-slack-store-tools`

Main plugin file:

- `/Users/jmiranda89/GitHub/woo-slack-bot-legacy/WordpressPlugin/woo-slack-store-tools/Woo Slack Store Tools.php`

What it provides:

- Mail log REST endpoints used by `/slack/orderpdf`:
  - `GET /wp-json/wc/v3/mail-log/search`
  - `GET /wp-json/wc/v3/mail-log/{id}`
- Woo admin order search support for `_alg_wc_custom_order_number`
- New order email output with both Woo ID and custom order number
- REST-enabled user meta fields: `customer_code`, `customer_class`

Install on a store:

1. Copy `woo-slack-store-tools` into `wp-content/plugins/`.
2. Activate **Woo Slack Store Tools** in WordPress admin.
3. Ensure WooCommerce is active.
4. Ensure WP Mail Logging table `wpml_mails` exists for mail log endpoints.

Build a zip for distribution:

```bash
/Users/jmiranda89/GitHub/woo-slack-bot-legacy/WordpressPlugin/woo-slack-store-tools/build-plugin-zip.sh
```

## Project Structure
```
src/
  clients/
    slack.js         Slack Web API client
  config/
    index.js         Environment configuration
  routes/
    commands.js      Slash command router composition
    commands/
      products.js    Product command handlers
      orders.js      Order command handlers
      customers.js   Customer metadata handlers
      pdf.js         PDF command handlers
    interactions.js  Interactive action handlers
  middleware/
    slackAuth.js     Slack request signature verification
  services/
    pdf.js           HTML -> PDF conversion
    woo.js           WooCommerce API helpers
  store/
    sessions.js      In-memory session store
  index.js           App entrypoint
app.js               Legacy entrypoint (shim)
```

## Notes
- All `/slack/*` requests are verified using Slack signing secret.
- Sessions are stored in memory with TTL and are cleared on process restart.
- The WooCommerce API calls use Basic Auth from `.env` credentials with request timeouts.
