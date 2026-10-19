const mongoose = require('mongoose');

const ScheduleCellSchema = new mongoose.Schema({
  calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', required: true },
  group: { type: String, required: true }, // e.g. "Grupo 10-A", "1er Semestre", "Materia / Grupo"
  day: { 
    type: String, 
    enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], 
    default: 'Lunes' 
  },
  timeSlot: { type: String, required: true }, // e.g. "07:00 - 08:30", "08:30 - 10:00"
  subject: { type: String, default: '' },
  teacher: { type: String, default: '' },
  classroom: { type: String, default: '' },
  notes: { type: String, default: '' },
  color: { type: String, default: '#e0f2fe' }
}, { 
  collection: 'schedulecells',
  timestamps: true 
});

// Ensure unique index for (calendarId, group, day, timeSlot) for atomic cell updates, sparse to allow general events
ScheduleCellSchema.index({ calendarId: 1, group: 1, day: 1, timeSlot: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ScheduleCell', ScheduleCellSchema);

