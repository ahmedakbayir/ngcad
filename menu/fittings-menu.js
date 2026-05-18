// fittings-menu.js
// "Hesap ► Fittings (Lokal Kayıplar)" hesaplama ve tablo gösterimi.
//
// Her bir HAT NO için boru hattı üzerindeki bağlantı eleman sayılarını üretir:
//   • DİRSEK 90°  (× 0.4)  — iki boru kavşağında açıklık 15° < α < 135°
//   • DİRSEK 45°  (× 0.3)  — iki boru kavşağında açıklık 135° ≤ α ≤ 165°
//   • REDÜKSİYON  (× 0.5)  — kavşakta çap değişimi (kendinden sonraki hatta verilir)
//   • VANA        (× 0.5)  — hat üzerindeki vanalar
//   • TE KOL AYIRMA (× 1.3) — T-kavşağında kol borusunun ana akışla 60°-120° arası açı yapması

import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { selectHatInProject } from './calc-table-helpers.js';

const COEFFS = {
    REDUKSIYON: 0.5,
    DIRSEK_90:  0.4,
    DIRSEK_45:  0.3,
    TE_KOL:     1.3,
    VANA:       0.5,
};

const COLS = [
    { key: 'reduksiyon', label: 'REDÜKSİYON', coef: COEFFS.REDUKSIYON },
    { key: 'dirsek90',   label: 'DİRSEK 90°', coef: COEFFS.DIRSEK_90 },
    { key: 'dirsek45',   label: 'DİRSEK 45°', coef: COEFFS.DIRSEK_45 },
    { key: 'teKol',      label: 'TE KOL AYIRMA', coef: COEFFS.TE_KOL },
    { key: 'vana',       label: 'VANA', coef: COEFFS.VANA },
];

function dnValue(boruCap) {
    const m = String(boruCap || 'DN25').replace(/[^0-9]/g, '');
    const n = parseInt(m, 10);
    return Number.isFinite(n) && n > 0 ? n : 25;
}

/**
 * İki 3B birim vektör arasındaki açıyı [0..π] aralığında döndürür.
 * @param {{x:number,y:number,z:number}} u
 * @param {{x:number,y:number,z:number}} v
 */
function angleBetweenVec3(u, v) {
    const dot = u.x * v.x + u.y * v.y + u.z * v.z;
    const clamped = Math.max(-1, Math.min(1, dot));
    return Math.acos(clamped);
}

/** Bir vektörün 3B uzunluğunu normalize ederek birim vektör döndürür. Sıfırsa null. */
function normalize3(dx, dy, dz) {
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    return { x: dx / len, y: dy / len, z: dz / len };
}

/** Bir 3B vektörü ters yönüne çevirir. */
function negate3(v) {
    return { x: -v.x, y: -v.y, z: -v.z };
}

function buildJunctions(pipes, hatMap, sectionOf) {
    const tol = 0.5;
    const map = new Map();

    const addEntry = (key, x, y, z, pipe, far, near) => {
        if (!map.has(key)) {
            map.set(key, { x, y, z, pipes: [], dirs: [], caps: [], hatNos: [], secIdxs: [], ends: [] });
        }
        const entry = map.get(key);
        // 3B çıkış birim vektörü (kavşaktan borunun uzak ucuna)
        const dir = normalize3(far.x - near.x, far.y - near.y, (far.z || 0) - (near.z || 0));
        if (!dir) return; // sıfır uzunluklu boru — atla
        entry.pipes.push(pipe);
        entry.dirs.push(dir);
        entry.caps.push(pipe.boruCap || 'DN25');
        entry.hatNos.push(hatMap.get(pipe.id));
        entry.secIdxs.push(sectionOf ? sectionOf.get(pipe.id) : null);
        entry.ends.push(near === pipe.p1 ? 'p1' : 'p2');
    };

    pipes.forEach(pipe => {
        if (!pipe.p1 || !pipe.p2) return;
        const k1x = Math.round(pipe.p1.x / tol) * tol;
        const k1y = Math.round(pipe.p1.y / tol) * tol;
        const k1z = Math.round((pipe.p1.z || 0) / tol) * tol;
        const k2x = Math.round(pipe.p2.x / tol) * tol;
        const k2y = Math.round(pipe.p2.y / tol) * tol;
        const k2z = Math.round((pipe.p2.z || 0) / tol) * tol;
        addEntry(`${k1x},${k1y},${k1z}`, pipe.p1.x, pipe.p1.y, pipe.p1.z || 0, pipe, pipe.p2, pipe.p1);
        addEntry(`${k2x},${k2y},${k2z}`, pipe.p2.x, pipe.p2.y, pipe.p2.z || 0, pipe, pipe.p1, pipe.p2);
    });

    return map;
}

