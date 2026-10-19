require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, getDbStatus } = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const folderRoutes = require('./routes/folderRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const eventRoutes = require('./routes/eventRoutes');
const materiaRoutes = require('./routes/materiaRoutes');
const grupoRoutes = require('./routes/grupoRoutes');
const aulaRoutes = require('./routes/aulaRoutes');

// Seed data function
const seedData = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// DB Status API Endpoint
app.get('/api/db-status', (req, res) => {
  res.json(getDbStatus());
});

// API Endpoints
app.use('/api/users', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/calendars', calendarRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/materias', materiaRoutes);
app.use('/api/grupos', grupoRoutes);
app.use('/api/aulas', aulaRoutes);

// Catch-all route to serve SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Connect DB in correct order
const startServer = async () => {
  console.log('🔄 Conectando a la base de datos...');
  try {
    await connectDB();
  } catch (err) {
    console.error('⚠️ Advertencia en la conexión DB:', err.message);
  }

  console.log('🌱 Inicializando datos del sistema...');
  try {
    await seedData();
  } catch (err) {
    console.error('⚠️ Advertencia al inicializar datos:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` INSTITUTIONAL CALENDAR SERVER ACTIVE AT:`);
    console.log(` 👉 http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
};

startServer().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err);

});

module.exports = app;


