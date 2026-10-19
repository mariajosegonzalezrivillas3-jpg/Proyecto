// Main Application State
const State = {
  users: [],
  activeUserId: null,
  currentUser: null,
  folders: [],
  calendars: [],
  activeCalendarId: null,
  scheduleCells: [],
  events: [],
  selectedDay: 'Lunes',
  selectedCategory: 'all',
  activeView: 'schedule', // 'schedule', 'events', 'catalogs'
  groups: [],
  timeSlots: [],
  gruposList: [],
  aulasList: [],
  materiasList: [],
  hiddenPreferences: {
    hiddenCalendars: [],
    hiddenFolders: [],
    showHidden: false
  }
};


const DEFAULT_TIME_SLOTS = ['07:00 - 08:30', '08:30 - 10:00', '10:30 - 12:00', '12:00 - 13:30'];

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Inicializando Plataforma Web Institucional...');
  await initApp();
});

async function initApp() {
  try {
    // 0. Update DB Status Indicator
    try {
      const dbStatus = await API.getDbStatus();
      const badge = document.getElementById('dbStatusBadge');
      const badgeText = document.getElementById('dbStatusText');
      if (badge && badgeText) {
        if (dbStatus.isConnected) {
          badge.className = 'db-status-badge connected';
          badgeText.textContent = dbStatus.mode.includes('MemoryServer') ? 'MongoDB (Memoria)' : 'MongoDB Atlas 🟢';
          badge.title = dbStatus.message || 'Conectado a MongoDB Atlas';
        } else {
          badge.className = 'db-status-badge memorystore';
          badgeText.textContent = 'Modo MemoryStore';
          badge.title = 'Almacenamiento temporal en memoria operativo';
        }

        badge.onclick = () => {
          UI.showToast(`${dbStatus.message || 'Estado de BD verificado.'}`, dbStatus.isConnected ? 'success' : 'info');
        };
      }
    } catch (e) {
      console.warn('Could not fetch DB status:', e);
    }

    // 1. Load users & set default / logged-in user
    State.users = await API.getUsers();

    const savedUserJson = localStorage.getItem('currentUser');
    if (savedUserJson) {
      try {
        const saved = JSON.parse(savedUserJson);
        const match = State.users.find(u => u._id === saved._id || u.email === saved.email);
        if (match) {
          State.currentUser = match;
          State.activeUserId = match._id;
        }
      } catch (e) {}
    }

    loadUserHiddenPreferences();

    // Do NOT default to State.users[0]! Unauthenticated visitors are in guest consultation mode.
    applyRolePermissions();

    // 2. Load all academic catalogs (grupos, aulas, materias) from MongoDB
    await reloadAllCatalogs();

    // 3. Load folders and calendars
    await refreshSidebar();

    const savedCalId = localStorage.getItem('activeCalendarId');
    const savedDay = localStorage.getItem('selectedDay');

    if (savedDay && ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].includes(savedDay)) {
      State.selectedDay = savedDay;
      document.querySelectorAll('.day-chip').forEach(btn => {
        if (btn.dataset.day === savedDay) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    if (savedCalId && State.calendars && State.calendars.some(c => c._id === savedCalId)) {
      await selectCalendar(savedCalId);
    } else if (State.calendars && State.calendars.length > 0) {
      await selectCalendar(State.calendars[0]._id);
    }

    // 4. Setup UI Event Listeners
    setupEventListeners();

    // 5. Start Real-time DB Synchronization (3s polling interval)
    startRealtimeSync();

  } catch (err) {
    console.error('Initialization error:', err);
    UI.showToast('Nota: Operando con datos del sistema. Verifique el servidor.', 'info');
  }
}

// RELOAD ALL ACADEMIC CATALOGS FROM DATABASE
async function reloadAllCatalogs() {
  try {
    const [grupos, aulas, materias, users] = await Promise.all([
      API.getGruposList(),
      API.getAulas(),
      API.getMaterias(),
      API.getUsers()
    ]);
    State.gruposList = Array.isArray(grupos) ? grupos : [];
    State.aulasList = Array.isArray(aulas) ? aulas : [];
    State.materiasList = Array.isArray(materias) ? materias : [];
    State.users = Array.isArray(users) ? users : [];

    // Update HTML5 autocomplete datalists
    UI.updateDatalists(State.materiasList, State.users, State.aulasList, State.gruposList);

    // Render Academic Catalogs Dashboard
    renderCatalogs();
  } catch (err) {
    console.warn('Error al recargar catálogos institucionales:', err);
  }
}

function isCurrentUserAdmin() {
  return State.currentUser && State.currentUser.role === 'admin';
}

function isCurrentUserAdminOrEditor() {
  return State.currentUser && (State.currentUser.role === 'admin' || State.currentUser.role === 'editor');
}

// PERSONAL PRIVACY & HIDING PREFERENCES (For Teachers and Admins)
function loadUserHiddenPreferences() {
  if (!State.currentUser || (State.currentUser.role !== 'admin' && State.currentUser.role !== 'editor')) {
    State.hiddenPreferences = {
      hiddenCalendars: [],
      hiddenFolders: [],
      showHidden: false
    };
    return;
  }

  const userId = State.currentUser._id;
  let localPrefs = null;
  try {
    const raw = localStorage.getItem('hiddenPrefs_' + userId);
    if (raw) localPrefs = JSON.parse(raw);
  } catch (e) {}

  const serverHiddenCals = Array.isArray(State.currentUser.hiddenCalendars) ? State.currentUser.hiddenCalendars : [];
  const serverHiddenFolders = Array.isArray(State.currentUser.hiddenFolders) ? State.currentUser.hiddenFolders : [];

  State.hiddenPreferences = {
    hiddenCalendars: localPrefs?.hiddenCalendars || serverHiddenCals,
    hiddenFolders: localPrefs?.hiddenFolders || serverHiddenFolders,
    showHidden: localPrefs?.showHidden || false
  };
}

async function saveUserHiddenPreferences() {
  if (!State.currentUser || (State.currentUser.role !== 'admin' && State.currentUser.role !== 'editor')) {
    return;
  }
  const userId = State.currentUser._id;
  try {
    localStorage.setItem('hiddenPrefs_' + userId, JSON.stringify(State.hiddenPreferences));
  } catch (e) {}

  try {
    const updated = await API.updateUserHiddenPreferences(userId, {
      hiddenCalendars: State.hiddenPreferences.hiddenCalendars,
      hiddenFolders: State.hiddenPreferences.hiddenFolders
    });
    if (updated) {
      State.currentUser.hiddenCalendars = updated.hiddenCalendars || State.hiddenPreferences.hiddenCalendars;
      State.currentUser.hiddenFolders = updated.hiddenFolders || State.hiddenPreferences.hiddenFolders;
      localStorage.setItem('currentUser', JSON.stringify(State.currentUser));
    }
  } catch (err) {
    console.warn('Error sincronizando preferencias de ocultado con el servidor:', err);
  }
}

async function toggleHideFolder(folderId) {
  if (!isCurrentUserAdminOrEditor()) return;
  const fId = String(folderId);
  const list = State.hiddenPreferences.hiddenFolders;
  const idx = list.indexOf(fId);
  const isHiddenNow = idx !== -1;

  if (isHiddenNow) {
    list.splice(idx, 1);
    UI.showToast('Carpeta restaurada y visible', 'success');
  } else {
    list.push(fId);
    UI.showToast('Carpeta oculta para ti', 'info');
  }

  await saveUserHiddenPreferences();
  await refreshSidebar();
}

async function toggleHideCalendar(calId) {
  if (!isCurrentUserAdminOrEditor()) return;
  const cId = String(calId);
  const list = State.hiddenPreferences.hiddenCalendars;
  const idx = list.indexOf(cId);
  const isHiddenNow = idx !== -1;

  if (isHiddenNow) {
    list.splice(idx, 1);
    UI.showToast('Calendario restaurado y visible', 'success');
  } else {
    list.push(cId);
    UI.showToast('Calendario oculto para ti', 'info');
    if (String(State.activeCalendarId) === cId) {
      const visibleCal = State.calendars.find(c => !list.includes(String(c._id)));
      if (visibleCal) {
        await selectCalendar(visibleCal._id);
      }
    }
  }

  await saveUserHiddenPreferences();
  await refreshSidebar();
}

function toggleShowHiddenDrawer() {
  State.hiddenPreferences.showHidden = !State.hiddenPreferences.showHidden;
  const canEditInst = isCurrentUserAdminOrEditor();
  UI.renderSidebarTree(
    State.folders,
    State.calendars,
    State.activeCalendarId,
    (calId) => selectCalendar(calId),
    (folderId) => handleDeleteFolder(folderId),
    (folder) => openEditFolderModal(folder),
    (folderId) => openCalendarModal(null, folderId),
    canEditInst,
    State.hiddenPreferences,
    (folderId) => toggleHideFolder(folderId),
    (calId) => toggleHideCalendar(calId),
    () => toggleShowHiddenDrawer()
  );
}

// CHECK USER PERMISSIONS FOR ACTIVE CALENDAR
function canCurrentUserEdit(calendar) {
  // If not logged in, editing is strictly forbidden (read-only for guests)
  if (!State.currentUser) return false;

  const role = State.currentUser.role;
  // Students (viewer) CANNOT edit any institutional calendar
  if (role === 'viewer') return false;

  // Administrators have full rights to edit any calendar
  if (role === 'admin') return true;

  // Editors have rights to edit institutional calendars
  if (role === 'editor') {
    if (!calendar) return true;
    if (calendar.permissions?.visibility === 'restricted') {
      const ownerId = calendar.ownerId?._id || calendar.ownerId;
      if (ownerId === State.currentUser._id) return true;
      const allowedEditors = (calendar.permissions?.allowedEditors || []).map(e => e._id || e);
      return allowedEditors.includes(State.currentUser._id);
    }
    return true;
  }

  return false;
}

function updateAuthHeaderUI() {
  applyRolePermissions();
}

function applyRolePermissions() {
  const isAuth = !!State.currentUser;
  const role = isAuth ? State.currentUser.role : 'guest';
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';
  const canEditInst = isAdmin || isEditor;

  // 1. Top bar auth profile
  UI.renderUsers(State.users, State.activeUserId);
  const btnAuth = document.getElementById('btnOpenAuthModal');
  const btnLogout = document.getElementById('btnLogoutBtn');
  const tabAdmin = document.getElementById('tabAuthAdmin');

  if (btnAuth) {
    if (isAdmin) {
      btnAuth.style.display = 'inline-flex';
      btnAuth.innerHTML = '<i class="fa-solid fa-user-shield"></i> Gestión Estudiantes y Roles';
      btnAuth.className = 'btn btn-primary';
    } else if (!isAuth) {
      btnAuth.style.display = 'inline-flex';
      btnAuth.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
      btnAuth.className = 'btn btn-primary';
    } else {
      // Estudiantes y editores logueados no ven botón de gestión de usuarios
      btnAuth.style.display = 'none';
    }
  }

  if (btnLogout) {
    btnLogout.style.display = isAuth ? 'inline-flex' : 'none';
  }

  // Pestaña Admin en modal: EXCLUSIVA Y ÚNICAMENTE para Administradores
  if (tabAdmin) {
    tabAdmin.style.display = isAdmin ? 'inline-flex' : 'none';
    if (!isAdmin) {
      const loginView = document.getElementById('loginView');
      const adminMgmtView = document.getElementById('adminMgmtView');
      const tabAuthLogin = document.getElementById('tabAuthLogin');
      if (tabAuthLogin) {
        tabAuthLogin.classList.add('active');
        tabAuthLogin.style.color = '#2563eb';
        tabAuthLogin.style.borderBottom = '3px solid #2563eb';
      }
      if (loginView) {
        loginView.classList.add('active');
        loginView.style.display = 'block';
      }
      if (adminMgmtView) {
        adminMgmtView.classList.remove('active');
        adminMgmtView.style.display = 'none';
      }
    }
  }

  // 2. Sidebar action buttons (+ Nueva Carpeta, + Nuevo Calendario)
  const btnNewFolder = document.getElementById('btnNewFolder');
  const btnNewCalendar = document.getElementById('btnNewCalendar');
  if (btnNewFolder) btnNewFolder.style.display = canEditInst ? 'inline-flex' : 'none';
  if (btnNewCalendar) btnNewCalendar.style.display = canEditInst ? 'inline-flex' : 'none';

  // 3. Active calendar header actions
  const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
  const canEditActiveCal = canCurrentUserEdit(activeCal);

  const btnEditCal = document.getElementById('btnEditCalendar');
  const btnDeleteCal = document.getElementById('btnDeleteCalendar');
  const btnShareCal = document.getElementById('btnShareCalendar');
  if (btnEditCal) btnEditCal.style.display = canEditActiveCal ? 'inline-flex' : 'none';
  if (btnDeleteCal) btnDeleteCal.style.display = canEditActiveCal ? 'inline-flex' : 'none';
  if (btnShareCal) btnShareCal.style.display = canEditActiveCal ? 'inline-flex' : 'none';

  // 4. Schedule view controls
  const btnAddGroup = document.getElementById('btnAddGroupBtn');
  const btnAddSlot = document.getElementById('btnAddSlotBtn');
  const btnSaveBatch = document.getElementById('btnSaveScheduleBatch');
  if (btnAddGroup) btnAddGroup.style.display = canEditActiveCal ? 'inline-flex' : 'none';
  if (btnAddSlot) btnAddSlot.style.display = canEditActiveCal ? 'inline-flex' : 'none';
  if (btnSaveBatch) btnSaveBatch.style.display = canEditActiveCal ? 'inline-flex' : 'none';

  // 5. Events view controls
  const btnAddEvent = document.getElementById('btnAddEventBtn');
  if (btnAddEvent) btnAddEvent.style.display = canEditActiveCal ? 'inline-flex' : 'none';

  // 6. Catalogs creation cards
  const formAddGrupo = document.getElementById('formAddGrupoCatalog');
  const formAddAula = document.getElementById('formAddAulaCatalog');
  const formAddMateria = document.getElementById('formAddMateriaCatalog');
  const formAddMaestro = document.getElementById('formAddMaestroCatalog');
  const btnSyncGrupos = document.getElementById('btnSyncGruposToCal');

  if (formAddGrupo && formAddGrupo.parentElement) {
    formAddGrupo.parentElement.style.display = canEditInst ? 'block' : 'none';
  }
  if (formAddAula && formAddAula.parentElement) {
    formAddAula.parentElement.style.display = canEditInst ? 'block' : 'none';
  }
  if (formAddMateria && formAddMateria.parentElement) {
    formAddMateria.parentElement.style.display = canEditInst ? 'block' : 'none';
  }
  if (formAddMaestro && formAddMaestro.parentElement) {
    formAddMaestro.parentElement.style.display = canEditInst ? 'block' : 'none';
  }
  if (btnSyncGrupos) {
    btnSyncGrupos.style.display = canEditInst ? 'inline-flex' : 'none';
  }

  // Re-render sidebar tree to update folder and calendar action controls based on role
  if (Array.isArray(State.folders) && Array.isArray(State.calendars)) {
    UI.renderSidebarTree(
      State.folders,
      State.calendars,
      State.activeCalendarId,
      (calId) => selectCalendar(calId),
      (folderId) => handleDeleteFolder(folderId),
      (folder) => openEditFolderModal(folder),
      (folderId) => openCalendarModal(null, folderId),
      canEditInst,
      State.hiddenPreferences,
      (folderId) => toggleHideFolder(folderId),
      (calId) => toggleHideCalendar(calId),
      () => toggleShowHiddenDrawer()
    );
  }
}

// REFRESH SIDEBAR DATA
async function refreshSidebar() {
  State.folders = await API.getFolders();
  State.calendars = await API.getCalendars();
  
  const canEditInst = isCurrentUserAdminOrEditor();

  UI.renderSidebarTree(
    State.folders,
    State.calendars,
    State.activeCalendarId,
    (calId) => selectCalendar(calId),
    (folderId) => handleDeleteFolder(folderId),
    (folder) => openEditFolderModal(folder),
    (folderId) => openCalendarModal(null, folderId),
    canEditInst,
    State.hiddenPreferences,
    (folderId) => toggleHideFolder(folderId),
    (calId) => toggleHideCalendar(calId),
    () => toggleShowHiddenDrawer()
  );

  // Update folder select in Calendar creation modal
  const folderSelect = document.getElementById('calFolderSelect');
  if (folderSelect) {
    folderSelect.innerHTML = '<option value="">Sin Carpeta (Raíz)</option>' +
      State.folders.map(f => `<option value="${f._id}">${f.icon || '📁'} ${f.name}</option>`).join('');
  }
}

// SELECT CALENDAR
async function selectCalendar(calId) {
  try {
    const calendar = await API.getCalendarById(calId);
    if (!calendar) return;

    State.activeCalendarId = calId;
    localStorage.setItem('activeCalendarId', calId);

    const canEdit = canCurrentUserEdit(calendar);
    const canEditInst = isCurrentUserAdminOrEditor();
    UI.renderCalendarHeader(calendar, canEdit);

    // Re-render sidebar active highlight
    UI.renderSidebarTree(
      State.folders,
      State.calendars,
      State.activeCalendarId,
      (cId) => selectCalendar(cId),
      (fId) => handleDeleteFolder(fId),
      (folder) => openEditFolderModal(folder),
      (folderId) => openCalendarModal(null, folderId),
      canEditInst,
      State.hiddenPreferences,
      (fId) => toggleHideFolder(fId),
      (cId) => toggleHideCalendar(cId),
      () => toggleShowHiddenDrawer()
    );

    // Load schedule cells & events
    await loadCalendarData(calId, canEdit);
  } catch (err) {
    console.warn('No se pudo acceder al calendario:', err);
    UI.showToast(err.message || 'No tienes autorización para visualizar este calendario', 'warning');
    const available = State.calendars.find(c => c._id !== calId && !State.hiddenPreferences.hiddenCalendars.includes(c._id));
    if (available) {
      await selectCalendar(available._id);
    }
  }
}

async function loadCalendarData(calId, canEdit) {
  State.scheduleCells = await API.getScheduleCells(calId);
  State.events = await API.getEvents(calId);

  // Always fetch fresh calendar directly from MongoDB Atlas
  const activeCal = await API.getCalendarById(calId);
  if (activeCal) {
    const idx = State.calendars.findIndex(c => c._id === calId);
    if (idx !== -1) State.calendars[idx] = activeCal;

    // Groups resolution
    let calGroups = Array.isArray(activeCal.groups) && activeCal.groups.length > 0 ? [...activeCal.groups] : [];
    if (calGroups.length === 0) {
      const distinctCellGroups = [...new Set(State.scheduleCells.map(c => c.group).filter(Boolean))];
      if (distinctCellGroups.length > 0) {
        calGroups = distinctCellGroups;
      } else if (State.gruposList.length > 0) {
        calGroups = State.gruposList.map(g => g.nombre);
      } else {
        calGroups = ['Grupo 10-A'];
      }
    }
    State.groups = calGroups;

    // Time slots resolution
    let calSlots = Array.isArray(activeCal.timeSlots) && activeCal.timeSlots.length > 0 ? [...activeCal.timeSlots] : [];
    if (calSlots.length === 0) {
      calSlots = [...DEFAULT_TIME_SLOTS];
    }
    State.timeSlots = calSlots;
  } else {
    State.groups = State.gruposList.length > 0 ? State.gruposList.map(g => g.nombre) : ['Grupo 10-A'];
    State.timeSlots = [...DEFAULT_TIME_SLOTS];
  }

  renderMatrix();

  UI.renderEventsGrid(
    State.events,
    State.selectedCategory,
    canEdit,
    (eventId) => handleDeleteEvent(eventId),
    (eventObj) => openEventModal(eventObj)
  );
}

function renderMatrix() {
  const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
  const canEdit = canCurrentUserEdit(activeCal);

  UI.renderScheduleMatrix(
    State.scheduleCells,
    State.selectedDay,
    State.groups,
    State.timeSlots,
    canEdit,
    (cellData) => handleSaveCell(cellData),
    (oldGroup) => handleEditGroup(oldGroup),
    (groupName) => handleDeleteGroup(groupName),
    (oldSlot) => handleEditTimeSlot(oldSlot),
    (slotName) => handleDeleteTimeSlot(slotName)
  );

  // Attach empty-state button listeners
  const btnEmptyAddGroup = document.getElementById('btnEmptyAddGroup');
  if (btnEmptyAddGroup) {
    btnEmptyAddGroup.onclick = () => openGroupModal('');
  }
  const btnEmptyAddSlot = document.getElementById('btnEmptyAddSlot');
  if (btnEmptyAddSlot) {
    btnEmptyAddSlot.onclick = () => openSlotModal('');
  }
  const btnEmptySyncGroup = document.getElementById('btnEmptySyncGroup');
  if (btnEmptySyncGroup) {
    btnEmptySyncGroup.onclick = () => handleSyncGruposToCal();
  }
}

// RENDER ACADEMIC CATALOGS DASHBOARD
function renderCatalogs() {
  UI.renderCatalogsView(
    {
      grupos: State.gruposList,
      aulas: State.aulasList,
      materias: State.materiasList,
      teachers: State.users
    },
    {
      canEditCatalogs: isCurrentUserAdminOrEditor(),
      canEditRoles: isCurrentUserAdminOrEditor(),
      isAdmin: isCurrentUserAdminOrEditor(),
      onUpdateRole: async (id, newRole) => {
        try {
          await API.updateTeacher(id, { role: newRole });
          UI.showToast(`Rol institucional actualizado a: ${newRole.toUpperCase()}`, 'success');
          await reloadAllCatalogs();
          if (State.currentUser && State.currentUser._id === id) {
            State.currentUser.role = newRole;
            localStorage.setItem('currentUser', JSON.stringify(State.currentUser));
            applyRolePermissions();
          }
        } catch (err) {
          UI.showToast(err.message || 'Error al actualizar rol de usuario', 'error');
        }
      },
      onAddGrupoToCal: async (groupName) => {
        if (!State.activeCalendarId) {
          return UI.showToast('Selecciona primero un calendario', 'info');
        }
        await API.addGroup(State.activeCalendarId, groupName);
        if (!State.groups.includes(groupName)) State.groups.push(groupName);
        renderMatrix();
        UI.showToast(`Grupo "${groupName}" añadido al horario activo`, 'success');
      },
      onDeleteGrupo: async (id, name) => {
        if (confirm(`¿Eliminar grupo "${name}" de la base de datos de MongoDB?`)) {
          try {
            await API.deleteGrupoEntity(id);
            UI.showToast(`Grupo "${name}" eliminado de MongoDB`, 'success');
            await reloadAllCatalogs();
            if (State.activeCalendarId) {
              const activeCal = await API.getCalendarById(State.activeCalendarId);
              if (activeCal) State.groups = Array.isArray(activeCal.groups) ? [...activeCal.groups] : [];
              renderMatrix();
            }
          } catch (e) {
            UI.showToast('Error al eliminar grupo', 'error');
          }
        }
      },
      onDeleteAula: async (id, name) => {
        if (confirm(`¿Eliminar aula "${name}" de la base de datos de MongoDB?`)) {
          try {
            await API.deleteAula(id);
            UI.showToast(`Aula "${name}" eliminada de MongoDB`, 'success');
            await reloadAllCatalogs();
          } catch (e) {
            UI.showToast('Error al eliminar aula', 'error');
          }
        }
      },
      onDeleteMateria: async (id, name) => {
        if (confirm(`¿Eliminar materia "${name}" de la base de datos de MongoDB?`)) {
          try {
            await API.deleteMateria(id);
            UI.showToast(`Materia "${name}" eliminada de MongoDB`, 'success');
            await reloadAllCatalogs();
          } catch (e) {
            UI.showToast('Error al eliminar materia', 'error');
          }
        }
      },
      onDeleteTeacher: async (id, name) => {
        if (!isCurrentUserAdminOrEditor()) {
          return UI.showToast('Solo los administradores y editores pueden eliminar usuarios', 'error');
        }
        if (confirm(`¿Eliminar usuario institucional "${name}" de la base de datos?`)) {
          try {
            await API.deleteTeacher(id);
            UI.showToast(`Usuario "${name}" eliminado de MongoDB`, 'success');
            await reloadAllCatalogs();
            UI.renderUsers(State.users, State.activeUserId);
          } catch (e) {
            UI.showToast(e.message || 'Error al eliminar usuario', 'error');
          }
        }
      }
    }
  );
}

// SYNC ALL REGISTERED GRUPOS TO CURRENT CALENDAR
async function handleSyncGruposToCal() {
  if (!State.activeCalendarId) {
    return UI.showToast('Selecciona primero un calendario', 'info');
  }
  if (State.gruposList.length === 0) {
    return UI.showToast('No hay grupos registrados en el catálogo aún.', 'info');
  }

  for (const g of State.gruposList) {
    if (!State.groups.includes(g.nombre)) {
      await API.addGroup(State.activeCalendarId, g.nombre);
      State.groups.push(g.nombre);
    }
  }

  renderMatrix();
  UI.showToast('¡Grupos sincronizados con el horario actual!', 'success');
}

// EDIT GROUP NAME
function handleEditGroup(oldGroupName) {
  openGroupModal(oldGroupName);
}

// DELETE GROUP FROM CURRENT CALENDAR
async function handleDeleteGroup(groupName) {
  if (confirm(`¿Eliminar la fila del grupo "${groupName}" y sus clases asignadas?`)) {
    try {
      await API.deleteGroup(State.activeCalendarId, groupName);
      
      State.calendars = await API.getCalendars();
      const activeCal = await API.getCalendarById(State.activeCalendarId);
      if (activeCal) {
        State.groups = Array.isArray(activeCal.groups) ? [...activeCal.groups] : [];
      } else {
        State.groups = State.groups.filter(g => g !== groupName);
      }
      State.scheduleCells = await API.getScheduleCells(State.activeCalendarId);
      
      renderMatrix();
      UI.showToast(`Grupo "${groupName}" eliminado del horario`, 'success');
    } catch (err) {
      UI.showToast('Error al eliminar grupo', 'error');
    }
  }
}

// ADD TIME SLOT
function handleAddTimeSlot() {
  openSlotModal('');
}

// EDIT TIME SLOT
function handleEditTimeSlot(oldSlotName) {
  openSlotModal(oldSlotName);
}

// DELETE TIME SLOT FROM CURRENT CALENDAR
async function handleDeleteTimeSlot(slotName) {
  if (confirm(`¿Eliminar la columna del bloque horario "${slotName}" y sus materias asignadas?`)) {
    try {
      await API.deleteTimeSlot(State.activeCalendarId, slotName);
      
      State.calendars = await API.getCalendars();
      const activeCal = await API.getCalendarById(State.activeCalendarId);
      if (activeCal) {
        State.timeSlots = Array.isArray(activeCal.timeSlots) ? [...activeCal.timeSlots] : [];
      } else {
        State.timeSlots = State.timeSlots.filter(s => s !== slotName);
      }
      State.scheduleCells = await API.getScheduleCells(State.activeCalendarId);
      
      renderMatrix();
      UI.showToast(`Bloque horario "${slotName}" eliminado del horario`, 'success');
    } catch (err) {
      UI.showToast('Error al eliminar bloque horario', 'error');
    }
  }
}

// SAVE CELL INDIVIDUALLY
async function handleSaveCell(cellData) {
  try {
    const payload = {
      calendarId: State.activeCalendarId,
      group: cellData.group,
      day: cellData.day,
      timeSlot: cellData.timeSlot,
      subject: cellData.subject,
      teacher: cellData.teacher,
      classroom: cellData.classroom
    };

    await API.saveSingleCell(payload);

    // Refresh catalogs in case new subject, teacher or classroom was typed
    await reloadAllCatalogs();

    // Re-fetch fresh cells directly from MongoDB
    const freshCells = await API.getScheduleCells(State.activeCalendarId);
    if (Array.isArray(freshCells)) {
      State.scheduleCells = freshCells;
    }

    const isDelete = !cellData.subject && !cellData.teacher && !cellData.classroom;
    UI.showToast(isDelete ? `Celda borrada (${cellData.group})` : `¡Guardado en MongoDB: ${cellData.subject || 'Clase'} (${cellData.group})!`, 'success');
    renderMatrix();
  } catch (err) {
    console.error(err);
    UI.showToast('Error al guardar en MongoDB', 'error');
  }
}

// SAVE BATCH SCHEDULE
async function handleSaveBatchSchedule() {
  const table = document.getElementById('scheduleTableBody');
  const boxes = table.querySelectorAll('.schedule-cell-input-box');
  const cellsToSave = [];

  boxes.forEach(box => {
    const group = box.dataset.group;
    const timeSlot = box.dataset.slot;
    const subject = box.querySelector('.cell-field-subject').value;
    const teacher = box.querySelector('.cell-field-teacher').value;
    const classroom = box.querySelector('.cell-field-classroom').value;

    cellsToSave.push({
      group,
      day: State.selectedDay,
      timeSlot,
      subject,
      teacher,
      classroom
    });
  });

  try {
    const updatedCells = await API.saveBatchCells(State.activeCalendarId, { calendarId: State.activeCalendarId, cells: cellsToSave });
    if (Array.isArray(updatedCells)) {
      State.scheduleCells = updatedCells;
    } else {
      State.scheduleCells = await API.getScheduleCells(State.activeCalendarId);
    }
    await reloadAllCatalogs();
    renderMatrix();
    UI.showToast('¡Horario completo guardado en MongoDB Atlas!', 'success');
  } catch (err) {
    UI.showToast('Error al guardar horario completo', 'error');
  }
}

// DELETE FOLDER
async function handleDeleteFolder(folderId) {
  try {
    await API.deleteFolder(folderId);
    UI.showToast('Carpeta eliminada', 'success');
    await refreshSidebar();
  } catch (err) {
    UI.showToast('Error al eliminar carpeta', 'error');
  }
}

// DELETE EVENT
async function handleDeleteEvent(eventId) {
  if (confirm('¿Eliminar este evento del cronograma?')) {
    try {
      await API.deleteEvent(eventId);
      UI.showToast('Evento eliminado', 'success');
      const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
      await loadCalendarData(State.activeCalendarId, canCurrentUserEdit(activeCal));
    } catch (err) {
      UI.showToast('Error al eliminar evento', 'error');
    }
  }
}

// EVENT LISTENERS SETUP
function setupEventListeners() {
  // DAY FILTER CHIPS
  document.querySelectorAll('.day-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.day-chip').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      State.selectedDay = e.target.dataset.day;
      localStorage.setItem('selectedDay', State.selectedDay);

      renderMatrix();
    });
  });

  // CATEGORY FILTER CHIPS
  document.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.category-chip').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      State.selectedCategory = e.target.dataset.cat;

      const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
      const canEdit = canCurrentUserEdit(activeCal);
      UI.renderEventsGrid(State.events, State.selectedCategory, canEdit, handleDeleteEvent, openEventModal);
    });
  });

  // VIEW SWITCHER (HORARIO vs CRONOGRAMA vs GESTIÓN ACADÉMICA)
  const btnSchedule = document.getElementById('btnViewSchedule');
  const btnEvents = document.getElementById('btnViewEvents');
  const btnCatalogs = document.getElementById('btnViewCatalogs');
  const viewSchedule = document.getElementById('scheduleView');
  const viewEvents = document.getElementById('eventsView');
  const viewCatalogs = document.getElementById('catalogsView');

  const switchView = (viewName) => {
    State.activeView = viewName;
    if (btnSchedule) btnSchedule.classList.toggle('active', viewName === 'schedule');
    if (btnEvents) btnEvents.classList.toggle('active', viewName === 'events');
    if (btnCatalogs) btnCatalogs.classList.toggle('active', viewName === 'catalogs');

    if (viewSchedule) viewSchedule.classList.toggle('active', viewName === 'schedule');
    if (viewEvents) viewEvents.classList.toggle('active', viewName === 'events');
    if (viewCatalogs) viewCatalogs.classList.toggle('active', viewName === 'catalogs');

    if (viewName === 'catalogs') {
      renderCatalogs();
    }
  };

  if (btnSchedule) btnSchedule.addEventListener('click', () => switchView('schedule'));
  if (btnEvents) btnEvents.addEventListener('click', () => switchView('events'));
  if (btnCatalogs) btnCatalogs.addEventListener('click', () => switchView('catalogs'));

  // CATALOG SUBTABS (Grupos, Aulas, Materias, Maestros)
  document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.catalog-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.catalog-tab-panel').forEach(p => p.classList.remove('active'));

      const targetTab = btn.dataset.tab;
      btn.classList.add('active');
      const panel = document.getElementById(targetTab);
      if (panel) panel.classList.add('active');
    });
  });

  // FORM: ADD GRUPO TO CATALOG
  const formAddGrupo = document.getElementById('formAddGrupoCatalog');
  if (formAddGrupo) {
    formAddGrupo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('inputNewGrupoName');
      const nombre = input.value.trim();
      if (!nombre) return;

      try {
        await API.createGrupoEntity({ nombre, calendarId: State.activeCalendarId });
        UI.showToast(`Grupo "${nombre}" guardado en MongoDB Atlas`, 'success');
        input.value = '';
        await reloadAllCatalogs();
        if (State.activeCalendarId) {
          const cal = await API.getCalendarById(State.activeCalendarId);
          if (cal && cal.groups) State.groups = cal.groups;
          renderMatrix();
        }
      } catch (err) {
        UI.showToast(err.message || 'Error al guardar grupo', 'error');
      }
    });
  }

  // FORM: ADD AULA TO CATALOG
  const formAddAula = document.getElementById('formAddAulaCatalog');
  if (formAddAula) {
    formAddAula.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameIn = document.getElementById('inputNewAulaName');
      const locIn = document.getElementById('inputNewAulaLocation');
      const nombre = nameIn.value.trim();
      const ubicacion = locIn.value.trim();
      if (!nombre) return;

      try {
        await API.createAula({ nombre, ubicacion });
        UI.showToast(`Aula "${nombre}" guardada en MongoDB Atlas`, 'success');
        nameIn.value = '';
        locIn.value = '';
        await reloadAllCatalogs();
      } catch (err) {
        UI.showToast(err.message || 'Error al guardar aula', 'error');
      }
    });
  }

  // FORM: ADD MATERIA TO CATALOG
  const formAddMateria = document.getElementById('formAddMateriaCatalog');
  if (formAddMateria) {
    formAddMateria.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameIn = document.getElementById('inputNewMateriaName');
      const codeIn = document.getElementById('inputNewMateriaCode');
      const nombre = nameIn.value.trim();
      const codigo = codeIn.value.trim();
      if (!nombre) return;

      try {
        await API.createMateria({ nombre, codigo });
        UI.showToast(`Materia "${nombre}" guardada en MongoDB Atlas`, 'success');
        nameIn.value = '';
        codeIn.value = '';
        await reloadAllCatalogs();
      } catch (err) {
        UI.showToast(err.message || 'Error al guardar materia', 'error');
      }
    });
  }

  // FORM: ADD MAESTRO / INSTITUTIONAL USER TO CATALOG
  const formAddMaestro = document.getElementById('formAddMaestroCatalog');
  if (formAddMaestro) {
    formAddMaestro.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameIn = document.getElementById('inputNewMaestroName');
      const emailIn = document.getElementById('inputNewMaestroEmail');
      const avatarIn = document.getElementById('selectNewMaestroAvatar');
      const roleIn = document.getElementById('selectNewMaestroRole');
      const name = nameIn.value.trim();
      const email = emailIn.value.trim();
      const avatar = avatarIn ? avatarIn.value : '👨‍🏫';
      const role = roleIn ? roleIn.value : 'editor';
      if (!name || !email) return;

      if (role === 'viewer' && !email.toLowerCase().endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
        return UI.showToast('Los estudiantes deben registrarse con el correo institucional @ieluiscarlosgalansarmiento.edu.co', 'error');
      }

      try {
        await API.createTeacher({ name, email, avatar, role });
        UI.showToast(`Usuario "${name}" (${role.toUpperCase()}) guardado en MongoDB Atlas`, 'success');
        nameIn.value = '';
        emailIn.value = '';
        await reloadAllCatalogs();
        UI.renderUsers(State.users, State.activeUserId);
      } catch (err) {
        UI.showToast(err.message || 'Error al guardar usuario institucional', 'error');
      }
    });
  }

  // BUTTON SYNC GRUPOS TO CALENDAR
  const btnSyncGrupos = document.getElementById('btnSyncGruposToCal');
  if (btnSyncGrupos) {
    btnSyncGrupos.addEventListener('click', handleSyncGruposToCal);
  }

  // SAVE BATCH SCHEDULE BUTTON
  document.getElementById('btnSaveScheduleBatch').addEventListener('click', handleSaveBatchSchedule);

  // ADD NEW GROUP BUTTON IN MATRIX
  document.getElementById('btnAddGroupBtn').addEventListener('click', () => openGroupModal(''));

  // ADD NEW TIME SLOT BUTTON IN MATRIX
  document.getElementById('btnAddSlotBtn').addEventListener('click', () => openSlotModal(''));

  // MODAL OPENERS
  document.getElementById('btnNewCalendar').addEventListener('click', () => openCalendarModal());
  document.getElementById('btnEditCalendar').addEventListener('click', () => {
    const cal = State.calendars.find(c => c._id === State.activeCalendarId);
    openCalendarModal(cal);
  });
  document.getElementById('btnNewFolder').addEventListener('click', () => openFolderModal());
  document.getElementById('btnShareCalendar').addEventListener('click', () => openPermissionsModal());
  document.getElementById('btnAddEventBtn').addEventListener('click', () => openEventModal());

  // MODAL CLOSE BUTTONS
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.target.closest('[data-close]').dataset.close;
      document.getElementById(modalId).classList.remove('active');
    });
  });

  // CALENDAR FORM SUBMIT
  document.getElementById('calendarForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('calIdInput').value;
    const selectedFolder = document.getElementById('calFolderSelect').value.trim();
    const payload = {
      name: document.getElementById('calNameInput').value.trim(),
      type: document.getElementById('calTypeSelect').value,
      folderId: selectedFolder || null,
      color: document.getElementById('calColorInput').value,
      icon: document.getElementById('calIconInput').value.trim() || '📅',
      description: document.getElementById('calDescInput').value.trim(),
      ownerId: State.activeUserId
    };

    try {
      let result;
      if (id) {
        result = await API.updateCalendar(id, payload);
        UI.showToast('Calendario actualizado con éxito', 'success');
      } else {
        result = await API.createCalendar(payload);
        UI.showToast('¡Calendario creado con éxito en la carpeta!', 'success');
      }

      document.getElementById('calendarModal').classList.remove('active');
      await refreshSidebar();
      if (result && result._id) {
        await selectCalendar(result._id);
      }
    } catch (err) {
      console.error('Error al guardar calendario:', err);
      UI.showToast(err.message || 'Error al guardar calendario', 'error');
    }
  });

  // FOLDER FORM SUBMIT (CREATE OR EDIT)
  document.getElementById('folderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const folderId = document.getElementById('folderIdInput').value;
    const payload = {
      name: document.getElementById('folderNameInput').value.trim(),
      color: document.getElementById('folderColorInput').value,
      icon: document.getElementById('folderIconInput').value.trim() || '📁',
      ownerId: State.activeUserId
    };

    try {
      if (folderId) {
        await API.updateFolder(folderId, payload);
        UI.showToast('Carpeta actualizada correctamente', 'success');
      } else {
        await API.createFolder(payload);
        UI.showToast('Carpeta creada con éxito en la base de datos', 'success');
      }
      document.getElementById('folderModal').classList.remove('active');
      await refreshSidebar();
    } catch (err) {
      console.error('Error al guardar carpeta:', err);
      UI.showToast(err.message || 'Error al guardar carpeta', 'error');
    }
  });

  // PERMISSIONS FORM SUBMIT
  document.getElementById('permissionsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const visibility = document.querySelector('input[name="visibility"]:checked').value;
    const allowedEditors = Array.from(document.querySelectorAll('.chk-editor:checked')).map(cb => cb.value);
    const allowedViewers = Array.from(document.querySelectorAll('.chk-viewer:checked')).map(cb => cb.value);

    try {
      await API.updatePermissions(State.activeCalendarId, {
        visibility,
        allowedEditors,
        allowedViewers
      });

      document.getElementById('permissionsModal').classList.remove('active');
      UI.showToast('Permisos actualizados en MongoDB', 'success');

      const cal = await API.getCalendarById(State.activeCalendarId);
      const canEdit = canCurrentUserEdit(cal);
      UI.renderCalendarHeader(cal, canEdit);
      renderMatrix();
    } catch (err) {
      UI.showToast('Error al actualizar permisos', 'error');
    }
  });

  // EVENT FORM SUBMIT
  document.getElementById('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventId = document.getElementById('eventIdInput').value;

    const teacherIdVal = document.getElementById('eventTeacherSelect').value;
    const classroomVal = document.getElementById('eventClassroomInput').value;
    const groupVal = document.getElementById('eventGroupInput').value;
    const subjectVal = document.getElementById('eventSubjectInput').value;

    const isRecurrent = document.getElementById('eventRecurrentCheck').checked;
    const recurrentDays = Array.from(document.querySelectorAll('.chk-recurrent-day:checked')).map(cb => cb.value);

    const payload = {
      calendarId: State.activeCalendarId,
      titulo: document.getElementById('eventTitleInput').value,
      description: document.getElementById('eventDescInput').value,
      materia_id: subjectVal || null,
      profesor_id: teacherIdVal || null,
      grupo_id: groupVal || null,
      aula_id: classroomVal || null,
      fecha_inicio: `${document.getElementById('eventDateInput').value}T${document.getElementById('eventStartInput').value}:00`,
      fecha_fin: document.getElementById('eventEndDateInput').value
        ? `${document.getElementById('eventEndDateInput').value}T${document.getElementById('eventEndInput').value}:00`
        : `${document.getElementById('eventDateInput').value}T${document.getElementById('eventEndInput').value}:00`,
      category: document.getElementById('eventCategorySelect').value,
      color: document.getElementById('eventColorInput').value,
      recurrencia: {
        esRecurrente: isRecurrent,
        frecuencia: document.getElementById('eventFreqSelect').value,
        diasSemana: recurrentDays
      }
    };

    try {
      if (eventId) {
        await API.updateEvent(eventId, payload);
        UI.showToast('Evento actualizado', 'success');
      } else {
        await API.createEvent(payload);
        UI.showToast('¡Evento guardado en MongoDB!', 'success');
      }

      // Auto-register any new group, aula, materia
      if (groupVal) await API.createGrupoEntity({ nombre: groupVal });
      if (classroomVal) await API.createAula({ nombre: classroomVal });
      if (subjectVal) await API.createMateria({ nombre: subjectVal });
      await reloadAllCatalogs();

      document.getElementById('eventModal').classList.remove('active');
      const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
      await loadCalendarData(State.activeCalendarId, canCurrentUserEdit(activeCal));
    } catch (err) {
      UI.showToast('Error al guardar evento', 'error');
    }
  });

  // GROUP FORM SUBMIT (MATRIX)
  document.getElementById('groupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldGroup = document.getElementById('oldGroupInput').value;
    const newGroup = document.getElementById('groupNameInput').value.trim();

    if (!newGroup) return;

    try {
      if (oldGroup) {
        await API.renameGroup(State.activeCalendarId, oldGroup, newGroup);
        UI.showToast(`Grupo renombrado a "${newGroup}"`, 'success');
      } else {
        await API.addGroup(State.activeCalendarId, newGroup);
        await API.createGrupoEntity({ nombre: newGroup });
        UI.showToast(`Grupo "${newGroup}" guardado en MongoDB`, 'success');
      }

      await reloadAllCatalogs();

      // Re-fetch calendar and cells directly from MongoDB Atlas
      const activeCal = await API.getCalendarById(State.activeCalendarId);
      if (activeCal) {
        State.groups = Array.isArray(activeCal.groups) ? [...activeCal.groups] : [newGroup];
        if (Array.isArray(activeCal.timeSlots)) {
          State.timeSlots = [...activeCal.timeSlots];
        }
      } else if (!State.groups.includes(newGroup)) {
        State.groups.push(newGroup);
      }
      State.scheduleCells = await API.getScheduleCells(State.activeCalendarId);

      document.getElementById('groupModal').classList.remove('active');
      renderMatrix();
    } catch (err) {
      console.error(err);
      UI.showToast('Error al guardar el grupo', 'error');
    }
  });

  // TIME SLOT FORM SUBMIT (MATRIX)
  document.getElementById('slotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldSlot = document.getElementById('oldSlotInput').value;
    const newSlot = document.getElementById('slotNameInput').value.trim();

    if (!newSlot) return;

    try {
      if (oldSlot) {
        await API.renameTimeSlot(State.activeCalendarId, oldSlot, newSlot);
        UI.showToast(`Bloque horario actualizado a "${newSlot}"`, 'success');
      } else {
        await API.addTimeSlot(State.activeCalendarId, newSlot);
        UI.showToast(`Bloque horario "${newSlot}" guardado en MongoDB`, 'success');
      }

      // Re-fetch calendars list and active calendar directly from MongoDB Atlas
      State.calendars = await API.getCalendars();
      const activeCal = await API.getCalendarById(State.activeCalendarId);
      if (activeCal) {
        if (Array.isArray(activeCal.timeSlots)) {
          State.timeSlots = [...activeCal.timeSlots];
        }
        if (Array.isArray(activeCal.groups)) {
          State.groups = [...activeCal.groups];
        }
      }
      State.scheduleCells = await API.getScheduleCells(State.activeCalendarId);

      document.getElementById('slotModal').classList.remove('active');
      renderMatrix();
    } catch (err) {
      console.error(err);
      UI.showToast('Error al guardar bloque horario', 'error');
    }
  });

  // DELETE CALENDAR BUTTON
  document.getElementById('btnDeleteCalendar').addEventListener('click', async () => {
    if (confirm('¿Estás seguro de eliminar este calendario y todos sus datos?')) {
      try {
        await API.deleteCalendar(State.activeCalendarId);
        UI.showToast('Calendario eliminado', 'success');
        await refreshSidebar();
        if (State.calendars.length > 0) {
          await selectCalendar(State.calendars[0]._id);
        }
      } catch (err) {
        UI.showToast('Error al eliminar calendario', 'error');
      }
    }
  });

  // AUTH MODAL & TABS NAVIGATION
  const tabAuthLogin = document.getElementById('tabAuthLogin');
  const tabAuthAdmin = document.getElementById('tabAuthAdmin');
  const loginView = document.getElementById('loginView');
  const adminMgmtView = document.getElementById('adminMgmtView');

  const switchToLoginView = () => {
    document.getElementById('authModal')?.classList.add('active');
    if (tabAuthLogin) {
      tabAuthLogin.classList.add('active');
      tabAuthLogin.style.color = '#2563eb';
      tabAuthLogin.style.borderBottom = '3px solid #2563eb';
    }
    if (tabAuthAdmin) {
      tabAuthAdmin.classList.remove('active');
      tabAuthAdmin.style.color = '#64748b';
      tabAuthAdmin.style.borderBottom = '3px solid transparent';
    }
    if (loginView) {
      loginView.classList.add('active');
      loginView.style.display = 'block';
    }
    if (adminMgmtView) {
      adminMgmtView.classList.remove('active');
      adminMgmtView.style.display = 'none';
    }

    // Siempre mostrar el formulario de acceso al entrar a la pestaña Iniciar Sesión
    const loginMain = document.getElementById('loginMainBox');
    const loginRec = document.getElementById('loginRecoveryBox');
    if (loginMain) loginMain.style.display = 'block';
    if (loginRec) loginRec.style.display = 'none';
  };

  const switchToAdminMgmtView = async () => {
    if (!State.currentUser || State.currentUser.role !== 'admin') {
      UI.showToast('Acceso denegado: Sección reservada exclusivamente para Administradores.', 'warning');
      switchToLoginView();
      return;
    }

    document.getElementById('authModal')?.classList.add('active');
    if (tabAuthAdmin) {
      tabAuthAdmin.classList.add('active');
      tabAuthAdmin.style.color = '#d97706';
      tabAuthAdmin.style.borderBottom = '3px solid #d97706';
    }
    if (tabAuthLogin) {
      tabAuthLogin.classList.remove('active');
      tabAuthLogin.style.color = '#64748b';
      tabAuthLogin.style.borderBottom = '3px solid transparent';
    }
    if (adminMgmtView) {
      adminMgmtView.classList.add('active');
      adminMgmtView.style.display = 'block';
    }
    if (loginView) {
      loginView.classList.remove('active');
      loginView.style.display = 'none';
    }

    await populateAdminUserLists();
  };

  tabAuthLogin?.addEventListener('click', switchToLoginView);
  tabAuthAdmin?.addEventListener('click', switchToAdminMgmtView);

  document.getElementById('btnOpenAuthModal')?.addEventListener('click', () => {
    document.getElementById('authModal')?.classList.add('active');
    if (State.currentUser && State.currentUser.role === 'admin') {
      switchToAdminMgmtView();
    } else {
      switchToLoginView();
    }
  });

  document.getElementById('userProfileBadge')?.addEventListener('click', () => {
    document.getElementById('authModal')?.classList.add('active');
    if (State.currentUser && State.currentUser.role === 'admin') {
      switchToAdminMgmtView();
    } else {
      switchToLoginView();
    }
  });

  // CARGAR DIRECTORIO Y SELECTORES DE USUARIOS PARA ADMINISTRADOR
  async function populateAdminUserLists() {
    try {
      const users = await API.getUsers();
      State.users = users;

      const badge = document.getElementById('adminUsersCountBadge');
      if (badge) badge.textContent = `${users.length} usuarios registrados`;

      const modSelect = document.getElementById('adminModUserSelect');
      if (modSelect) {
        const prevVal = modSelect.value;
        modSelect.innerHTML = '<option value="">-- Seleccionar usuario o estudiante --</option>';
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u._id;
          opt.textContent = `${u.avatar || '👤'} ${u.name} — [${u.role.toUpperCase()}] (${u.email})`;
          modSelect.appendChild(opt);
        });
        if (prevVal) modSelect.value = prevVal;
      }

      const container = document.getElementById('adminUsersListContainer');
      if (container) {
        if (users.length === 0) {
          container.innerHTML = '<div style="padding:1rem; text-align:center; color:#64748b; font-size:0.85rem;">No hay usuarios registrados.</div>';
          return;
        }

        container.innerHTML = users.map(u => {
          let roleTag = '';
          if (u.role === 'admin') {
            roleTag = '<span style="background:#fef3c7; color:#92400e; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid #fde68a; white-space:nowrap;">👑 Admin</span>';
          } else if (u.role === 'editor') {
            roleTag = '<span style="background:#eff6ff; color:#1e40af; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid #bfdbfe; white-space:nowrap;">👨‍🏫 Docente</span>';
          } else {
            roleTag = '<span style="background:#f0fdf4; color:#166534; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid #bbf7d0; white-space:nowrap;">🎓 Estudiante</span>';
          }

          const isCurrent = State.currentUser && State.currentUser._id === u._id;
          const isOfficialMail = u.email === 'calendariolcgs@gmail.com';
          const canDelete = !isCurrent && !isOfficialMail;

          return `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:0.75rem 0.95rem; border-bottom:1px solid #f1f5f9; gap:0.75rem; background:#ffffff; transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
              <div style="display:flex; align-items:flex-start; gap:0.65rem; min-width:0; flex:1;">
                <span style="font-size:1.35rem; line-height:1.2; flex-shrink:0; margin-top:2px;">${u.avatar || '👤'}</span>
                <div style="min-width:0; flex:1; word-break:break-word; overflow-wrap:anywhere;">
                  <div style="font-weight:600; font-size:0.875rem; color:#0f172a; word-break:break-word; overflow-wrap:anywhere; line-height:1.35;">
                    ${u.name} ${isCurrent ? '<span style="font-size:0.7rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:1px 6px; border-radius:4px; margin-left:4px; white-space:nowrap;">(Tú)</span>' : ''}
                  </div>
                  <div style="font-size:0.76rem; color:#475569; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin-top:3px; word-break:break-all; overflow-wrap:anywhere; line-height:1.35;">
                    <i class="fa-solid fa-envelope" style="font-size:0.72rem; color:#94a3b8; margin-right:4px;"></i>${u.email}
                  </div>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.4rem; flex-shrink:0;">
                <div>${roleTag}</div>
                <div style="display:flex; align-items:center; gap:0.35rem;">
                  <button type="button" class="btn-quick-mod-role" data-id="${u._id}" data-role="${u.role}" title="Modificar rol de este usuario" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; font-size:0.75rem; cursor:pointer; color:#334155; display:inline-flex; align-items:center; gap:0.3rem;">
                    <i class="fa-solid fa-user-pen"></i> <span style="font-size:0.72rem;">Rol</span>
                  </button>
                  ${canDelete ? `
                    <button type="button" class="btn-delete-user" data-id="${u._id}" data-name="${u.name}" title="Eliminar usuario" style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:3px 7px; font-size:0.75rem; cursor:pointer; color:#dc2626;">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');

        container.querySelectorAll('.btn-delete-user').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            const name = e.currentTarget.dataset.name;
            if (confirm(`¿Está seguro de eliminar al usuario "${name}"? Esta acción no se puede deshacer.`)) {
              try {
                await API.deleteUser(id);
                UI.showToast(`Usuario ${name} eliminado`, 'info');
                await reloadAllCatalogs();
                await populateAdminUserLists();
              } catch (err) {
                UI.showToast(err.message || 'Error al eliminar usuario', 'error');
              }
            }
          });
        });

        container.querySelectorAll('.btn-quick-mod-role').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const selectEl = document.getElementById('adminModUserSelect');
            if (selectEl) {
              selectEl.value = id;
              selectEl.dispatchEvent(new Event('change'));
              selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        });
      }
    } catch (err) {
      console.error('Error al cargar lista de usuarios admin:', err);
    }
  }

  // DETALLE AL SELECCIONAR USUARIO PARA MODIFICAR ROL (AJUSTE ESTÉTICO SIN PÉRDIDA DE INFORMACIÓN)
  document.getElementById('adminModUserSelect')?.addEventListener('change', (e) => {
    const userId = e.target.value;
    const infoBox = document.getElementById('adminModUserInfo');
    const descSpan = document.getElementById('adminModUserDesc');
    const roleSelect = document.getElementById('adminModRoleSelect');

    if (!userId) {
      if (infoBox) infoBox.style.display = 'none';
      return;
    }

    const user = State.users.find(u => u._id === userId);
    if (user) {
      if (infoBox) infoBox.style.display = 'block';
      if (descSpan) {
        descSpan.innerHTML = `
          <div style="display:flex; align-items:flex-start; gap:0.75rem; word-break:break-word; overflow-wrap:anywhere;">
            <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">${user.avatar || '👤'}</span>
            <div style="min-width:0; flex:1;">
              <div style="font-weight:700; color:#0f172a; font-size:0.92rem; word-break:break-word; overflow-wrap:anywhere; line-height:1.35;">${user.name}</div>
              <div style="font-size:0.8rem; color:#475569; font-family:ui-monospace, monospace; margin-top:3px; word-break:break-all; overflow-wrap:anywhere; line-height:1.35;">
                <i class="fa-solid fa-envelope" style="color:#94a3b8; font-size:0.75rem; margin-right:3px;"></i>${user.email}
              </div>
              <div style="font-size:0.78rem; margin-top:5px; color:#64748b;">
                Rol actual: <span style="text-transform:uppercase; font-weight:700; color:#2563eb; background:#eff6ff; padding:2px 7px; border-radius:4px; border:1px solid #bfdbfe;">${user.role}</span>
              </div>
            </div>
          </div>
        `;
      }
      if (roleSelect) {
        roleSelect.value = user.role;
      }
    }
  });

  // BOTÓN PARA VISIBILIZAR / OCULTAR CONTRASEÑA EN REGISTRO ADMIN
  document.getElementById('btnToggleAdminRegPassword')?.addEventListener('click', () => {
    const passInput = document.getElementById('adminRegPassword');
    const eyeIcon = document.getElementById('iconEyeAdminReg');
    if (passInput) {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      if (eyeIcon) {
        eyeIcon.className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      }
    }
  });

  // COLOR PICKER VAL DISPLAY PARA ADMIN REGISTER
  document.getElementById('adminRegColor')?.addEventListener('input', (e) => {
    const val = document.getElementById('adminRegColorVal');
    if (val) val.textContent = e.target.value;
  });

  // SUBMIT FORMULARIO REGISTRAR ESTUDIANTE / USUARIO (SOLO ADMIN)
  document.getElementById('adminRegisterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!State.currentUser || State.currentUser.role !== 'admin') {
      UI.showToast('Acceso denegado: Solo administradores pueden registrar estudiantes o usuarios.', 'error');
      return;
    }

    const name = document.getElementById('adminRegName').value.trim();
    const email = document.getElementById('adminRegEmail').value.trim();
    const password = document.getElementById('adminRegPassword').value;
    const role = document.getElementById('adminRegRole').value;
    const avatar = document.getElementById('adminRegAvatar').value;
    const color = document.getElementById('adminRegColor').value;
    const submitBtn = document.getElementById('btnAdminSubmitRegister');

    if (role === 'viewer' && !email.toLowerCase().endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
      UI.showToast('Los estudiantes deben registrarse obligatoriamente con el correo institucional @ieluiscarlosgalansarmiento.edu.co', 'warning');
      return;
    }

    const originalText = submitBtn.innerHTML;
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';

      const newUser = await API.register({ name, email, password, role, avatar, color });
      UI.showToast(`¡${newUser.name} registrado exitosamente como ${newUser.role.toUpperCase()}!`, 'success');

      document.getElementById('adminRegisterForm').reset();
      document.getElementById('adminRegAvatar').value = '🎓';
      document.getElementById('adminRegColor').value = '#3b82f6';
      document.getElementById('adminRegColorVal').textContent = '#3b82f6';

      await reloadAllCatalogs();
      await populateAdminUserLists();
    } catch (err) {
      UI.showToast(err.message || 'Error al registrar usuario', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // SUBMIT FORMULARIO MODIFICAR ROL (SOLO ADMIN)
  document.getElementById('adminModifyRoleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!State.currentUser || State.currentUser.role !== 'admin') {
      UI.showToast('Acceso denegado: Solo administradores pueden modificar roles.', 'error');
      return;
    }

    const userId = document.getElementById('adminModUserSelect').value;
    const newRole = document.getElementById('adminModRoleSelect').value;
    const submitBtn = document.getElementById('btnAdminSubmitModifyRole');

    if (!userId) {
      UI.showToast('Por favor seleccione un usuario para modificar su rol.', 'warning');
      return;
    }

    const targetUser = State.users.find(u => u._id === userId);
    if (!targetUser) {
      UI.showToast('Usuario no encontrado.', 'error');
      return;
    }

    if (newRole === 'viewer' && !targetUser.email.toLowerCase().endsWith('@ieluiscarlosgalansarmiento.edu.co')) {
      UI.showToast('Para asignar rol de Estudiante, el correo debe terminar en @ieluiscarlosgalansarmiento.edu.co', 'warning');
      return;
    }

    const originalText = submitBtn.innerHTML;
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

      const updated = await API.updateUser(userId, { role: newRole });
      UI.showToast(`¡Rol de ${updated.name} actualizado a ${updated.role.toUpperCase()}!`, 'success');

      // Si el administrador modificó su propia cuenta
      if (State.currentUser && State.currentUser._id === userId) {
        State.currentUser.role = newRole;
        localStorage.setItem('currentUser', JSON.stringify(State.currentUser));
        applyRolePermissions();
      }

      await reloadAllCatalogs();
      await populateAdminUserLists();
    } catch (err) {
      UI.showToast(err.message || 'Error al modificar rol', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // Alternar vista de recuperación EXCLUSIVAMENTE dentro de Iniciar Sesión
  const showRecoveryInLoginView = () => {
    const loginMain = document.getElementById('loginMainBox');
    const loginRec = document.getElementById('loginRecoveryBox');
    if (loginMain) loginMain.style.display = 'none';
    if (loginRec) loginRec.style.display = 'block';

    const curEmail = document.getElementById('loginEmailInput')?.value;
    if (curEmail) {
      document.getElementById('forgotEmailInput').value = curEmail;
    }
    setTimeout(() => document.getElementById('forgotEmailInput')?.focus(), 150);
  };

  const showMainInLoginView = () => {
    const loginMain = document.getElementById('loginMainBox');
    const loginRec = document.getElementById('loginRecoveryBox');
    if (loginRec) loginRec.style.display = 'none';
    if (loginMain) loginMain.style.display = 'block';
    setTimeout(() => document.getElementById('loginPasswordInput')?.focus(), 150);
  };

  const btnForgotPass = document.getElementById('btnForgotPass');
  if (btnForgotPass) {
    btnForgotPass.addEventListener('click', showRecoveryInLoginView);
  }

  const btnBackToLogin = document.getElementById('btnBackToLoginFromForgot');
  if (btnBackToLogin) {
    btnBackToLogin.addEventListener('click', showMainInLoginView);
  }

  // SOLICITAR CÓDIGO DE RECUPERACIÓN (PASO 1)
  const formRequestResetCode = document.getElementById('formRequestResetCode');
  if (formRequestResetCode) {
    formRequestResetCode.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmailInput').value.trim();
      const sendBtn = document.getElementById('btnSendResetCode');
      const originalText = sendBtn.innerHTML;

      try {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

        const response = await API.forgotPassword(email);

        const emailNotice = document.getElementById('emailSentNotification');
        if (emailNotice) {
          emailNotice.style.display = 'block';
        }

        UI.showToast(response.message || 'Código de seguridad enviado a tu correo institucional.', 'success');
        document.getElementById('resetCodeInput').value = '';
        document.getElementById('resetCodeInput').focus();
      } catch (err) {
        UI.showToast(err.message || 'Error al solicitar código de recuperación', 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalText;
      }
    });
  }

  // RESTABLECER CONTRASEÑA (PASO 2)
  const formConfirmResetPassword = document.getElementById('formConfirmResetPassword');
  if (formConfirmResetPassword) {
    formConfirmResetPassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmailInput').value.trim();
      const code = document.getElementById('resetCodeInput').value.trim();
      const newPassword = document.getElementById('newPasswordInput').value;
      const confirmPassword = document.getElementById('confirmNewPasswordInput').value;
      const saveBtn = document.getElementById('btnSaveNewPassword');

      if (!email) {
        UI.showToast('Por favor ingrese su correo institucional en el paso 1', 'warning');
        return;
      }

      if (!code || code.length !== 6) {
        UI.showToast('Ingrese el código de 6 dígitos que recibió en su correo.', 'warning');
        return;
      }

      if (newPassword !== confirmPassword) {
        UI.showToast('Las contraseñas no coinciden. Verifícalas.', 'warning');
        return;
      }

      if (newPassword.length < 4) {
        UI.showToast('La nueva contraseña debe tener al menos 4 caracteres.', 'warning');
        return;
      }

      const originalText = saveBtn.innerHTML;
      try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

        const res = await API.resetPassword(email, code, newPassword);

        UI.showToast(res.message || '¡Contraseña actualizada con éxito!', 'success');

        // Configurar credenciales en el login y volver al formulario principal
        document.getElementById('loginEmailInput').value = email;
        document.getElementById('loginPasswordInput').value = newPassword;

        // Limpiar formularios de recuperación
        formConfirmResetPassword.reset();
        formRequestResetCode.reset();
        const emailNotice = document.getElementById('emailSentNotification');
        if (emailNotice) emailNotice.style.display = 'none';

        // Volver a la vista principal de login con los datos listos
        showMainInLoginView();
      } catch (err) {
        UI.showToast(err.message || 'Error al restablecer contraseña', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    });
  }

  // FAST DEMO USER BUTTONS (1-CLICK)
  document.querySelectorAll('.btn-demo-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const email = e.currentTarget.dataset.email;
      const pass = e.currentTarget.dataset.pass;
      document.getElementById('loginEmailInput').value = email;
      document.getElementById('loginPasswordInput').value = pass;
      document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    });
  });

  // LOGIN FORM SUBMIT
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmailInput').value.trim();
    const pass = document.getElementById('loginPasswordInput').value;

    try {
      const user = await API.login(email, pass);
      State.currentUser = user;
      State.activeUserId = user._id;
      localStorage.setItem('currentUser', JSON.stringify(user));

      loadUserHiddenPreferences();
      applyRolePermissions();
      document.getElementById('authModal').classList.remove('active');
      UI.showToast(`¡Bienvenido/a, ${user.name}! Rol: ${user.role.toUpperCase()}`, 'success');

      await reloadAllCatalogs();
      await refreshSidebar();
      if (State.activeCalendarId) {
        await selectCalendar(State.activeCalendarId);
      }
    } catch (err) {
      UI.showToast(err.message || 'Error al iniciar sesión', 'error');
    }
  });

  // LOGOUT BUTTON
  document.getElementById('btnLogoutBtn')?.addEventListener('click', async () => {
    State.currentUser = null;
    State.activeUserId = null;
    localStorage.removeItem('currentUser');
    loadUserHiddenPreferences();
    applyRolePermissions();
    switchToLoginView();
    UI.showToast('Sesión cerrada. Modo consulta activo.', 'info');
    await reloadAllCatalogs();
    await refreshSidebar();
    if (State.activeCalendarId) {
      await selectCalendar(State.activeCalendarId);
    }
  });

  // COLOR PICKERS VALUE DISPLAY
  document.getElementById('calColorInput')?.addEventListener('input', (e) => {
    document.getElementById('calColorVal').textContent = e.target.value;
  });
  document.getElementById('folderColorInput')?.addEventListener('input', (e) => {
    document.getElementById('folderColorVal').textContent = e.target.value;
  });

  // RECURRENCE CHECKBOX TOGGLE IN EVENT MODAL
  document.getElementById('eventRecurrentCheck')?.addEventListener('change', (e) => {
    const fields = document.getElementById('recurrenceFieldsGroup');
    if (fields) fields.style.display = e.target.checked ? 'block' : 'none';
  });

  // GLOBAL SEARCH BAR
  document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderMatrix();
      const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
      UI.renderEventsGrid(State.events, State.selectedCategory, canCurrentUserEdit(activeCal), handleDeleteEvent, openEventModal);
      return;
    }

    // Filter matrix inputs highlight
    document.querySelectorAll('.schedule-cell-input-box').forEach(box => {
      const subj = (box.querySelector('.cell-field-subject')?.value || '').toLowerCase();
      const teach = (box.querySelector('.cell-field-teacher')?.value || '').toLowerCase();
      const room = (box.querySelector('.cell-field-classroom')?.value || '').toLowerCase();
      const match = subj.includes(q) || teach.includes(q) || room.includes(q);
      box.style.border = match ? '2px solid #3b82f6' : '1px solid #e2e8f0';
      box.style.backgroundColor = match ? '#eff6ff' : '#ffffff';
    });

    // Filter event cards
    const filteredEvents = State.events.filter(ev => {
      const t = (ev.titulo || '').toLowerCase();
      const m = (ev.materia_id?.nombre || ev.materia_id || '').toLowerCase();
      const d = (ev.profesor_id?.name || '').toLowerCase();
      return t.includes(q) || m.includes(q) || d.includes(q);
    });
    const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
    UI.renderEventsGrid(filteredEvents, State.selectedCategory, canCurrentUserEdit(activeCal), handleDeleteEvent, openEventModal);
  });
}