function ensureStat(stats, key) {
    if (key == null) return null;
    if (!stats.has(key)) {
        stats.set(key, { dirsek90: 0, dirsek45: 0, reduksiyon: 0, vana: 0, teKol: 0 });
    }
    return stats.get(key);
}

function classifyElbow(aciklikDeg) {
    if (aciklikDeg > 15 && aciklikDeg < 135) return 'D90';
    if (aciklikDeg >= 135 && aciklikDeg <= 165) return 'D45';
    return null;
}

/**
 * Tüm hatlar için fittings sayımını yapar.
 * @returns {{ rows: Array, hatNos: number[] }}
 */
export function computeFittings(manager) {
    if (!manager || !manager.pipes || manager.pipes.length === 0) {
        return { rows: [], hatNos: [] };
    }

    const { hatMap, sectionOf } = computeHatGroups(manager.pipes, manager.components || []);

    // Stats SECTION bazında tutulur (hatNo değil) — aynı hatNo'yu paylaşan
    // birden fazla fiziksel section varsa, her section ayrı ayrı sayılır;
    // sonda her hatNo için bir temsilci section seçilir (çift sayım önlenir).
    const stats = new Map();         // sectionIdx → { dirsek90, dirsek45, reduksiyon, vana, teKol }
    const secToHat = new Map();      // sectionIdx → hatNo

    // 0) Tüm mevcut section'lar için boş satır oluştur
    hatMap.forEach((hatNo, pipeId) => {
        const si = sectionOf.get(pipeId);
        if (si == null) return;
        ensureStat(stats, si);
        secToHat.set(si, hatNo);
    });

    const sectionOfPipe = (pipeId) => sectionOf.get(pipeId);

    // 1) VANA — bagliBoruId ile bağlı borunun section'ı
    (manager.components || []).forEach(c => {
        if (c.type !== 'vana' || !c.bagliBoruId) return;
        const pipe = manager.findPipeById(c.bagliBoruId);
        if (!pipe) return;
        const s = ensureStat(stats, sectionOfPipe(pipe.id));
        if (s) s.vana++;
    });

    // 2) Kavşaklara göre dirsek / redüksiyon / TE KOL AYIRMA
    const junctions = buildJunctions(manager.pipes, hatMap, sectionOf);

    junctions.forEach(j => {
        const n = j.pipes.length;
        if (n < 2) return;

        if (n === 2) {
            // 3B uzayda iki çıkış vektörü arasındaki açıyı hesapla → açıklık
            const aciklikDeg = angleBetweenVec3(j.dirs[0], j.dirs[1]) * 180 / Math.PI;
            const elbow = classifyElbow(aciklikDeg);

            const p0 = j.pipes[0];
            const p1 = j.pipes[1];
            const capsDiffer = j.caps[0] !== j.caps[1];

            // KURAL: Köşede dirsek + redüksiyon birlikte ise sıralama daima
            //   AKIŞ YÖNÜNDE → önce dirsek → sonra redüksiyon
            // (çap büyüse de küçülse de fark etmez)
            //
            //   • Dirsek     → akış yönünde UPSTREAM (önce gelen) borunun hattına
            //   • Redüksiyon → akış yönünde DOWNSTREAM (sonraki) borunun hattına
            //
            // Akış yönü: parent-child (baslangicBaglanti) ile belirlenir.
            // Eğer parent-child kurulmamışsa, hat numarası ile fallback (küçük no = upstream).
            let upstream = null;
            let downstream = null;

            if (p1.baslangicBaglanti?.hedefId === p0.id) {
                upstream = p0; downstream = p1;
            } else if (p0.baslangicBaglanti?.hedefId === p1.id) {
                upstream = p1; downstream = p0;
            } else {
                const h0 = hatMap.get(p0.id);
                const h1 = hatMap.get(p1.id);
                if (h0 != null && h1 != null && h0 !== h1) {
                    if (h0 < h1) { upstream = p0; downstream = p1; }
                    else         { upstream = p1; downstream = p0; }
                } else {
                    upstream = p0; downstream = p1;
                }
            }

            if (elbow) {
                const s = ensureStat(stats, sectionOfPipe(upstream.id));
                if (s) {
                    if (elbow === 'D90') s.dirsek90++;
                    else s.dirsek45++;
                }
            }

            if (capsDiffer) {
                const s = ensureStat(stats, sectionOfPipe(downstream.id));
                if (s) s.reduksiyon++;
            }
            return;
        }

        // 3+ borulu kavşaklar → T (veya çapraz)
        // Parent-child ilişkisi: bu kavşaktaki "gelen" (parent), kavşaktaki diğer borulardan birinin baslangicBaglanti.hedefId'sine sahip pipe
        const parentIdx = j.pipes.findIndex(p =>
            j.pipes.some(other => other !== p && other.baslangicBaglanti?.hedefId === p.id)
        );

        if (parentIdx >= 0) {
            // Gelen akış yönü (3B): parent'ın kavşaktaki çıkış vektörünün TERSİ
            // (parent → kavşak yönü). Çocuk akış yönü = kavşak → child uzak ucu.
            const gelenFlow = negate3(j.dirs[parentIdx]);

            for (let i = 0; i < n; i++) {
                if (i === parentIdx) continue;
                if (j.pipes[i].baslangicBaglanti?.hedefId !== j.pipes[parentIdx].id) {
                    // Aynı parent'a bağlı olmayan boru (ör. başka bir kavşaktan gelen) — atla
                    continue;
                }
                const childDir = j.dirs[i];
                const angleDeg = angleBetweenVec3(gelenFlow, childDir) * 180 / Math.PI;
                if (angleDeg >= 60 && angleDeg <= 120) {
                    const s = ensureStat(stats, j.secIdxs[i]);
                    if (s) s.teKol++;
                }
            }
        }

        // Redüksiyon: kavşakta birden çok farklı çap varsa, en büyük çaptan küçük olan(lar)a redüksiyon
        const uniqueCaps = new Set(j.caps);
        if (uniqueCaps.size > 1) {
            const dnVals = j.caps.map(dnValue);
            const maxDn = Math.max(...dnVals);
            for (let i = 0; i < n; i++) {
                if (dnVals[i] < maxDn) {
                    // "Kendinden sonraki hat" — küçük çaplı borunun kendi section'ı (downstream)
                    const s = ensureStat(stats, j.secIdxs[i]);
                    if (s) s.reduksiyon++;
                }
            }
        }
    });

    // Section bazlı stats'ı hatNo bazına indirge: her hatNo için en küçük
    // sectionIdx'li temsilci section seçilir (aynı hatNo'yu paylaşan section'lar
    // fingerprint'ten dolayı zaten "aynı" varsayılır → bir temsilci yeterli).
    const hatToRepSec = new Map();
    Array.from(secToHat.keys()).sort((a, b) => a - b).forEach(si => {
        const hatNo = secToHat.get(si);
        if (!hatToRepSec.has(hatNo)) hatToRepSec.set(hatNo, si);
    });

    const hatStats = new Map();
    hatToRepSec.forEach((si, hatNo) => {
        hatStats.set(hatNo, stats.get(si) || { dirsek90: 0, dirsek45: 0, reduksiyon: 0, vana: 0, teKol: 0 });
    });

    // Sonucu sıralı listeye dönüştür
    const hatNos = Array.from(hatStats.keys()).sort((a, b) => a - b);
    const rows = hatNos.map(hatNo => {
        const v = hatStats.get(hatNo);
        const total =
            (v.reduksiyon * COEFFS.REDUKSIYON) +
            (v.dirsek90  * COEFFS.DIRSEK_90)  +
            (v.dirsek45  * COEFFS.DIRSEK_45)  +
            (v.teKol     * COEFFS.TE_KOL)     +
            (v.vana      * COEFFS.VANA);
        return {
            hatNo,
            reduksiyon: v.reduksiyon,
            dirsek90:   v.dirsek90,
            dirsek45:   v.dirsek45,
            teKol:      v.teKol,
            vana:       v.vana,
            total: Math.round(total * 100) / 100
        };
    });

    return { rows, hatNos };
}

