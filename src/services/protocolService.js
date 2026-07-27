import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { INITIAL_PROTOCOLS } from '../config/sagData.js';

const COLLECTION = 'protocolos_sag';

export async function getAllProtocols() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProtocolById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getProtocolsByCountry(country) {
  const q = query(collection(db, COLLECTION), where('pais', '==', country));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function findProtocolByCombination(pais, producto, variedad) {
  const all = await getAllProtocols();
  return all.find(p =>
    p.pais === pais && p.producto === producto && p.vigente !== false &&
    (p.variedades?.includes(variedad) || !p.variedades?.length || !variedad)
  ) || null;
}

export async function createProtocol(protocolData) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...protocolData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProtocol(id, updates) {
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProtocol(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function seedInitialProtocols() {
  const existing = await getAllProtocols();
  if (existing.length > 0) return { seeded: 0, existing: existing.length };

  let seeded = 0;
  for (const proto of INITIAL_PROTOCOLS) {
    await addDoc(collection(db, COLLECTION), {
      ...proto,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
