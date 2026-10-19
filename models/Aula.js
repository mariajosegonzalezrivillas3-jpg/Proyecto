const mongoose = require('mongoose');

const AulaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  ubicacion: { type: String, default: '' }
}, { 
  collection: 'aulas',
  timestamps: true 
});

module.exports = mongoose.model('Aula', AulaSchema);
