'use strict';

/**
 * In-memory session store keyed by Slack user ID.
 * Keeps state across multi-step Slack interactions.
 */
const sessions = new Map();

function getSession(userId) {
  return sessions.get(userId);
}

function hasSession(userId) {
  return sessions.has(userId);
}

function setSession(userId, value) {
  sessions.set(userId, value);
  return value;
}

function updateSession(userId, patch) {
  const current = sessions.get(userId) || {};
  const next = { ...current, ...patch };
  sessions.set(userId, next);
  return next;
}

function deleteSession(userId) {
  sessions.delete(userId);
}

module.exports = {
  getSession,
  hasSession,
  setSession,
  updateSession,
  deleteSession
};
