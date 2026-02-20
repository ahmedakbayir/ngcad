// =============================================
// Ticket System - Frontend SPA
// =============================================

let currentUser = null;
let lookups = { statuses: [], priorities: [], firms: [], agents: [], tags: [] };

// ---- API Helper ----
async function api(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (res.status === 401) {
        window.location.href = '/login.html';
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Bir hata oluştu');
    return data;
}

// ---- Toast ----
function toast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ---- Modal ----
function openModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ---- Status/Priority helpers ----
const statusLabels = { new: 'Yeni', in_progress: 'Devam Ediyor', waiting: 'Bekliyor', pending_close: 'Kapatılacak', closed: 'Kapalı' };
const priorityLabels = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
const yetkiLabels = { 1: 'Admin', 2: 'Agent', 3: 'Müşteri' };
const yetkiClasses = { 1: 'admin', 2: 'agent', 3: 'customer' };
const eventLabels = {
    create: 'Oluşturuldu', update: 'Güncellendi', assign: 'Atandı', close: 'Kapatıldı',
    status_change: 'Durum Değişti', priority_change: 'Öncelik Değişti', tag_add: 'Etiket Eklendi',
    tag_remove: 'Etiket Kaldırıldı', comment_add: 'Yorum', reopen: 'Tekrar Açıldı', unassign: 'Atama Kaldırıldı'
};

function statusBadge(name) {
    return `<span class="badge badge-${name}">${statusLabels[name] || name}</span>`;
}
function priorityBadge(name) {
    return `<span class="badge badge-${name}">${priorityLabels[name] || name}</span>`;
}
function yetkiBadge(id) {
    return `<span class="badge badge-${yetkiClasses[id] || 'customer'}">${yetkiLabels[id] || 'Müşteri'}</span>`;
}
function formatDate(dt) {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ---- Router ----
function navigate(page, params) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const link = document.querySelector(`[data-page="${page}"]`);
    if (link) link.classList.add('active');
    window.location.hash = page;

    const content = document.getElementById('pageContent');
    switch (page) {
        case 'dashboard': renderDashboard(content); break;
        case 'tickets': renderTickets(content); break;
        case 'ticket-detail': renderTicketDetail(content, params); break;
        case 'users': renderUsers(content); break;
        case 'firms': renderFirms(content); break;
        case 'tags': renderTags(content); break;
        default: renderDashboard(content);
    }
}

// ---- Init ----
async function init() {
    try {
        currentUser = await api('/api/auth/me');
        if (!currentUser) return;

        // Show user info
        document.getElementById('currentUser').innerHTML =
            `${currentUser.name} ${yetkiBadge(currentUser.yetkiId)}`;

        // Show/hide admin-only nav items
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = currentUser.yetkiId === 1 ? '' : 'none';
        });
        document.querySelectorAll('.agent-only').forEach(el => {
            el.style.display = currentUser.yetkiId <= 2 ? '' : 'none';
        });

        // Logout
        document.getElementById('btnLogout').addEventListener('click', async () => {
            await api('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login.html';
        });

        // Load lookups
        lookups = await api('/api/dashboard/lookups');

        // Route
        const hash = window.location.hash.slice(1) || 'dashboard';
        navigate(hash);
    } catch {
        window.location.href = '/login.html';
    }
}

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('ticket-detail:')) {
        navigate('ticket-detail', { id: hash.split(':')[1] });
    } else {
        navigate(hash || 'dashboard');
    }
});

