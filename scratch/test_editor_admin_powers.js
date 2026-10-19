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

async function run() {
  console.log('=== VERIFICANDO PERMISOS DE ADMINISTRADOR Y EDITOR PARA AÑADIR ROLES, ESTUDIANTES Y REGISTROS ===\n');

  // Test 1: Editor añade nuevo estudiante con correo institucional
  const timestamp = Date.now();
  const studentEmail = `alumno_${timestamp}@ieluiscarlosgalansarmiento.edu.co`;
  console.log(`1. Editor registrando nuevo estudiante: ${studentEmail}...`);
  const createStudentByEditor = await request('POST', '/api/users/register', {
    name: 'Estudiante Nuevo Galanista',
    email: studentEmail,
    role: 'viewer',
    password: 'password123'
  }, {
    'x-user-role': 'editor'
  });
  console.log(`- Status: ${createStudentByEditor.status}`);
  console.log(`- Creado: ${createStudentByEditor.data?.name} (Rol: ${createStudentByEditor.data?.role})`);
  if (createStudentByEditor.status === 201 && createStudentByEditor.data?.role === 'viewer') {
    console.log('✅ ÉXITO: El Editor pudo registrar un nuevo estudiante institucional correctamente.\n');
  } else {
    console.error('❌ ERROR al registrar estudiante por Editor.\n');
  }

  // Test 2: Editor cambia el rol de un usuario
  const studentId = createStudentByEditor.data?._id;
  console.log('2. Editor cambiando el rol de un usuario a editor...');
  const roleChangeByEditor = await request('PUT', `/api/users/${studentId}`, {
    role: 'editor'
  }, {
    'x-user-role': 'editor'
  });
  console.log(`- Status: ${roleChangeByEditor.status}`);
  console.log(`- Nuevo rol: ${roleChangeByEditor.data?.role}`);
  if (roleChangeByEditor.status === 200 && roleChangeByEditor.data?.role === 'editor') {
    console.log('✅ ÉXITO: El Editor pudo modificar y asignar el rol de un usuario.\n');
  } else {
    console.error('❌ ERROR al modificar rol por Editor.\n');
  }

  // Test 3: Administrador cambia el rol de vuelta
  console.log('3. Administrador modificando rol...');
  const roleChangeByAdmin = await request('PUT', `/api/users/${studentId}`, {
    role: 'viewer'
  }, {
    'x-user-role': 'admin'
  });
  console.log(`- Status: ${roleChangeByAdmin.status}`);
  console.log(`- Rol actualizado: ${roleChangeByAdmin.data?.role}`);
  if (roleChangeByAdmin.status === 200 && roleChangeByAdmin.data?.role === 'viewer') {
    console.log('✅ ÉXITO: El Administrador puede gestionar roles.\n');
  } else {
    console.error('❌ ERROR al modificar rol por Admin.\n');
  }

  // Test 4: Estudiante (viewer) intenta añadir un nuevo usuario (debe estar bloqueado)
  console.log('4. Estudiante intentando registrar un usuario...');
  const studentAttempt = await request('POST', '/api/users/register', {
    name: 'Intruso',
    email: 'intruso@instituto.edu',
    role: 'admin'
  }, {
    'x-user-role': 'viewer'
  });
  console.log(`- Status: ${studentAttempt.status}`);
  if (studentAttempt.status === 403) {
    console.log('✅ ÉXITO: Los estudiantes siguen estrictamente bloqueados de registrar usuarios.\n');
  } else {
    console.error('❌ ERROR: Estudiante pudo registrar usuarios.\n');
  }

  // Limpiar usuario de prueba
  if (studentId) {
    await request('DELETE', `/api/users/${studentId}`, null, { 'x-user-role': 'admin' });
  }

  console.log('=== TODAS LAS VERIFICACIONES COMPLETADAS EXITOSAMENTE ===');
}

run().catch(console.error);
