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
  console.log('=== TEST: GESTIÓN DE CARPETAS Y CALENDARIOS DENTRO DE ELLAS ===\n');

  // Test 1: Admin crea una carpeta
  console.log('1. Creando carpeta institucional como Admin...');
  const createFolderRes = await request('POST', '/api/folders', {
    name: 'Carpeta Secundaria y Media',
    color: '#8b5cf6',
    icon: '📚'
  }, {
    'x-user-role': 'admin'
  });
  console.log(`- Status: ${createFolderRes.status}`);
  console.log(`- Carpeta ID: ${createFolderRes.data?._id}, Nombre: ${createFolderRes.data?.name}`);
  const folderId = createFolderRes.data?._id;
  if (createFolderRes.status !== 201 || !folderId) {
    throw new Error('Fallo al crear carpeta');
  }
  console.log('✅ Carpeta creada exitosamente en MongoDB Atlas.\n');

  // Test 2: Admin edita la carpeta
  console.log('2. Editando carpeta como Admin...');
  const editFolderRes = await request('PUT', `/api/folders/${folderId}`, {
    name: 'Secundaria y Media Técnica',
    color: '#10b981',
    icon: '🎓'
  }, {
    'x-user-role': 'admin'
  });
  console.log(`- Status: ${editFolderRes.status}`);
  console.log(`- Nombre actualizado: ${editFolderRes.data?.name}, Color: ${editFolderRes.data?.color}`);
  if (editFolderRes.status !== 200 || editFolderRes.data?.name !== 'Secundaria y Media Técnica') {
    throw new Error('Fallo al editar carpeta');
  }
  console.log('✅ Carpeta editada exitosamente en MongoDB Atlas.\n');

  // Test 3: Editor crea un calendario DENTRO de la carpeta
  console.log('3. Creando calendario dentro de la carpeta como Editor...');
  const createCalRes = await request('POST', '/api/calendars', {
    name: 'Horario 11-A Media Técnica',
    type: 'horario',
    color: '#ec4899',
    icon: '🔬',
    description: 'Horario específico para grado 11',
    folderId: folderId
  }, {
    'x-user-role': 'editor'
  });
  console.log(`- Status: ${createCalRes.status}`);
  console.log(`- Calendario ID: ${createCalRes.data?._id}`);
  console.log(`- Folder asignado:`, createCalRes.data?.folderId);
  const calendarId = createCalRes.data?._id;
  if (createCalRes.status !== 201 || !calendarId) {
    throw new Error('Fallo al crear calendario dentro de la carpeta');
  }
  const assignedFolderId = createCalRes.data?.folderId?._id || createCalRes.data?.folderId;
  if (String(assignedFolderId) !== String(folderId)) {
    throw new Error(`El folderId esperado (${folderId}) no coincide con el guardado (${assignedFolderId})`);
  }
  console.log('✅ Calendario creado y vinculado a la carpeta correctamente en MongoDB Atlas.\n');

  // Test 4: Consultar calendarios y verificar población de carpeta
  console.log('4. Verificando persistencia y población en GET /api/calendars...');
  const listCalsRes = await request('GET', '/api/calendars');
  const foundCal = listCalsRes.data.find(c => c._id === calendarId);
  console.log(`- Calendario encontrado: ${foundCal?.name}`);
  console.log(`- Folder populado:`, foundCal?.folderId);
  if (!foundCal || !foundCal.folderId || String(foundCal.folderId._id || foundCal.folderId) !== String(folderId)) {
    throw new Error('El calendario no retiene correctamente su carpeta en la base de datos');
  }
  console.log('✅ Persistencia y visualización de relación carpeta-calendario verificada.\n');

  // Test 5: Estudiante (viewer) intenta crear carpeta (debe fallar 403)
  console.log('5. Verificando que Estudiante (viewer) NO pueda crear carpetas...');
  const studentFolderAttempt = await request('POST', '/api/folders', {
    name: 'Carpeta Ilegal Estudiante'
  }, {
    'x-user-role': 'viewer'
  });
  console.log(`- Status: ${studentFolderAttempt.status}`);
  if (studentFolderAttempt.status !== 403) {
    throw new Error('Estudiante no fue bloqueado al intentar crear carpeta');
  }
  console.log('✅ Correcto: Estudiante bloqueado con 403 Forbidden.\n');

  // Test 6: Estudiante (viewer) intenta crear calendario (debe fallar 403)
  console.log('6. Verificando que Estudiante (viewer) NO pueda crear calendarios...');
  const studentCalAttempt = await request('POST', '/api/calendars', {
    name: 'Calendario Ilegal Estudiante',
    folderId: folderId
  }, {
    'x-user-role': 'viewer'
  });
  console.log(`- Status: ${studentCalAttempt.status}`);
  if (studentCalAttempt.status !== 403) {
    throw new Error('Estudiante no fue bloqueado al intentar crear calendario');
  }
  console.log('✅ Correcto: Estudiante bloqueado con 403 Forbidden.\n');

  // Test 7: Estudiante (viewer) intenta eliminar carpeta (debe fallar 403)
  console.log('7. Verificando que Estudiante (viewer) NO pueda eliminar carpetas...');
  const studentDelFolderAttempt = await request('DELETE', `/api/folders/${folderId}`, null, {
    'x-user-role': 'viewer'
  });
  console.log(`- Status: ${studentDelFolderAttempt.status}`);
  if (studentDelFolderAttempt.status !== 403) {
    throw new Error('Estudiante no fue bloqueado al intentar eliminar carpeta');
  }
  console.log('✅ Correcto: Estudiante bloqueado con 403 Forbidden.\n');

  // Test 8: Eliminar carpeta y verificar que el calendario pase a la raíz (folderId: null)
  console.log('8. Admin eliminando carpeta y verificando migración de calendarios a la raíz...');
  const delFolderRes = await request('DELETE', `/api/folders/${folderId}`, null, {
    'x-user-role': 'admin'
  });
  console.log(`- Status eliminación carpeta: ${delFolderRes.status}`);

  const checkCalAfterFolderDelete = await request('GET', `/api/calendars/${calendarId}`);
  console.log(`- Estado folderId del calendario tras borrar carpeta:`, checkCalAfterFolderDelete.data?.folderId);
  if (checkCalAfterFolderDelete.data?.folderId !== null) {
    throw new Error('El calendario no fue desacoplado a la raíz tras borrar la carpeta');
  }
  console.log('✅ Correcto: Los calendarios se mueven a la raíz sin perderse.\n');

  // Test 9: Limpiar calendario de prueba
  console.log('9. Limpiando calendario de prueba...');
  await request('DELETE', `/api/calendars/${calendarId}`, null, {
    'x-user-role': 'admin'
  });
  console.log('✅ Limpieza completada.\n');

  console.log('🎉 TODOS LOS TESTS DE CARPETAS Y CALENDARIOS PASARON EXITOSAMENTE!');
}

run().catch(err => {
  console.error('❌ ERROR:', err);
  process.exit(1);
});