// MODAL OPEN HELPERS
function openCalendarModal(calendar = null, folderId = null) {
  document.getElementById('calendarModalTitle').textContent = calendar ? 'Editar Calendario' : 'Crear Nuevo Calendario';
  document.getElementById('calIdInput').value = calendar ? calendar._id : '';
  document.getElementById('calNameInput').value = calendar ? calendar.name : '';
  document.getElementById('calTypeSelect').value = calendar ? calendar.type : 'horario';

  // Ensure folder select options are properly populated with latest folders
  const folderSelect = document.getElementById('calFolderSelect');
  if (folderSelect) {
    folderSelect.innerHTML = '<option value="">Sin Carpeta (Raíz)</option>' +
      (State.folders || []).map(f => `<option value="${f._id}">${f.icon || '📁'} ${f.name}</option>`).join('');

    let targetFolderId = '';
    if (calendar) {
      targetFolderId = calendar.folderId?._id ? String(calendar.folderId._id) : (calendar.folderId ? String(calendar.folderId) : '');
    } else if (folderId) {
      targetFolderId = String(folderId);
    }
    folderSelect.value = targetFolderId;
  }

  document.getElementById('calColorInput').value = calendar ? calendar.color : '#3b82f6';
  document.getElementById('calColorVal').textContent = calendar ? calendar.color : '#3b82f6';
  document.getElementById('calIconInput').value = calendar ? calendar.icon : '📅';
  document.getElementById('calDescInput').value = calendar ? calendar.description : '';

  document.getElementById('calendarModal').classList.add('active');
}

