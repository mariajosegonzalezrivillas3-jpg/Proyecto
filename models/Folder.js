const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  icon: { type: String, default: '📁' }
}, { 
  collection: 'folders',
  timestamps: true 
});

module.exports = mongoose.model('Folder', FolderSchema);