function fmtNum(n) {
    if (!n) return '';
    return String(n);
}

function fmtTotal(n) {
    if (n == null) return '';
    // Türkçe ondalık virgül
    const s = (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 1 : (Math.round(n * 100) % 10 === 0 ? 1 : 2));
    return s.replace('.', ',');
}

function fmtCoef(n) {
    return String(n).replace('.', ',');
}

function renderTable(rows) {
    if (!rows || rows.length === 0) {
        return `<div class="fittings-empty-msg">Hesaplanacak hat bulunamadı.</div>`;
    }

    const head = `
        <thead>
            <tr>
                <th class="ft-hat-h" rowspan="2">Hat No</th>
                ${COLS.map(c => `<th>${c.label}</th>`).join('')}
                <th class="ft-total-h" rowspan="2">Σξ</th>
            </tr>
            <tr class="ft-coef-row">
                ${COLS.map(c => `<th>${fmtCoef(c.coef)}</th>`).join('')}
            </tr>
        </thead>`;

    const body = rows.map(r => `
        <tr data-hat-no="${r.hatNo}">
            <td class="ft-hat">${r.hatNo}</td>
            ${COLS.map(c => {
                const v = r[c.key];
                return `<td class="ft-cell ${v ? '' : 'ft-empty'}">${v ? fmtNum(v) : '–'}</td>`;
            }).join('')}
            <td class="ft-total">${fmtTotal(r.total)}</td>
        </tr>
    `).join('');

    return `<div class="fittings-table-wrapper"><table class="fittings-table">${head}<tbody>${body}</tbody></table></div>`;
}

