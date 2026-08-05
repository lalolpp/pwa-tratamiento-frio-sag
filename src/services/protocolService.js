import * as local from './localStore.js';
import {
  updateDocument, deleteDocument, saveDocument, offlineCollections, stableProtocolId,
} from './offlineService.js';

const COLLECTION = offlineCollections.PROTOCOLS;

async function ensureSeeded() {
  const all = await local.getAll(COLLECTION);
  if (all.length > 0) return all;
  const { INITIAL_PROTOCOLS } = await import('../config/sagData.js');
  const now = Date.now();
  const seeded = INITIAL_PROTOCOLS.map(p => ({
    ...p,
    id: stableProtocolId(p),
    createdAt: now,
    updatedAt: now,
    _updatedAt: now,
  }));
  for (const rec of seeded) {
    await local.upsert(COLLECTION, rec);
  }
  return seeded;
}

export async function getAllProtocols() {
  const all = await ensureSeeded();
  return all.map(({ id, _updatedAt, ...rest }) => ({ id, ...rest }));
}

export async function getProtocolById(id) {
  const rec = await local.get(COLLECTION, id);
  if (!rec) return null;
  const { id: docId, _updatedAt, ...rest } = rec;
  return { id: docId, ...rest };
}

export async function getProtocolsByCountry(country) {
  const all = await getAllProtocols();
  return all.filter(p => p.pais === country);
}

export async function findProtocolByCombination(pais, producto, variedad) {
  const all = await getAllProtocols();
  return all.find(p =>
    p.pais === pais && p.producto === producto && p.vigente !== false &&
    (p.variedades?.includes(variedad) || !p.variedades?.length || !variedad)
  ) || null;
}

export async function createProtocol(protocolData) {
  return saveDocument(COLLECTION, protocolData);
}

export async function updateProtocol(id, updates) {
  await updateDocument(COLLECTION, id, updates);
}

export async function deleteProtocol(id) {
  await deleteDocument(COLLECTION, id);
}

export async function seedInitialProtocols() {
  const existing = await local.getAll(COLLECTION);
  if (existing.length > 0) return { seeded: 0, existing: existing.length };
  const { INITIAL_PROTOCOLS } = await import('../config/sagData.js');
  let seeded = 0;
  for (const proto of INITIAL_PROTOCOLS) {
    await saveDocument(COLLECTION, proto);
    seeded++;
  }
  return { seeded, existing: 0 };
}

export async function getProtocolStats() {
  const protocols = await getAllProtocols();
  const countries = new Set();
  const products = new Set();
  let active = 0;

  protocols.forEach(p => {
    countries.add(p.pais);
    if (p.producto) products.add(p.producto);
    if (p.vigente) active++;
  });

  return {
    total: protocols.length,
    active,
    inactive: protocols.length - active,
    countries: countries.size,
    products: products.size,
  };
}

export async function getCountriesSummary() {
  const protocols = await getAllProtocols();
  const map = {};

  protocols.forEach(p => {
    if (!map[p.pais]) {
      map[p.pais] = { pais: p.pais, products: new Set(), total: 0, active: 0 };
    }
    map[p.pais].products.add(p.producto);
    map[p.pais].total++;
    if (p.vigente) map[p.pais].active++;
  });

  return Object.values(map).map(c => ({
    pais: c.pais,
    products: Array.from(c.products),
    total: c.total,
    active: c.active,
  })).sort((a, b) => a.pais.localeCompare(b.pais));
}
