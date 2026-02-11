<?php
/**
 * Plugin Name: Woo Slack Store Tools
 * Description: Combined Woo Slack utilities: mail log REST API, Woo order search by custom number, order ID email details, and customer meta registration.
 * Version: 2.0.0
 * Author: Jonathan Miranda
 */

if (!defined('ABSPATH')) {
	exit;
}

add_action('rest_api_init', 'woo_slack_store_tools_register_routes');
add_action('pre_get_posts', 'woo_slack_store_tools_extend_order_search', 10, 1);
add_action('woocommerce_email_order_details', 'woo_slack_store_tools_add_order_ids_to_new_order_email', 9, 4);
add_action('init', 'woo_slack_store_tools_register_user_meta');

function woo_slack_store_tools_can_manage_woo() {
	return current_user_can('manage_woocommerce');
}

function woo_slack_store_tools_register_routes() {
	register_rest_route('wc/v3', '/mail-log/search', [
		'methods'             => 'GET',
		'permission_callback' => 'woo_slack_store_tools_can_manage_woo',
		'callback'            => 'woo_slack_store_tools_mail_search',
		'args'                => [
			'subject' => ['required' => true],
			'limit'   => ['required' => false],
			'days'    => ['required' => false],
		],
	]);

	register_rest_route('wc/v3', '/mail-log/(?P<id>\d+)', [
		'methods'             => 'GET',
		'permission_callback' => 'woo_slack_store_tools_can_manage_woo',
		'callback'            => 'woo_slack_store_tools_mail_get',
	]);
}

function woo_slack_store_tools_mail_search($request) {
	global $wpdb;

	$table_name = $wpdb->prefix . 'wpml_mails';
	$subject    = sanitize_text_field($request->get_param('subject'));
	$limit      = min(25, max(1, intval($request->get_param('limit') ?: 10)));
	$days       = min(365, max(1, intval($request->get_param('days') ?: 30)));
	$since      = gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS));

	if (empty($subject)) {
		return new WP_Error('invalid_subject', 'Subject is required', ['status' => 400]);
	}

	$sql = $wpdb->prepare(
		"SELECT mail_id, subject, receiver, timestamp
		 FROM {$table_name}
		 WHERE subject LIKE %s
		   AND timestamp >= %s
		 ORDER BY timestamp DESC
		 LIMIT %d",
		'%' . $wpdb->esc_like($subject) . '%',
		$since,
		$limit
	);

	$results = $wpdb->get_results($sql, ARRAY_A);

	return rest_ensure_response([
		'count'   => count($results),
		'results' => $results,
	]);
}

function woo_slack_store_tools_mail_get($request) {
	global $wpdb;

	$table_name = $wpdb->prefix . 'wpml_mails';
	$id         = intval($request['id']);

	$sql = $wpdb->prepare(
		"SELECT mail_id, subject, receiver, timestamp, message, headers
		 FROM {$table_name}
		 WHERE mail_id = %d
		 LIMIT 1",
		$id
	);

	$row = $wpdb->get_row($sql, ARRAY_A);

	if (!$row) {
		return new WP_Error('not_found', 'Mail log not found', ['status' => 404]);
	}

	return rest_ensure_response([
		'mail_id'   => $row['mail_id'],
		'subject'   => $row['subject'],
		'to'        => $row['receiver'],
		'timestamp' => $row['timestamp'],
		'html'      => $row['message'],
	]);
}

function woo_slack_store_tools_extend_order_search($query) {
	global $pagenow, $wpdb;

	if (
		!is_admin() ||
		$pagenow !== 'edit.php' ||
		!$query->is_main_query() ||
		!isset($_GET['s'], $_GET['post_type']) ||
		$_GET['post_type'] !== 'shop_order'
	) {
		return;
	}

	$search_term = sanitize_text_field(wp_unslash($_GET['s']));
	if ($search_term === '') {
		return;
	}

	$custom_order_ids = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT post_id
			 FROM {$wpdb->postmeta}
			 WHERE meta_key = %s
			   AND meta_value LIKE %s",
			'_alg_wc_custom_order_number',
			'%' . $wpdb->esc_like($search_term) . '%'
		)
	);

	if (empty($custom_order_ids)) {
		return;
	}

	$existing_post_in = $query->get('post__in');
	$existing_post_in = is_array($existing_post_in) ? $existing_post_in : [];
	$combined_post_in = array_unique(array_map('intval', array_merge($existing_post_in, $custom_order_ids)));

	$query->set('post__in', $combined_post_in);
}

function woo_slack_store_tools_add_order_ids_to_new_order_email($order, $sent_to_admin, $plain_text, $email) {
	if (!$email || $email->id !== 'new_order') {
		return;
	}

	$real_id   = $order->get_id();
	$custom_id = get_post_meta($real_id, '_alg_wc_custom_order_number', true);

	if ($plain_text) {
		echo "Web Order ID: #" . $real_id . "\n";
		echo "Pathway Order #: " . $custom_id . "\n";
		return;
	}

	echo '<p><strong>Web Order ID:</strong> #' . esc_html($real_id) . '</p>';
	echo '<p><strong>Pathway Order #:</strong> ' . esc_html($custom_id) . '</p>';
}

function woo_slack_store_tools_register_user_meta() {
	register_meta('user', 'customer_code', [
		'type'          => 'string',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => 'woo_slack_store_tools_can_manage_woo',
	]);

	register_meta('user', 'customer_class', [
		'type'          => 'string',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => 'woo_slack_store_tools_can_manage_woo',
	]);
}
