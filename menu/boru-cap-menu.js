// boru-cap-menu.js
// "Hesap ► Boru Çapı Hesapları" — TS 7363:2018 §4.4.1 (≤50 mbar, çelik boru)
//
// Her hat için:
//   ΔPΣ = ΔPR + ΔPZ + ΔPH
//   P1 - P2 = 23,2 × R × Q^1.82 / D^4.82 × L                   (bar)
//   ΔPR    = (P1 - P2) × 1000                                  (mbar)
//   V      = 353,677 × Q / (D² × P2)                           (m/s)
//   ΔPZ    = 3,97e-3 × Σξ × V²                                 (mbar)
//   ΔPH    = 0,049 × H                                         (mbar)
//
// Σξ değerleri "Fittings (Lokal Kayıplar)" tablosundan gelir (computeFittings).
// İlk hattın P1'i 21 mbar girişler için 1,021 bar; sonraki hatlarda parent
// hattın P2 değeri kullanılır.

import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { computeFittings } from './fittings-menu.js';
import { draw2D } from '../draw/draw2d.js';

// TS 7363 Çizelge 1 — Çelik borularda dış çap & cidar kalınlığı
const PIPE_SPECS = {
    'DN15':  { od: 21.3,  wall: 2.80 },
    'DN20':  { od: 26.9,  wall: 2.90 },
    'DN25':  { od: 33.7,  wall: 3.40 },
    'DN32':  { od: 42.4,  wall: 3.60 },
    'DN40':  { od: 48.3,  wall: 3.70 },
    'DN50':  { od: 60.3,  wall: 3.90 },
    'DN65':  { od: 73.0,  wall: 5.20 },
    'DN80':  { od: 88.9,  wall: 5.50 },
    'DN100': { od: 114.3, wall: 6.00 },
    'DN125': { od: 141.0, wall: 6.60 },
    'DN150': { od: 168.3, wall: 7.10 },
    'DN200': { od: 219.1, wall: 8.18 },
    'DN250': { od: 273.0, wall: 9.27 },
    'DN300': { od: 323.0, wall: 9.50 },
    'DN400': { od: 406.0, wall: 9.50 },
    'DN450': { od: 470.0, wall: 9.50 },
};
const DN_LIST = Object.keys(PIPE_SPECS);

const R_GAS = 0.6;       // gaz sabiti
const V_LIMIT = 6;       // m/s — Not: V ≤ 6 m/s olmalıdır

// İlk hattın P1'i: 21 mbar tesisat → 1,021 bar; 50 mbar (300 mbar değil) → 1,05 bar
function defaultP1Bar(basinc) {
    const b = String(basinc || '21');
    if (b === '50')  return 1.05;
    return 1.021; // 21 mbar (varsayılan)
}

function pipeId(p) { return p.boruCap || 'DN25'; }
function getInternalDiameter(dn) {
    const s = PIPE_SPECS[dn];
    if (!s) return null;
    return s.od - 2 * s.wall; // mm
}

