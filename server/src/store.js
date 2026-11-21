import fs from 'node:fs';
import path from 'node:path';
// Tiny storage layer. Everything above it only uses store.db and store.save(),
// so swapping in MongoDB later changes this file only.
export function createStore(initial, file) {
  const store = { db: initial, save() { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(store.db)); } } };
  return store;
}

// MongoDB option. The whole app state is kept in one document: simple and fine for this scale
// (see README question 7 for what changes at larger scale). Saves are debounced.
export async function createMongoStore(uri, initial) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db().collection('roster_state');
  const doc = await col.findOne({ _id: 'state' });
  let timer;
  const store = {
    db: doc?.data ?? initial,
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => col.replaceOne({ _id: 'state' }, { _id: 'state', data: store.db }, { upsert: true }).catch((e) => console.error('Mongo save failed', e.message)), 200);
    },
  };
  if (!doc) store.save();
  return store;
}
