import { auth } from '../config/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

export function requireAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.hash = '#/login';
      return;
    }
    callback(user);
  });
}

export function getCurrentUser() {
  return auth.currentUser;
}
