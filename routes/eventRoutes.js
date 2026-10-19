const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Materia = require('../models/Materia');
const Grupo = require('../models/Grupo');
const Aula = require('../models/Aula');
const User = require('../models/User');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

function toValidObjectId(val) {
  if (!val || val === '' || val === 'null' || val === 'undefined') return null;
  if (mongoose.Types.ObjectId.isValid(val)) return new mongoose.Types.ObjectId(val);
  return null;
}

async function resolveMateriaId(val) {
  if (!val || val === 'null' || val === 'undefined') return null;
  const str = val.toString().trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);

  let mat = await Materia.findOne({ nombre: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!mat) {
    mat = await Materia.create({ nombre: str });
  }
  return mat._id;
}

async function resolveGrupoId(val) {
  if (!val || val === 'null' || val === 'undefined') return null;
  const str = val.toString().trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);

  let grp = await Grupo.findOne({ nombre: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!grp) {
    grp = await Grupo.create({ nombre: str });
  }
  return grp._id;
}

async function resolveAulaId(val) {
  if (!val || val === 'null' || val === 'undefined') return null;
  const str = val.toString().trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);

  let aula = await Aula.findOne({ nombre: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!aula) {
    aula = await Aula.create({ nombre: str });
  }
  return aula._id;
}

async function resolveProfesorId(val) {
  if (!val || val === 'null' || val === 'undefined') return null;
  const str = val.toString().trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str)) return new mongoose.Types.ObjectId(str);

  let user = await User.findOne({ name: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  return user ? user._id : null;
}

function parseDates(body) {
  let start, end;
  if (body.fecha_inicio) {
    start = new Date(body.fecha_inicio);
  } else if (body.date && body.startTime) {
    start = new Date(`${body.date}T${body.startTime}:00`);
  } else if (body.date) {
    start = new Date(`${body.date}T09:00:00`);
  } else {
    start = new Date();
  }

  if (body.fecha_fin) {
    end = new Date(body.fecha_fin);
  } else if (body.date && body.endTime) {
    end = new Date(`${body.date}T${body.endTime}:00`);
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  if (isNaN(start.getTime())) start = new Date();
  if (isNaN(end.getTime())) end = new Date(start.getTime() + 60 * 60 * 1000);

  return { start, end };
}

// Middleware: verificar que solo administradores y editores modifiquen eventos
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a gestionar eventos del cronograma institucional.'
      });
    }
  }
  next();
});

// GET all events
router.get('/', async (req, res) => {
  try {
    const { calendarId } = req.query;

    if (isMongoAlive()) {
      const filter = {};
      if (calendarId && toValidObjectId(calendarId)) {
        filter.calendarId = toValidObjectId(calendarId);
      }
      const events = await Event.find(filter)
        .populate('profesor_id', 'name email avatar role')
        .populate('materia_id', 'nombre codigo')
        .populate('grupo_id', 'nombre')
        .populate('aula_id', 'nombre ubicacion')
        .sort({ fecha_inicio: 1 });
      return res.json(events);
    }

    let evs = MemoryStore.events;
    if (calendarId) {
      evs = evs.filter(e => (e.calendarId?._id || e.calendarId || '').toString() === calendarId.toString());
    }
    res.json(evs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create event
router.post('/', async (req, res) => {
  try {
    const {
      calendarId,
      titulo, title,
      materia_id,
      profesor_id,
      grupo_id,
      aula_id,
      color, description, category
    } = req.body;

    const { start, end } = parseDates(req.body);
    const eventTitle = titulo || title || 'Nuevo Evento';

    if (isMongoAlive()) {
      const matId = await resolveMateriaId(materia_id);
      const profId = await resolveProfesorId(profesor_id);
      const grpId = await resolveGrupoId(grupo_id);
      const auId = await resolveAulaId(aula_id);

      const event = new Event({
        calendarId: toValidObjectId(calendarId),
        titulo: eventTitle,
        materia_id: matId,
        profesor_id: profId,
        grupo_id: grpId,
        aula_id: auId,
        fecha_inicio: start,
        fecha_fin: end,
        color: color || '#3b82f6',
        description: description || '',
        category: category || 'General'
      });

      await event.save();
      const populatedEvent = await Event.findById(event._id)
        .populate('profesor_id', 'name email avatar role')
        .populate('materia_id', 'nombre codigo')
        .populate('grupo_id', 'nombre')
        .populate('aula_id', 'nombre ubicacion');

      return res.status(201).json(populatedEvent);
    }

    const newEv = {
      _id: new mongoose.Types.ObjectId().toString(),
      calendarId,
      titulo: eventTitle,
      title: eventTitle,
      materia_id: materia_id || null,
      profesor_id: profesor_id || null,
      grupo_id: grupo_id || null,
      aula_id: aula_id || null,
      fecha_inicio: start,
      fecha_fin: end,
      date: start.toISOString().split('T')[0],
      startTime: start.toTimeString().substring(0, 5),
      endTime: end.toTimeString().substring(0, 5),
      color: color || '#3b82f6',
      description: description || '',
      category: category || 'General'
    };

    MemoryStore.events.push(newEv);
    savePersistentStore();
    res.status(201).json(newEv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update event
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      calendarId,
      titulo, title,
      materia_id,
      profesor_id,
      grupo_id,
      aula_id,
      color, description, category
    } = req.body;

    const { start, end } = parseDates(req.body);
    const eventTitle = titulo || title;

    if (isMongoAlive()) {
      const matId = await resolveMateriaId(materia_id);
      const profId = await resolveProfesorId(profesor_id);
      const grpId = await resolveGrupoId(grupo_id);
      const auId = await resolveAulaId(aula_id);

      const updatePayload = {
        ...(calendarId && { calendarId: toValidObjectId(calendarId) }),
        ...(eventTitle && { titulo: eventTitle }),
        materia_id: matId,
        profesor_id: profId,
        grupo_id: grpId,
        aula_id: auId,
        fecha_inicio: start,
        fecha_fin: end,
        ...(color && { color }),
        ...(description !== undefined && { description }),
        ...(category && { category })
      };

      const event = await Event.findByIdAndUpdate(id, updatePayload, { new: true })
        .populate('profesor_id', 'name email avatar role')
        .populate('materia_id', 'nombre codigo')
        .populate('grupo_id', 'nombre')
        .populate('aula_id', 'nombre ubicacion');

      if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
      return res.json(event);
    }

    const idx = MemoryStore.events.findIndex(e => e._id === id);
    if (idx === -1) return res.status(404).json({ error: 'Evento no encontrado' });

    MemoryStore.events[idx] = {
      ...MemoryStore.events[idx],
      ...req.body,
      titulo: eventTitle || MemoryStore.events[idx].titulo,
      fecha_inicio: start,
      fecha_fin: end
    };
    savePersistentStore();
    res.json(MemoryStore.events[idx]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE event
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isMongoAlive()) {
      const event = await Event.findByIdAndDelete(id);
      if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
      return res.json({ message: 'Evento eliminado correctamente', eventId: id });
    }

    const idx = MemoryStore.events.findIndex(e => e._id === id);
    if (idx === -1) return res.status(404).json({ error: 'Evento no encontrado' });

    MemoryStore.events.splice(idx, 1);
    savePersistentStore();
    res.json({ message: 'Evento eliminado correctamente', eventId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


