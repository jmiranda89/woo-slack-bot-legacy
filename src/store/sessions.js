'use strict';

const config = require('../config');

/**
 * In-memory session store keyed by Slack user ID.
 * Keeps state across multi-step Slack interactions.
 */
const sessions = new Map();

function now() {
  return Date.now();
}

function ttlExpiry() {
  return now() + config.sessionTtlMs;
}

function unwrap(userId) {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    sessions.delete(userId);
    return null;
  }
  return entry;
}

function getSession(userId) {
  const entry = unwrap(userId);
  if (!entry) return undefined;
  return entry.data;
}

function hasSession(userId) {
  return Boolean(unwrap(userId));
}

function setSession(userId, value) {
  sessions.set(userId, { data: value, expiresAt: ttlExpiry() });
  return value;
}

function updateSession(userId, patch) {
  const current = getSession(userId) || {};
  const next = { ...current, ...patch };
  sessions.set(userId, { data: next, expiresAt: ttlExpiry() });
  return next;
}

function deleteSession(userId) {
  sessions.delete(userId);
}

setInterval(() => {
  const ts = now();
  for (const [userId, entry] of sessions.entries()) {
    if (entry.expiresAt <= ts) {
      sessions.delete(userId);
    }
  }
}, Math.max(60 * 1000, Math.floor(config.sessionTtlMs / 2))).unref();

module.exports = {
  getSession,
  hasSession,
  setSession,
  updateSession,
  deleteSession
};
