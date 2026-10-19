const UI = {
  // SHOW TOAST NOTIFICATION
  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  },

  // RENDER USER PROFILE BADGE IN TOPBAR
  renderUsers(users, activeUserId) {
    const avatarEl = document.getElementById('activeUserAvatar');
    const nameEl = document.getElementById('activeUserName');
    const badge = document.getElementById('activeRoleBadge');

    const activeUser = (users || []).find(u => u._id === activeUserId);
    if (activeUser) {
      if (avatarEl) avatarEl.textContent = activeUser.avatar || (activeUser.role === 'viewer' ? '🎓' : '👤');
      if (nameEl) nameEl.textContent = activeUser.name;
      if (badge) {
        if (activeUser.role === 'admin') {
          badge.textContent = 'Admin';
          badge.className = 'role-badge admin';
        } else if (activeUser.role === 'editor') {
          badge.textContent = 'Editor';
          badge.className = 'role-badge editor';
        } else {
          badge.textContent = 'Estudiante';
          badge.className = 'role-badge viewer';
        }
      }
    } else {
      if (avatarEl) avatarEl.textContent = '👤';
      if (nameEl) nameEl.textContent = 'Invitado (Consulta)';
      if (badge) {
        badge.textContent = 'Solo Lectura';
        badge.className = 'role-badge guest';
      }
    }
  },

  // RENDER SIDEBAR FOLDER & CALENDAR TREE
  // RENDER SIDEBAR FOLDER & CALENDAR TREE
  renderSidebarTree(
    folders,
    calendars,
    activeCalId,
    onSelectCal,
    onDeleteFolder,
    onEditFolder,
    onNewCalInFolder,
    canEdit = true,
    hiddenPrefs = { hiddenCalendars: [], hiddenFolders: [], showHidden: false },
    onToggleHideFolder = null,
    onToggleHideCalendar = null,
    onToggleShowHidden = null
  ) {
    const container = document.getElementById('folderList');
    container.innerHTML = '';

    const hiddenCals = (hiddenPrefs?.hiddenCalendars || []).map(String);
    const hiddenFolds = (hiddenPrefs?.hiddenFolders || []).map(String);
    const showHidden = !!hiddenPrefs?.showHidden;

    // Filter visible vs hidden folders
    const visibleFolders = canEdit ? folders.filter(f => !hiddenFolds.includes(String(f._id))) : folders;
    const hiddenFoldersList = canEdit ? folders.filter(f => hiddenFolds.includes(String(f._id))) : [];
    const hiddenCalsList = canEdit ? calendars.filter(c => hiddenCals.includes(String(c._id))) : [];

    // Group calendars by folder (ensure safe string comparison)
    const folderMap = {};
    const rootCalendars = [];

    calendars.forEach(cal => {
      let rawFId = cal.folderId;
      if (rawFId && typeof rawFId === 'object' && rawFId._id) {
        rawFId = rawFId._id;
      }
      const fId = rawFId ? String(rawFId) : null;
      if (fId) {
        if (!folderMap[fId]) folderMap[fId] = [];
        folderMap[fId].push(cal);
      } else {
        rootCalendars.push(cal);
      }
    });

    if (visibleFolders.length === 0 && calendars.length === 0 && hiddenFoldersList.length === 0) {
      container.innerHTML = `
        <div style="padding:1.25rem 0.75rem; text-align:center; color:#64748b; font-size:0.8rem;">
          <i class="fa-solid fa-folder-open" style="font-size:1.6rem; color:#475569; margin-bottom:0.5rem; display:block;"></i>
          <p style="margin-bottom:0.5rem;">No hay calendarios creados</p>
        </div>
      `;
      return;
    }

    // Render Visible Folders
    visibleFolders.forEach(folder => {
      const folderKey = String(folder._id);
      const allFCals = folderMap[folderKey] || [];
      const fCals = canEdit ? allFCals.filter(c => !hiddenCals.includes(String(c._id))) : allFCals;
      const hasActiveCal = fCals.some(c => String(c._id) === String(activeCalId));
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-item';

      folderDiv.innerHTML = `
        <div class="folder-header" data-folder-id="${folder._id}" style="cursor: pointer; display:flex; align-items:center; justify-content:space-between; user-select:none;" title="Haz clic para desplegar / ver calendarios">
          <div class="folder-left" style="display:flex; align-items:center; gap:0.4rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
            <i class="fa-solid fa-chevron-down folder-chevron" style="font-size:0.65rem; color:#94a3b8; transition:transform 0.2s; min-width:12px; ${hasActiveCal || fCals.length > 0 ? '' : 'transform:rotate(-90deg);'}"></i>
            <span class="color-dot" style="background-color: ${folder.color || '#6366f1'}; flex-shrink:0;"></span>
            <span style="font-weight:600; font-size:0.85rem; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${folder.icon || '📁'} ${folder.name}
            </span>
            <small style="color:#64748b; font-size:0.75rem; font-weight:normal; margin-left:0.2rem;">(${fCals.length})</small>
          </div>
          ${canEdit ? `
            <div class="folder-actions" style="display:flex; gap:0.25rem; align-items:center; flex-shrink:0;">
              <button class="add-cal-folder-btn icon-btn" title="Añadir Calendario a esta Carpeta" style="width:24px;height:24px;font-size:0.7rem;color:#60a5fa;" data-folder-id="${folder._id}">
                <i class="fa-solid fa-plus"></i>
              </button>
              <button class="edit-folder-btn icon-btn" title="Editar Carpeta" style="width:24px;height:24px;font-size:0.65rem;color:#94a3b8;" data-folder-id="${folder._id}">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="hide-folder-btn icon-btn" title="Ocultar carpeta para mí" style="width:24px;height:24px;font-size:0.65rem;color:#f59e0b;" data-folder-id="${folder._id}">
                <i class="fa-solid fa-eye-slash"></i>
              </button>
              <button class="delete-folder-btn icon-btn" title="Eliminar Carpeta" style="width:24px;height:24px;font-size:0.65rem;color:#ef4444;" data-folder-id="${folder._id}">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          ` : ''}
        </div>
        <div class="folder-calendars" style="padding-left:1.25rem; margin-top:0.25rem; display:${hasActiveCal || fCals.length > 0 ? 'block' : 'none'};">
          ${fCals.length > 0 ? fCals.map(cal => `
            <div class="calendar-sub-item ${String(cal._id) === String(activeCalId) ? 'active' : ''}" data-cal-id="${cal._id}">
              <div style="display:flex; align-items:center; gap:0.4rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                <span class="color-dot" style="background-color: ${cal.color || '#3b82f6'}; flex-shrink:0;"></span>
                <span>${cal.icon || '📅'} ${cal.name}</span>
              </div>
              ${canEdit ? `
                <button class="hide-cal-btn icon-btn" title="Ocultar calendario para mí" data-cal-id="${cal._id}" style="width:22px;height:22px;font-size:0.6rem;color:#94a3b8;opacity:0.7;margin-left:0.25rem;">
                  <i class="fa-solid fa-eye-slash"></i>
                </button>
              ` : ''}
            </div>
          `).join('') : `
            <div class="folder-empty-placeholder" data-folder-id="${folder._id}" style="padding:0.4rem 0.5rem; font-size:0.75rem; color:#64748b; font-style:italic; display:flex; align-items:center; gap:0.4rem; cursor:${canEdit ? 'pointer' : 'default'}; border-radius:4px;" title="${canEdit ? 'Haz clic para añadir un calendario a esta carpeta' : 'Carpeta sin calendarios'}">
              <i class="fa-solid fa-folder-open" style="font-size:0.75rem; opacity:0.6;"></i>
              <span>${canEdit ? '+ Añadir calendario aquí' : 'Sin calendarios'}</span>
            </div>
          `}
        </div>
      `;

      // Event listeners for folder collapse / toggle
      const folderHeader = folderDiv.querySelector('.folder-header');
      const folderCalendarsDiv = folderDiv.querySelector('.folder-calendars');
      const chevron = folderDiv.querySelector('.folder-chevron');

      folderHeader.addEventListener('click', (e) => {
        if (e.target.closest('.delete-folder-btn') || e.target.closest('.edit-folder-btn') || e.target.closest('.add-cal-folder-btn') || e.target.closest('.hide-folder-btn')) return;

        // Toggle open/collapse
        const isCollapsed = folderCalendarsDiv.style.display === 'none';
        folderCalendarsDiv.style.display = isCollapsed ? 'block' : 'none';
        if (chevron) {
          chevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
        }

        // If folder has calendars and none in this folder is active, select the first
        if (fCals.length > 0 && !hasActiveCal) {
          onSelectCal(fCals[0]._id);
        } else if (fCals.length === 0 && canEdit && onNewCalInFolder) {
          onNewCalInFolder(folder._id);
        }
      });

      // Add calendar to folder button
      folderDiv.querySelector('.add-cal-folder-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onNewCalInFolder) {
          onNewCalInFolder(folder._id);
        } else {
          document.dispatchEvent(new CustomEvent('open-new-cal-folder', { detail: { folderId: folder._id } }));
        }
      });

      // Edit folder button
      folderDiv.querySelector('.edit-folder-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onEditFolder) onEditFolder(folder);
      });

      // Hide folder for user button
      folderDiv.querySelector('.hide-folder-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onToggleHideFolder) onToggleHideFolder(folder._id);
      });

      // Delete folder button
      folderDiv.querySelector('.delete-folder-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`¿Deseas eliminar la carpeta "${folder.name}"? Los calendarios dentro se moverán a la raíz.`)) {
          onDeleteFolder(folder._id);
        }
      });

      // Empty placeholder click
      folderDiv.querySelector('.folder-empty-placeholder')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (canEdit) {
          if (onNewCalInFolder) {
            onNewCalInFolder(folder._id);
          } else {
            document.dispatchEvent(new CustomEvent('open-new-cal-folder', { detail: { folderId: folder._id } }));
          }
        }
      });

      // Calendar sub-item clicks and hide calendar buttons
      folderDiv.querySelectorAll('.calendar-sub-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.hide-cal-btn')) return;
          e.stopPropagation();
          onSelectCal(el.dataset.calId);
        });

        el.querySelector('.hide-cal-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onToggleHideCalendar) onToggleHideCalendar(el.dataset.calId);
        });
      });

      container.appendChild(folderDiv);
    });

    // Render Root Calendars (not in any folder)
    const visibleRootCalendars = canEdit 
      ? rootCalendars.filter(c => !hiddenCals.includes(String(c._id))) 
      : rootCalendars;

    if (visibleRootCalendars.length > 0) {
      const rootDiv = document.createElement('div');
      rootDiv.className = 'folder-item root-calendars-section';
      rootDiv.innerHTML = `
        <div class="nav-section-title" style="margin-top:0.85rem; padding:0.25rem 0.5rem; display:flex; align-items:center; gap:0.4rem; font-size:0.75rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">
          <i class="fa-solid fa-layer-group" style="font-size:0.75rem; color:#60a5fa;"></i>
          <span>Calendarios Principales (${visibleRootCalendars.length})</span>
        </div>
        <div class="folder-calendars" style="padding-left:0.4rem; margin-top:0.25rem;">
          ${visibleRootCalendars.map(cal => `
            <div class="calendar-sub-item ${String(cal._id) === String(activeCalId) ? 'active' : ''}" data-cal-id="${cal._id}">
              <div style="display:flex; align-items:center; gap:0.45rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                <span class="color-dot" style="background-color: ${cal.color || '#3b82f6'}; flex-shrink:0;"></span>
                <span>${cal.icon || '📅'} ${cal.name}</span>
              </div>
              ${canEdit ? `
                <button class="hide-cal-btn icon-btn" title="Ocultar calendario para mí" data-cal-id="${cal._id}" style="width:22px;height:22px;font-size:0.6rem;color:#94a3b8;opacity:0.7;margin-left:0.25rem;">
                  <i class="fa-solid fa-eye-slash"></i>
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;

      rootDiv.querySelectorAll('.calendar-sub-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.hide-cal-btn')) return;
          e.stopPropagation();
          onSelectCal(el.dataset.calId);
        });

        el.querySelector('.hide-cal-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onToggleHideCalendar) onToggleHideCalendar(el.dataset.calId);
        });
      });

      container.appendChild(rootDiv);
    }

    // Render Personal Hidden Drawer for Admin / Editor
    const totalHidden = hiddenFoldersList.length + hiddenCalsList.length;
    if (canEdit && totalHidden > 0) {
      const hiddenSection = document.createElement('div');
      hiddenSection.className = 'hidden-items-section';
      hiddenSection.style.cssText = 'margin-top:1.25rem; border-top:1px dashed #334155; padding-top:0.75rem;';

      hiddenSection.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem; padding:0 0.2rem;">
          <span style="font-size:0.75rem; color:#94a3b8; font-weight:600; display:flex; align-items:center; gap:0.35rem;">
            <i class="fa-solid fa-eye-slash" style="color:#f59e0b;"></i>
            <span>Ocultos para ti (${totalHidden})</span>
          </span>
          <button class="btn-toggle-hidden-drawer" style="font-size:0.7rem; background:#1e293b; color:#60a5fa; border:1px solid #334155; padding:0.2rem 0.5rem; border-radius:4px; cursor:pointer; font-weight:600;">
            ${showHidden ? 'Cerrar' : 'Ver y desocultar'}
          </button>
        </div>
        ${showHidden ? `
          <div class="hidden-drawer" style="background:rgba(15, 23, 42, 0.7); border:1px dashed #475569; border-radius:6px; padding:0.5rem;">
            ${hiddenFoldersList.length > 0 ? `
              <div style="font-size:0.7rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:0.3rem;">Carpetas ocultadas:</div>
              ${hiddenFoldersList.map(hf => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.4rem; background:#1e293b; border-radius:4px; margin-bottom:0.25rem;">
                  <span style="font-size:0.8rem; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${hf.icon || '📁'} ${hf.name}</span>
                  <button class="unhide-folder-btn" data-folder-id="${hf._id}" style="background:#2563eb; color:#fff; border:none; padding:0.2rem 0.45rem; border-radius:3px; font-size:0.65rem; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
                    <i class="fa-solid fa-eye"></i> Desocultar
                  </button>
                </div>
              `).join('')}
            ` : ''}

            ${hiddenCalsList.length > 0 ? `
              <div style="font-size:0.7rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:0.4rem; margin-bottom:0.3rem;">Calendarios ocultados:</div>
              ${hiddenCalsList.map(hc => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.4rem; background:#1e293b; border-radius:4px; margin-bottom:0.25rem;">
                  <span style="font-size:0.8rem; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${hc.icon || '📅'} ${hc.name}</span>
                  <button class="unhide-cal-btn" data-cal-id="${hc._id}" style="background:#2563eb; color:#fff; border:none; padding:0.2rem 0.45rem; border-radius:3px; font-size:0.65rem; cursor:pointer; display:flex; align-items:center; gap:0.25rem;">
                    <i class="fa-solid fa-eye"></i> Desocultar
                  </button>
                </div>
              `).join('')}
            ` : ''}
          </div>
        ` : ''}
      `;

      hiddenSection.querySelector('.btn-toggle-hidden-drawer')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onToggleShowHidden) onToggleShowHidden();
      });

      hiddenSection.querySelectorAll('.unhide-folder-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onToggleHideFolder) onToggleHideFolder(btn.dataset.folderId);
        });
      });

      hiddenSection.querySelectorAll('.unhide-cal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onToggleHideCalendar) onToggleHideCalendar(btn.dataset.calId);
        });
      });

      container.appendChild(hiddenSection);
    }
  },

  // RENDER ACTIVE CALENDAR HEADER
  renderCalendarHeader(calendar, canEdit) {
    document.getElementById('calHeaderTitle').textContent = calendar.name;
    document.getElementById('calHeaderIcon').textContent = calendar.icon || '📅';
    document.getElementById('calHeaderIcon').style.backgroundColor = `${calendar.color}22`;
    document.getElementById('calHeaderType').textContent = calendar.type ? calendar.type.toUpperCase() : 'GENERAL';
    document.getElementById('calHeaderDesc').textContent = calendar.description || 'Sin descripción';
    
    const visBadge = document.getElementById('calHeaderVisibility');
    const isPublic = calendar.permissions?.visibility === 'public';
    visBadge.innerHTML = `<i class="fa-solid ${isPublic ? 'fa-earth-americas' : 'fa-lock'}"></i> ${isPublic ? 'Público' : 'Restringido'}`;

    // Folder badge in header
    const folderBadge = document.getElementById('calHeaderFolder');
    const folderText = document.getElementById('calHeaderFolderText');
    if (folderBadge && folderText) {
      if (calendar.folderId) {
        const fName = typeof calendar.folderId === 'object' ? calendar.folderId.name : 'Carpeta';
        const fIcon = (typeof calendar.folderId === 'object' && calendar.folderId.icon) ? calendar.folderId.icon : '📁';
        folderText.textContent = `${fIcon} ${fName}`;
        folderBadge.style.display = 'inline-flex';
      } else {
        folderBadge.style.display = 'none';
      }
    }

    // Enable/disable edit actions according to permissions
    const btnEdit = document.getElementById('btnEditCalendar');
    const btnShare = document.getElementById('btnShareCalendar');
    const btnDelete = document.getElementById('btnDeleteCalendar');

    const btnSaveBatch = document.getElementById('btnSaveScheduleBatch');
    const btnAddGroup = document.getElementById('btnAddGroupBtn');
    const btnAddEvent = document.getElementById('btnAddEventBtn');

    if (!canEdit) {
      btnEdit.style.display = 'none';
      btnDelete.style.display = 'none';
      btnSaveBatch.style.display = 'none';
      btnAddGroup.style.display = 'none';
      btnAddEvent.style.display = 'none';
      document.getElementById('permissionStatusBox').className = 'permission-status warning';
      document.getElementById('permissionStatusBox').innerHTML = `<i class="fa-solid fa-eye"></i> Modo Sólo Lectura`;
    } else {
      btnEdit.style.display = 'inline-flex';
      btnDelete.style.display = 'inline-flex';
      btnSaveBatch.style.display = 'inline-flex';
      btnAddGroup.style.display = 'inline-flex';
      btnAddEvent.style.display = 'inline-flex';
      document.getElementById('permissionStatusBox').className = 'permission-status';
      document.getElementById('permissionStatusBox').innerHTML = `<i class="fa-solid fa-circle-check"></i> Modo Edición Habilitado`;
    }
  },

  // RENDER CLASS SCHEDULE MATRIX TABLE (GROUPS vs TIME SLOTS)
  renderScheduleMatrix(cells, selectedDay, groups, timeSlots, canEdit, onSaveCell, onEditGroup, onDeleteGroup, onEditSlot, onDeleteSlot) {
    // 1. Render Table Header (Time Slot columns)
    const theaderTr = document.getElementById('scheduleTableHeader');
    let thHTML = `<th class="group-col-header">Grupo / Curso</th>`;

    timeSlots.forEach(slot => {
      thHTML += `
        <th>
          <div class="header-slot-box">
            <span>${slot}</span>
            ${canEdit ? `
              <div class="slot-actions">
                <button class="edit-slot-btn icon-btn" data-slot="${slot}" style="width:22px;height:22px;font-size:0.6rem;" title="Renombrar Horario"><i class="fa-solid fa-pen"></i></button>
                <button class="del-slot-btn icon-btn" data-slot="${slot}" style="width:22px;height:22px;font-size:0.6rem;color:#ef4444;" title="Eliminar Horario"><i class="fa-solid fa-trash"></i></button>
              </div>
            ` : ''}
          </div>
        </th>
      `;
    });
    theaderTr.innerHTML = thHTML;

    // Attach slot header listeners
    if (canEdit && onEditSlot && onDeleteSlot) {
      theaderTr.querySelectorAll('.edit-slot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slotVal = btn.getAttribute('data-slot') || btn.dataset.slot || '';
          onEditSlot(slotVal);
        });
      });
      theaderTr.querySelectorAll('.del-slot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slotVal = btn.getAttribute('data-slot') || btn.dataset.slot || '';
          onDeleteSlot(slotVal);
        });
      });
    }

    // 2. Render Table Body (Group rows)
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = '';

    if (timeSlots.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="2" style="text-align:center; padding:3rem 1.5rem; color:#64748b; background-color:#ffffff;">
            <div style="font-size:2.2rem; margin-bottom:0.75rem; color:#3b82f6;">
              <i class="fa-solid fa-clock"></i>
            </div>
            <h4 style="font-family:var(--font-heading); color:#1e293b; margin-bottom:0.5rem; font-size:1.1rem;">
              No hay bloques horarios configurados
            </h4>
            <p style="font-size:0.875rem; max-width:450px; margin:0 auto 1.25rem auto; color:#64748b; line-height:1.5;">
              Para visualizar la matriz de clases, añade al menos un bloque horario (ej. 07:00 - 08:30).
            </p>
            <button class="btn btn-primary" id="btnEmptyAddSlot" style="margin:0 auto;"><i class="fa-solid fa-plus"></i> + Añadir Bloque Horario</button>
          </td>
        </tr>
      `;
      return;
    }

    if (groups.length === 0) {
      const colSpan = Math.max(1, timeSlots.length + 1);
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}" style="text-align:center; padding:3rem 1.5rem; color:#64748b; background-color:#ffffff;">
            <div style="font-size:2.2rem; margin-bottom:0.75rem; color:#3b82f6;">
              <i class="fa-solid fa-users-rectangle"></i>
            </div>
            <h4 style="font-family:var(--font-heading); color:#1e293b; margin-bottom:0.5rem; font-size:1.1rem;">
              No hay grupos asignados a este horario
            </h4>
            <p style="font-size:0.875rem; max-width:480px; margin:0 auto 1.25rem auto; color:#64748b; line-height:1.5;">
              Añade un grupo o sincroniza los grupos registrados en MongoDB para comenzar a cargar asignaturas, docentes y aulas.
            </p>
            <div style="display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
              <button class="btn btn-primary" id="btnEmptyAddGroup"><i class="fa-solid fa-plus"></i> + Añadir Primer Grupo</button>
              <button class="btn btn-outline" id="btnEmptySyncGroup"><i class="fa-solid fa-layer-group"></i> Usar Grupos Registrados</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    // Index cells by group and timeSlot for fast lookup
    const cellMap = {};
    cells.filter(c => c.day === selectedDay).forEach(c => {
      cellMap[`${c.group}_${c.timeSlot}`] = c;
    });

    groups.forEach(groupName => {
      const tr = document.createElement('tr');
      
      // Group header cell with edit & delete actions
      let trHTML = `
        <td class="group-cell-label">
          <div class="group-header-box">
            <span>${groupName}</span>
            ${canEdit ? `
              <div class="group-actions">
                <button class="edit-group-btn icon-btn" data-group="${groupName}" style="width:22px;height:22px;font-size:0.6rem;" title="Renombrar Grupo"><i class="fa-solid fa-pen"></i></button>
                <button class="del-group-btn icon-btn" data-group="${groupName}" style="width:22px;height:22px;font-size:0.6rem;color:#ef4444;" title="Eliminar Grupo"><i class="fa-solid fa-trash"></i></button>
              </div>
            ` : ''}
          </div>
        </td>
      `;

      timeSlots.forEach(slot => {
        const cell = cellMap[`${groupName}_${slot}`] || {};
        const subject = cell.subject || '';
        const teacher = cell.teacher || '';
        const classroom = cell.classroom || '';

        trHTML += `
          <td>
            <div class="schedule-cell-input-box ${!canEdit ? 'read-only' : ''}" data-group="${groupName}" data-slot="${slot}">
              <input type="text" class="cell-subject-input cell-field-subject" 
                     list="materiasDatalist"
                     placeholder="${canEdit ? 'Materia / Asignatura...' : 'Vacío'}" 
                     value="${subject}" ${!canEdit ? 'readonly' : ''}
                     title="Escribe o selecciona una materia">
              
              <input type="text" class="cell-sub-input cell-field-teacher" 
                     list="docentesDatalist"
                     placeholder="${canEdit ? 'Docente / Maestro...' : ''}" 
                     value="${teacher}" ${!canEdit ? 'readonly' : ''}
                     title="Escribe o selecciona un docente">
              
              <input type="text" class="cell-sub-input cell-field-classroom" 
                     list="aulasDatalist"
                     placeholder="${canEdit ? 'Aula / Laboratorio...' : ''}" 
                     value="${classroom}" ${!canEdit ? 'readonly' : ''}
                     title="Escribe o selecciona un aula">
              
              ${canEdit ? `
                <div style="display:flex; gap:0.25rem; margin-top:0.35rem;">
                  <button class="cell-save-btn" style="flex:1;" title="Guardar esta celda en MongoDB"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                  <button class="cell-clear-btn" style="padding:0.25rem 0.5rem; background-color:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:4px; font-size:0.7rem; cursor:pointer;" title="Borrar datos de esta celda"><i class="fa-solid fa-trash"></i></button>
                </div>
              ` : ''}
            </div>
          </td>
        `;
      });

      tr.innerHTML = trHTML;

      // Attach group row action listeners
      if (canEdit && onEditGroup && onDeleteGroup) {
        tr.querySelector('.edit-group-btn')?.addEventListener('click', () => onEditGroup(groupName));
        tr.querySelector('.del-group-btn')?.addEventListener('click', () => onDeleteGroup(groupName));
      }

      // Attach listener to save button per cell
      if (canEdit) {
        tr.querySelectorAll('.cell-save-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const box = e.target.closest('.schedule-cell-input-box');
            const group = box.dataset.group;
            const slot = box.dataset.slot;
            const subjectVal = box.querySelector('.cell-field-subject').value;
            const teacherVal = box.querySelector('.cell-field-teacher').value;
            const classroomVal = box.querySelector('.cell-field-classroom').value;

            onSaveCell({
              group,
              day: selectedDay,
              timeSlot: slot,
              subject: subjectVal,
              teacher: teacherVal,
              classroom: classroomVal
            });
          });
        });

        // Attach listener to clear/delete button per cell
        tr.querySelectorAll('.cell-clear-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const box = e.target.closest('.schedule-cell-input-box');
            const group = box.dataset.group;
            const slot = box.dataset.slot;
            box.querySelector('.cell-field-subject').value = '';
            box.querySelector('.cell-field-teacher').value = '';
            box.querySelector('.cell-field-classroom').value = '';

            onSaveCell({
              group,
              day: selectedDay,
              timeSlot: slot,
              subject: '',
              teacher: '',
              classroom: ''
            });
          });
        });
      }

      tbody.appendChild(tr);
    });
  },


  // RENDER EVENT CARDS FOR CRONOGRAMAS
  renderEventsGrid(events, selectedCat, canEdit, onDeleteEvent, onEditEvent) {
    const container = document.getElementById('eventsGrid');
    container.innerHTML = '';

    const filtered = selectedCat === 'all' ? events : events.filter(e => e.category === selectedCat);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">
          <i class="fa-solid fa-calendar-xmark" style="font-size:2.5rem;margin-bottom:1rem;"></i>
          <p>No hay eventos registrados en esta categoría.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.style.borderLeftColor = ev.color || '#3b82f6';

      const eventTitle = ev.titulo || ev.title || 'Evento';
      
      let profesorName = 'Sin Docente';
      if (ev.profesor_id) {
        if (typeof ev.profesor_id === 'object' && ev.profesor_id.name) {
          profesorName = `${ev.profesor_id.avatar || '👨‍🏫'} ${ev.profesor_id.name}`;
        } else {
          profesorName = `Profesor ID: ${ev.profesor_id}`;
        }
      }

      let materiaName = ev.materia_id ? (typeof ev.materia_id === 'object' ? ev.materia_id.nombre : ev.materia_id) : '';
      let grupoName = ev.grupo_id ? (typeof ev.grupo_id === 'object' ? ev.grupo_id.nombre : ev.grupo_id) : '';
      let aulaName = ev.aula_id ? (typeof ev.aula_id === 'object' ? ev.aula_id.nombre : ev.aula_id) : (ev.location || '');

      let startDateStr = ev.date || (ev.fecha_inicio ? new Date(ev.fecha_inicio).toLocaleDateString() : '');
      let startTimeStr = ev.startTime || (ev.fecha_inicio ? new Date(ev.fecha_inicio).toTimeString().substring(0,5) : '09:00');
      let endTimeStr = ev.endTime || (ev.fecha_fin ? new Date(ev.fecha_fin).toTimeString().substring(0,5) : '10:00');

      card.innerHTML = `
        <div>
          <div class="event-card-header">
            <span class="event-title">${eventTitle}</span>
            <span class="calendar-type-chip" style="background-color: ${ev.color}22; color: ${ev.color}">${ev.category || 'General'}</span>
          </div>

          <div class="event-meta" style="flex-wrap:wrap; gap:0.5rem; margin-top:0.4rem;">
            <span><i class="fa-solid fa-calendar"></i> ${startDateStr}</span>
            <span><i class="fa-solid fa-clock"></i> ${startTimeStr} - ${endTimeStr}</span>
          </div>

          ${materiaName ? `<div style="font-size:0.85rem; font-weight:600; color:#1e293b; margin-top:0.3rem;"><i class="fa-solid fa-book" style="color:#3b82f6;"></i> Materia: ${materiaName}</div>` : ''}
          ${profesorName !== 'Sin Docente' ? `<div style="font-size:0.8rem; color:#475569; margin-top:0.2rem;"><i class="fa-solid fa-user-tie"></i> Docente: ${profesorName}</div>` : ''}
          ${grupoName ? `<div style="font-size:0.8rem; color:#475569; margin-top:0.2rem;"><i class="fa-solid fa-users-rectangle"></i> Grupo: ${grupoName}</div>` : ''}

          <p class="event-desc" style="margin-top:0.4rem;">${ev.description || 'Sin descripción adicional.'}</p>
        </div>

        <div class="event-footer">
          <span><i class="fa-solid fa-location-dot"></i> ${aulaName || 'Aula por definir'}</span>
          ${canEdit ? `
            <div style="display:flex;gap:0.4rem;">
              <button class="edit-ev-btn icon-btn" style="width:24px;height:24px;font-size:0.65rem;" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="del-ev-btn icon-btn" style="width:24px;height:24px;font-size:0.65rem;color:#ef4444;" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div>
          ` : ''}
        </div>
      `;

      if (canEdit) {
        card.querySelector('.del-ev-btn')?.addEventListener('click', () => onDeleteEvent(ev._id));
        card.querySelector('.edit-ev-btn')?.addEventListener('click', () => onEditEvent(ev));
      }

      container.appendChild(card);
    });
  },

  // UPDATE HTML5 DATALISTS FOR AUTOCOMPLETE IN CELLS AND FORMS
  updateDatalists(materias = [], teachers = [], aulas = [], grupos = []) {
    const matDl = document.getElementById('materiasDatalist');
    if (matDl) {
      matDl.innerHTML = materias.map(m => `<option value="${m.nombre}">${m.codigo ? `[${m.codigo}] ` : ''}${m.nombre}</option>`).join('');
    }

    const docDl = document.getElementById('docentesDatalist');
    if (docDl) {
      docDl.innerHTML = teachers.map(t => `<option value="${t.name}">${t.avatar || '👨‍🏫'} ${t.name} (${t.role || 'Docente'})</option>`).join('');
    }

    const aulDl = document.getElementById('aulasDatalist');
    if (aulDl) {
      aulDl.innerHTML = aulas.map(a => `<option value="${a.nombre}">${a.nombre}${a.ubicacion ? ` - ${a.ubicacion}` : ''}</option>`).join('');
    }

    const grpDl = document.getElementById('gruposDatalist');
    if (grpDl) {
      grpDl.innerHTML = grupos.map(g => `<option value="${g.nombre}">${g.nombre}</option>`).join('');
    }
  },

  // RENDER ACADEMIC CATALOGS DASHBOARD (GRUPOS, AULAS, MATERIAS, MAESTROS)
  renderCatalogsView({ grupos = [], aulas = [], materias = [], teachers = [] }, callbacks = {}) {
    const canEditCatalogs = callbacks.canEditCatalogs !== false;
    const canEditRoles = callbacks.canEditRoles === true;
    const isAdmin = callbacks.isAdmin === true;

    // 1. Update Counter Badges
    const countG = document.getElementById('countGrupos');
    const countA = document.getElementById('countAulas');
    const countM = document.getElementById('countMaterias');
    const countT = document.getElementById('countMaestros');
    if (countG) countG.textContent = grupos.length;
    if (countA) countA.textContent = aulas.length;
    if (countM) countM.textContent = materias.length;
    if (countT) countT.textContent = teachers.length;

    // 2. Render Grupos
    const gGrid = document.getElementById('gruposGrid');
    if (gGrid) {
      if (grupos.length === 0) {
        gGrid.innerHTML = `
          <div class="catalog-empty">
            <i class="fa-solid fa-layer-group"></i>
            <h4>No hay grupos registrados</h4>
            <p>Escribe el nombre del grupo en el campo superior para guardarlo directamente en MongoDB.</p>
          </div>
        `;
      } else {
        gGrid.innerHTML = grupos.map(g => `
          <div class="catalog-item-card" data-id="${g._id}">
            <div class="catalog-item-left">
              <div class="catalog-item-icon icon-blue"><i class="fa-solid fa-users"></i></div>
              <div class="catalog-item-details">
                <h4>${g.nombre}</h4>
                <p><i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Sincronizado en MongoDB</p>
              </div>
            </div>
            <div class="catalog-item-actions">
              ${canEditCatalogs ? `
                <button class="btn-add-grupo-to-cal icon-btn" data-name="${g.nombre}" title="Añadir al horario activo" style="color:#2563eb; background:#eff6ff;"><i class="fa-solid fa-calendar-plus"></i></button>
                <button class="btn-del-grupo icon-btn danger" data-id="${g._id}" data-name="${g.nombre}" title="Eliminar Grupo de BD" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
        `).join('');

        if (canEditCatalogs) {
          gGrid.querySelectorAll('.btn-add-grupo-to-cal').forEach(btn => {
            btn.addEventListener('click', () => {
              const name = btn.dataset.name;
              if (callbacks.onAddGrupoToCal) callbacks.onAddGrupoToCal(name);
            });
          });

          gGrid.querySelectorAll('.btn-del-grupo').forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const name = btn.dataset.name;
              if (callbacks.onDeleteGrupo) callbacks.onDeleteGrupo(id, name);
            });
          });
        }
      }
    }

    // 3. Render Aulas
    const aGrid = document.getElementById('aulasGrid');
    if (aGrid) {
      if (aulas.length === 0) {
        aGrid.innerHTML = `
          <div class="catalog-empty">
            <i class="fa-solid fa-door-open"></i>
            <h4>No hay aulas registradas</h4>
            <p>Registra salones o laboratorios en el formulario superior para guardarlos en MongoDB.</p>
          </div>
        `;
      } else {
        aGrid.innerHTML = aulas.map(a => `
          <div class="catalog-item-card" data-id="${a._id}">
            <div class="catalog-item-left">
              <div class="catalog-item-icon icon-emerald"><i class="fa-solid fa-door-open"></i></div>
              <div class="catalog-item-details">
                <h4>${a.nombre}</h4>
                <p><i class="fa-solid fa-location-dot"></i> ${a.ubicacion || 'Ubicación estándar'}</p>
              </div>
            </div>
            <div class="catalog-item-actions">
              ${canEditCatalogs ? `
                <button class="btn-del-aula icon-btn danger" data-id="${a._id}" data-name="${a.nombre}" title="Eliminar Aula de BD" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
        `).join('');

        if (canEditCatalogs) {
          aGrid.querySelectorAll('.btn-del-aula').forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const name = btn.dataset.name;
              if (callbacks.onDeleteAula) callbacks.onDeleteAula(id, name);
            });
          });
        }
      }
    }

    // 4. Render Materias
    const mGrid = document.getElementById('materiasGrid');
    if (mGrid) {
      if (materias.length === 0) {
        mGrid.innerHTML = `
          <div class="catalog-empty">
            <i class="fa-solid fa-book"></i>
            <h4>No hay materias registradas</h4>
            <p>Añade asignaturas con su código para que aparezcan en los horarios y autocompletados.</p>
          </div>
        `;
      } else {
        mGrid.innerHTML = materias.map(m => `
          <div class="catalog-item-card" data-id="${m._id}">
            <div class="catalog-item-left">
              <div class="catalog-item-icon icon-amber"><i class="fa-solid fa-book"></i></div>
              <div class="catalog-item-details">
                <h4>${m.nombre}</h4>
                <p><i class="fa-solid fa-hashtag"></i> Código: ${m.codigo || 'S/C'}</p>
              </div>
            </div>
            <div class="catalog-item-actions">
              ${canEditCatalogs ? `
                <button class="btn-del-materia icon-btn danger" data-id="${m._id}" data-name="${m.nombre}" title="Eliminar Materia de BD" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
        `).join('');

        if (canEditCatalogs) {
          mGrid.querySelectorAll('.btn-del-materia').forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const name = btn.dataset.name;
              if (callbacks.onDeleteMateria) callbacks.onDeleteMateria(id, name);
            });
          });
        }
      }
    }

    // 5. Render Maestros / Usuarios Institucionales
    const tGrid = document.getElementById('maestrosGrid');
    if (tGrid) {
      if (teachers.length === 0) {
        tGrid.innerHTML = `
          <div class="catalog-empty">
            <i class="fa-solid fa-chalkboard-user"></i>
            <h4>No hay usuarios registrados</h4>
            <p>Registra docentes y usuarios con su correo institucional para asignarlos a asignaturas.</p>
          </div>
        `;
      } else {
        tGrid.innerHTML = teachers.map(t => {
          const roleClass = t.role === 'admin' ? 'admin' : (t.role === 'editor' ? 'editor' : 'viewer');
          const roleText = t.role === 'admin' ? 'Administrador' : (t.role === 'editor' ? 'Docente/Editor' : 'Estudiante');

          return `
          <div class="catalog-item-card" data-id="${t._id}">
            <div class="catalog-item-left" style="min-width:0; flex:1; display:flex; align-items:flex-start; gap:0.75rem;">
              <div class="catalog-item-icon icon-purple" style="font-size:1.4rem; flex-shrink:0; margin-top:2px;">${t.avatar || (t.role === 'viewer' ? '🎓' : '👨‍🏫')}</div>
              <div class="catalog-item-details" style="min-width:0; flex:1; word-break:break-word; overflow-wrap:anywhere;">
                <h4 style="word-break:break-word; overflow-wrap:anywhere; margin:0 0 0.25rem 0; line-height:1.35; font-size:0.92rem;">${t.name}</h4>
                <p style="word-break:break-all; overflow-wrap:anywhere; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:0.78rem; line-height:1.35; color:#64748b; margin:0 0 0.35rem 0;">
                  <i class="fa-solid fa-envelope" style="font-size:0.72rem; color:#94a3b8; margin-right:3px;"></i>${t.email}
                </p>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem; margin-top:0.35rem;">
                  <span class="role-badge ${roleClass}" style="font-size:0.68rem; padding:0.18rem 0.5rem; flex-shrink:0;">${roleText}</span>
                  ${canEditRoles ? `
                    <select class="change-user-role-select form-control" data-id="${t._id}" style="padding:0.2rem 0.45rem; font-size:0.75rem; border-radius:6px; max-width:160px; height:auto;" title="Cambiar rol institucional del usuario">
                      <option value="editor" ${t.role === 'editor' ? 'selected' : ''}>👨‍🏫 Docente (Editor)</option>
                      <option value="admin" ${t.role === 'admin' ? 'selected' : ''}>👑 Administrador</option>
                      <option value="viewer" ${t.role === 'viewer' ? 'selected' : ''}>🎓 Estudiante (Lector)</option>
                    </select>
                  ` : ''}
                </div>
              </div>
            </div>
            <div class="catalog-item-actions" style="flex-shrink:0; align-self:flex-start; margin-left:0.5rem;">
              ${isAdmin ? `
                <button class="btn-del-maestro icon-btn danger" data-id="${t._id}" data-name="${t.name}" title="Eliminar Usuario de BD" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
              ` : ''}
            </div>
          </div>
          `;
        }).join('');

        if (canEditRoles) {
          tGrid.querySelectorAll('.change-user-role-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
              const id = sel.dataset.id;
              const newRole = sel.value;
              if (callbacks.onUpdateRole) {
                await callbacks.onUpdateRole(id, newRole);
              }
            });
          });
        }

        if (isAdmin) {
          tGrid.querySelectorAll('.btn-del-maestro').forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const name = btn.dataset.name;
              if (callbacks.onDeleteTeacher) callbacks.onDeleteTeacher(id, name);
            });
          });
        }
      }
    }
  }
};

