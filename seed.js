const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { MemoryStore, isMongoAlive } = require('./config/store');
const User = require('./models/User');

const Folder = require('./models/Folder');
const Calendar = require('./models/Calendar');
const ScheduleCell = require('./models/ScheduleCell');
const Event = require('./models/Event');

const seedData = async () => {
  console.log(' Seeding institutional data...');

  let mongoSuccess = false;
  if (isMongoAlive()) {
    try {
      const existingCalendars = await Calendar.countDocuments({});
      if (existingCalendars > 0) {
        console.log('ℹ️ MongoDB contiene información del usuario. Sincronizando y preservando datos intactos...');
        const calendars = await Calendar.find({});
        const Grupo = require('./models/Grupo');
        for (const cal of calendars) {
          let modified = false;
          if (!cal.timeSlots || cal.timeSlots.length === 0) {
            cal.timeSlots = ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30'];
            modified = true;
          }
          if (!cal.groups || cal.groups.length === 0) {
            const cellGroups = await ScheduleCell.distinct('group', { calendarId: cal._id });
            const regGrupos = await Grupo.find().select('nombre');
            const combo = [...new Set([...cellGroups, ...regGrupos.map(g => g.nombre)])].filter(Boolean);
            cal.groups = combo.length > 0 ? combo : ['Grupo 10-A'];
            modified = true;
          }
          if (modified) {
            cal.markModified('timeSlots');
            cal.markModified('groups');
            await cal.save();
          }
        }
        return;
      }
      mongoSuccess = true;
    } catch (err) {
      console.warn('⚠️ Error comprobando existencia de datos en MongoDB:', err.message);
      mongoSuccess = false;
    }
  } else {
    if (MemoryStore.calendars.length > 0) {
      console.log('ℹ️ Almacenamiento en memoria contiene datos del usuario. Preservando información intacta.');
      return;
    }
  }

  // Helper ID generator
  const makeId = () => new mongoose.Types.ObjectId().toString();

  // 1. Create Default Institutional Users
  const user1 = {
    _id: makeId(),
    name: 'Coordinadora María Elena Rostro (Dirección)',
    email: 'direccion@instituto.edu',
    password: '123456',
    role: 'admin',
    avatar: '👩‍🏫',
    color: '#8b5cf6'
  };

  const user2 = {
    _id: makeId(),
    name: 'Prof. Carlos Mendoza (Coordinador)',
    email: 'carlos.mendoza@instituto.edu',
    password: '123456',
    role: 'editor',
    avatar: '👨‍🏫',
    color: '#3b82f6'
  };

  const user3 = {
    _id: makeId(),
    name: 'Estudiante Lucía Gómez',
    email: 'lucia.gomez@estudiantes.edu',
    password: '123456',
    role: 'viewer',
    avatar: '🎓',
    color: '#10b981'
  };

  if (mongoSuccess) {
    try {
      await User.create([user1, user2, user3]);
    } catch (e) {
      MemoryStore.users.push(user1, user2, user3);
    }
  } else {
    MemoryStore.users.push(user1, user2, user3);
  }

  // 2. Create Folders
  const folder1 = {
    _id: makeId(),
    name: 'Académico y Clases 2026',
    color: '#3b82f6',
    icon: '📚',
    ownerId: user1._id
  };

  const folder2 = {
    _id: makeId(),
    name: 'Deportes y Extracurriculares',
    color: '#10b981',
    icon: '🏆',
    ownerId: user1._id
  };

  const folder3 = {
    _id: makeId(),
    name: 'Evaluaciones y Exámenes',
    color: '#f59e0b',
    icon: '📝',
    ownerId: user1._id
  };

  if (mongoSuccess) {
    try {
      await Folder.create([folder1, folder2, folder3]);
    } catch (e) {
      MemoryStore.folders.push(folder1, folder2, folder3);
    }
  } else {
    MemoryStore.folders.push(folder1, folder2, folder3);
  }

  // 3. Create Calendars
  const cal1 = {
    _id: makeId(),
    name: 'Horario General de Clases - Semestre A',
    type: 'horario',
    color: '#3b82f6',
    icon: '📖',
    description: 'Matriz de horarios de clases por grupos y asignaturas.',
    folderId: folder1._id,
    ownerId: user1._id,
    permissions: {
      visibility: 'public',
      allowedEditors: [user1._id, user2._id],
      allowedViewers: [user3._id]
    },
    groups: ['Grupo 10-A (Sistemas)', 'Grupo 10-B (Industrial)', 'Grupo 11-A (Biomedicina)'],
    timeSlots: ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30']
  };

  const cal2 = {
    _id: makeId(),
    name: 'Cronograma Deportivo y Entrenamientos',
    type: 'deportes',
    color: '#10b981',
    icon: '⚽',
    description: 'Horarios de prácticas de fútbol, baloncesto y atletismo.',
    folderId: folder2._id,
    ownerId: user1._id,
    permissions: {
      visibility: 'public',
      allowedEditors: [user1._id, user2._id],
      allowedViewers: []
    }
  };

  const cal3 = {
    _id: makeId(),
    name: 'Calendario de Exámenes Parciales',
    type: 'pruebas',
    color: '#ef4444',
    icon: '📑',
    description: 'Fechas y salas asignadas para exámenes finales y parciales.',
    folderId: folder3._id,
    ownerId: user1._id,
    permissions: {
      visibility: 'public',
      allowedEditors: [user1._id],
      allowedViewers: []
    }
  };

  const cal4 = {
    _id: makeId(),
    name: 'Eventos Institucionales y Ceremonias',
    type: 'eventos',
    color: '#8b5cf6',
    icon: '🏛️',
    description: 'Actos solemnes, conferencias y reuniones de la comunidad.',
    folderId: null,
    ownerId: user1._id,
    permissions: {
      visibility: 'public',
      allowedEditors: [user1._id, user2._id],
      allowedViewers: []
    }
  };

  if (mongoSuccess) {
    try {
      await Calendar.create([cal1, cal2, cal3, cal4]);
    } catch (e) {
      MemoryStore.calendars.push(cal1, cal2, cal3, cal4);
    }
  } else {
    MemoryStore.calendars.push(cal1, cal2, cal3, cal4);
  }

  const { savePersistentStore } = require('./config/store');
  savePersistentStore();
  console.log(' Data seeded successfully! No sample events/cells created - waiting for user input.');
};

module.exports = seedData;

