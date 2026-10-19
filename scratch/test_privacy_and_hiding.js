const BASE_URL = 'http://localhost:3000/api';

async function req(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function runTests() {
  console.log('--- TEST PRIVACIDAD Y OCULTAMIENTO ---');

  // 1. Iniciar sesión como Admin
  const adminUser = await req(`${BASE_URL}/users/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'calendariolcgs@gmail.com',
      password: '11042008eC'
    })
  });
  console.log('✅ Admin logueado:', adminUser.name, 'Rol:', adminUser.role);

  // 2. Iniciar sesión como Estudiante
  const studentUser = await req(`${BASE_URL}/users/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'estudiante@ieluiscarlosgalansarmiento.edu.co',
      password: '123456'
    })
  });
  console.log('✅ Estudiante logueado:', studentUser.name, 'Rol:', studentUser.role);

  // 3. Crear un calendario privado/restringido como Admin
  const createdCal = await req(`${BASE_URL}/calendars`, {
    method: 'POST',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      name: 'Calendario Confidencial Docente',
      type: 'horario',
      color: '#8b5cf6',
      icon: '🔒',
      ownerId: adminUser._id
    })
  });
  console.log('✅ Calendario creado:', createdCal._id, createdCal.name);

  // 4. Configurar visibilidad RESTRINGIDA sin el estudiante
  await req(`${BASE_URL}/calendars/${createdCal._id}/permissions`, {
    method: 'PUT',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      visibility: 'restricted',
      allowedEditors: [adminUser._id],
      allowedViewers: [adminUser._id] // estudiante NO está aquí
    })
  });
  console.log('✅ Permisos configurados: Visibilidad restricted (Solo Admin)');

  // 5. Verificar que el estudiante NO lo ve en GET /api/calendars
  const studentCals = await req(`${BASE_URL}/calendars`, {
    headers: {
      'x-user-id': studentUser._id,
      'x-user-role': studentUser.role
    }
  });
  const studentCanSeeInList = studentCals.some(c => c._id === createdCal._id);
  console.log('❓ ¿Estudiante ve el calendario en su lista?:', studentCanSeeInList);
  if (studentCanSeeInList) {
    throw new Error('FALLO: El estudiante no debería ver el calendario restringido');
  } else {
    console.log('✅ ÉXITO: El calendario restringido está OCULTO para el estudiante en su lista.');
  }

  // 6. Verificar que si el estudiante intenta acceder por ID directo a GET /api/calendars/:id recibe 403 Forbidden
  try {
    await req(`${BASE_URL}/calendars/${createdCal._id}`, {
      headers: {
        'x-user-id': studentUser._id,
        'x-user-role': studentUser.role
      }
    });
    throw new Error('FALLO: El estudiante pudo acceder al calendario restringido por ID');
  } catch (err) {
    if (err.status === 403) {
      console.log('✅ ÉXITO: Estudiante bloqueado con 403 Forbidden al consultar calendario privado.');
    } else {
      throw err;
    }
  }

  // 7. Admin le da acceso al estudiante en allowedViewers
  await req(`${BASE_URL}/calendars/${createdCal._id}/permissions`, {
    method: 'PUT',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      visibility: 'restricted',
      allowedEditors: [adminUser._id],
      allowedViewers: [adminUser._id, studentUser._id]
    })
  });
  console.log('✅ Permisos actualizados: Estudiante añadido a allowedViewers');

  const studentCals2 = await req(`${BASE_URL}/calendars`, {
    headers: {
      'x-user-id': studentUser._id,
      'x-user-role': studentUser.role
    }
  });
  const studentCanSeeNow = studentCals2.some(c => c._id === createdCal._id);
  if (!studentCanSeeNow) {
    throw new Error('FALLO: El estudiante ahora debería ver el calendario permitido');
  }
  console.log('✅ ÉXITO: Estudiante ahora puede ver el calendario cuando se le otorga visualización.');

  // 8. Test de ocultamiento personal para Docente / Admin
  console.log('\n--- TEST OCULTAMIENTO PERSONAL (Admin/Docente) ---');
  // Crear carpeta de prueba
  const createdFolder = await req(`${BASE_URL}/folders`, {
    method: 'POST',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      name: 'Carpeta Personal Admin',
      color: '#10b981',
      icon: '📁',
      ownerId: adminUser._id
    })
  });

  // Admin oculta la carpeta y el calendario para sí mismo
  const hideRes = await req(`${BASE_URL}/users/${adminUser._id}/hidden`, {
    method: 'PUT',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      hiddenCalendars: [createdCal._id],
      hiddenFolders: [createdFolder._id]
    })
  });
  console.log('✅ Preferencias de ocultado guardadas en MongoDB:', hideRes.hiddenCalendars, hideRes.hiddenFolders);

  if (!hideRes.hiddenCalendars.includes(createdCal._id) || !hideRes.hiddenFolders.includes(createdFolder._id)) {
    throw new Error('FALLO: No se guardaron los IDs ocultos en el usuario');
  }

  // Desocultar (revertir)
  const unhideRes = await req(`${BASE_URL}/users/${adminUser._id}/hidden`, {
    method: 'PUT',
    headers: {
      'x-user-id': adminUser._id,
      'x-user-role': adminUser.role
    },
    body: JSON.stringify({
      hiddenCalendars: [],
      hiddenFolders: []
    })
  });
  console.log('✅ Desocultado exitoso en MongoDB. Items ocultos ahora:', unhideRes.hiddenCalendars.length, unhideRes.hiddenFolders.length);

  // Limpiar recursos creados en el test
  await req(`${BASE_URL}/calendars/${createdCal._id}`, {
    method: 'DELETE',
    headers: { 'x-user-id': adminUser._id, 'x-user-role': adminUser.role }
  });
  await req(`${BASE_URL}/folders/${createdFolder._id}`, {
    method: 'DELETE',
    headers: { 'x-user-id': adminUser._id, 'x-user-role': adminUser.role }
  });
  console.log('🧹 Recursos de prueba eliminados con éxito.');
  console.log('\n🎉 TODOS LOS TESTS DE PRIVACIDAD Y OCULTAMIENTO PASARON PERFECTAMENTE.');
}

runTests().catch(err => {
  console.error('❌ Error en el test:', err.message, err.data || '');
  process.exit(1);
});
