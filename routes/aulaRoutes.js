const express = require('express');
const router = express.Router();
const Aula = require('../models/Aula');
const ScheduleCell = require('../models/ScheduleCell');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// Middleware: verificar que solo administradores y editores modifiquen aulas
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a gestionar aulas institucionales.'
      });
    }
  }
  next();
});

// GET all aulas
router.get('/', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const aulas = await Aula.find().sort({ nombre: 1 });
      return res.json(aulas);
    }
    res.json(MemoryStore.aulas || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create aula
router.post('/', async (req, res) => {
  try {
    const { nombre, ubicacion } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del aula o salón es obligatorio.' });
    }

    const cleanNombre = nombre.trim();
    const cleanUbicacion = (ubicacion || '').trim();

    if (isMongoAlive()) {
      let aula = await Aula.findOne({ nombre: cleanNombre });
      if (!aula) {
        aula = new Aula({ nombre: cleanNombre, ubicacion: cleanUbicacion });
        await aula.save();
      } else if (cleanUbicacion && !aula.ubicacion) {
        aula.ubicacion = cleanUbicacion;
        await aula.save();
      }
      return res.status(201).json(aula);
    }

    if (!MemoryStore.aulas) MemoryStore.aulas = [];
    let existing = MemoryStore.aulas.find(a => a.nombre.toLowerCase() === cleanNombre.toLowerCase());
    if (!existing) {
      existing = {
        _id: Date.now().toString(),
        nombre: cleanNombre,
        ubicacion: cleanUbicacion
      };
      MemoryStore.aulas.push(existing);
    } else if (cleanUbicacion) {
      existing.ubicacion = cleanUbicacion;
    }

    savePersistentStore();
    res.status(201).json(existing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update aula
router.put('/:id', async (req, res) => {
  try {
    const { nombre, ubicacion } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }

    const cleanNombre = nombre.trim();
    const cleanUbicacion = (ubicacion || '').trim();

    if (isMongoAlive()) {
      const aula = await Aula.findById(req.params.id);
      if (!aula) return res.status(404).json({ error: 'Aula no encontrada' });

      const oldName = aula.nombre;
      aula.nombre = cleanNombre;
      aula.ubicacion = cleanUbicacion;
      await aula.save();

      // Cascade rename in schedule cells
      if (oldName !== cleanNombre) {
        await ScheduleCell.updateMany({ classroom: oldName }, { classroom: cleanNombre });
      }

      return res.json(aula);
    }

    if (!MemoryStore.aulas) MemoryStore.aulas = [];
    const aula = MemoryStore.aulas.find(a => a._id === req.params.id);
    if (!aula) return res.status(404).json({ error: 'Aula no encontrada' });

    const oldName = aula.nombre;
    aula.nombre = cleanNombre;
    aula.ubicacion = cleanUbicacion;

    if (oldName !== cleanNombre) {
      MemoryStore.scheduleCells.forEach(cell => {
        if (cell.classroom === oldName) cell.classroom = cleanNombre;
      });
    }

    savePersistentStore();
    res.json(aula);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE aula
router.delete('/:id', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const aula = await Aula.findByIdAndDelete(req.params.id);
      if (!aula) return res.status(404).json({ error: 'Aula not found' });
      return res.json({ message: 'Aula deleted', id: req.params.id, nombre: aula.nombre });
    }

    if (!MemoryStore.aulas) MemoryStore.aulas = [];
    const idx = MemoryStore.aulas.findIndex(a => a._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Aula not found' });
    const deleted = MemoryStore.aulas.splice(idx, 1)[0];
    savePersistentStore();
    res.json({ message: 'Aula deleted', id: req.params.id, nombre: deleted.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
