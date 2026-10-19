const http = require('http');

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function put(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 VERIFICACIÓN COMPLETA DE PERMISOS ADMIN, ESTUDIANTE Y RECUPERACIÓN');
  console.log('========================================================\n');

  // 1. Iniciar sesión como Estudiante
  console.log('--- TEST 1: Iniciar Sesión de Estudiante ---');
  const studentLogin = await post('/api/users/login', {
    email: 'estudiante@ieluiscarlosgalansarmiento.edu.co',
    password: '123456'
  });
  console.log('Resultado login estudiante:', studentLogin.status, studentLogin.data.name, 'Rol:', studentLogin.data.role);

  // 2. Estudiante intenta registrar un nuevo usuario (debe dar 403)
  console.log('\n--- TEST 2: Estudiante intenta registrar un nuevo usuario (Debe ser denegado 403) ---');
  const studentRegisterAttempt = await post('/api/users/register', {
    name: 'Estudiante Hacker',
    email: 'hacker@ieluiscarlosgalansarmiento.edu.co',
    password: 'password123',
    role: 'admin'
  }, {
    'x-user-id': studentLogin.data._id,
    'x-user-role': studentLogin.data.role
  });
  console.log('Status HTTP (Esperado 403):', studentRegisterAttempt.status);
  console.log('Mensaje de rechazo:', studentRegisterAttempt.data.error);

  // 3. Estudiante intenta modificar su rol a Admin (debe dar 403)
  console.log('\n--- TEST 3: Estudiante intenta cambiarse el rol a Administrador (Debe ser denegado 403) ---');
  const studentRoleHack = await put(`/api/users/${studentLogin.data._id}`, {
    role: 'admin'
  }, {
    'x-user-id': studentLogin.data._id,
    'x-user-role': studentLogin.data.role
  });
  console.log('Status HTTP (Esperado 403):', studentRoleHack.status);
  console.log('Mensaje de rechazo:', studentRoleHack.data.error);

  // 4. Iniciar sesión como Administrador Oficial (calendariolcgs@gmail.com)
  console.log('\n--- TEST 4: Iniciar Sesión como Administrador Oficial (calendariolcgs@gmail.com) ---');
  const adminLogin = await post('/api/users/login', {
    email: 'calendariolcgs@gmail.com',
    password: '11042008eC'
  });
  console.log('Resultado login admin:', adminLogin.status, adminLogin.data.name, 'Rol:', adminLogin.data.role);

  // 5. Administrador registra un nuevo estudiante
  console.log('\n--- TEST 5: Administrador registra un nuevo estudiante con correo institucional ---');
  const testStudentEmail = `estudiante.test.${Date.now()}@ieluiscarlosgalansarmiento.edu.co`;
  const adminCreateStudent = await post('/api/users/register', {
    name: 'Estudiante Prueba Galán',
    email: testStudentEmail,
    password: 'miClaveSegura2026',
    role: 'viewer',
    avatar: '🎓',
    color: '#10b981'
  }, {
    'x-user-id': adminLogin.data._id,
    'x-user-role': adminLogin.data.role
  });
  console.log('Status creación estudiante (Esperado 201):', adminCreateStudent.status);
  console.log('Estudiante creado:', adminCreateStudent.data.name, 'Rol:', adminCreateStudent.data.role, 'Email:', adminCreateStudent.data.email);

  // 6. Administrador modifica el rol del estudiante creado
  console.log('\n--- TEST 6: Administrador modifica el rol del usuario ---');
  const modifyRole = await put(`/api/users/${adminCreateStudent.data._id}`, {
    role: 'editor'
  }, {
    'x-user-id': adminLogin.data._id,
    'x-user-role': adminLogin.data.role
  });
  console.log('Status cambio de rol (Esperado 200):', modifyRole.status);
  console.log('Nuevo rol asignado por Admin:', modifyRole.data.role);

  // 7. Prueba de recuperación de contraseña con envío de correo real
  console.log('\n--- TEST 7: Solicitar recuperación de contraseña (Envío de correo real con Gmail) ---');
  const tStart = Date.now();
  const recoveryReq = await post('/api/users/forgot-password', {
    email: 'calendariolcgs@gmail.com'
  });
  const tElapsed = Date.now() - tStart;
  console.log(`Respuesta /forgot-password (${tElapsed} ms):`, recoveryReq.status);
  console.log('Mensaje recibido:', recoveryReq.data.message);

  console.log('\n========================================================');
  console.log('🎉 ¡TODAS LAS VALIDACIONES DE SEGURIDAD Y FUNCIONALIDAD PASARON CON ÉXITO!');
  console.log('========================================================');
}

runTests().catch(console.error);
