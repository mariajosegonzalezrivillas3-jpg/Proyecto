const express = require('express');
const router = express.Router();
const Materia = require('../models/Materia');
const ScheduleCell = require('../models/ScheduleCell');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// Middleware: verificar que solo administradores y editores modifiquen materias
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a gestionar materias institucionales.'
      });
    }
  }
  next();
});

// GET all materias
router.get('/', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const materias = await Materia.find().sort({ nombre: 1 });
      return res.json(materias);
    }
    res.json(MemoryStore.materias || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create materia
router.post('/', async (req, res) => {
  try {
    const { nombre, codigo } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre de la materia es obligatorio.' });
    }

    const cleanNombre = nombre.trim();
    const cleanCodigo = (codigo || '').trim();

    if (isMongoAlive()) {
      let materia = await Materia.findOne({ nombre: cleanNombre });
      if (!materia) {
        materia = new Materia({ nombre: cleanNombre, codigo: cleanCodigo });
        await materia.save();
      } else if (cleanCodigo && !materia.codigo) {
        materia.codigo = cleanCodigo;
        await materia.save();
      }
      return res.status(201).json(materia);
    }

    if (!MemoryStore.materias) MemoryStore.materias = [];
    let existing = MemoryStore.materias.find(m => m.nombre.toLowerCase() === cleanNombre.toLowerCase());
    if (!existing) {
      existing = {
        _id: Date.now().toString(),
        nombre: cleanNombre,
        codigo: cleanCodigo
      };
      MemoryStore.materias.push(existing);
    } else if (cleanCodigo) {
      existing.codigo = cleanCodigo;
    }

    savePersistentStore();
    res.status(201).json(existing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update materia
router.put('/:id', async (req, res) => {
  try {
    const { nombre, codigo } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre de la materia es obligatorio.' });
    }

    const cleanNombre = nombre.trim();
    const cleanCodigo = (codigo || '').trim();

    if (isMongoAlive()) {
      const materia = await Materia.findById(req.params.id);
      if (!materia) return res.status(404).json({ error: 'Materia no encontrada' });

      const oldName = materia.nombre;
      materia.nombre = cleanNombre;
      materia.codigo = cleanCodigo;
      await materia.save();

      // Cascade rename in schedule cells
      if (oldName !== cleanNombre) {
        await ScheduleCell.updateMany({ subject: oldName }, { subject: cleanNombre });
      }

      return res.json(materia);
    }

    if (!MemoryStore.materias) MemoryStore.materias = [];
    const materia = MemoryStore.materias.find(m => m._id === req.params.id);
    if (!materia) return res.status(404).json({ error: 'Materia no encontrada' });

    const oldName = materia.nombre;
    materia.nombre = cleanNombre;
    materia.codigo = cleanCodigo;

    if (oldName !== cleanNombre) {
      MemoryStore.scheduleCells.forEach(cell => {
        if (cell.subject === oldName) cell.subject = cleanNombre;
      });
    }

    savePersistentStore();
    res.json(materia);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE materia
router.delete('/:id', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const materia = await Materia.findByIdAndDelete(req.params.id);
      if (!materia) return res.status(404).json({ error: 'Materia not found' });
      return res.json({ message: 'Materia deleted', id: req.params.id, nombre: materia.nombre });
    }

    if (!MemoryStore.materias) MemoryStore.materias = [];
    const idx = MemoryStore.materias.findIndex(m => m._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Materia not found' });
    const deleted = MemoryStore.materias.splice(idx, 1)[0];
    savePersistentStore();
    res.json({ message: 'Materia deleted', id: req.params.id, nombre: deleted.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