// ─── HAT VERİLERİNİ TOPLA ──────────────────────────────────────────────────────
// hatMap: pipe.id → hatNo
// Çıktı: hat → { dn, Q, L_m, H_m, basinc, headPipe, tailPipe, parentHatNo, segmentType }
function buildHatData(manager) {
    if (!manager?.pipes?.length) return { hats: [], hatNos: [] };

    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));

    // Çocuk haritası
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });

    // Sayaç çıkış borusu (TÜKETİM hattının başlangıcı)
    const sayacCikisIds = new Set(
        (manager.components || [])
            .filter(c => c.type === 'sayac' && c.cikisBagliBoruId)
            .map(c => c.cikisBagliBoruId)
    );

    // Her boru için: sayaç sonrası mı? (TÜKETİM/CİHAZ HATTI)
    const downstreamOfMeter = new Set();
    sayacCikisIds.forEach(rootId => {
        const queue = [rootId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (downstreamOfMeter.has(id)) continue;
            downstreamOfMeter.add(id);
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    });

    // Hat → pipe id listesi
    const hatPipes = new Map();
    hatMap.forEach((hatNo, pid) => {
        if (!hatPipes.has(hatNo)) hatPipes.set(hatNo, []);
        hatPipes.get(hatNo).push(pid);
    });

    const hats = [];
    hatPipes.forEach((pids, hatNo) => {
        const localSet = new Set(pids);
        const pipes = pids.map(id => pipeMap.get(id)).filter(Boolean);
        if (pipes.length === 0) return;

        // Toplam uzunluk (cm → m)
        const totalLenCm = pipes.reduce((s, p) => {
            if (!p.p1 || !p.p2) return s;
            return s + Math.hypot(
                p.p2.x - p.p1.x,
                p.p2.y - p.p1.y,
                (p.p2.z || 0) - (p.p1.z || 0)
            );
        }, 0);
        const L_m = totalLenCm / 100;

        // Head pipe: parent'ı bu hatta DEĞİL (veya yok)
        const heads = pipes.filter(p => {
            const par = p.baslangicBaglanti;
            if (!par || par.tip !== 'boru' || !par.hedefId) return true;
            return !localSet.has(par.hedefId);
        });
        // Tail pipe: tüm çocukları bu hatta DEĞİL (veya yok)
        const tails = pipes.filter(p => {
            const ch = childrenOf.get(p.id) || [];
            if (ch.length === 0) return true;
            return ch.every(cid => !localSet.has(cid));
        });

        const headPipe = heads[0] || pipes[0];
        const tailPipe = tails[0] || pipes[pipes.length - 1];

        // Yükseklik farkı: akış girişi - akış çıkışı (m), pozitif = düşüş (kayıp)
        const entryZ = (headPipe.p1?.z || 0);
        const exitZ  = (tailPipe.p2?.z || 0);
        const H_m = (entryZ - exitZ) / 100;

        // Parent hat: head pipe'ın parent borusunun hat numarası
        let parentHatNo = null;
        const headPar = headPipe.baslangicBaglanti;
        if (headPar?.tip === 'boru' && headPar.hedefId) {
            const ph = hatMap.get(headPar.hedefId);
            if (ph != null && ph !== hatNo) parentHatNo = ph;
        }

        const segmentType = pids.some(id => downstreamOfMeter.has(id))
            ? 'TUKETIM'
            : 'KOLON';

        hats.push({
            hatNo,
            dn:       pipeId(pipes[0]),
            Q:        Number(pipes[0].debi) || 0,
            L_m,
            H_m,
            basinc:   String(pipes[0].basinc ?? '21'),
            parentHatNo,
            segmentType,
            pipeIds:  pids,
            headPipeId: headPipe.id,
            tailPipeId: tailPipe.id,
        });
    });

    hats.sort((a, b) => a.hatNo - b.hatNo);
    const hatNos = hats.map(h => h.hatNo);
    return { hats, hatNos };
}

