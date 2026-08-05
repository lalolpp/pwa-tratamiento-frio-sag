import { getCurrentUser, isUnlocked } from './localAuth.js';

export function requireAuth(callback) {
  if (!isUnlocked()) {
    window.location.hash = '#/login';
    return null;
  }
  callback(getCurrentUser());
  return null;
}
