const STORAGE_PREFIX = 'dev_fs_';

function getAllDocs(collectionName) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + collectionName) || '[]');
  } catch { return []; }
}

function saveAllDocs(collectionName, docs) {
  localStorage.setItem(STORAGE_PREFIX + collectionName, JSON.stringify(docs));
}

function genId() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function makeMockTimestamp(isoString) {
  const date = new Date(isoString);
  return {
    _type: 'timestamp',
    _date: date,
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1000000,
    toMillis: () => date.getTime(),
    valueOf: () => date.getTime(),
    isEqual: (other) => date.getTime() === (other?.toDate?.()?.getTime?.() || 0),
    toJSON: () => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }),
  };
}

export function collection(_db, name) {
  return { _type: 'collection', _path: name, _collectionName: name };
}

export function doc(_db, collectionName, id) {
  return { _type: 'doc', _path: collectionName, _collectionName: collectionName, _id: id };
}

export function query(colOrDoc, ...constraints) {
  return { _type: 'query', _source: colOrDoc, _constraints: constraints };
}

export function where(field, op, value) {
  return { _type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { _type: 'orderBy', field, direction };
}

export function limit(n) {
  return { _type: 'limit', value: n };
}

export function startAfter(snapshot) {
  return { _type: 'startAfter', _doc: snapshot?._raw };
}

export function serverTimestamp() {
  return { _type: 'serverTimestamp', _date: new Date().toISOString() };
}

function resolveValue(v) {
  if (v && v._type === 'serverTimestamp') return makeMockTimestamp(v._date);
  return v;
}

function applyFilters(docs, constraints) {
  let result = [...docs];
  for (const c of constraints) {
    if (c._type === 'where') {
      result = result.filter(d => {
        const val = d[c.field];
        switch (c.op) {
          case '==': return val === c.value;
          case '!=': return val !== c.value;
          case '>': return val > c.value;
          case '<': return val < c.value;
          case '>=': return val >= c.value;
          case '<=': return val <= c.value;
          case 'array-contains': return Array.isArray(val) && val.includes(c.value);
          case 'in': return Array.isArray(c.value) && c.value.includes(val);
          default: return true;
        }
      });
    }
    if (c._type === 'orderBy') {
      result.sort((a, b) => {
        const va = a[c.field] || '';
        const vb = b[c.field] || '';
        return c.direction === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      });
    }
    if (c._type === 'limit') {
      result = result.slice(0, c.value);
    }
    if (c._type === 'startAfter') {
      const afterId = c._doc?.id;
      if (afterId) {
        const idx = result.findIndex(d => d.id === afterId);
        if (idx >= 0) result = result.slice(idx + 1);
      }
    }
  }
  return result;
}

function makeSnapshot(docs) {
  return {
    docs: docs.map(d => ({
      id: d.id,
      data: () => {
        const { id: _id, ...rest } = d;
        return rest;
      },
      exists: () => true,
      _raw: d,
    })),
    empty: docs.length === 0,
    size: docs.length,
  };
}

function makeDocSnapshot(doc) {
  if (!doc) {
    return {
      id: '',
      data: () => undefined,
      exists: () => false,
      _raw: null,
    };
  }
  return {
    id: doc.id,
    data: () => {
      const { id: _id, ...rest } = doc;
      return rest;
    },
    exists: () => true,
    _raw: doc,
  };
}

export async function getDocs(colOrQuery) {
  const collectionName = colOrQuery._collectionName || colOrQuery._source?._collectionName;
  if (!collectionName) return makeSnapshot([]);

  const allDocs = getAllDocs(collectionName);

  if (colOrQuery._type === 'query') {
    const filtered = applyFilters(allDocs, colOrQuery._constraints || []);
    return makeSnapshot(filtered);
  }

  return makeSnapshot(allDocs);
}

export async function getDoc(docRef) {
  const allDocs = getAllDocs(docRef._collectionName);
  const found = allDocs.find(d => d.id === docRef._id);
  return makeDocSnapshot(found || null);
}

export async function addDoc(colOrRef, data) {
  const collectionName = colOrRef._collectionName || colOrRef._path;
  const docs = getAllDocs(collectionName);
  const id = genId();
  const processedData = {};
  for (const [k, v] of Object.entries(data)) {
    processedData[k] = resolveValue(v);
  }
  const newDoc = { id, ...processedData };
  docs.push(newDoc);
  saveAllDocs(collectionName, docs);
  return { id, _path: collectionName };
}

export async function updateDoc(docRef, data) {
  const allDocs = getAllDocs(docRef._collectionName);
  const idx = allDocs.findIndex(d => d.id === (docRef._id || docRef.id));
  if (idx >= 0) {
    const processedData = {};
    for (const [k, v] of Object.entries(data)) {
      processedData[k] = resolveValue(v);
    }
    allDocs[idx] = { ...allDocs[idx], ...processedData };
    saveAllDocs(docRef._collectionName, allDocs);
  }
}

export async function deleteDoc(docRef) {
  const id = docRef._id || docRef.id;
  let allDocs = getAllDocs(docRef._collectionName);
  allDocs = allDocs.filter(d => d.id !== id);
  saveAllDocs(docRef._collectionName, allDocs);
}

export async function writeBatch(_db) {
  const ops = [];
  return {
    set: (ref, data) => ops.push({ type: 'set', ref, data }),
    update: (ref, data) => ops.push({ type: 'update', ref, data }),
    delete: (ref) => ops.push({ type: 'delete', ref }),
    commit: async () => {
      for (const op of ops) {
        if (op.type === 'set') await addDoc(op.ref, op.data);
        if (op.type === 'update') await updateDoc(op.ref, op.data);
        if (op.type === 'delete') await deleteDoc(op.ref);
      }
    },
  };
}