// ─── PER-HAT HESAPLAMA ─────────────────────────────────────────────────────────
function computeHatRow(hat, sigmaXi, P1_bar) {
    const D_mm = getInternalDiameter(hat.dn);
    if (!D_mm || D_mm <= 0) {
        return { ...hat, error: `Bilinmeyen çap: ${hat.dn}`, P1_bar };
    }
    if (hat.Q <= 0 || hat.L_m <= 0) {
        // Akış yok / uzunluk yok → tümü 0
        return {
            ...hat,
            sigmaXi,
            D_mm,
            v: 0,
            dPR_L: 0,
            dPR: 0,
            dPF: 0,
            dPA: 0.049 * (hat.H_m || 0),
            sumDP: 0.049 * (hat.H_m || 0),
            P1_bar,
            P2_bar: P1_bar,
        };
    }

    // P1 - P2 = 23,2 × R × Q^1.82 / D^4.82 × L  (bar)
    const drop_bar = 23.2 * R_GAS * Math.pow(hat.Q, 1.82) / Math.pow(D_mm, 4.82) * hat.L_m;
    const dPR = drop_bar * 1000; // mbar
    const dPR_L = hat.L_m > 0 ? dPR / hat.L_m : 0;
    const P2_bar = Math.max(0.001, P1_bar - drop_bar);

    // V = 353,677 × Q / (D² × P2)
    const v = 353.677 * hat.Q / (D_mm * D_mm * P2_bar);

    // ΔPF (yerel direnç) = 3.97e-3 × Σξ × V²
    const dPF = 3.97e-3 * sigmaXi * v * v;

    // ΔPA (yükseklik) = 0.049 × H
    const dPA = 0.049 * (hat.H_m || 0);

    const sumDP = dPR + dPF + dPA;

    return {
        ...hat,
        sigmaXi,
        D_mm,
        v,
        dPR_L,
        dPR,
        dPF,
        dPA,
        sumDP,
        P1_bar,
        P2_bar,
        vWarn: v > V_LIMIT,
    };
}

// Hat ağacında BFS ile P1 → P2 cascade
function cascadeHats(hats, fittingsByHat) {
    const byHat = new Map(hats.map(h => [h.hatNo, h]));
    const childrenByParent = new Map();
    hats.forEach(h => {
        if (h.parentHatNo == null) return;
        if (!childrenByParent.has(h.parentHatNo)) childrenByParent.set(h.parentHatNo, []);
        childrenByParent.get(h.parentHatNo).push(h.hatNo);
    });

    const rows = new Map();
    const roots = hats.filter(h => h.parentHatNo == null || !byHat.has(h.parentHatNo));

    const bfs = roots.map(h => ({ hat: h, P1_bar: defaultP1Bar(h.basinc) }));
    while (bfs.length > 0) {
        const { hat, P1_bar } = bfs.shift();
        if (rows.has(hat.hatNo)) continue;
        const xi = fittingsByHat.get(hat.hatNo) ?? 0;
        const row = computeHatRow(hat, xi, P1_bar);
        rows.set(hat.hatNo, row);
        (childrenByParent.get(hat.hatNo) || []).forEach(childNo => {
            const ch = byHat.get(childNo);
            if (ch) bfs.push({ hat: ch, P1_bar: row.P2_bar });
        });
    }

    // Yetim kalan (cycle veya kopuk) hatlar — varsayılan girişle hesapla
    hats.forEach(h => {
        if (rows.has(h.hatNo)) return;
        const xi = fittingsByHat.get(h.hatNo) ?? 0;
        rows.set(h.hatNo, computeHatRow(h, xi, defaultP1Bar(h.basinc)));
    });

    return hats.map(h => rows.get(h.hatNo));
}

// ─── BİÇİMLENDİRME ─────────────────────────────────────────────────────────────
const NF4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const NF2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function f4(n) {
    if (n == null || !isFinite(n)) return '–';
    if (Math.abs(n) < 1e-9) return '0,0000';
    return NF4.format(n);
}
function f2(n) {
    if (n == null || !isFinite(n)) return '–';
    return NF2.format(n);
}

// ─── FITTINGS BREAKDOWN (HOVER HINT) ───────────────────────────────────────────
function buildFittingsBreakdown(fittingsRow) {
    if (!fittingsRow) return '';
    const items = [];
    if (fittingsRow.reduksiyon) items.push(`Redüksiyon × ${fittingsRow.reduksiyon} (×0,5)`);
    if (fittingsRow.dirsek90)   items.push(`Dirsek 90° × ${fittingsRow.dirsek90} (×0,4)`);
    if (fittingsRow.dirsek45)   items.push(`Dirsek 45° × ${fittingsRow.dirsek45} (×0,3)`);
    if (fittingsRow.teKol)      items.push(`Te Kol Ayırma × ${fittingsRow.teKol} (×1,3)`);
    if (fittingsRow.vana)       items.push(`Vana × ${fittingsRow.vana} (×0,5)`);
    return items.length ? items.join('\n') : 'Lokal kayıp yok';
}

