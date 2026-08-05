import * as local from './localStore.js';
import { INITIAL_PROTOCOLS } from '../config/sagData.js';

const EVALUATIONS = 'evaluations';
const CHAMBERS = 'chambers';
const PROTOCOLS = 'protocolos_sag';

export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

export function stableProtocolId(protocol) {
  const s = `${protocol.pais}|${protocol.producto}|${protocol.familia || ''}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return 'proto_' + Math.abs(h).toString(36);
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
}

export function timestampToMs(value) {
  if (value == null) return null;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return isNaN(t) ? null : t;
  }
  return null;
}

export function toDisplayDate(value) {
  const ms = timestampToMs(value);
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleDateString('es-CL');
  } catch {
    return '-';
  }
}

let seedingPromise = null;

function seedLocalProtocols() {
  if (!seedingPromise) {
    seedingPromise = (async () => {
      const existing = await local.getAll(PROTOCOLS);
      if (existing.length > 0) return;
      for (const p of INITIAL_PROTOCOLS) {
        const now = Date.now();
        await local.upsert(PROTOCOLS, {
          ...p,
          id: stableProtocolId(p),
          createdAt: now,
          updatedAt: now,
          _updatedAt: now,
        });
      }
    })().catch((err) => {
      seedingPromise = null;
      throw err;
    });
  }
  return seedingPromise;
}

export async function syncAll() {
  await seedLocalProtocols();
}

export function initOffline() {
  seedLocalProtocols().catch(() => {});
}

export async function saveDocument(collection, data) {
  const id = data.id || genId();
  const now = Date.now();
  const record = {
    ...data,
    id,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    _updatedAt: now,
  };
  await local.upsert(collection, record);
  return id;
}

export async function saveEvaluation(user, payload) {
  return saveDocument(EVALUATIONS, {
    ...payload,
    userId: user.uid,
    userEmail: user.email,
    status: 'completada',
  });
}

export async function saveChamber(user, chamberData) {
  return saveDocument(CHAMBERS, { ...chamberData, createdBy: user.email });
}

export async function updateDocument(collection, id, updates) {
  const record = await local.get(collection, id);
  const merged = { ...(record || {}), ...updates, id, updatedAt: Date.now(), _updatedAt: Date.now() };
  delete merged._pending;
  await local.upsert(collection, merged);
}

export async function deleteDocument(collection, id) {
  await local.remove(collection, id);
}

export const offlineCollections = { EVALUATIONS, CHAMBERS, PROTOCOLS };