// Global custom events for opening calendar modal inside folder
document.addEventListener('open-new-cal-folder', (e) => {
  openCalendarModal(null, e.detail?.folderId);
});
window.addEventListener('open-new-cal-folder', (e) => {
  openCalendarModal(null, e.detail?.folderId);
});
window.addEventListener('openCalendarModalWithFolder', (e) => {
  openCalendarModal(null, e.detail?.folderId);
});

function openFolderModal() {
  const titleEl = document.getElementById('folderModalTitle');
  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-folder-plus"></i> Crear Nueva Carpeta';
  document.getElementById('folderIdInput').value = '';
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderColorInput').value = '#6366f1';
  document.getElementById('folderColorVal').textContent = '#6366f1';
  document.getElementById('folderIconInput').value = '📁';
  const btnSubmit = document.getElementById('btnSubmitFolder');
  if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-folder-check"></i> Crear Carpeta';
  document.getElementById('folderModal').classList.add('active');
}

function openEditFolderModal(folder) {
  if (!folder) return;
  const titleEl = document.getElementById('folderModalTitle');
  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-folder-pen"></i> Editar Carpeta';
  document.getElementById('folderIdInput').value = folder._id;
  document.getElementById('folderNameInput').value = folder.name || '';
  document.getElementById('folderColorInput').value = folder.color || '#6366f1';
  document.getElementById('folderColorVal').textContent = folder.color || '#6366f1';
  document.getElementById('folderIconInput').value = folder.icon || '📁';
  const btnSubmit = document.getElementById('btnSubmitFolder');
  if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Guardar Cambios';
  document.getElementById('folderModal').classList.add('active');
}

