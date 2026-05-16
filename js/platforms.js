// =====================================================================
// Модуль «Площадки»
// =====================================================================

const Platforms = (() => {

  async function load() {
    const { data, error } = await db
      .from('web_platforms')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    if (error) { console.error(error); return []; }
    return data || [];
  }

  function render(platforms) {
    const container = document.getElementById('platforms-content');
    if (!container) return;

    if (!platforms.length) {
      container.innerHTML = '<p class="empty-hint">Площадки пока не добавлены.</p>';
      return;
    }

    // Группировка по категориям
    const groups = {};
    platforms.forEach(p => {
      const cat = p.category || 'Основное';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    container.innerHTML = '';
    Object.entries(groups).forEach(([category, items], idx) => {
      const section = document.createElement('div');
      section.className = 'platform-group';

      // Заголовок-аккордеон
      const header = document.createElement('button');
      header.className = 'accordion-header' + (idx === 0 ? ' open' : '');
      header.innerHTML = `<span>${category}</span><span class="acc-arrow">▾</span>`;
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        body.classList.toggle('hidden');
      });

      // Сетка кнопок
      const body = document.createElement('div');
      body.className = 'accordion-body' + (idx !== 0 ? ' hidden' : '');
      const grid = document.createElement('div');
      grid.className = 'platforms-grid';

      items.forEach(p => {
        const btn = document.createElement('a');
        btn.className = 'platform-btn';
        btn.href = p.url || '#';
        if (p.url) btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.innerHTML = `
          <span class="platform-icon">${p.icon || '🔗'}</span>
          <span class="platform-info">
            <strong>${_esc(p.name)}</strong>
            <small>${_esc(p.description)}</small>
          </span>
          <span class="platform-arrow">→</span>
        `;
        grid.appendChild(btn);
      });

      body.appendChild(grid);
      section.appendChild(header);
      section.appendChild(body);
      container.appendChild(section);
    });
  }

  function _esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }

  async function loadAndRender() {
    const container = document.getElementById('platforms-content');
    if (container) container.innerHTML = '<div class="spinner"></div>';
    const data = await load();
    render(data);
  }

  return { loadAndRender };
})();
