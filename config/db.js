require('dotenv').config();
const mongoose = require('mongoose');

let isConnected = false;
let dbMode = 'MemoryStore';
let connectionMessage = '';

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proyecto';
  
  try {
    // 1. Attempt standard local/configured MongoDB connection with IPv4 DNS resolution
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      family: 4
    });
    // Verify connection is working with a ping
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    
    isConnected = true;
    dbMode = 'MongoDB (Atlas/Cloud)';
    connectionMessage = `🟢 Conectado a MongoDB Atlas en ${mongoUri.split('@')[1] || mongoUri}`;
    console.log(`=======================================================`);
    console.log(` ${connectionMessage}`);
    console.log(`=======================================================`);
    return true;
  } catch (err) {
    console.warn(`⚠️ No se pudo conectar a MongoDB Atlas (${err.message}). Cambiando a MongoDB en Memoria...`);
    try {
      await mongoose.disconnect();
    } catch (e) {}

    // 2. Fallback to MongoMemoryServer
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      console.log(' 🔄 Iniciando MongoDB en memoria (MongoMemoryServer)...');
      const mongod = await MongoMemoryServer.create({
        instance: { dbName: 'proyecto' }
      });
      const memoryUri = mongod.getUri();
      await mongoose.connect(memoryUri);
      isConnected = true;
      dbMode = 'MongoDB (MemoryServer)';
      connectionMessage = `🟢 Conectado a MongoDB en Memoria (MongoMemoryServer)`;
      console.log(`=======================================================`);
      console.log(` ${connectionMessage}`);
      console.log(`=======================================================`);
      return true;
    } catch (memErr) {
      // 3. Fallback to MemoryStore mode
      isConnected = false;
      dbMode = 'MemoryStore';
      connectionMessage = `ℹ️ Motor MongoDB en memoria no disponible. Ejecutando en modo MemoryStore.`;
      console.log(`=======================================================`);
      console.log(` ${connectionMessage}`);
      console.log(`=======================================================`);
      return false;
    }
  }
};

const getDbStatus = () => {
  const alive = mongoose.connection.readyState === 1;
  return {
    success: true,
    isConnected: alive,
    mode: alive ? dbMode : 'MemoryStore',
    message: connectionMessage,
    readyState: mongoose.connection.readyState
  };
};

module.exports = { connectDB, getDbStatus };