function openPermissionsModal() {
  const cal = State.calendars.find(c => c._id === State.activeCalendarId);
  if (!cal) return;

  document.getElementById('permCalIdInput').value = cal._id;

  const visibility = cal.permissions?.visibility || 'public';
  const radio = document.querySelector(`input[name="visibility"][value="${visibility}"]`);
  if (radio) radio.checked = true;

  const editors = (cal.permissions?.allowedEditors || []).map(e => e._id || e);
  const viewers = (cal.permissions?.allowedViewers || []).map(v => v._id || v);

  const edList = document.getElementById('editorsCheckboxList');
  edList.innerHTML = State.users.map(u => `
    <label class="user-checkbox-item">
      <input type="checkbox" class="chk-editor" value="${u._id}" ${editors.includes(u._id) ? 'checked' : ''}>
      <span>${u.avatar} ${u.name} <small>(${u.role})</small></span>
    </label>
  `).join('');

  const vwList = document.getElementById('viewersCheckboxList');
  vwList.innerHTML = State.users.map(u => `
    <label class="user-checkbox-item">
      <input type="checkbox" class="chk-viewer" value="${u._id}" ${viewers.includes(u._id) ? 'checked' : ''}>
      <span>${u.avatar} ${u.name} <small>(${u.role})</small></span>
    </label>
  `).join('');

  document.getElementById('permissionsModal').classList.add('active');
}

