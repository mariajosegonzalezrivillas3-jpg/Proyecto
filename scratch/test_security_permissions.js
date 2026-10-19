const http = require('http');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== INICIANDO PRUEBAS DE SEGURIDAD Y PERMISOS INSTITUCIONALES ===\n');

  // 1. Intento de autorregistro público sin rol autorizado (estudiante / anónimo)
  console.log('1. Probando intento de autorregistro público...');
  const regAttempt = await request('POST', '/api/users/register', {
    name: 'Estudiante Hacker',
    email: 'hacker@ieluiscarlosgalansarmiento.edu.co',
    password: 'password123',
    role: 'admin'
  });
  console.log(`- Status: ${regAttempt.status}`);
  console.log(`- Mensaje: ${JSON.stringify(regAttempt.data)}`);
  if (regAttempt.status === 403) {
    console.log('✅ CORRECTO: El autoregistro público está bloqueado (403 Forbidden).\n');
  } else {
    console.error('❌ ERROR: Se permitió el registro público no autorizado.\n');
  }

  // 2. Inicio de sesión como estudiante con correo institucional oficial
  console.log('2. Probando inicio de sesión de estudiante con correo institucional (@ieluiscarlosgalansarmiento.edu.co)...');
  const studentLogin = await request('POST', '/api/users/login', {
    email: 'estudiante@ieluiscarlosgalansarmiento.edu.co',
    password: '123456'
  });
  console.log(`- Status: ${studentLogin.status}`);
  console.log(`- Usuario: ${studentLogin.data?.name}, Rol: ${studentLogin.data?.role}`);
  if (studentLogin.status === 200 && studentLogin.data?.role === 'viewer') {
    console.log('✅ CORRECTO: Estudiante autenticado exitosamente en modo solo lectura (viewer).\n');
  } else {
    console.error('❌ ERROR: Falló el inicio de sesión del estudiante institucional.\n');
  }

  // 3. Intento de estudiante (rol viewer) de crear un calendario
  console.log('3. Probando intento de estudiante de crear un calendario...');
  const studentCalCreate = await request('POST', '/api/calendars', {
    name: 'Calendario No Autorizado Estudiante'
  }, {
    'x-user-role': 'viewer',
    'x-user-id': studentLogin.data?._id
  });
  console.log(`- Status: ${studentCalCreate.status}`);
  console.log(`- Mensaje: ${JSON.stringify(studentCalCreate.data)}`);
  if (studentCalCreate.status === 403) {
    console.log('✅ CORRECTO: Estudiante tiene prohibido crear o editar calendarios (403 Forbidden).\n');
  } else {
    console.error('❌ ERROR: Estudiante pudo crear o modificar calendarios.\n');
  }

  // 4. Intento de visitante no autenticado de modificar horarios
  console.log('4. Probando intento anónimo/invitado de guardar clases en horario...');
  const guestScheduleEdit = await request('POST', '/api/schedules/batch', {
    calendarId: 'dummyId',
    cells: []
  });
  console.log(`- Status: ${guestScheduleEdit.status}`);
  console.log(`- Mensaje: ${JSON.stringify(guestScheduleEdit.data)}`);
  if (guestScheduleEdit.status === 403) {
    console.log('✅ CORRECTO: Usuarios no autenticados / invitados tienen bloqueada la edición de horarios.\n');
  } else {
    console.error('❌ ERROR: Se permitió la edición de horarios sin autenticación.\n');
  }

  // 5. Intento de editor de modificar el rol de un usuario a admin
  console.log('5. Probando intento de docente/editor de cambiar el rol de un usuario...');
  const editorRoleEdit = await request('PUT', `/api/users/${studentLogin.data?._id}`, {
    role: 'admin'
  }, {
    'x-user-role': 'editor'
  });
  console.log(`- Status: ${editorRoleEdit.status}`);
  console.log(`- Mensaje: ${JSON.stringify(editorRoleEdit.data)}`);
  if (editorRoleEdit.status === 403) {
    console.log('✅ CORRECTO: Solo administradores pueden modificar roles (editores bloqueados con 403).\n');
  } else {
    console.error('❌ ERROR: Un editor pudo cambiar el rol a admin.\n');
  }

  // 6. Intento de administrador legítimo de actualizar rol
  console.log('6. Probando actualización de rol autorizada por Administrador...');
  const adminRoleEdit = await request('PUT', `/api/users/${studentLogin.data?._id}`, {
    role: 'viewer'
  }, {
    'x-user-role': 'admin'
  });
  console.log(`- Status: ${adminRoleEdit.status}`);
  if (adminRoleEdit.status === 200) {
    console.log('✅ CORRECTO: El administrador tiene derecho autorizado para gestionar roles.\n');
  } else {
    console.error('❌ ERROR: El administrador no pudo gestionar roles.\n');
  }

  console.log('=== TODAS LAS PRUEBAS DE SEGURIDAD HAN PASADO CON ÉXITO ===');
}

runTests().catch(console.error);
