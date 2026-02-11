=== Woo Slack Store Tools ===
Contributors: jmiranda
Tags: woocommerce, rest-api, email, orders
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Combined Woo Slack utilities for WooCommerce stores:
- Mail log REST API endpoints for Slack integrations
- Admin order search by custom order number
- New order email details with both internal and custom order IDs
- Woo customer meta registration in REST

== Description ==
Woo Slack Store Tools bundles custom WooCommerce store behavior into one reusable plugin.

Features included:
1. REST API route to search mail logs: `/wc/v3/mail-log/search`
2. REST API route to fetch a mail log item: `/wc/v3/mail-log/{id}`
3. WooCommerce admin order search support for `_alg_wc_custom_order_number`
4. Additional order IDs in WooCommerce "New order" email output
5. User meta registration (`customer_code`, `customer_class`) with REST support

== Installation ==
1. Upload the `woo-slack-store-tools` folder to `/wp-content/plugins/`.
2. Activate the plugin through the WordPress Plugins screen.
3. Ensure WooCommerce is active.
4. Ensure WP Mail Logging plugin/table (`wpml_mails`) exists if using mail log endpoints.

== Frequently Asked Questions ==
= Who can access the REST routes? =
Only users with `manage_woocommerce` capability.

= Does this plugin require WooCommerce? =
Yes, for intended behavior and capability checks.

== Changelog ==
= 2.0.0 =
* Combined standalone mail-log plugin logic and theme snippets into one plugin.
* Added reusable packaging/docs files for cross-store use.