function openEventModal(eventObj = null) {
  document.getElementById('eventModalTitle').textContent = eventObj ? 'Editar Evento' : 'Añadir Nuevo Evento';
  document.getElementById('eventIdInput').value = eventObj ? eventObj._id : '';
  document.getElementById('eventTitleInput').value = eventObj ? eventObj.titulo : '';
  document.getElementById('eventDescInput').value = eventObj ? (eventObj.description || '') : '';

  // Teacher select (profesor_id)
  const teacherSelect = document.getElementById('eventTeacherSelect');
  let selectedTeacherId = '';
  if (eventObj?.profesor_id) {
    selectedTeacherId = typeof eventObj.profesor_id === 'object' ? eventObj.profesor_id._id : eventObj.profesor_id;
  }
  teacherSelect.innerHTML = '<option value="">Sin Docente Asignado</option>' +
    State.users.map(u => `<option value="${u._id}" ${u._id === selectedTeacherId ? 'selected' : ''}>${u.avatar || '👨‍🏫'} ${u.name} (${u.role || 'Docente'})</option>`).join('');

  // Classroom (aula_id)
  let classroomVal = '';
  if (eventObj?.aula_id) {
    classroomVal = typeof eventObj.aula_id === 'object' ? eventObj.aula_id.nombre : eventObj.aula_id;
  }
  document.getElementById('eventClassroomInput').value = classroomVal;

  // Group (grupo_id)
  let groupVal = '';
  if (eventObj?.grupo_id) {
    groupVal = typeof eventObj.grupo_id === 'object' ? eventObj.grupo_id.nombre : eventObj.grupo_id;
  }
  document.getElementById('eventGroupInput').value = groupVal;

  // Subject (materia_id)
  let subjectVal = '';
  if (eventObj?.materia_id) {
    subjectVal = typeof eventObj.materia_id === 'object' ? eventObj.materia_id.nombre : eventObj.materia_id;
  }
  document.getElementById('eventSubjectInput').value = subjectVal;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (eventObj && eventObj.fecha_inicio) {
    const startD = new Date(eventObj.fecha_inicio);
    document.getElementById('eventDateInput').value = eventObj.fecha_inicio.split('T')[0];
    document.getElementById('eventStartInput').value = eventObj.fecha_inicio.split('T')[1]?.slice(0, 5) || '09:00';
  } else {
    document.getElementById('eventDateInput').value = todayStr;
    document.getElementById('eventStartInput').value = '09:00';
  }

  if (eventObj && eventObj.fecha_fin) {
    document.getElementById('eventEndDateInput').value = eventObj.fecha_fin.split('T')[0];
    document.getElementById('eventEndInput').value = eventObj.fecha_fin.split('T')[1]?.slice(0, 5) || '10:30';
  } else {
    document.getElementById('eventEndDateInput').value = todayStr;
    document.getElementById('eventEndInput').value = '10:30';
  }

  document.getElementById('eventCategorySelect').value = eventObj ? (eventObj.category || 'General') : 'General';
  document.getElementById('eventColorInput').value = eventObj ? (eventObj.color || '#3b82f6') : '#3b82f6';

  // Recurrence
  const isRecurrent = eventObj?.recurrencia?.esRecurrente || false;
  document.getElementById('eventRecurrentCheck').checked = isRecurrent;
  document.getElementById('recurrenceFieldsGroup').style.display = isRecurrent ? 'block' : 'none';
  document.getElementById('eventFreqSelect').value = eventObj?.recurrencia?.frecuencia || 'Semanal';

  const recurrentDays = eventObj?.recurrencia?.diasSemana || [];
  document.querySelectorAll('.chk-recurrent-day').forEach(cb => {
    cb.checked = recurrentDays.includes(cb.value);
  });

  document.getElementById('eventModal').classList.add('active');
}

