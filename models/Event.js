const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  calendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar', default: null },
  titulo: { type: String, default: 'Nuevo Evento' },
  title: { type: String, default: 'Nuevo Evento' },
  materia_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Materia', default: null },
  profesor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  grupo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Grupo', default: null },
  aula_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Aula', default: null },
  fecha_inicio: { type: Date, default: Date.now },
  fecha_fin: { type: Date, default: () => new Date(Date.now() + 3600000) },
  date: { type: String },
  startTime: { type: String },
  endTime: { type: String },
  color: { type: String, default: '#3b82f6' },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' }
}, {
  collection: 'events',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

EventSchema.pre('save', function (next) {
  if (this.titulo) this.title = this.titulo;
  else if (this.title) this.titulo = this.title;

  if (!this.fecha_inicio) this.fecha_inicio = new Date();
  if (!this.fecha_fin) this.fecha_fin = new Date(this.fecha_inicio.getTime() + 3600000);
  if (this.fecha_inicio) {
    const d = new Date(this.fecha_inicio);
    if (!isNaN(d.getTime())) {
      this.date = d.toISOString().split('T')[0];
      this.startTime = d.toTimeString().substring(0, 5);
    }
  }
  if (this.fecha_fin) {
    const d = new Date(this.fecha_fin);
    if (!isNaN(d.getTime())) {
      this.endTime = d.toTimeString().substring(0, 5);
    }
  }
  next();
});

module.exports = mongoose.model('Event', EventSchema);