// ─── TABLE RENDER ──────────────────────────────────────────────────────────────
const COLS = [
    { key: 'Q',     label: 'Q',     unit: 'm³/h' },
    { key: 'L',     label: 'L',     unit: 'm' },
    { key: 'DN',    label: 'DN',    unit: 'mm' },
    { key: 'v',     label: 'v',     unit: 'm/s' },
    { key: 'dPRL',  label: 'ΔPR/L', unit: 'mbar/m' },
    { key: 'dPR',   label: 'ΔPR',   unit: 'mbar' },
    { key: 'xi',    label: 'Σξ',    unit: '' },
    { key: 'dPF',   label: 'ΔPF',   unit: 'mbar' },
    { key: 'H',     label: 'H',     unit: 'm' },
    { key: 'dPA',   label: 'ΔPA',   unit: 'mbar' },
    { key: 'sumDP', label: 'ΣΔP',   unit: 'mbar' },
];

function renderTableHead() {
    const labelRow = COLS.map(c => `<th>${c.label}</th>`).join('');
    const unitRow  = COLS.map(c => `<th class="bc-unit">${c.unit}</th>`).join('');
    return `
        <thead>
            <tr>
                <th class="bc-no" rowspan="2">#</th>
                ${labelRow}
            </tr>
            <tr class="bc-units-row">${unitRow}</tr>
        </thead>`;
}

function renderRow(row, fittingsRow) {
    if (row.error) {
        return `<tr><td class="bc-no">${row.hatNo}</td><td colspan="${COLS.length}" class="bc-empty">${row.error}</td></tr>`;
    }

    const dnSelect = `
        <select class="bc-dn-select" data-hat="${row.hatNo}">
            ${DN_LIST.map(dn => `<option value="${dn}" ${dn === row.dn ? 'selected' : ''}>${dn}</option>`).join('')}
        </select>`;

    const xiTooltip = buildFittingsBreakdown(fittingsRow);

    const vClass = row.vWarn ? 'bc-cell bc-warn' : 'bc-cell';

    return `
        <tr>
            <td class="bc-no">${row.hatNo}</td>
            <td class="bc-cell">${f4(row.Q)}</td>
            <td class="bc-cell">${f4(row.L_m)}</td>
            <td class="bc-cell bc-dn">${dnSelect}</td>
            <td class="${vClass}" title="${row.vWarn ? 'V > 6 m/s — TS 7363 sınırı aşıldı' : ''}">${f4(row.v)}</td>
            <td class="bc-cell">${f4(row.dPR_L)}</td>
            <td class="bc-cell">${f4(row.dPR)}</td>
            <td class="bc-cell bc-xi" title="${escAttr(xiTooltip)}">${f2(row.sigmaXi)}</td>
            <td class="bc-cell">${f4(row.dPF)}</td>
            <td class="bc-cell">${f2(row.H_m)}</td>
            <td class="bc-cell">${f4(row.dPA)}</td>
            <td class="bc-cell bc-total">${f4(row.sumDP)}</td>
        </tr>`;
}

function renderSection(title, rows, fittingsByHat) {
    if (rows.length === 0) return '';
    const body = rows.map(r => renderRow(r, fittingsByHat.get(r.hatNo + '_full'))).join('');
    return `
        <tr class="bc-section-row"><td colspan="${COLS.length + 1}">${title}</td></tr>
        ${body}`;
}

