const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Calendar = require('../models/Calendar');
const ScheduleCell = require('../models/ScheduleCell');
const Event = require('../models/Event');
const Grupo = require('../models/Grupo');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

const DEFAULT_TIME_SLOTS = ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30'];

// Helper to populate memory calendar references
const populateMemoryCalendar = (cal) => {
  const folder = MemoryStore.folders.find(f => f._id === (cal.folderId?._id || cal.folderId));
  const owner = MemoryStore.users.find(u => u._id === (cal.ownerId?._id || cal.ownerId));
  return {
    ...cal,
    folderId: folder || null,
    ownerId: owner || null
  };
};

// Middleware: verificar que solo administradores y editores modifiquen calendarios
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a editar calendarios dentro de lo institucional.'
      });
    }
  }
  next();
});

// Helper to safely sanitize folderId to ObjectId or null
const sanitizeFolderId = (folderId) => {
  if (!folderId || folderId === 'null' || folderId === 'undefined' || folderId === '') {
    return null;
  }
  const idStr = typeof folderId === 'object' && folderId._id ? folderId._id.toString() : folderId.toString();
  if (mongoose.Types.ObjectId.isValid(idStr) && idStr.length === 24) {
    return new mongoose.Types.ObjectId(idStr);
  }
  return null;
};

// Helper to verify calendar view permission
const isUserAllowedToViewCalendar = (cal, userId, userRole) => {
  // Administrators have full visibility of all institutional calendars
  if (userRole === 'admin') return true;

  const visibility = cal.permissions?.visibility || 'public';
  if (visibility === 'public') return true;

  // If calendar is restricted or private, require user identification
  if (!userId) return false;

  const uIdStr = userId.toString();

  // Owner can always view
  const ownerId = cal.ownerId?._id ? cal.ownerId._id.toString() : (cal.ownerId ? cal.ownerId.toString() : null);
  if (ownerId && ownerId === uIdStr) return true;

  // Allowed editors can view
  const editors = (cal.permissions?.allowedEditors || []).map(e => (e?._id || e).toString());
  if (editors.includes(uIdStr)) return true;

  // Allowed viewers can view
  const viewers = (cal.permissions?.allowedViewers || []).map(v => (v?._id || v).toString());
  if (viewers.includes(uIdStr)) return true;

  return false;
};

