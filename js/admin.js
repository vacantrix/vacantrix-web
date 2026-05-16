// =====================================================================
// Административная панель
// =====================================================================

const Admin = (() => {

  // ── Инициализация ───────────────────────────────────────────────────
  async function init() {
    await Auth.init();
    if (!Auth.isLoggedIn()) {
      window.location.href = '../index.html';
      return;
    }
    if (!Auth.isAdmin()) {
      document.body.innerHTML = '<div style="text-align:center;padding:80px;color:#ff6060;font-size:18px">⛔ Доступ запрещён</div>';
      return;
    }
    document.getElementById('admin-email').textContent = Auth.currentUser().email;
    _bindNav();
    await _loadSection('platforms');
  }

  // ── Навигация ────────────────────────────────────────────────────────
  function _bindNav() {
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section;
        document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _loadSection(sec);
      });
    });

    document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
      await Auth.signOut();
      window.location.href = '../index.html';
    });
  }

  async function _loadSection(name) {
    const area = document.getElementById('admin-content');
    area.innerHTML = '<div class="spinner"></div>';
    if (name === 'platforms') await _renderPlatforms(area);
    if (name === 'apps')      await _renderApps(area);
    if (name === 'users')     await _renderUsers(area);
    if (name === 'settings')  _renderSettings(area);
  }

  // ══════════════════════════════════════════════════════════════════════
  // ПЛОЩАДКИ
  // ══════════════════════════════════════════════════════════════════════
  async function _renderPlatforms(area) {
    const { data } = await db.from('web_platforms').select('*').order('sort_order');
    const rows = data || [];

    area.innerHTML = `
      <div class="admin-section-header">
        <h2>Площадки</h2>
        <button class="btn-primary" id="btn-add-platform">+ Добавить</button>
      </div>
      <div id="platforms-list" class="admin-list"></div>
    `;

    _renderPlatformList(rows);

    document.getElementById('btn-add-platform').addEventListener('click', () => {
      _showPlatformForm(null);
    });
  }

  function _renderPlatformList(rows) {
    const list = document.getElementById('platforms-list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<p class="empty-hint">Нет площадок. Добавьте первую.</p>';
      return;
    }
    list.innerHTML = rows.map((p, i) => `
      <div class="admin-item" data-id="${p.id}" draggable="true">
        <span class="drag-handle">⠿</span>
        <span class="admin-item-icon">${p.icon || '🔗'}</span>
        <div class="admin-item-info">
          <strong>${_esc(p.name)}</strong>
          <small>${_esc(p.category)} · ${_esc(p.description)}</small>
        </div>
        <span class="admin-item-status ${p.active ? 'active' : 'inactive'}">
          ${p.active ? 'Активна' : 'Скрыта'}
        </span>
        <div class="admin-item-actions">
          <button class="btn-ghost sm" onclick="Admin.editPlatform('${p.id}')">✏</button>
          <button class="btn-danger sm" onclick="Admin.deletePlatform('${p.id}')">✕</button>
        </div>
      </div>
    `).join('');
    _bindDrag('platforms-list', _savePlatformOrder);
  }

  function _showPlatformForm(existing) {
    const modal = document.getElementById('admin-modal');
    const body  = document.getElementById('admin-modal-body');
    const p = existing || {};
    body.innerHTML = `
      <h3>${p.id ? 'Редактировать' : 'Добавить'} площадку</h3>
      <div class="form-group"><label>Название *</label>
        <input class="form-input" id="pf-name" value="${_esc(p.name||'')}" placeholder="Название"></div>
      <div class="form-group"><label>Описание</label>
        <input class="form-input" id="pf-desc" value="${_esc(p.description||'')}" placeholder="Краткое описание"></div>
      <div class="form-group"><label>URL</label>
        <input class="form-input" id="pf-url" value="${_esc(p.url||'')}" placeholder="https://..."></div>
      <div class="form-group"><label>Иконка (emoji)</label>
        <input class="form-input" id="pf-icon" value="${_esc(p.icon||'🔗')}" placeholder="🔗"></div>
      <div class="form-group"><label>Категория</label>
        <input class="form-input" id="pf-cat" value="${_esc(p.category||'Основное')}" placeholder="Основное"></div>
      <div class="form-check">
        <input type="checkbox" id="pf-active" ${p.active !== false ? 'checked' : ''}>
        <label for="pf-active">Активна (видна на сайте)</label>
      </div>
      <p id="pf-error" class="form-error"></p>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-primary" id="pf-save">Сохранить</button>
        <button class="btn-outline" onclick="Admin.closeModal()">Отмена</button>
      </div>
    `;
    modal.classList.remove('hidden');

    document.getElementById('pf-save').addEventListener('click', async () => {
      const name = document.getElementById('pf-name').value.trim();
      if (!name) { document.getElementById('pf-error').textContent = 'Название обязательно.'; return; }
      const payload = {
        name,
        description: document.getElementById('pf-desc').value.trim(),
        url:         document.getElementById('pf-url').value.trim(),
        icon:        document.getElementById('pf-icon').value.trim() || '🔗',
        category:    document.getElementById('pf-cat').value.trim() || 'Основное',
        active:      document.getElementById('pf-active').checked,
      };
      try {
        if (p.id) {
          await db.from('web_platforms').update(payload).eq('id', p.id);
        } else {
          const { data: all } = await db.from('web_platforms').select('sort_order').order('sort_order', { ascending: false }).limit(1);
          payload.sort_order = (all?.[0]?.sort_order ?? -1) + 1;
          await db.from('web_platforms').insert(payload);
        }
        closeModal();
        await _loadSection('platforms');
      } catch (e) {
        document.getElementById('pf-error').textContent = e.message;
      }
    });
  }

  async function editPlatform(id) {
    const { data } = await db.from('web_platforms').select('*').eq('id', id).single();
    _showPlatformForm(data);
  }

  async function deletePlatform(id) {
    if (!confirm('Удалить площадку?')) return;
    await db.from('web_platforms').delete().eq('id', id);
    await _loadSection('platforms');
  }

  async function _savePlatformOrder(ids) {
    for (let i = 0; i < ids.length; i++) {
      await db.from('web_platforms').update({ sort_order: i }).eq('id', ids[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ПРИЛОЖЕНИЯ
  // ══════════════════════════════════════════════════════════════════════
  async function _renderApps(area) {
    const { data } = await db.from('web_apps').select('*').order('sort_order');
    const rows = data || [];

    area.innerHTML = `
      <div class="admin-section-header">
        <h2>Приложения</h2>
        <button class="btn-primary" id="btn-add-app">+ Добавить</button>
      </div>
      <div id="apps-list" class="admin-list"></div>
    `;

    _renderAppList(rows);
    document.getElementById('btn-add-app').addEventListener('click', () => _showAppForm(null));
  }

  function _renderAppList(rows) {
    const list = document.getElementById('apps-list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<p class="empty-hint">Нет приложений.</p>';
      return;
    }
    list.innerHTML = rows.map(a => `
      <div class="admin-item" data-id="${a.id}" draggable="true">
        <span class="drag-handle">⠿</span>
        <div class="admin-item-info">
          <strong>${_esc(a.name)}</strong>
          <small>${_esc(a.tagline)}</small>
        </div>
        <span class="admin-item-status ${a.active ? 'active' : 'inactive'}">
          ${a.active ? 'Активно' : 'Скрыто'}
        </span>
        <div class="admin-item-actions">
          <button class="btn-ghost sm" onclick="Admin.editApp('${a.id}')">✏</button>
          <button class="btn-danger sm" onclick="Admin.deleteApp('${a.id}')">✕</button>
        </div>
      </div>
    `).join('');
    _bindDrag('apps-list', _saveAppOrder);
  }

  function _showAppForm(existing) {
    const modal = document.getElementById('admin-modal');
    const body  = document.getElementById('admin-modal-body');
    const a = existing || {};
    const screenshots = (a.screenshots || []).join('\n');
    const features    = (a.features    || []).join('\n');
    body.innerHTML = `
      <h3>${a.id ? 'Редактировать' : 'Добавить'} приложение</h3>
      <div class="form-group"><label>Название *</label>
        <input class="form-input" id="af-name" value="${_esc(a.name||'')}"></div>
      <div class="form-group"><label>Slug (URL-идентификатор) *</label>
        <input class="form-input" id="af-slug" value="${_esc(a.slug||'')}" placeholder="vacantrix"></div>
      <div class="form-group"><label>Слоган</label>
        <input class="form-input" id="af-tagline" value="${_esc(a.tagline||'')}"></div>
      <div class="form-group"><label>Описание</label>
        <textarea class="form-input" id="af-desc" rows="3">${_esc(a.description||'')}</textarea></div>
      <div class="form-group"><label>URL иконки</label>
        <input class="form-input" id="af-icon" value="${_esc(a.icon_url||'')}" placeholder="https://..."></div>
      <div class="form-group"><label>Скриншоты (URL, по одному на строку)</label>
        <textarea class="form-input" id="af-screenshots" rows="3">${_esc(screenshots)}</textarea></div>
      <div class="form-group"><label>Преимущества (по одному на строку)</label>
        <textarea class="form-input" id="af-features" rows="4">${_esc(features)}</textarea></div>
      <div class="form-group"><label>Ссылка для скачивания</label>
        <input class="form-input" id="af-download" value="${_esc(a.download_url||'')}"></div>
      <div class="form-group"><label>App Store URL</label>
        <input class="form-input" id="af-appstore" value="${_esc(a.appstore_url||'')}"></div>
      <div class="form-group"><label>Google Play URL</label>
        <input class="form-input" id="af-playstore" value="${_esc(a.playstore_url||'')}"></div>
      <div class="form-group"><label>Сайт / Подробнее URL</label>
        <input class="form-input" id="af-website" value="${_esc(a.website_url||'')}"></div>
      <div class="form-group"><label>Промо-видео URL (mp4 / YouTube embed)</label>
        <input class="form-input" id="af-video" value="${_esc(a.promo_video_url||'')}"></div>
      <div class="form-check">
        <input type="checkbox" id="af-active" ${a.active !== false ? 'checked' : ''}>
        <label for="af-active">Активно (видно на сайте)</label>
      </div>
      <p id="af-error" class="form-error"></p>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-primary" id="af-save">Сохранить</button>
        <button class="btn-outline" onclick="Admin.closeModal()">Отмена</button>
      </div>
    `;
    modal.classList.remove('hidden');

    document.getElementById('af-save').addEventListener('click', async () => {
      const name = document.getElementById('af-name').value.trim();
      const slug = document.getElementById('af-slug').value.trim();
      if (!name || !slug) { document.getElementById('af-error').textContent = 'Название и slug обязательны.'; return; }
      const payload = {
        name, slug,
        tagline:        document.getElementById('af-tagline').value.trim(),
        description:    document.getElementById('af-desc').value.trim(),
        icon_url:       document.getElementById('af-icon').value.trim(),
        screenshots:    _lines('af-screenshots'),
        features:       _lines('af-features'),
        download_url:   document.getElementById('af-download').value.trim(),
        appstore_url:   document.getElementById('af-appstore').value.trim(),
        playstore_url:  document.getElementById('af-playstore').value.trim(),
        website_url:    document.getElementById('af-website').value.trim(),
        promo_video_url:document.getElementById('af-video').value.trim(),
        active:         document.getElementById('af-active').checked,
      };
      try {
        if (a.id) {
          await db.from('web_apps').update(payload).eq('id', a.id);
        } else {
          const { data: all } = await db.from('web_apps').select('sort_order').order('sort_order', { ascending: false }).limit(1);
          payload.sort_order = (all?.[0]?.sort_order ?? -1) + 1;
          await db.from('web_apps').insert(payload);
        }
        closeModal();
        await _loadSection('apps');
      } catch (e) {
        document.getElementById('af-error').textContent = e.message;
      }
    });
  }

  async function editApp(id) {
    const { data } = await db.from('web_apps').select('*').eq('id', id).single();
    _showAppForm(data);
  }

  async function deleteApp(id) {
    if (!confirm('Удалить приложение?')) return;
    await db.from('web_apps').delete().eq('id', id);
    await _loadSection('apps');
  }

  async function _saveAppOrder(ids) {
    for (let i = 0; i < ids.length; i++) {
      await db.from('web_apps').update({ sort_order: i }).eq('id', ids[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ПОЛЬЗОВАТЕЛИ
  // ══════════════════════════════════════════════════════════════════════
  async function _renderUsers(area) {
    const { data } = await db.from('web_user_roles').select('*');
    area.innerHTML = `
      <div class="admin-section-header"><h2>Пользователи</h2></div>
      <div class="admin-list">
        ${(data || []).map(u => `
          <div class="admin-item">
            <div class="admin-item-info">
              <strong>${_esc(u.user_id)}</strong>
              <small>Роль: ${_esc(u.role)}</small>
            </div>
            ${u.role !== 'admin' ? `
              <button class="btn-outline sm"
                onclick="Admin.makeAdmin('${u.user_id}')">Назначить админом</button>` : ''}
          </div>`).join('') || '<p class="empty-hint">Нет записей.</p>'}
      </div>
    `;
  }

  async function makeAdmin(userId) {
    if (!confirm('Назначить этого пользователя администратором?')) return;
    await db.from('web_user_roles').upsert({ user_id: userId, role: 'admin' });
    await _loadSection('users');
  }

  // ══════════════════════════════════════════════════════════════════════
  // НАСТРОЙКИ
  // ══════════════════════════════════════════════════════════════════════
  function _renderSettings(area) {
    area.innerHTML = `
      <div class="admin-section-header"><h2>Настройки аккаунта</h2></div>
      <div class="admin-card">
        <h3 style="margin-bottom:16px">Сменить пароль</h3>
        <div class="form-group">
          <label>Новый пароль</label>
          <input class="form-input" id="new-pass" type="password" placeholder="Минимум 6 символов">
        </div>
        <p id="pass-error" class="form-error"></p>
        <button class="btn-primary" id="btn-change-pass">Сохранить</button>
      </div>
    `;
    document.getElementById('btn-change-pass').addEventListener('click', async () => {
      const pw = document.getElementById('new-pass').value;
      const errEl = document.getElementById('pass-error');
      if (pw.length < 6) { errEl.textContent = 'Минимум 6 символов.'; return; }
      try {
        await Auth.updatePassword(pw);
        errEl.style.color = '#60cc60';
        errEl.textContent = 'Пароль изменён.';
        setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 3000);
      } catch (e) {
        errEl.textContent = e.message;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // МОДАЛЬНОЕ ОКНО
  // ══════════════════════════════════════════════════════════════════════
  function closeModal() {
    document.getElementById('admin-modal').classList.add('hidden');
  }

  // ── Drag-and-drop сортировка ─────────────────────────────────────────
  function _bindDrag(containerId, onSave) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let dragged = null;

    container.querySelectorAll('[draggable=true]').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragged = el;
        el.style.opacity = '.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.style.opacity = '';
        const ids = [...container.querySelectorAll('[data-id]')].map(e => e.dataset.id);
        onSave(ids);
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (el !== dragged) {
          const rect = el.getBoundingClientRect();
          const mid  = rect.top + rect.height / 2;
          container.insertBefore(dragged, e.clientY < mid ? el : el.nextSibling);
        }
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function _lines(id) {
    return document.getElementById(id).value
      .split('\n').map(s => s.trim()).filter(Boolean);
  }

  function _esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }

  return { init, editPlatform, deletePlatform, editApp, deleteApp, makeAdmin, closeModal };
})();

document.addEventListener('DOMContentLoaded', Admin.init);
