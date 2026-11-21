import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore, createMongoStore } from './store.js';
import { buildSeed } from './seed.js';

const file = fileURLToPath(new URL('../data/db.json', import.meta.url));
const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
let store;
if (process.env.MONGODB_URI) {
  store = await createMongoStore(process.env.MONGODB_URI, buildSeed());
  console.log('Using MongoDB');
} else {
  store = createStore(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : buildSeed(), file);
  store.save();
  console.log('Using local JSON file (set MONGODB_URI to use MongoDB)');
}
const port = process.env.PORT || 4000;
createApp(store, { clientDir }).listen(port, () => console.log(`Roster app on :${port}`));
