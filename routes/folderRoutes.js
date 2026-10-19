const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const Calendar = require('../models/Calendar');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// Middleware: verificar que solo administradores y editores modifiquen carpetas
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const role = req.headers['x-user-role'];
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo administradores y editores tienen derecho a gestionar carpetas institucionales.'
      });
    }
  }
  next();
});

// GET all folders
router.get('/', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const folders = await Folder.find().sort({ name: 1 });
      return res.json(folders);
    }
    res.json(MemoryStore.folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create folder
router.post('/', async (req, res) => {
  try {
    const { name, color, icon, ownerId } = req.body;
    const cleanOwnerId = (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) ? new mongoose.Types.ObjectId(ownerId) : null;
    if (isMongoAlive()) {
      const folder = new Folder({ 
        name, 
        color: color || '#6366f1', 
        icon: icon || '📁', 
        ownerId: cleanOwnerId 
      });
      await folder.save();
      return res.status(201).json(folder);
    }

    const newFolder = {
      _id: Date.now().toString(),
      name,
      color: color || '#6366f1',
      icon: icon || '📁',
      ownerId
    };
    MemoryStore.folders.push(newFolder);
    savePersistentStore();
    res.status(201).json(newFolder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update folder
router.put('/:id', async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    const folderIdStr = req.params.id.toString();

    if (isMongoAlive()) {
      const targetFolderId = (mongoose.Types.ObjectId.isValid(folderIdStr) && folderIdStr.length === 24)
        ? new mongoose.Types.ObjectId(folderIdStr)
        : null;

      const folder = await Folder.findOneAndUpdate(
        targetFolderId ? { $or: [{ _id: targetFolderId }, { _id: folderIdStr }] } : { _id: folderIdStr },
        { 
          ...(name !== undefined ? { name } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(icon !== undefined ? { icon } : {})
        },
        { new: true }
      );
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      return res.json(folder);
    }

    const idx = MemoryStore.folders.findIndex(f => f._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Folder not found' });
    if (name !== undefined) MemoryStore.folders[idx].name = name;
    if (color !== undefined) MemoryStore.folders[idx].color = color;
    if (icon !== undefined) MemoryStore.folders[idx].icon = icon;
    savePersistentStore();
    res.json(MemoryStore.folders[idx]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE folder
router.delete('/:id', async (req, res) => {
  try {
    const folderIdStr = req.params.id.toString();
    if (isMongoAlive()) {
      const targetFolderId = (mongoose.Types.ObjectId.isValid(folderIdStr) && folderIdStr.length === 24)
        ? new mongoose.Types.ObjectId(folderIdStr)
        : null;

      const folder = await Folder.findOneAndDelete(
        targetFolderId ? { $or: [{ _id: targetFolderId }, { _id: folderIdStr }] } : { _id: folderIdStr }
      );
      if (!folder) return res.status(404).json({ error: 'Folder not found' });

      await Calendar.updateMany(
        targetFolderId ? { $or: [{ folderId: targetFolderId }, { folderId: folderIdStr }] } : { folderId: folderIdStr },
        { $set: { folderId: null } }
      );
      return res.json({ message: 'Folder deleted', folderId: req.params.id });
    }

    const idx = MemoryStore.folders.findIndex(f => f._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Folder not found' });
    MemoryStore.folders.splice(idx, 1);
    
    // Set folderId null for calendars inside deleted folder
    MemoryStore.calendars.forEach(c => {
      const fid = c.folderId?._id || c.folderId;
      if (fid === req.params.id) c.folderId = null;
    });

    savePersistentStore();
    res.json({ message: 'Folder deleted', folderId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