function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTable(rows, fittingsByHat) {
    if (!rows || rows.length === 0) {
        return `<div class="bc-empty-msg">Hesaplanacak hat bulunamadı.</div>`;
    }

    const kolon = rows.filter(r => r.segmentType === 'KOLON');
    const tuk   = rows.filter(r => r.segmentType !== 'KOLON');

    const head = renderTableHead();
    const body = `
        ${renderSection('BİNA BAĞLANTI / KOLON HATTI', kolon, fittingsByHat)}
        ${renderSection('TÜKETİM ve CİHAZ HATTI', tuk, fittingsByHat)}
    `;

    return `
        <div class="bc-table-wrapper">
            <table class="bc-table">${head}<tbody>${body}</tbody></table>
        </div>`;
}

// ─── MODAL KONTROL ─────────────────────────────────────────────────────────────
function renderInto(bodyEl) {
    const manager = plumbingManager;

    // 1. Fittings (Σξ) — hatNo → total + breakdown
    const { rows: fitRows } = computeFittings(manager);
    const fittingsByHat = new Map();
    fitRows.forEach(r => {
        fittingsByHat.set(r.hatNo, r.total);
        fittingsByHat.set(r.hatNo + '_full', r);
    });

    // 2. Hat verileri
    const { hats } = buildHatData(manager);

    // 3. Cascade hesabı
    const rows = cascadeHats(hats, fittingsByHat);

    bodyEl.innerHTML = renderTable(rows, fittingsByHat);

    // DN combobox: değişince ilgili hat pipe'larının boruCap'ini güncelle ve yeniden hesapla
    bodyEl.querySelectorAll('.bc-dn-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const hatNo = parseInt(e.target.dataset.hat, 10);
            const newDn = e.target.value;
            applyDnToHat(manager, hatNo, newDn);
            renderInto(bodyEl);
        });
    });
}

function applyDnToHat(manager, hatNo, newDn) {
    if (!manager?.pipes) return;
    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    let changed = false;
    manager.pipes.forEach(p => {
        if (hatMap.get(p.id) === hatNo && p.boruCap !== newDn) {
            p.boruCap = newDn;
            changed = true;
            // Üzerindeki vananın çapını da güncelle
            (manager.components || []).forEach(c => {
                if (c.type === 'vana' && c.bagliBoruId === p.id) c.vanaCap = newDn;
            });
        }
    });
    if (changed) {
        manager.saveToState?.();
        try { draw2D(); } catch (_) {}
    }
}

function centerModal() {
    const modal = document.querySelector('#boru-cap-modal-overlay .bc-modal');
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const left = Math.max(20, (window.innerWidth - rect.width) / 2);
    const top  = Math.max(20, (window.innerHeight - rect.height) / 2);
    modal.style.left = `${left}px`;
    modal.style.top  = `${top}px`;
}

export function showBoruCapModal() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    const body    = document.getElementById('boru-cap-modal-body');
    if (!overlay || !body) return;
    renderInto(body);
    overlay.style.display = 'block';
    centerModal();
}

function hideBoruCapModal() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function makeDraggable() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    if (!overlay) return;
    const modal  = overlay.querySelector('.bc-modal');
    const header = overlay.querySelector('.bc-modal-header');
    if (!modal || !header) return;

    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.bc-modal-close')) return;
        dragging = true;
        const rect = modal.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        modal.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        const rect = modal.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width;
        const maxTop  = window.innerHeight - rect.height;
        modal.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + dx))}px`;
        modal.style.top  = `${Math.max(0, Math.min(maxTop,  startTop  + dy))}px`;
    });

    document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; modal.classList.remove('dragging'); }
    });
}

export function initBoruCapMenu() {
    const trigger  = document.getElementById('menuHesapBoruCap');
    const closeBtn = document.getElementById('boru-cap-modal-close');
    const overlay  = document.getElementById('boru-cap-modal-overlay');
    const mainMenu = document.getElementById('mainMenuContent');

    makeDraggable();

    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement.classList.remove('show');
            showBoruCapModal();
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideBoruCapModal(); });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hideBoruCapModal(); });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') hideBoruCapModal();
    });
}