// 24-HOUR TIME NORMALIZER
function normalizeTime24h(str) {
  if (!str) return '07:00';
  const clean = str.trim().toLowerCase();
  const isPM = clean.includes('pm') || clean.includes('p.m.');
  const isAM = clean.includes('am') || clean.includes('a.m.');
  const numbersOnly = clean.replace(/[^0-9:]/g, '');
  let [hours, minutes] = numbersOnly.split(':');
  if (!hours) return '07:00';
  if (!minutes) minutes = '00';
  let h = parseInt(hours, 10);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function openGroupModal(oldGroup = '') {
  document.getElementById('oldGroupInput').value = oldGroup;
  document.getElementById('groupModalTitle').textContent = oldGroup ? `Editar Nombre de Grupo` : 'Añadir Nuevo Grupo';
  document.getElementById('groupNameInput').value = oldGroup;
  document.getElementById('groupModal').classList.add('active');
}

function openSlotModal(oldSlot = '') {
  document.getElementById('oldSlotInput').value = oldSlot;
  document.getElementById('slotModalTitle').textContent = oldSlot ? `Editar Bloque Horario: "${oldSlot}"` : 'Añadir Bloque Horario';
  
  const nameIn = document.getElementById('slotNameInput');
  const startIn = document.getElementById('slotStartTimeInput');
  const endIn = document.getElementById('slotEndTimeInput');

  nameIn.value = oldSlot || '';

  if (oldSlot && oldSlot.includes('-')) {
    const parts = oldSlot.split('-').map(s => s.trim());
    const validStart = normalizeTime24h(parts[0]);
    const validEnd = normalizeTime24h(parts[1]);

    if (startIn) startIn.value = validStart || '07:00';
    if (endIn) endIn.value = validEnd || '08:30';
  } else {
    if (startIn) startIn.value = '07:00';
    if (endIn) endIn.value = '08:30';
    if (!oldSlot) {
      nameIn.value = '07:00 - 08:30';
    }
  }

  const updateSlotLabel = () => {
    if (startIn && endIn && startIn.value && endIn.value) {
      nameIn.value = `${startIn.value} - ${endIn.value}`;
    }
  };

  if (startIn && endIn) {
    startIn.oninput = updateSlotLabel;
    endIn.oninput = updateSlotLabel;
    startIn.onchange = updateSlotLabel;
    endIn.onchange = updateSlotLabel;
  }

  document.getElementById('slotModal').classList.add('active');
}

// REALTIME DATABASE SYNCHRONIZATION (INSTANT UPDATE FOR ADDITIONS & DELETIONS)
let syncIntervalId = null;
function startRealtimeSync() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(async () => {
    if (!State.activeCalendarId) return;
    try {
      // Don't interrupt if user is actively editing a cell input
      const isTyping = document.activeElement && 
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

      const activeCal = State.calendars.find(c => c._id === State.activeCalendarId);
      const canEdit = canCurrentUserEdit(activeCal);

      const freshCells = await API.getScheduleCells(State.activeCalendarId);
      const freshEvents = await API.getEvents(State.activeCalendarId);
      const freshCalendars = await API.getCalendars();

      const cellsHash = JSON.stringify(freshCells);
      const eventsHash = JSON.stringify(freshEvents);
      const calsHash = JSON.stringify(freshCalendars);

      if (!isTyping && cellsHash !== JSON.stringify(State.scheduleCells)) {
        State.scheduleCells = freshCells;
        renderMatrix();
      }

      if (eventsHash !== JSON.stringify(State.events)) {
        State.events = freshEvents;
        UI.renderEventsGrid(
          State.events,
          State.selectedCategory,
          canEdit,
          (eventId) => handleDeleteEvent(eventId),
          (eventObj) => openEventModal(eventObj)
        );
      }

      if (calsHash !== JSON.stringify(State.calendars)) {
        State.calendars = freshCalendars;
        await refreshSidebar();
        if (freshCalendars.length > 0 && !freshCalendars.some(c => c._id === State.activeCalendarId)) {
          await selectCalendar(freshCalendars[0]._id);
        }
      }
    } catch (e) {
      // Ignore transient network errors during sync
    }
  }, 4000);
}