function centerModal() {
    const modal = document.querySelector('#fittings-modal-overlay .fittings-modal');
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const left = Math.max(20, (window.innerWidth - rect.width) / 2);
    // Yukarıdan ~%10 (alt kenarı ~%80'de kalsın; oransal).
    const top = Math.max(20, Math.round(window.innerHeight * 0.10));
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
}

export function showFittingsModal() {
    const overlay = document.getElementById('fittings-modal-overlay');
    const body = document.getElementById('fittings-modal-body');
    if (!overlay || !body) return;

    const { rows } = computeFittings(plumbingManager);
    body.innerHTML = renderTable(rows);
    overlay.style.display = 'block';
    centerModal();

    // Hat satırına çift tıklama → paneli kapat ve hattı projede seçili hâle getir.
    body.querySelectorAll('tr[data-hat-no]').forEach(tr => {
        tr.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const hatNo = parseInt(tr.dataset.hatNo, 10);
            if (!Number.isFinite(hatNo)) return;
            hideFittingsModal();
            selectHatInProject(hatNo);
        });
    });
}

function hideFittingsModal() {
    const overlay = document.getElementById('fittings-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function makeDraggable() {
    const overlay = document.getElementById('fittings-modal-overlay');
    if (!overlay) return;
    const modal = overlay.querySelector('.fittings-modal');
    const header = overlay.querySelector('.fittings-modal-header');
    if (!modal || !header) return;

    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.fittings-modal-close')) return;
        dragging = true;
        const rect = modal.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        modal.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const rect = modal.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width;
        const maxTop = window.innerHeight - rect.height;
        const newLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, startTop + dy));
        modal.style.left = `${newLeft}px`;
        modal.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            modal.classList.remove('dragging');
        }
    });
}

export function initFittingsMenu() {
    const trigger = document.getElementById('menuHesapFittings');
    const closeBtn = document.getElementById('fittings-modal-close');
    const overlay = document.getElementById('fittings-modal-overlay');
    const mainMenu = document.getElementById('mainMenuContent');

    makeDraggable();

    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement.classList.remove('show');
            showFittingsModal();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideFittingsModal();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hideFittingsModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
            hideFittingsModal();
        }
    });

    const hesapTrigger = document.getElementById('menuHesap');
    if (hesapTrigger) {
        hesapTrigger.addEventListener('click', (e) => e.preventDefault());
    }

    // HESAP ikon paneli: ξ butonu → fittings modalı
    const iconBtn = document.getElementById('bHesapFittings');
    if (iconBtn) {
        iconBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showFittingsModal();
        });
    }
}
