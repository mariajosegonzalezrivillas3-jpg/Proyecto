const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: '123456' },
  role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'viewer' },
  avatar: { type: String, default: '🎓' },
  color: { type: String, default: '#3b82f6' },
  resetCode: { type: String, default: null },
  resetCodeExpires: { type: Date, default: null },
  hiddenCalendars: { type: [String], default: [] },
  hiddenFolders: { type: [String], default: [] }
}, { 
  collection: 'usuarios',
  timestamps: true 
});

module.exports = mongoose.model('User', UserSchema);
