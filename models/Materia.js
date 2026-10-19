const mongoose = require('mongoose');

const MateriaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  codigo: { type: String, default: '' }
}, { 
  collection: 'materias',
  timestamps: true 
});

module.exports = mongoose.model('Materia', MateriaSchema);
