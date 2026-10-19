const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ScheduleCell = require('../models/ScheduleCell');
const Calendar = require('../models/Calendar');
const Grupo = require('../models/Grupo');
const Materia = require('../models/Materia');
const Aula = require('../models/Aula');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// Helpers for ObjectId resolution
const toObjectId = (id) => (id && mongoose.Types.ObjectId.isValid(id.toString()) && id.toString().length === 24) ? new mongoose.Types.ObjectId(id.toString()) : null;
const calQuery = (calendarId) => {
  const objId = toObjectId(calendarId);
  return objId ? { $or: [{ _id: objId }, { _id: calendarId.toString() }] } : { _id: calendarId.toString() };
};
const calCellQuery = (calendarId) => {
  const objId = toObjectId(calendarId);
  return objId ? { $or: [{ calendarId: objId }, { calendarId: calendarId.toString() }] } : { calendarId: calendarId.toString() };
};

// Middleware: verificar que solo administradores y editores modifiquen horarios
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a editar los horarios de clases institucionalmente.'
      });
    }
  }
  next();
});

// GET all cells for a specific calendar
router.get('/:calendarId', async (req, res) => {
  try {
    const calIdStr = req.params.calendarId.toString();
    if (isMongoAlive()) {
      const cells = await ScheduleCell.find(calCellQuery(calIdStr));
      return res.json(cells);
    }
    const cells = MemoryStore.scheduleCells.filter(c => (c.calendarId?._id || c.calendarId || '').toString() === calIdStr);
    res.json(cells);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT upsert a single cell (Individual save per cell)
router.post('/cell', async (req, res) => {
  try {
    const { calendarId, group, day, timeSlot, subject, teacher, classroom, notes, color } = req.body;
    
    if (!calendarId || !group || !day || !timeSlot) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (calendarId, group, day, timeSlot)' });
    }

    const cleanGroup = group.trim();
    const cleanSubject = (subject || '').trim();
    const cleanTeacher = (teacher || '').trim();
    const cleanClassroom = (classroom || '').trim();

    if (isMongoAlive()) {
      const objId = toObjectId(calendarId) || calendarId;

      // If subject, teacher, classroom are all empty, delete cell from MongoDB
      if (!cleanSubject && !cleanTeacher && !cleanClassroom) {
        await ScheduleCell.deleteOne({
          $or: [{ calendarId: objId }, { calendarId: calendarId.toString() }],
          group: cleanGroup,
          day,
          timeSlot
        });
        return res.json({ deleted: true, calendarId, group: cleanGroup, day, timeSlot, subject: '', teacher: '', classroom: '' });
      }

      const updateData = {
        calendarId: objId,
        group: cleanGroup,
        day,
        timeSlot,
        subject: cleanSubject,
        teacher: cleanTeacher,
        classroom: cleanClassroom
      };
      if (notes !== undefined) updateData.notes = notes;
      if (color !== undefined) updateData.color = color;

      const cell = await ScheduleCell.findOneAndUpdate(
        { 
          $or: [{ calendarId: objId }, { calendarId: calendarId.toString() }],
          group: cleanGroup, 
          day, 
          timeSlot 
        },
        { $set: updateData },
        { new: true, upsert: true, runValidators: true }
      );

      // Auto-register entities in respective collections for global consistency
      if (cleanGroup) {
        await Grupo.findOneAndUpdate({ nombre: cleanGroup }, { nombre: cleanGroup }, { upsert: true });
        await Calendar.updateOne(calQuery(calendarId), { $addToSet: { groups: cleanGroup } });
      }
      if (cleanSubject) {
        await Materia.findOneAndUpdate({ nombre: cleanSubject }, { nombre: cleanSubject }, { upsert: true });
      }
      if (cleanClassroom) {
        await Aula.findOneAndUpdate({ nombre: cleanClassroom }, { nombre: cleanClassroom }, { upsert: true });
      }

      return res.json(cell);
    }

    // MemoryStore fallback
    let cell = MemoryStore.scheduleCells.find(
      c => (c.calendarId?._id || c.calendarId).toString() === calendarId.toString() &&
           c.group === cleanGroup && c.day === day && c.timeSlot === timeSlot
    );

    if (cell) {
      cell.subject = cleanSubject;
      cell.teacher = cleanTeacher;
      cell.classroom = cleanClassroom;
      if (notes !== undefined) cell.notes = notes;
      if (color !== undefined) cell.color = color;
    } else {
      cell = {
        _id: Date.now().toString(),
        calendarId: calendarId.toString(),
        group: cleanGroup,
        day,
        timeSlot,
        subject: cleanSubject,
        teacher: cleanTeacher,
        classroom: cleanClassroom,
        notes: notes || '',
        color: color || '#e0f2fe'
      };
      MemoryStore.scheduleCells.push(cell);
    }

    // Auto-register in MemoryStore entities
    if (!MemoryStore.grupos) MemoryStore.grupos = [];
    if (!MemoryStore.grupos.some(g => g.nombre === cleanGroup)) {
      MemoryStore.grupos.push({ _id: Date.now().toString(), nombre: cleanGroup });
    }
    if (cleanSubject) {
      if (!MemoryStore.materias) MemoryStore.materias = [];
      if (!MemoryStore.materias.some(m => m.nombre === cleanSubject)) {
        MemoryStore.materias.push({ _id: Date.now().toString(), nombre: cleanSubject, codigo: '' });
      }
    }
    if (cleanClassroom) {
      if (!MemoryStore.aulas) MemoryStore.aulas = [];
      if (!MemoryStore.aulas.some(a => a.nombre === cleanClassroom)) {
        MemoryStore.aulas.push({ _id: Date.now().toString(), nombre: cleanClassroom, ubicacion: '' });
      }
    }

    savePersistentStore();
    res.json(cell);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST batch update/create cells (Save entire schedule)
router.post('/batch', async (req, res) => {
  try {
    const { calendarId, cells } = req.body;
    if (!calendarId || !Array.isArray(cells)) {
      return res.status(400).json({ error: 'Payload inválido. Se espera calendarId y lista cells.' });
    }

    const objId = toObjectId(calendarId) || calendarId;

    if (isMongoAlive()) {
      const operations = cells.map(cell => {
        const cleanGroup = (cell.group || '').trim();
        const cleanSubject = (cell.subject || '').trim();
        const cleanTeacher = (cell.teacher || '').trim();
        const cleanClassroom = (cell.classroom || '').trim();
        const isEmpty = !cleanSubject && !cleanTeacher && !cleanClassroom;

        if (isEmpty) {
          return {
            deleteOne: {
              filter: { calendarId: objId, group: cleanGroup, day: cell.day || 'Lunes', timeSlot: cell.timeSlot }
            }
          };
        }
        return {
          updateOne: {
            filter: { calendarId: objId, group: cleanGroup, day: cell.day || 'Lunes', timeSlot: cell.timeSlot },
            update: { 
              $set: {
                calendarId: objId,
                group: cleanGroup,
                day: cell.day || 'Lunes',
                timeSlot: cell.timeSlot,
                subject: cleanSubject, 
                teacher: cleanTeacher, 
                classroom: cleanClassroom,
                notes: cell.notes || '',
                color: cell.color || '#e0f2fe'
              }
            },
            upsert: true
          }
        };
      });

      if (operations.length > 0) {
        await ScheduleCell.bulkWrite(operations);
      }

      // Automatically register any newly entered groups, materias, aulas in MongoDB
      const uniqueGroups = [...new Set(cells.map(c => (c.group || '').trim()).filter(Boolean))];
      const uniqueSubjects = [...new Set(cells.map(c => (c.subject || '').trim()).filter(Boolean))];
      const uniqueClassrooms = [...new Set(cells.map(c => (c.classroom || '').trim()).filter(Boolean))];

      for (const g of uniqueGroups) {
        await Grupo.findOneAndUpdate({ nombre: g }, { nombre: g }, { upsert: true });
      }
      if (uniqueGroups.length > 0) {
        await Calendar.updateOne(calQuery(calendarId), { $addToSet: { groups: { $each: uniqueGroups } } });
      }
      for (const s of uniqueSubjects) {
        await Materia.findOneAndUpdate({ nombre: s }, { nombre: s }, { upsert: true });
      }
      for (const cl of uniqueClassrooms) {
        await Aula.findOneAndUpdate({ nombre: cl }, { nombre: cl }, { upsert: true });
      }

      const updatedCells = await ScheduleCell.find(calCellQuery(calendarId));
      return res.json(updatedCells);
    }

    // Memory Store Batch Upsert
    const calIdStr = calendarId.toString();
    cells.forEach(c => {
      const cleanGroup = (c.group || '').trim();
      const cleanSubject = (c.subject || '').trim();
      const cleanTeacher = (c.teacher || '').trim();
      const cleanClassroom = (c.classroom || '').trim();

      let existing = MemoryStore.scheduleCells.find(
        sc => (sc.calendarId?._id || sc.calendarId || '').toString() === calIdStr &&
              sc.group === cleanGroup && sc.day === (c.day || 'Lunes') && sc.timeSlot === c.timeSlot
      );
      if (existing) {
        existing.subject = cleanSubject;
        existing.teacher = cleanTeacher;
        existing.classroom = cleanClassroom;
      } else {
        MemoryStore.scheduleCells.push({
          _id: Date.now().toString() + Math.random(),
          calendarId: calIdStr,
          group: cleanGroup,
          day: c.day || 'Lunes',
          timeSlot: c.timeSlot,
          subject: cleanSubject,
          teacher: cleanTeacher,
          classroom: cleanClassroom,
          notes: '',
          color: '#e0f2fe'
        });
      }

      // Sync memory catalogs
      if (cleanGroup && !MemoryStore.grupos?.some(g => g.nombre === cleanGroup)) {
        if (!MemoryStore.grupos) MemoryStore.grupos = [];
        MemoryStore.grupos.push({ _id: Date.now().toString(), nombre: cleanGroup });
      }
      if (cleanSubject && !MemoryStore.materias?.some(m => m.nombre === cleanSubject)) {
        if (!MemoryStore.materias) MemoryStore.materias = [];
        MemoryStore.materias.push({ _id: Date.now().toString(), nombre: cleanSubject, codigo: '' });
      }
      if (cleanClassroom && !MemoryStore.aulas?.some(a => a.nombre === cleanClassroom)) {
        if (!MemoryStore.aulas) MemoryStore.aulas = [];
        MemoryStore.aulas.push({ _id: Date.now().toString(), nombre: cleanClassroom, ubicacion: '' });
      }
    });

    savePersistentStore();
    const currentCells = MemoryStore.scheduleCells.filter(c => (c.calendarId?._id || c.calendarId || '').toString() === calIdStr);
    res.json(currentCells);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /group/rename - Rename a group across cells and calendar schema
router.put('/group/rename', async (req, res) => {
  try {
    const { calendarId, oldGroup, newGroup } = req.body;
    if (!calendarId || !oldGroup || !newGroup) {
      return res.status(400).json({ error: 'Missing parameters (calendarId, oldGroup, newGroup)' });
    }

    const cleanOld = oldGroup.trim();
    const cleanNew = newGroup.trim();
    const calIdStr = calendarId.toString();

    if (isMongoAlive()) {
      const objId = toObjectId(calendarId) || calendarId;
      await ScheduleCell.updateMany(
        { $or: [{ calendarId: objId }, { calendarId: calIdStr }], group: cleanOld },
        { group: cleanNew }
      );
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal) {
        let grps = Array.isArray(cal.groups) ? [...cal.groups] : [];
        const idx = grps.indexOf(cleanOld);
        if (idx !== -1) grps[idx] = cleanNew;
        else if (!grps.includes(cleanNew)) grps.push(cleanNew);
        cal.groups = grps;
        cal.markModified('groups');
        await cal.save();
      }
      // Also update in Grupo collection
      await Grupo.findOneAndUpdate({ nombre: cleanOld }, { nombre: cleanNew }, { upsert: true });

      return res.json({ success: true, message: `Grupo renombrado a "${cleanNew}"` });
    }

    // Memory Store
    MemoryStore.scheduleCells.forEach(cell => {
      if ((cell.calendarId?._id || cell.calendarId || '').toString() === calIdStr && cell.group === cleanOld) {
        cell.group = cleanNew;
      }
    });
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal) {
      let grps = Array.isArray(cal.groups) ? [...cal.groups] : [];
      const idx = grps.indexOf(cleanOld);
      if (idx !== -1) grps[idx] = cleanNew;
      else if (!grps.includes(cleanNew)) grps.push(cleanNew);
      cal.groups = grps;
    }
    const memG = (MemoryStore.grupos || []).find(g => g.nombre === cleanOld);
    if (memG) memG.nombre = cleanNew;

    savePersistentStore();
    res.json({ success: true, message: `Grupo renombrado a "${cleanNew}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /group - Delete a group and its cells
router.delete('/group', async (req, res) => {
  try {
    const { calendarId, group } = req.body;
    if (!calendarId || !group) {
      return res.status(400).json({ error: 'Missing parameters (calendarId, group)' });
    }

    const cleanGroup = group.trim();
    const calIdStr = calendarId.toString();

    if (isMongoAlive()) {
      const objId = toObjectId(calendarId) || calendarId;
      await ScheduleCell.deleteMany({
        $or: [{ calendarId: objId }, { calendarId: calIdStr }],
        group: cleanGroup
      });
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal && cal.groups) {
        cal.groups = cal.groups.filter(g => g !== cleanGroup);
        cal.markModified('groups');
        await cal.save();
      }
      return res.json({ success: true, message: `Grupo "${cleanGroup}" eliminado` });
    }

    MemoryStore.scheduleCells = MemoryStore.scheduleCells.filter(c => !((c.calendarId?._id || c.calendarId || '').toString() === calIdStr && c.group === cleanGroup));
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal && cal.groups) {
      cal.groups = cal.groups.filter(g => g !== cleanGroup);
    }
    savePersistentStore();
    res.json({ success: true, message: `Grupo "${cleanGroup}" eliminado` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /group/add - Add a group to calendar AND ensure it is registered in Grupo collection
router.post('/group/add', async (req, res) => {
  try {
    const { calendarId, group } = req.body;
    if (!calendarId || !group || !group.trim()) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (calendarId, group)' });
    }

    const cleanGroup = group.trim();
    if (isMongoAlive()) {
      // 1. Ensure saved in Grupo model
      await Grupo.findOneAndUpdate(
        { nombre: cleanGroup },
        { nombre: cleanGroup },
        { upsert: true, new: true }
      );

      // 2. Add to calendar's groups
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal) {
        let grps = Array.isArray(cal.groups) ? [...cal.groups] : [];
        if (!grps.includes(cleanGroup)) {
          grps.push(cleanGroup);
          cal.groups = grps;
        }
        // If timeSlots was empty, initialize standard institutional slots
        if (!cal.timeSlots || cal.timeSlots.length === 0) {
          cal.timeSlots = ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30'];
        }
        cal.markModified('groups');
        cal.markModified('timeSlots');
        await cal.save();
      }
      return res.json({ success: true, groups: cal ? cal.groups : [cleanGroup], timeSlots: cal ? cal.timeSlots : [] });
    }

    // Memory Store
    if (!MemoryStore.grupos) MemoryStore.grupos = [];
    if (!MemoryStore.grupos.some(g => g.nombre === cleanGroup)) {
      MemoryStore.grupos.push({ _id: Date.now().toString(), nombre: cleanGroup });
    }
    const calIdStr = calendarId.toString();
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal) {
      if (!cal.groups) cal.groups = [];
      if (!cal.groups.includes(cleanGroup)) cal.groups.push(cleanGroup);
      if (!cal.timeSlots || cal.timeSlots.length === 0) {
        cal.timeSlots = ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30'];
      }
    }
    savePersistentStore();
    res.json({ success: true, groups: cal ? cal.groups : [cleanGroup], timeSlots: cal ? cal.timeSlots : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /timeslot/rename - Rename a time slot across cells and calendar
router.put('/timeslot/rename', async (req, res) => {
  try {
    const { calendarId, oldTimeSlot, newTimeSlot } = req.body;
    if (!calendarId || !oldTimeSlot || !newTimeSlot) {
      return res.status(400).json({ error: 'Missing parameters (calendarId, oldTimeSlot, newTimeSlot)' });
    }

    const cleanOld = oldTimeSlot.trim();
    const cleanNew = newTimeSlot.trim();
    const calIdStr = calendarId.toString();

    if (isMongoAlive()) {
      const objId = toObjectId(calendarId) || calendarId;
      await ScheduleCell.updateMany(
        { $or: [{ calendarId: objId }, { calendarId: calIdStr }], timeSlot: cleanOld },
        { timeSlot: cleanNew }
      );
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal) {
        let slots = Array.isArray(cal.timeSlots) ? [...cal.timeSlots] : [];
        const idx = slots.indexOf(cleanOld);
        if (idx !== -1) {
          slots[idx] = cleanNew;
        } else if (!slots.includes(cleanNew)) {
          slots.push(cleanNew);
        }
        cal.timeSlots = slots;
        cal.markModified('timeSlots');
        await cal.save();
      }
      return res.json({ success: true, message: `Bloque horario renombrado a "${cleanNew}"` });
    }

    MemoryStore.scheduleCells.forEach(cell => {
      if ((cell.calendarId?._id || cell.calendarId || '').toString() === calIdStr && cell.timeSlot === cleanOld) {
        cell.timeSlot = cleanNew;
      }
    });
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal) {
      let slots = Array.isArray(cal.timeSlots) ? [...cal.timeSlots] : [];
      const idx = slots.indexOf(cleanOld);
      if (idx !== -1) slots[idx] = cleanNew;
      else if (!slots.includes(cleanNew)) slots.push(cleanNew);
      cal.timeSlots = slots;
    }
    savePersistentStore();
    res.json({ success: true, message: `Bloque horario renombrado a "${cleanNew}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /timeslot - Delete a time slot and its cells
router.delete('/timeslot', async (req, res) => {
  try {
    const { calendarId, timeSlot } = req.body;
    if (!calendarId || !timeSlot) {
      return res.status(400).json({ error: 'Missing parameters (calendarId, timeSlot)' });
    }

    const cleanSlot = timeSlot.trim();
    const calIdStr = calendarId.toString();

    if (isMongoAlive()) {
      const objId = toObjectId(calendarId) || calendarId;
      await ScheduleCell.deleteMany({
        $or: [{ calendarId: objId }, { calendarId: calIdStr }],
        timeSlot: cleanSlot
      });
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal && cal.timeSlots) {
        cal.timeSlots = cal.timeSlots.filter(ts => ts !== cleanSlot);
        cal.markModified('timeSlots');
        await cal.save();
      }
      return res.json({ success: true, message: `Bloque horario "${cleanSlot}" eliminado` });
    }

    MemoryStore.scheduleCells = MemoryStore.scheduleCells.filter(c => !((c.calendarId?._id || c.calendarId || '').toString() === calIdStr && c.timeSlot === cleanSlot));
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal && cal.timeSlots) {
      cal.timeSlots = cal.timeSlots.filter(ts => ts !== cleanSlot);
    }
    savePersistentStore();
    res.json({ success: true, message: `Bloque horario "${cleanSlot}" eliminado` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /timeslot/add - Add a time slot to calendar
router.post('/timeslot/add', async (req, res) => {
  try {
    const { calendarId, timeSlot } = req.body;
    if (!calendarId || !timeSlot || !timeSlot.trim()) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (calendarId, timeSlot)' });
    }

    const cleanSlot = timeSlot.trim();
    if (isMongoAlive()) {
      const cal = await Calendar.findOne(calQuery(calendarId));
      if (cal) {
        let slots = Array.isArray(cal.timeSlots) ? [...cal.timeSlots] : [];
        if (!slots.includes(cleanSlot)) {
          slots.push(cleanSlot);
          cal.timeSlots = slots;
        }
        // If calendar has no groups yet, populate with registered grupos from MongoDB
        if (!cal.groups || cal.groups.length === 0) {
          const registeredGrupos = await Grupo.find().sort({ nombre: 1 });
          if (registeredGrupos.length > 0) {
            cal.groups = registeredGrupos.map(g => g.nombre);
          } else {
            cal.groups = ['Grupo 10-A'];
          }
        }
        cal.markModified('timeSlots');
        cal.markModified('groups');
        await cal.save();
      }
      return res.json({ success: true, timeSlots: cal ? cal.timeSlots : [cleanSlot], groups: cal ? cal.groups : [] });
    }

    // Memory Store
    const calIdStr = calendarId.toString();
    const cal = MemoryStore.calendars.find(c => (c._id || '').toString() === calIdStr);
    if (cal) {
      if (!cal.timeSlots) cal.timeSlots = [];
      if (!cal.timeSlots.includes(cleanSlot)) cal.timeSlots.push(cleanSlot);
      if (!cal.groups || cal.groups.length === 0) {
        cal.groups = (MemoryStore.grupos && MemoryStore.grupos.length > 0) ? MemoryStore.grupos.map(g => g.nombre) : ['Grupo 10-A'];
      }
    }
    savePersistentStore();
    res.json({ success: true, timeSlots: cal ? cal.timeSlots : [cleanSlot], groups: cal ? cal.groups : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
