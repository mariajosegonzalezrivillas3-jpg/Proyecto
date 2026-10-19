const mongoose = require('mongoose');

const GrupoSchema = new mongoose.Schema({
  nombre: { type: String, required: true }
}, { 
  collection: 'grupos',
  timestamps: true 
});

module.exports = mongoose.model('Grupo', GrupoSchema);
