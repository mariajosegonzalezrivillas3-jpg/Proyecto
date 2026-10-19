const API_BASE = '/api';

// Helper to retrieve auth headers for institutional role enforcement
function getAuthHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const u = JSON.parse(raw);
      if (u._id) headers['x-user-id'] = u._id;
      if (u.role) headers['x-user-role'] = u.role;
    }
  } catch (e) {}
  return headers;
}

// Automatically attach auth headers to all API requests
const _originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  if (typeof url === 'string' && url.startsWith(API_BASE)) {
    options.headers = getAuthHeaders(options.headers || {});
  }
  return _originalFetch(url, options);
};


const API = {
  // DB STATUS
  async getDbStatus() {
    try {
      const res = await fetch(`${API_BASE}/db-status`);
      return await res.json();
    } catch (e) {
      return { isConnected: false, mode: 'Offline', message: 'Servidor inaccesible' };
    }
  },

  // USERS & AUTH
  async getUsers() {
    const res = await fetch(`${API_BASE}/users`);
    return await res.json();
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
    return data;
  },

  async register(userData) {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar usuario');
    return data;
  },

  async forgotPassword(email) {
    const res = await fetch(`${API_BASE}/users/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al solicitar recuperación');
    return data;
  },

  async resetPassword(email, code, newPassword) {
    const res = await fetch(`${API_BASE}/users/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al restablecer contraseña');
    return data;
  },

  async updateUser(id, userData) {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar usuario');
    return data;
  },

  async deleteUser(id) {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');
    return data;
  },

  async updateUserHiddenPreferences(id, { hiddenCalendars, hiddenFolders }) {
    const res = await fetch(`${API_BASE}/users/${id}/hidden`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenCalendars, hiddenFolders })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar elementos ocultos');
    return data;
  },

  // FOLDERS
  async getFolders() {
    const res = await fetch(`${API_BASE}/folders`);
    return await res.json();
  },

  async createFolder(data) {
    const res = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateFolder(id, data) {
    const res = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al actualizar carpeta');
    return result;
  },

  async deleteFolder(id) {
    const res = await fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // CALENDARS
  async getCalendars(folderId = null) {
    const url = folderId ? `${API_BASE}/calendars?folderId=${folderId}` : `${API_BASE}/calendars`;
    const res = await fetch(url);
    return await res.json();
  },

  async getCalendarById(id) {
    const res = await fetch(`${API_BASE}/calendars/${id}`);
    return await res.json();
  },

  async createCalendar(data) {
    const res = await fetch(`${API_BASE}/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateCalendar(id, data) {
    const res = await fetch(`${API_BASE}/calendars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updatePermissions(id, data) {
    const res = await fetch(`${API_BASE}/calendars/${id}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async deleteCalendar(id) {
    const res = await fetch(`${API_BASE}/calendars/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // SCHEDULE CELLS (HORARIOS DE CLASES)
  async getScheduleCells(calendarId) {
    const res = await fetch(`${API_BASE}/schedules/${calendarId}`);
    return await res.json();
  },

  async saveSingleCell(data) {
    const res = await fetch(`${API_BASE}/schedules/cell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al guardar materia');
    return result;
  },

  async saveBatchCells(calendarId, cellsData) {
    const payload = Array.isArray(cellsData) ? { calendarId, cells: cellsData } : cellsData;
    const res = await fetch(`${API_BASE}/schedules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al guardar matriz');
    return result;
  },

  // GROUPS & TIME SLOTS
  async renameGroup(calendarId, oldGroup, newGroup) {
    const res = await fetch(`${API_BASE}/schedules/group/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, oldGroup, newGroup })
    });
    return await res.json();
  },

  async deleteGroup(calendarId, group) {
    const res = await fetch(`${API_BASE}/schedules/group`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, group })
    });
    return await res.json();
  },

  async addGroup(calendarId, group) {
    const res = await fetch(`${API_BASE}/schedules/group/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, group })
    });
    return await res.json();
  },

  async renameTimeSlot(calendarId, oldTimeSlot, newTimeSlot) {
    const res = await fetch(`${API_BASE}/schedules/timeslot/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, oldTimeSlot, newTimeSlot })
    });
    return await res.json();
  },

  async deleteTimeSlot(calendarId, timeSlot) {
    const res = await fetch(`${API_BASE}/schedules/timeslot`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, timeSlot })
    });
    return await res.json();
  },

  async addTimeSlot(calendarId, timeSlot) {
    const res = await fetch(`${API_BASE}/schedules/timeslot/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, timeSlot })
    });
    return await res.json();
  },

  // EVENTS (CRONOGRAMAS)
  async getEvents(calendarId = null) {
    const url = calendarId ? `${API_BASE}/events?calendarId=${calendarId}` : `${API_BASE}/events`;
    const res = await fetch(url);
    return await res.json();
  },

  async createEvent(data) {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateEvent(id, data) {
    const res = await fetch(`${API_BASE}/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async deleteEvent(id) {
    const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // MATERIAS (CRUD)
  async getMaterias() {
    const res = await fetch(`${API_BASE}/materias`);
    return await res.json();
  },

  async createMateria(data) {
    const res = await fetch(`${API_BASE}/materias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al crear materia');
    return result;
  },

  async updateMateria(id, data) {
    const res = await fetch(`${API_BASE}/materias/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al actualizar materia');
    return result;
  },

  async deleteMateria(id) {
    const res = await fetch(`${API_BASE}/materias/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al eliminar materia');
    return result;
  },

  // GRUPOS ENTITY (CRUD)
  async getGruposList() {
    const res = await fetch(`${API_BASE}/grupos`);
    return await res.json();
  },

  async createGrupoEntity(data) {
    const res = await fetch(`${API_BASE}/grupos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al registrar grupo');
    return result;
  },

  async updateGrupoEntity(id, data) {
    const res = await fetch(`${API_BASE}/grupos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al actualizar grupo');
    return result;
  },

  async deleteGrupoEntity(id) {
    const res = await fetch(`${API_BASE}/grupos/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al eliminar grupo');
    return result;
  },

  // AULAS ENTITY (CRUD)
  async getAulas() {
    const res = await fetch(`${API_BASE}/aulas`);
    return await res.json();
  },

  async createAula(data) {
    const res = await fetch(`${API_BASE}/aulas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al registrar aula');
    return result;
  },

  async updateAula(id, data) {
    const res = await fetch(`${API_BASE}/aulas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al actualizar aula');
    return result;
  },

  async deleteAula(id) {
    const res = await fetch(`${API_BASE}/aulas/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al eliminar aula');
    return result;
  },

  // MAESTROS / DOCENTES ENTITY (CRUD)
  async createTeacher(data) {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, role: data.role || 'editor' })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al registrar docente');
    return result;
  },

  async updateTeacher(id, data) {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al actualizar docente');
    return result;
  },

  async deleteTeacher(id) {
    const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al eliminar docente');
    return result;
  }
};