// GET all calendars
router.get('/', async (req, res) => {
  try {
    const { folderId } = req.query;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    if (isMongoAlive()) {
      const filter = {};
      if (folderId) {
        const cleanFId = sanitizeFolderId(folderId);
        if (cleanFId) filter.folderId = cleanFId;
      }

      const calendars = await Calendar.find(filter)
        .populate('folderId', 'name color icon')
        .populate('ownerId', 'name email role avatar')
        .sort({ createdAt: 1 });
      
      const allowedCalendars = calendars.filter(c => isUserAllowedToViewCalendar(c, userId, userRole));
      return res.json(allowedCalendars);
    }

    let cals = MemoryStore.calendars;
    if (folderId) {
      cals = cals.filter(c => (c.folderId?._id || c.folderId) === folderId);
    }
    const populated = cals.map(populateMemoryCalendar);
    const allowed = populated.filter(c => isUserAllowedToViewCalendar(c, userId, userRole));
    res.json(allowed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET calendar by ID
router.get('/:id', async (req, res) => {
  try {
    const calIdStr = req.params.id.toString();
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    if (isMongoAlive()) {
      const targetCalId = (mongoose.Types.ObjectId.isValid(calIdStr) && calIdStr.length === 24) 
        ? new mongoose.Types.ObjectId(calIdStr) 
        : null;

      let calendar = await Calendar.findOne(
        targetCalId ? { $or: [{ _id: targetCalId }, { _id: calIdStr }] } : { _id: calIdStr }
      )
        .populate('folderId', 'name color icon')
        .populate('ownerId', 'name email role avatar');

      if (!calendar) return res.status(404).json({ error: 'Calendario no encontrado' });

      if (!isUserAllowedToViewCalendar(calendar, userId, userRole)) {
        return res.status(403).json({
          error: 'Acceso restringido: Este calendario tiene visualización restringida y no estás autorizado para verlo.'
        });
      }

      // Ensure groups and timeSlots exist and are synced
      let modified = false;
      if (!calendar.timeSlots || calendar.timeSlots.length === 0) {
        calendar.timeSlots = [...DEFAULT_TIME_SLOTS];
        modified = true;
      }

      if (!calendar.groups || calendar.groups.length === 0) {
        const cellGroups = await ScheduleCell.distinct('group', { 
          calendarId: targetCalId || calIdStr 
        });
        const registeredGrupos = await Grupo.find().select('nombre');
        const combo = [...new Set([...cellGroups, ...registeredGrupos.map(g => g.nombre)])].filter(Boolean);
        if (combo.length > 0) {
          calendar.groups = combo;
        } else {
          calendar.groups = ['Grupo 10-A'];
        }
        modified = true;
      }

      if (modified) {
        calendar.markModified('timeSlots');
        calendar.markModified('groups');
        await calendar.save();
      }

      return res.json(calendar);
    }

    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });

    const populated = populateMemoryCalendar(cal);
    if (!isUserAllowedToViewCalendar(populated, userId, userRole)) {
      return res.status(403).json({
        error: 'Acceso restringido: Este calendario tiene visualización restringida y no estás autorizado para verlo.'
      });
    }

    if (!populated.timeSlots || populated.timeSlots.length === 0) {
      populated.timeSlots = [...DEFAULT_TIME_SLOTS];
    }
    if (!populated.groups || populated.groups.length === 0) {
      const reg = (MemoryStore.grupos || []).map(g => g.nombre);
      populated.groups = reg.length > 0 ? reg : ['Grupo 10-A'];
    }

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create calendar
router.post('/', async (req, res) => {
  try {
    const { name, type, color, icon, description, folderId, ownerId, permissions } = req.body;

    let initialGroups = Array.isArray(req.body.groups) && req.body.groups.length > 0 ? req.body.groups : [];
    let initialSlots = Array.isArray(req.body.timeSlots) && req.body.timeSlots.length > 0 ? req.body.timeSlots : [...DEFAULT_TIME_SLOTS];

    const cleanFolderId = sanitizeFolderId(folderId);
    const cleanOwnerId = (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) ? new mongoose.Types.ObjectId(ownerId) : null;

    if (isMongoAlive()) {
      if (initialGroups.length === 0) {
        const registered = await Grupo.find().sort({ nombre: 1 });
        initialGroups = registered.length > 0 ? registered.map(g => g.nombre) : ['Grupo 10-A'];
      }

      const calendar = new Calendar({
        name,
        type: type || 'general',
        color: color || '#3b82f6',
        icon: icon || '📅',
        description: description || '',
        folderId: cleanFolderId,
        ownerId: cleanOwnerId,
        permissions: permissions || { visibility: 'public', allowedEditors: [], allowedViewers: [] },
        groups: initialGroups,
        timeSlots: initialSlots
      });
      await calendar.save();

      const populated = await Calendar.findById(calendar._id)
        .populate('folderId', 'name color icon')
        .populate('ownerId', 'name email role avatar');
      return res.status(201).json(populated);
    }

    if (initialGroups.length === 0) {
      initialGroups = (MemoryStore.grupos && MemoryStore.grupos.length > 0) ? MemoryStore.grupos.map(g => g.nombre) : ['Grupo 10-A'];
    }

    const newCal = {
      _id: Date.now().toString(),
      name,
      type: type || 'general',
      color: color || '#3b82f6',
      icon: icon || '📅',
      description: description || '',
      folderId: cleanFolderId ? cleanFolderId.toString() : null,
      ownerId,
      permissions: permissions || { visibility: 'public', allowedEditors: [], allowedViewers: [] },
      groups: initialGroups,
      timeSlots: initialSlots
    };

    MemoryStore.calendars.push(newCal);
    savePersistentStore();
    res.status(201).json(populateMemoryCalendar(newCal));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update calendar
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if ('folderId' in updateData) {
      updateData.folderId = sanitizeFolderId(updateData.folderId);
    }
    if ('ownerId' in updateData) {
      updateData.ownerId = (updateData.ownerId && mongoose.Types.ObjectId.isValid(updateData.ownerId)) ? new mongoose.Types.ObjectId(updateData.ownerId) : null;
    }

    if (isMongoAlive()) {
      const calIdStr = req.params.id.toString();
      const targetCalId = (mongoose.Types.ObjectId.isValid(calIdStr) && calIdStr.length === 24)
        ? new mongoose.Types.ObjectId(calIdStr)
        : null;

      const calendar = await Calendar.findOneAndUpdate(
        targetCalId ? { $or: [{ _id: targetCalId }, { _id: calIdStr }] } : { _id: calIdStr },
        { $set: updateData },
        { new: true }
      )
        .populate('folderId', 'name color icon')
        .populate('ownerId', 'name email role avatar');

      if (!calendar) return res.status(404).json({ error: 'Calendar not found' });
      return res.json(calendar);
    }

    const idx = MemoryStore.calendars.findIndex(c => c._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Calendar not found' });

    MemoryStore.calendars[idx] = { 
      ...MemoryStore.calendars[idx], 
      ...updateData,
      folderId: updateData.folderId ? updateData.folderId.toString() : null
    };
    savePersistentStore();
    res.json(populateMemoryCalendar(MemoryStore.calendars[idx]));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update calendar permissions
router.put('/:id/permissions', async (req, res) => {
  try {
    const { visibility, allowedEditors, allowedViewers } = req.body;

    if (isMongoAlive()) {
      const calendar = await Calendar.findById(req.params.id);
      if (!calendar) return res.status(404).json({ error: 'Calendar not found' });

      if (visibility) calendar.permissions.visibility = visibility;
      if (allowedEditors) calendar.permissions.allowedEditors = allowedEditors;
      if (allowedViewers) calendar.permissions.allowedViewers = allowedViewers;

      await calendar.save();
      const updated = await Calendar.findById(calendar._id)
        .populate('folderId', 'name color icon')
        .populate('ownerId', 'name email role avatar');

      return res.json(updated);
    }

    const idx = MemoryStore.calendars.findIndex(c => c._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Calendar not found' });

    const cal = MemoryStore.calendars[idx];
    if (!cal.permissions) cal.permissions = {};
    if (visibility) cal.permissions.visibility = visibility;
    if (allowedEditors) cal.permissions.allowedEditors = allowedEditors;
    if (allowedViewers) cal.permissions.allowedViewers = allowedViewers;

    savePersistentStore();
    res.json(populateMemoryCalendar(cal));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE calendar
router.delete('/:id', async (req, res) => {
  try {
    const calIdStr = req.params.id.toString();
    if (isMongoAlive()) {
      const targetCalId = (mongoose.Types.ObjectId.isValid(calIdStr) && calIdStr.length === 24) 
        ? new mongoose.Types.ObjectId(calIdStr) 
        : calIdStr;
      const calendar = await Calendar.findOneAndDelete({
        $or: [{ _id: targetCalId }, { _id: calIdStr }]
      });
      if (!calendar) return res.status(404).json({ error: 'Calendar not found' });

      await ScheduleCell.deleteMany({
        $or: [{ calendarId: targetCalId }, { calendarId: calIdStr }]
      });
      await Event.deleteMany({
        $or: [{ calendarId: targetCalId }, { calendarId: calIdStr }]
      });

      return res.json({ message: 'Calendar deleted successfully', calendarId: req.params.id });
    }

    const idx = MemoryStore.calendars.findIndex(c => c._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Calendar not found' });

    MemoryStore.calendars.splice(idx, 1);
    MemoryStore.scheduleCells = MemoryStore.scheduleCells.filter(c => (c.calendarId?._id || c.calendarId || '').toString() !== calIdStr);
    MemoryStore.events = MemoryStore.events.filter(e => (e.calendarId?._id || e.calendarId || '').toString() !== calIdStr);

    savePersistentStore();
    res.json({ message: 'Calendar deleted successfully', calendarId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
