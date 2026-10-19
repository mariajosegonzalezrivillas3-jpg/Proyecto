const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ScheduleCell = require('../models/ScheduleCell');
const { MemoryStore, isMongoAlive, savePersistentStore } = require('../config/store');

// GET all users (teachers, coordinators, students, admins)
router.get('/', async (req, res) => {
  try {
    if (isMongoAlive()) {
      const users = await User.find().select('-password').sort({ createdAt: 1 });
      return res.json(users);
    }
    const safeUsers = MemoryStore.users.map(({ password, ...u }) => u);
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new user / teacher / student
router.post('/register', async (req, res) => {
  try {
    const requestingRole = req.headers['x-user-role'];
    if (requestingRole !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: Únicamente los administradores tienen autorización para añadir estudiantes y registrar nuevos usuarios.'
      });
    }

    const { name, email, password, role, avatar, color } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const pass = password || '123456';
    const targetRole = role || 'viewer';

    // Validación de dominio institucional para estudiantes
    if (targetRole === 'viewer' && !cleanEmail.endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
      return res.status(400).json({
        error: 'Los estudiantes deben registrarse obligatoriamente con el correo institucional @ieluiscarlosgalansarmiento.edu.co'
      });
    }

    if (isMongoAlive()) {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
      }

      const user = new User({
        name: cleanName,
        email: cleanEmail,
        password: pass,
        role: targetRole,
        avatar: avatar || (targetRole === 'viewer' ? '🎓' : '👨‍🏫'),
        color: color || '#3b82f6'
      });

      await user.save();
      const userObj = user.toObject();
      delete userObj.password;
      return res.status(201).json(userObj);
    }

    const existing = MemoryStore.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const newUser = {
      _id: Date.now().toString(),
      name: cleanName,
      email: cleanEmail,
      password: pass,
      role: targetRole,
      avatar: avatar || (targetRole === 'viewer' ? '🎓' : '👨‍🏫'),
      color: color || '#3b82f6'
    };

    MemoryStore.users.push(newUser);
    savePersistentStore();
    const { password: _, ...userWithoutPass } = newUser;
    res.status(201).json(userWithoutPass);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST create teacher alias
router.post('/', async (req, res) => {
  req.url = '/register';
  return router.handle(req, res);
});

// PUT update user / teacher / student / role
router.put('/:id', async (req, res) => {
  try {
    const requestingRole = req.headers['x-user-role'];
    if (requestingRole !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: Únicamente los administradores tienen derecho a modificar roles y usuarios en lo institucional.'
      });
    }

    const { name, email, role, avatar, color, password } = req.body;

    if (isMongoAlive()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      // Validar dominio si se cambia a estudiante
      if (role === 'viewer') {
        const checkEmail = (email || user.email).toLowerCase().trim();
        if (!checkEmail.endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
          return res.status(400).json({
            error: 'Los estudiantes deben tener correo institucional @ieluiscarlosgalansarmiento.edu.co'
          });
        }
      }

      const oldName = user.name;
      if (name) user.name = name.trim();
      if (email) user.email = email.toLowerCase().trim();
      if (role) user.role = role;
      if (avatar) user.avatar = avatar;
      if (color) user.color = color;
      if (password && password.trim()) user.password = password.trim();
      await user.save();

      // Cascade update teacher in schedule cells
      if (name && oldName !== user.name) {
        await ScheduleCell.updateMany({ teacher: oldName }, { teacher: user.name });
      }

      const userObj = user.toObject();
      delete userObj.password;
      return res.json(userObj);
    }

    const user = MemoryStore.users.find(u => u._id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (role === 'viewer') {
      const checkEmail = (email || user.email).toLowerCase().trim();
      if (!checkEmail.endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
        return res.status(400).json({
          error: 'Los estudiantes deben tener correo institucional @ieluiscarlosgalansarmiento.edu.co'
        });
      }
    }

    const oldName = user.name;
    if (name) user.name = name.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (role) user.role = role;
    if (avatar) user.avatar = avatar;
    if (color) user.color = color;
    if (password && password.trim()) user.password = password.trim();

    if (name && oldName !== user.name) {
      MemoryStore.scheduleCells.forEach(cell => {
        if (cell.teacher === oldName) cell.teacher = user.name;
      });
    }

    savePersistentStore();
    const { password: _, ...userWithoutPass } = user;
    res.json(userWithoutPass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update user hidden calendars and folders preferences (docents and admins)
router.put('/:id/hidden', async (req, res) => {
  try {
    const { hiddenCalendars, hiddenFolders } = req.body;
    const requestingRole = req.headers['x-user-role'];

    if (requestingRole !== 'admin' && requestingRole !== 'editor') {
      return res.status(403).json({
        error: 'Acceso denegado: Solo docentes y administradores pueden personalizar elementos ocultos.'
      });
    }

    if (isMongoAlive()) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (Array.isArray(hiddenCalendars)) {
        user.hiddenCalendars = hiddenCalendars.map(String);
      }
      if (Array.isArray(hiddenFolders)) {
        user.hiddenFolders = hiddenFolders.map(String);
      }
      await user.save();

      const userObj = user.toObject();
      delete userObj.password;
      return res.json(userObj);
    }

    const user = MemoryStore.users.find(u => u._id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (Array.isArray(hiddenCalendars)) user.hiddenCalendars = hiddenCalendars.map(String);
    if (Array.isArray(hiddenFolders)) user.hiddenFolders = hiddenFolders.map(String);

    savePersistentStore();
    const { password: _, ...userWithoutPass } = user;
    res.json(userWithoutPass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE user / teacher
router.delete('/:id', async (req, res) => {
  try {
    const requestingRole = req.headers['x-user-role'];
    if (requestingRole !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: Únicamente los administradores pueden eliminar usuarios institucionales.'
      });
    }

    if (isMongoAlive()) {
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json({ message: 'Usuario eliminado', id: req.params.id, name: user.name });
    }

    const idx = MemoryStore.users.findIndex(u => u._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    const deleted = MemoryStore.users.splice(idx, 1)[0];
    savePersistentStore();
    res.json({ message: 'Usuario eliminado', id: req.params.id, name: deleted.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Ingrese correo y contraseña.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (isMongoAlive()) {
      const user = await User.findOne({ email: cleanEmail });
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Credenciales incorrectas. Verifique su correo institucional y contraseña.' });
      }

      // Los estudiantes deben iniciar sesión obligatoriamente con su correo institucional
      if (user.role === 'viewer' && !cleanEmail.endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
        return res.status(403).json({
          error: 'Acceso restringido: Los estudiantes solo pueden iniciar sesión con su correo institucional (@ieluiscarlosgalansarmiento.edu.co).'
        });
      }

      const userObj = user.toObject();
      delete userObj.password;
      return res.json(userObj);
    }

    const user = MemoryStore.users.find(u => u.email.toLowerCase() === cleanEmail && u.password === password);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas. Verifique su correo institucional y contraseña.' });
    }

    if (user.role === 'viewer' && !cleanEmail.endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
      return res.status(403).json({
        error: 'Acceso restringido: Los estudiantes solo pueden iniciar sesión con su correo institucional (@ieluiscarlosgalansarmiento.edu.co).'
      });
    }

    const { password: _, ...userWithoutPass } = user;
    res.json(userWithoutPass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /forgot-password - Request 6-digit recovery code and send via email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Por favor ingrese su correo institucional.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    // Generar código numérico seguro de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    if (isMongoAlive()) {
      const user = await User.findOne({ email: cleanEmail });
      if (!user) {
        return res.status(404).json({ error: 'No se encontró ninguna cuenta registrada con este correo institucional.' });
      }

      user.resetCode = code;
      user.resetCodeExpires = expires;
      await user.save();

      // Enviar código por correo electrónico (Nodemailer)
      try {
        const { sendResetCodeEmail } = require('../services/emailService');
        await sendResetCodeEmail(cleanEmail, code, user.name);
      } catch (mailErr) {
        console.error('Error al enviar correo:', mailErr.message);
        return res.status(500).json({
          error: 'No se pudo enviar el correo de recuperación. Verifique que GMAIL_USER y GMAIL_APP_PASS estén configurados correctamente en .env.'
        });
      }

      return res.json({
        message: 'Código de seguridad enviado a tu correo institucional. Por favor revisa tu bandeja de entrada o spam.',
        email: cleanEmail,
        expiresInMinutes: 15
      });
    }

    const user = MemoryStore.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'No se encontró ninguna cuenta registrada con este correo institucional.' });
    }

    user.resetCode = code;
    user.resetCodeExpires = expires;
    savePersistentStore();

    // Enviar código por correo electrónico (Nodemailer)
    try {
      const { sendResetCodeEmail } = require('../services/emailService');
      await sendResetCodeEmail(cleanEmail, code, user.name);
    } catch (mailErr) {
      console.error('Error al enviar correo:', mailErr.message);
      return res.status(500).json({
        error: 'No se pudo enviar el correo de recuperación. Verifique que GMAIL_USER y GMAIL_APP_PASS estén configurados correctamente en .env.'
      });
    }

    res.json({
      message: 'Código de seguridad enviado a tu correo institucional. Por favor revisa tu bandeja de entrada o spam.',
      email: cleanEmail,
      expiresInMinutes: 15
    });
  } catch (err) {
    console.error('Error en /forgot-password:', err);
    res.status(500).json({ error: err.message || 'Error al procesar la solicitud de recuperación' });
  }
});

// POST /reset-password - Verify 6-digit code and update password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios (correo, código y nueva contraseña).' });
    }

    if (newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    if (isMongoAlive()) {
      const user = await User.findOne({ email: cleanEmail });
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      if (!user.resetCode || user.resetCode !== cleanCode) {
        return res.status(400).json({ error: 'El código de verificación es inválido o incorrecto.' });
      }

      if (user.resetCodeExpires && new Date(user.resetCodeExpires) < new Date()) {
        return res.status(400).json({ error: 'El código de verificación ha expirado. Solicite uno nuevo.' });
      }

      user.password = newPassword.trim();
      user.resetCode = null;
      user.resetCodeExpires = null;
      await user.save();

      return res.json({
        message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.',
        email: cleanEmail
      });
    }

    const user = MemoryStore.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (!user.resetCode || user.resetCode !== cleanCode) {
      return res.status(400).json({ error: 'El código de verificación es inválido o incorrecto.' });
    }

    if (user.resetCodeExpires && new Date(user.resetCodeExpires) < new Date()) {
      return res.status(400).json({ error: 'El código de verificación ha expirado. Solicite uno nuevo.' });
    }

    user.password = newPassword.trim();
    user.resetCode = null;
    user.resetCodeExpires = null;
    savePersistentStore();

    res.json({
      message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.',
      email: cleanEmail
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

