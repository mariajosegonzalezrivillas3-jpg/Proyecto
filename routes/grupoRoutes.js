const express = require('express');
const router = express.Router();
const Grupo = require('../models/Grupo');
const Calendar = require('../models/Calendar');
const ScheduleCell = require('../models/ScheduleCell');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// Middleware: verificar que solo administradores y editores modifiquen grupos
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a gestionar grupos institucionales.'
      });
    }
  }
  next();
});

// GET all grupos
router.get('/', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const grupos = await Grupo.find().sort({ nombre: 1 });
      return res.json(grupos);
    }
    res.json(MemoryStore.grupos || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create grupo
router.post('/', async (req, res) => {
  try {
    const { nombre, calendarId } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del grupo es obligatorio.' });
    }

    const cleanNombre = nombre.trim();

    if (isMongoAlive()) {
      let grupo = await Grupo.findOne({ nombre: cleanNombre });
      if (!grupo) {
        grupo = new Grupo({ nombre: cleanNombre });
        await grupo.save();
      }

      // If calendarId was provided, also attach to this calendar
      if (calendarId) {
        const cal = await Calendar.findById(calendarId);
        if (cal) {
          let grps = Array.isArray(cal.groups) ? [...cal.groups] : [];
          if (!grps.includes(cleanNombre)) {
            grps.push(cleanNombre);
            cal.groups = grps;
            cal.markModified('groups');
            await cal.save();
          }
        }
      }

      return res.status(201).json(grupo);
    }

    if (!MemoryStore.grupos) MemoryStore.grupos = [];
    let existing = MemoryStore.grupos.find(g => g.nombre.toLowerCase() === cleanNombre.toLowerCase());
    if (!existing) {
      existing = {
        _id: Date.now().toString(),
        nombre: cleanNombre
      };
      MemoryStore.grupos.push(existing);
    }

    if (calendarId) {
      const cal = MemoryStore.calendars.find(c => c._id === calendarId);
      if (cal) {
        if (!cal.groups) cal.groups = [];
        if (!cal.groups.includes(cleanNombre)) cal.groups.push(cleanNombre);
      }
    }

    savePersistentStore();
    res.status(201).json(existing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update / rename grupo
router.put('/:id', async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }
    const cleanNombre = nombre.trim();

    if (isMongoAlive()) {
      const oldGrupo = await Grupo.findById(req.params.id);
      if (!oldGrupo) return res.status(404).json({ error: 'Grupo no encontrado' });
      
      const oldName = oldGrupo.nombre;
      oldGrupo.nombre = cleanNombre;
      await oldGrupo.save();

      // Cascade rename to calendars and schedule cells
      await ScheduleCell.updateMany({ group: oldName }, { group: cleanNombre });
      const calendars = await Calendar.find({ groups: oldName });
      for (const cal of calendars) {
        cal.groups = cal.groups.map(g => g === oldName ? cleanNombre : g);
        cal.markModified('groups');
        await cal.save();
      }

      return res.json(oldGrupo);
    }

    if (!MemoryStore.grupos) MemoryStore.grupos = [];
    const grupo = MemoryStore.grupos.find(g => g._id === req.params.id);
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

    const oldName = grupo.nombre;
    grupo.nombre = cleanNombre;

    MemoryStore.scheduleCells.forEach(cell => {
      if (cell.group === oldName) cell.group = cleanNombre;
    });
    MemoryStore.calendars.forEach(cal => {
      if (Array.isArray(cal.groups)) {
        cal.groups = cal.groups.map(g => g === oldName ? cleanNombre : g);
      }
    });

    savePersistentStore();
    res.json(grupo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE grupo
router.delete('/:id', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const grupo = await Grupo.findByIdAndDelete(req.params.id);
      if (!grupo) return res.status(404).json({ error: 'Grupo not found' });
      return res.json({ message: 'Grupo deleted', id: req.params.id, nombre: grupo.nombre });
    }

    if (!MemoryStore.grupos) MemoryStore.grupos = [];
    const idx = MemoryStore.grupos.findIndex(g => g._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Grupo not found' });
    const deleted = MemoryStore.grupos.splice(idx, 1)[0];
    savePersistentStore();
    res.json({ message: 'Grupo deleted', id: req.params.id, nombre: deleted.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
