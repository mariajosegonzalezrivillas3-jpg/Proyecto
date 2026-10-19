const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const storeFilePath = path.join(dataDir, 'store.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let MemoryStore = {
  users: [],
  folders: [],
  calendars: [],
  scheduleCells: [],
  events: [],
  materias: [],
  grupos: [],
  aulas: []
};

// Load persistent data from disk if exists
const loadPersistentStore = () => {
  if (fs.existsSync(storeFilePath)) {
    try {
      const raw = fs.readFileSync(storeFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      MemoryStore.users = parsed.users || [];
      MemoryStore.folders = parsed.folders || [];
      MemoryStore.calendars = parsed.calendars || [];
      MemoryStore.scheduleCells = parsed.scheduleCells || [];
      MemoryStore.events = parsed.events || [];
      MemoryStore.materias = parsed.materias || [];
      MemoryStore.grupos = parsed.grupos || [];
      MemoryStore.aulas = parsed.aulas || [];
    } catch (e) {
      console.warn('⚠️ Error leyendo almacenamiento local en disco:', e.message);
    }
  }
};

// Save persistent data to disk
const savePersistentStore = () => {
  try {
    fs.writeFileSync(storeFilePath, JSON.stringify(MemoryStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Error guardando almacenamiento local en disco:', e.message);
  }
};

loadPersistentStore();

// Check if Mongoose is connected to a live MongoDB server
const isMongoAlive = () => mongoose.connection.readyState === 1;

module.exports = {
  MemoryStore,
  savePersistentStore,
  loadPersistentStore,
  isMongoAlive
};
