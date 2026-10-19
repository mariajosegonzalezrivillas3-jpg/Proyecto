const mongoose = require('mongoose');

const CalendarSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['horario', 'deportes', 'pruebas', 'eventos', 'general'], 
    default: 'general' 
  },
  color: { type: String, default: '#3b82f6' },
  icon: { type: String, default: '📅' },
  description: { type: String, default: '' },
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  permissions: {
    visibility: { 
      type: String, 
      enum: ['public', 'private', 'restricted'], 
      default: 'public' 
    },
    allowedEditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    allowedViewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  groups: {
    type: [String],
    default: undefined
  },
  timeSlots: {
    type: [String],
    default: undefined
  }
}, { 
  collection: 'calendars',
  timestamps: true 
});

module.exports = mongoose.model('Calendar', CalendarSchema);