// =============================================
// DASHBOARD
// =============================================
async function renderDashboard(container) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
    const data = await api('/api/dashboard/stats');
    if (!data) return;

    const statusColors = { new: '#3b82f6', in_progress: '#f59e0b', waiting: '#8b5cf6', pending_close: '#6366f1', closed: '#10b981' };
    const maxCount = Math.max(...data.byStatus.map(s => s.count), 1);

    container.innerHTML = `
        <div class="page-header"><h1>Dashboard</h1></div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Toplam Ticket</div>
                <div class="stat-value">${data.total}</div>
            </div>
            <div class="stat-card success">
                <div class="stat-label">Açık</div>
                <div class="stat-value">${data.open}</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-label">Bana Atanan</div>
                <div class="stat-value">${data.myTickets}</div>
            </div>
            <div class="stat-card danger">
                <div class="stat-label">Kritik</div>
                <div class="stat-value">${data.critical}</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="card">
                <div class="card-header"><h3>Durum Dağılımı</h3></div>
                <div class="status-bars">
                    ${data.byStatus.map(s => `
                        <div class="status-bar-item">
                            <span class="bar-label">${statusLabels[s.name] || s.name}</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${(s.count / maxCount) * 100}%;background:${statusColors[s.name] || '#94a3b8'}"></div>
                            </div>
                            <span class="bar-count">${s.count}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Öncelik Dağılımı</h3></div>
                <div class="status-bars">
                    ${data.byPriority.map(p => {
                        const colors = { low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', critical: '#ef4444' };
                        const maxP = Math.max(...data.byPriority.map(x => x.count), 1);
                        return `
                        <div class="status-bar-item">
                            <span class="bar-label">${priorityLabels[p.name] || p.name}</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${(p.count / maxP) * 100}%;background:${colors[p.name] || '#94a3b8'}"></div>
                            </div>
                            <span class="bar-count">${p.count}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>

        <div class="card mt-16">
            <div class="card-header"><h3>Son Ticketlar</h3></div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Atanan</th><th>Firma</th><th>Güncelleme</th></tr>
                    </thead>
                    <tbody>
                        ${data.recentTickets.length === 0 ? '<tr><td colspan="7" class="text-muted" style="text-align:center">Henüz ticket yok</td></tr>' :
                        data.recentTickets.map(t => `
                            <tr class="clickable-row" onclick="navigate('ticket-detail',{id:${t.id}})">
                                <td>${t.id}</td>
                                <td><strong>${esc(t.title)}</strong></td>
                                <td>${statusBadge(t.status_name)}</td>
                                <td>${priorityBadge(t.priority_name)}</td>
                                <td>${esc(t.assigned_user_name || '-')}</td>
                                <td>${esc(t.firm_name || '-')}</td>
                                <td>${formatDate(t.updated_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// =============================================
// TICKETS
// =============================================
async function renderTickets(container) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';

    const createBtn = currentUser.yetkiId <= 2
        ? `<button class="btn btn-primary" onclick="openTicketForm()">+ Yeni Ticket</button>`
        : `<button class="btn btn-primary" onclick="openTicketForm()">+ Destek Talebi</button>`;

    const tickets = await api('/api/tickets');
    if (!tickets) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>Ticketlar</h1>
            ${createBtn}
        </div>

        <div class="filters-bar">
            <div class="filter-group">
                <label>Durum:</label>
                <select id="filterStatus" onchange="applyTicketFilters()">
                    <option value="">Tümü</option>
                    ${lookups.statuses.map(s => `<option value="${s.id}">${statusLabels[s.name] || s.name}</option>`).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Öncelik:</label>
                <select id="filterPriority" onchange="applyTicketFilters()">
                    <option value="">Tümü</option>
                    ${lookups.priorities.map(p => `<option value="${p.id}">${priorityLabels[p.name] || p.name}</option>`).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Ara:</label>
                <input type="text" id="filterSearch" placeholder="Başlık ara..." oninput="applyTicketFilters()" style="width:200px">
            </div>
        </div>

        <div class="card">
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Firma</th><th>Atanan</th><th>Tarih</th></tr>
                    </thead>
                    <tbody id="ticketTableBody">
                        ${renderTicketRows(tickets)}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    window._allTickets = tickets;
}

function renderTicketRows(tickets) {
    if (tickets.length === 0) {
        return '<tr><td colspan="7" class="empty-state">Ticket bulunamadı</td></tr>';
    }
    return tickets.map(t => `
        <tr class="clickable-row" onclick="navigate('ticket-detail',{id:${t.id}})">
            <td>${t.id}</td>
            <td><strong>${esc(t.title)}</strong></td>
            <td>${statusBadge(t.status_name)}</td>
            <td>${priorityBadge(t.priority_name)}</td>
            <td>${esc(t.firm_name || '-')}</td>
            <td>${esc(t.assigned_user_name || '-')}</td>
            <td>${formatDate(t.created_at)}</td>
        </tr>
    `).join('');
}

async function applyTicketFilters() {
    const statusId = document.getElementById('filterStatus').value;
    const priorityId = document.getElementById('filterPriority').value;
    const search = document.getElementById('filterSearch').value;

    const params = new URLSearchParams();
    if (statusId) params.set('statusId', statusId);
    if (priorityId) params.set('priorityId', priorityId);
    if (search) params.set('search', search);

    const tickets = await api(`/api/tickets?${params}`);
    if (tickets) {
        document.getElementById('ticketTableBody').innerHTML = renderTicketRows(tickets);
    }
}

function openTicketForm(ticket) {
    const isEdit = !!ticket;
    const isAgent = currentUser.yetkiId <= 2;

    openModal(`
        <h2>${isEdit ? 'Ticket Düzenle' : 'Yeni Ticket'}</h2>
        <form id="ticketForm">
            <div class="form-group">
                <label>Başlık *</label>
                <input type="text" id="tf_title" value="${esc(ticket?.title || '')}" required>
            </div>
            <div class="form-group">
                <label>Açıklama</label>
                <textarea id="tf_description">${esc(ticket?.description || '')}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Öncelik</label>
                    <select id="tf_priority">
                        ${lookups.priorities.map(p => `<option value="${p.id}" ${p.id === (ticket?.priority_id || 2) ? 'selected' : ''}>${priorityLabels[p.name] || p.name}</option>`).join('')}
                    </select>
                </div>
                ${isAgent ? `
                <div class="form-group">
                    <label>Atanan</label>
                    <select id="tf_assigned">
                        <option value="">Atanmadı</option>
                        ${lookups.agents.map(a => `<option value="${a.id}" ${a.id === ticket?.assigned_user_id ? 'selected' : ''}>${a.name}</option>`).join('')}
                    </select>
                </div>` : '<div></div>'}
            </div>
            <div class="form-row">
                ${isAgent ? `
                <div class="form-group">
                    <label>Firma</label>
                    <select id="tf_firm">
                        <option value="">Seçiniz</option>
                        ${lookups.firms.map(f => `<option value="${f.id}" ${f.id === ticket?.firm_id ? 'selected' : ''}>${f.name}</option>`).join('')}
                    </select>
                </div>` : '<div></div>'}
                <div class="form-group">
                    <label>Son Tarih</label>
                    <input type="date" id="tf_due" value="${ticket?.due_date?.split('T')[0] || ''}">
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Güncelle' : 'Oluştur'}</button>
            </div>
        </form>
    `);

    document.getElementById('ticketForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            title: document.getElementById('tf_title').value,
            description: document.getElementById('tf_description').value,
            priorityId: parseInt(document.getElementById('tf_priority').value),
            assignedUserId: document.getElementById('tf_assigned')?.value ? parseInt(document.getElementById('tf_assigned').value) : null,
            firmId: document.getElementById('tf_firm')?.value ? parseInt(document.getElementById('tf_firm').value) : null,
            dueDate: document.getElementById('tf_due').value || null
        };
        try {
            if (isEdit) {
                await api(`/api/tickets/${ticket.id}`, { method: 'PUT', body });
                toast('Ticket güncellendi');
            } else {
                await api('/api/tickets', { method: 'POST', body });
                toast('Ticket oluşturuldu');
            }
            closeModal();
            navigate('tickets');
        } catch (err) { toast(err.message, 'error'); }
    });
}

// =============================================
// TICKET DETAIL
// =============================================
async function renderTicketDetail(container, params) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
    const data = await api(`/api/tickets/${params.id}`);
    if (!data) return;

    const t = data.ticket;
    const isAgent = currentUser.yetkiId <= 2;

    container.innerHTML = `
        <div class="page-header">
            <h1>
                <button class="btn btn-icon" onclick="navigate('tickets')" title="Geri">&larr;</button>
                #${t.id} - ${esc(t.title)}
            </h1>
            <div style="display:flex;gap:8px">
                ${isAgent ? `<button class="btn btn-secondary" onclick="openTicketForm(window._currentTicket)">Düzenle</button>` : ''}
            </div>
        </div>

        <div class="ticket-detail-grid">
            <div class="ticket-main">
                <div class="card">
                    <div class="card-header"><h3>Açıklama</h3></div>
                    <div class="ticket-description">${esc(t.description || 'Açıklama yok')}</div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3>Aktivite</h3>
                    </div>
                    <div style="margin-bottom:16px">
                        <textarea id="commentInput" placeholder="Yorum yazın..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:14px;min-height:60px;resize:vertical;outline:none"></textarea>
                        <div style="text-align:right;margin-top:8px">
                            <button class="btn btn-primary btn-sm" onclick="addComment(${t.id})">Yorum Ekle</button>
                        </div>
                    </div>
                    <div class="timeline" id="timeline">
                        ${renderTimeline(data.events)}
                    </div>
                </div>
            </div>

            <div class="ticket-sidebar">
                <div class="card">
                    <div class="card-header"><h3>Bilgiler</h3></div>
                    <div class="info-item">
                        <span class="info-label">Durum</span>
                        ${isAgent ? `
                        <select id="statusSelect" onchange="changeStatus(${t.id})" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                            ${lookups.statuses.map(s => `<option value="${s.id}" ${s.id === t.status_id ? 'selected' : ''}>${statusLabels[s.name] || s.name}</option>`).join('')}
                        </select>` : statusBadge(t.status_name)}
                    </div>
                    <div class="info-item">
                        <span class="info-label">Öncelik</span>
                        ${isAgent ? `
                        <select id="prioritySelect" onchange="changePriority(${t.id})" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                            ${lookups.priorities.map(p => `<option value="${p.id}" ${p.id === t.priority_id ? 'selected' : ''}>${priorityLabels[p.name] || p.name}</option>`).join('')}
                        </select>` : priorityBadge(t.priority_name)}
                    </div>
                    <div class="info-item">
                        <span class="info-label">Atanan</span>
                        ${isAgent ? `
                        <select id="assignSelect" onchange="changeAssign(${t.id})" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                            <option value="0">Atanmadı</option>
                            ${lookups.agents.map(a => `<option value="${a.id}" ${a.id === t.assigned_user_id ? 'selected' : ''}>${a.name}</option>`).join('')}
                        </select>` : `<span>${esc(t.assigned_user_name || 'Atanmadı')}</span>`}
                    </div>
                    <div class="info-item">
                        <span class="info-label">Firma</span>
                        <span>${esc(t.firm_name || '-')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Oluşturan</span>
                        <span>${esc(t.created_by_name || '-')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Tarih</span>
                        <span>${formatDate(t.created_at)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Son Tarih</span>
                        <span>${t.due_date ? formatDate(t.due_date) : '-'}</span>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3>Etiketler</h3>
                        ${isAgent ? `<button class="btn btn-sm btn-secondary" onclick="openTagSelector(${t.id})">+</button>` : ''}
                    </div>
                    <div id="tagList">
                        ${data.tags.length === 0 ? '<span class="text-muted">Etiket yok</span>' :
                        data.tags.map(tag => `
                            <span class="tag" style="background:${tag.color_hex}">
                                ${esc(tag.name)}
                                ${isAgent ? `<span class="tag-remove" onclick="removeTag(${t.id},${tag.id})">&times;</span>` : ''}
                            </span>
                        `).join(' ')}
                    </div>
                </div>
            </div>
        </div>
    `;

    window._currentTicket = t;
}

function renderTimeline(events) {
    if (!events || events.length === 0) return '<p class="text-muted">Henüz aktivite yok</p>';
    return events.map(e => {
        const isComment = e.event_type_name === 'comment_add';
        return `
            <div class="timeline-item ${isComment ? 'comment' : 'status'}">
                <div class="timeline-header">
                    <span class="timeline-user">${esc(e.user_name || 'Sistem')}</span>
                    <span class="badge badge-${e.event_type_name === 'comment_add' ? 'in_progress' : 'new'}" style="font-size:10px">${eventLabels[e.event_type_name] || e.event_type_name}</span>
                    <span class="timeline-date">${formatDate(e.created_at)}</span>
                </div>
                <div class="timeline-body">${esc(e.description || '')}</div>
            </div>
        `;
    }).join('');
}

async function addComment(ticketId) {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) return;
    try {
        await api(`/api/tickets/${ticketId}/comments`, { method: 'POST', body: { description: text } });
        toast('Yorum eklendi');
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

async function changeStatus(ticketId) {
    const statusId = parseInt(document.getElementById('statusSelect').value);
    try {
        await api(`/api/tickets/${ticketId}`, { method: 'PUT', body: { statusId } });
        toast('Durum güncellendi');
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

async function changePriority(ticketId) {
    const priorityId = parseInt(document.getElementById('prioritySelect').value);
    try {
        await api(`/api/tickets/${ticketId}`, { method: 'PUT', body: { priorityId } });
        toast('Öncelik güncellendi');
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

async function changeAssign(ticketId) {
    const assignedUserId = parseInt(document.getElementById('assignSelect').value);
    try {
        await api(`/api/tickets/${ticketId}`, { method: 'PUT', body: { assignedUserId } });
        toast('Atama güncellendi');
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

function openTagSelector(ticketId) {
    openModal(`
        <h2>Etiket Ekle</h2>
        <div style="display:flex;flex-direction:column;gap:8px">
            ${lookups.tags.map(tag => `
                <button class="btn btn-secondary" onclick="addTag(${ticketId},${tag.id})" style="text-align:left">
                    <span class="tag" style="background:${tag.color_hex}">${esc(tag.name)}</span>
                    <span class="text-muted" style="margin-left:8px">${esc(tag.description || '')}</span>
                </button>
            `).join('')}
        </div>
        <div class="form-actions mt-16">
            <button class="btn btn-secondary" onclick="closeModal()">Kapat</button>
        </div>
    `);
}

async function addTag(ticketId, tagId) {
    try {
        await api(`/api/tickets/${ticketId}/tags?tagId=${tagId}`, { method: 'POST' });
        toast('Etiket eklendi');
        closeModal();
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

async function removeTag(ticketId, tagId) {
    try {
        await api(`/api/tickets/${ticketId}/tags/${tagId}`, { method: 'DELETE' });
        toast('Etiket kaldırıldı');
        navigate('ticket-detail', { id: ticketId });
    } catch (err) { toast(err.message, 'error'); }
}

// =============================================
// USERS
// =============================================
async function renderUsers(container) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
    const users = await api('/api/users');
    if (!users) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>Kullanıcılar</h1>
            <button class="btn btn-primary" onclick="openUserForm()">+ Yeni Kullanıcı</button>
        </div>
        <div class="card">
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Ad</th><th>E-posta</th><th>Telefon</th><th>Firma</th><th>Yetki</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td>${u.id}</td>
                                <td><strong>${esc(u.name)}</strong></td>
                                <td>${esc(u.mail)}</td>
                                <td>${esc(u.tel || '-')}</td>
                                <td>${esc(u.firm_name || '-')}</td>
                                <td>${yetkiBadge(u.yetki_id)}</td>
                                <td><button class="btn btn-sm btn-secondary" onclick='openUserForm(${JSON.stringify(u).replace(/'/g, "&#39;")})'>Düzenle</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openUserForm(user) {
    const isEdit = !!user;
    openModal(`
        <h2>${isEdit ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h2>
        <form id="userForm">
            <div class="form-group">
                <label>Ad Soyad *</label>
                <input type="text" id="uf_name" value="${esc(user?.name || '')}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>E-posta *</label>
                    <input type="email" id="uf_mail" value="${esc(user?.mail || '')}" required>
                </div>
                <div class="form-group">
                    <label>${isEdit ? 'Şifre (boş = değişmez)' : 'Şifre *'}</label>
                    <input type="password" id="uf_password" ${isEdit ? '' : 'required'}>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Telefon</label>
                    <input type="text" id="uf_tel" value="${esc(user?.tel || '')}">
                </div>
                <div class="form-group">
                    <label>Yetki</label>
                    <select id="uf_yetki">
                        <option value="3" ${(user?.yetki_id || 3) === 3 ? 'selected' : ''}>Müşteri</option>
                        <option value="2" ${user?.yetki_id === 2 ? 'selected' : ''}>Agent</option>
                        <option value="1" ${user?.yetki_id === 1 ? 'selected' : ''}>Admin</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Firma</label>
                <select id="uf_firm">
                    <option value="">Firma Yok</option>
                    ${lookups.firms.map(f => `<option value="${f.id}" ${f.id === user?.firm_id ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Güncelle' : 'Oluştur'}</button>
            </div>
        </form>
    `);

    document.getElementById('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            name: document.getElementById('uf_name').value,
            mail: document.getElementById('uf_mail').value,
            password: document.getElementById('uf_password').value || null,
            tel: document.getElementById('uf_tel').value || null,
            yetkiId: parseInt(document.getElementById('uf_yetki').value),
            firmId: document.getElementById('uf_firm').value ? parseInt(document.getElementById('uf_firm').value) : null
        };
        try {
            if (isEdit) {
                await api(`/api/users/${user.id}`, { method: 'PUT', body });
                toast('Kullanıcı güncellendi');
            } else {
                await api('/api/users', { method: 'POST', body });
                toast('Kullanıcı oluşturuldu');
            }
            closeModal();
            lookups = await api('/api/dashboard/lookups');
            navigate('users');
        } catch (err) { toast(err.message, 'error'); }
    });
}

// =============================================
// FIRMS
// =============================================
async function renderFirms(container) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
    const firms = await api('/api/firms');
    if (!firms) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>Firmalar</h1>
            <button class="btn btn-primary" onclick="openFirmForm()">+ Yeni Firma</button>
        </div>
        <div class="card">
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Firma Adı</th><th>Kullanıcı</th><th>Ticket</th><th>Durum</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                        ${firms.map(f => `
                            <tr>
                                <td>${f.id}</td>
                                <td><strong>${esc(f.name)}</strong></td>
                                <td>${f.user_count}</td>
                                <td>${f.ticket_count}</td>
                                <td><span class="badge ${f.inactive ? 'badge-closed' : 'badge-new'}">${f.inactive ? 'Pasif' : 'Aktif'}</span></td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick='openFirmForm(${JSON.stringify(f).replace(/'/g, "&#39;")})'>Düzenle</button>
                                    <button class="btn btn-sm ${f.inactive ? 'btn-success' : 'btn-danger'}" onclick="toggleFirm(${f.id})">${f.inactive ? 'Aktifle' : 'Pasifle'}</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openFirmForm(firm) {
    const isEdit = !!firm;
    openModal(`
        <h2>${isEdit ? 'Firma Düzenle' : 'Yeni Firma'}</h2>
        <form id="firmForm">
            <div class="form-group">
                <label>Firma Adı *</label>
                <input type="text" id="ff_name" value="${esc(firm?.name || '')}" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Güncelle' : 'Oluştur'}</button>
            </div>
        </form>
    `);

    document.getElementById('firmForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: document.getElementById('ff_name').value };
        try {
            if (isEdit) {
                await api(`/api/firms/${firm.id}`, { method: 'PUT', body });
                toast('Firma güncellendi');
            } else {
                await api('/api/firms', { method: 'POST', body });
                toast('Firma oluşturuldu');
            }
            closeModal();
            lookups = await api('/api/dashboard/lookups');
            navigate('firms');
        } catch (err) { toast(err.message, 'error'); }
    });
}

async function toggleFirm(id) {
    try {
        await api(`/api/firms/${id}/toggle`, { method: 'PUT' });
        toast('Firma durumu güncellendi');
        lookups = await api('/api/dashboard/lookups');
        navigate('firms');
    } catch (err) { toast(err.message, 'error'); }
}

// =============================================
// TAGS
// =============================================
async function renderTags(container) {
    container.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
    const tags = await api('/api/tags');
    if (!tags) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>Etiketler</h1>
            <button class="btn btn-primary" onclick="openTagForm()">+ Yeni Etiket</button>
        </div>
        <div class="card">
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Etiket</th><th>Açıklama</th><th>Kullanım</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                        ${tags.map(t => `
                            <tr>
                                <td>${t.id}</td>
                                <td><span class="tag" style="background:${t.color_hex}">${esc(t.name)}</span></td>
                                <td>${esc(t.description || '-')}</td>
                                <td>${t.usage_count} ticket</td>
                                <td><button class="btn btn-sm btn-secondary" onclick='openTagForm(${JSON.stringify(t).replace(/'/g, "&#39;")})'>Düzenle</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openTagForm(tag) {
    const isEdit = !!tag;
    openModal(`
        <h2>${isEdit ? 'Etiket Düzenle' : 'Yeni Etiket'}</h2>
        <form id="tagForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Etiket Adı *</label>
                    <input type="text" id="tgf_name" value="${esc(tag?.name || '')}" required>
                </div>
                <div class="form-group">
                    <label>Renk</label>
                    <input type="color" id="tgf_color" value="${tag?.color_hex || '#6b7280'}" style="height:38px;cursor:pointer">
                </div>
            </div>
            <div class="form-group">
                <label>Açıklama</label>
                <input type="text" id="tgf_desc" value="${esc(tag?.description || '')}">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">İptal</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Güncelle' : 'Oluştur'}</button>
            </div>
        </form>
    `);

    document.getElementById('tagForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            name: document.getElementById('tgf_name').value,
            description: document.getElementById('tgf_desc').value || null,
            colorHex: document.getElementById('tgf_color').value
        };
        try {
            if (isEdit) {
                await api(`/api/tags/${tag.id}`, { method: 'PUT', body });
                toast('Etiket güncellendi');
            } else {
                await api('/api/tags', { method: 'POST', body });
                toast('Etiket oluşturuldu');
            }
            closeModal();
            lookups = await api('/api/dashboard/lookups');
            navigate('tags');
        } catch (err) { toast(err.message, 'error'); }
    });
}

// ---- Utility ----
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- Start ----
init();
