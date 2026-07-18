// general-files/xml-io.js
// GÜNCELLENDİ: X eksenindeki simetri (aynalama) sorununu çözmek için tüm Y koordinatları (-1) ile çarpıldı.
// GÜNCELLENDİ: Merdiven rotasyonu 90° CCW (-90) olarak ayarlandı ve boyutları (en/boy) buna göre düzeltildi.

import { state, setState, dom, VECTORDRAW_AREA_TYPES } from './main.js';
import { getOrCreateNode, distToSegmentSquared, calculatePlanarArea, findBestLabelPosition } from '../draw/geometry.js';
import { wallExists } from '../wall/wall-handler.js';
import { createColumn } from '../architectural-objects/columns.js';
import { createBeam } from '../architectural-objects/beams.js';
import { createStairs } from '../architectural-objects/stairs.js';
import { processWalls } from '../wall/wall-processor.js';
import { saveState } from './history.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { fitDrawingToScreen } from '../draw/zoom.js';

// turf.js global olarak index.html'den yükleniyor (CDN)

// XML'deki koordinatları cm'ye çevirmek için ölçek
const SCALE = 100;

// Gasline import varsayılan kat yüksekliği (cm). Sample dosyalardaki tüm projeler 300 cm.
const GASLINE_FLOOR_HEIGHT = 300;

// Standart DN çapları (boru-cap → DN string)
const STANDARD_DNS = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 400, 450];

// GLBORUCAP int (örn. 25) → "DN25". En yakın standart DN'e yuvarlar.
function _dnFromIntCap(intCap) {
    const v = Number(intCap);
    if (!Number.isFinite(v) || v <= 0) return 'DN25';
    const nearest = STANDARD_DNS.reduce((best, dn) =>
        Math.abs(dn - v) < Math.abs(best - v) ? dn : best
    );
    return `DN${nearest}`;
}

// ─── XML TOP-LEVEL PROP ARAMA YARDIMCISI ─────────────────────────────────
// querySelector deskendant taraması yapar; gasline XML'inde clsboru/clssayac/clsvana/
// clskombi gibi elemanların İÇİNDE (DrawEntities altında) ayrıca vdLine/vdRect bulunur
// ve bunların StartPoint/EndPoint/Origin'leri de "F=..." Pleridir. Doğrudan querySelector
// bu inner property'leri döndürür → asıl pipe/sayaç koordinatı yanlış parse edilir.
// Bu helper sadece DOĞRUDAN ÇOCUK P elementlerine bakar.
function _topProp(parentEl, fName) {
    if (!parentEl) return null;
    for (const child of parentEl.children) {
        if (child.tagName === 'P' && child.getAttribute('F') === fName) return child;
    }
    return null;
}

// --- GASLINE IMPORT HELPER'LARI ---------------------------------------------

// XML metin satırlarında \P ayracı veya gerçek yeni satır olabilir
function _splitTextLines(s) {
    if (!s) return [];
    return String(s).split(/\\P|\r?\n/).map(t => t.trim()).filter(Boolean);
}

// GLVANATIPI (int) + text → v2 vana tipi + izolator flag
function _mapVanaFromXML({ vanaTipiInt, textLines, muhafazali }) {
    const joined = (textLines || []).join(' ').toUpperCase();
    let tip = 'AKV';
    let izolator = false;
    let ilerdeKullanim = false;
    // "Domestik" = gasline'da ilerde kullanım amaçlı branşman vanası
    if (joined.includes('DOMESTİK') || joined.includes('DOMESTIK')) {
        tip = 'BRANSMAN';
        ilerdeKullanim = true;
    }
    else if (joined.includes('SISMIK') || joined.includes('SİSMİK')) tip = 'SISMIK';
    else if (joined.includes('SELENOID') || joined.includes('SELENO')) tip = 'SELENOID';
    else if (joined.includes('BRAN')) tip = 'BRANSMAN';
    else if (joined.includes('YAN B') || joined.includes('YANB')) tip = 'YAN_BINA';
    else if (joined.includes('EMN')) tip = 'EMNIYET';
    else if (joined.includes('CİHAZ') || joined.includes('CIHAZ')) tip = 'CIHAZ';
    else {
        // GLVANATIPI int mapping
        switch (vanaTipiInt) {
            case 1: tip = 'AKV'; break;            // Açma-Kapama Vanası
            case 2: tip = 'BRANSMAN'; break;       // Daire branşmanı
            case 3: tip = 'AKV'; break;            // EKV → AKV
            case 4: tip = 'AKV'; izolator = true; break; // İzolatörlü
            case 5: tip = 'EMNIYET'; break;        // Emniyet vanası
            case 6: tip = 'BRANSMAN'; ilerdeKullanim = true; break; // Domestik → ilerde kullanım
            case 7: tip = 'AKV'; break;            // KKV yok → AKV
            default: tip = 'AKV';
        }
    }
    // "İzolatörlü" metni varsa izolator flag'ini set et
    if (joined.includes('İZOLAT') || joined.includes('IZOLAT')) izolator = true;
    return { tip, izolator, muhafaza: !!muhafazali, ilerdeKullanim };
}

// Birim no: "D3\PDaire" veya "AKV\PDN50\Ph:1.8m" → sadece D3 çıkar
function _extractBirimNo(textLines) {
    for (const line of textLines) {
        const m = /\b(D\d+|G\d+|K\d+)\b/.exec(line);
        if (m) return m[1];
    }
    return '';
}

// Çap: "DN50" / "DN32" → 50 / 32
function _extractVanaCap(textLines) {
    for (const line of textLines) {
        const m = /DN\s*(\d+)/i.exec(line);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

// Kombi/Ocak description text'ini parse et
function _parseCihazText(textLines) {
    const out = { bacaTipi: null, yogusmali: false, marka: null, model: null, kapasiteKcal: null, kapasiteKW: null };
    const joined = textLines.join(' ');
    const upperJoined = joined.toUpperCase();

    // Baca tipi
    if (/HERMET[İI]K/i.test(joined)) out.bacaTipi = 'Hermetik';
    else if (/BACASIZ/i.test(joined)) out.bacaTipi = 'Bacasız';
    else if (/ATMOSFER[İI]K/i.test(joined)) out.bacaTipi = 'Atmosferik';

    // Yoğuşmalı
    if (/YO[ĞG]U[ŞS]/i.test(joined)) out.yogusmali = true;

    // Kapasite: "20726Kcal/h", "20.726 Kcal/h", "87720Kcal/h" — hem küçük hem büyük harf
    const kcalM = /(\d[\d.,]*)\s*[Kk][Cc][Aa][Ll]\s*\/?\s*[Hh]/.exec(joined);
    if (kcalM) {
        const num = kcalM[1].replace(/\./g, '').replace(',', '.');
        const v = parseFloat(num);
        if (!isNaN(v)) out.kapasiteKcal = v;
    }
    // "(24,1KW)", "24 kW", "102 KW"
    const kwM = /(\d[\d.,]*)\s*[Kk][Ww]\b/.exec(joined);
    if (kwM) {
        const num = kwM[1].replace(/\./g, '').replace(',', '.');
        const v = parseFloat(num);
        if (!isNaN(v)) out.kapasiteKW = v;
    }

    // Kapasiteler birbirinden türetilebilir (1 kW ≈ 860 Kcal/h)
    if (out.kapasiteKcal && !out.kapasiteKW) out.kapasiteKW = parseFloat((out.kapasiteKcal / 860).toFixed(2));
    if (out.kapasiteKW && !out.kapasiteKcal) out.kapasiteKcal = Math.round(out.kapasiteKW * 860);

    // Marka / Model: açıklayıcı olmayan satırlar
    const stripped = textLines.filter(l => !/Kcal|KW|kW|Hermet|Bacas|Atmosfer|Yoğu|Yogus|Evsel|Duvar Tipi|Kazan|Kombi|Ocak|Cihaz|drenaj|Onayl|GAZMER|ATM|Dirsek|L=|\bG\b/i.test(l));
    if (stripped.length >= 1 && !out.marka) out.marka = stripped[0];
    if (stripped.length >= 2 && !out.model) out.model = stripped[1];

    return out;
}

// Z kotlarından kat tespit et ve state.floors'u kur.
// Gasline'da slab tepe kotları FLOOR_HEIGHT (=300 cm) katları halindedir: 0, 300, 600...
// Her Z için floor_idx = floor(z / FLOOR_HEIGHT) hesaplayarak içeriği barındıran tüm katları
// bulup üst üste binmeyecek şekilde 300 cm dilimlere ayırırız. Negatif idx bodrum katı olur.
// Kullanıcı önceden gerçek kat tanımladıysa hiç dokunulmaz.
function _ensureFloorsFromZValues(zValues, existingFloors) {
    const realFloors = (existingFloors || []).filter(f => !f.isPlaceholder);
    if (realFloors.length >= 2) return null;

    const zs = zValues.filter(v => Number.isFinite(v));
    if (zs.length === 0) return null;

    const FH = GASLINE_FLOOR_HEIGHT;

    // İçerikli kat indekslerini topla
    const occupied = new Set();
    zs.forEach(z => occupied.add(Math.floor(z / FH)));

    if (occupied.size === 0) return null;

    let minIdx = Infinity, maxIdx = -Infinity;
    occupied.forEach(i => { if (i < minIdx) minIdx = i; if (i > maxIdx) maxIdx = i; });

    // En alt görünür katı 0 sayalım → bodrum negatif kalır
    // (Önceki algoritma min'i Zemin yapıyordu; gasline'da Z=0 zaten Zemin olarak gelir)
    const floors = [];
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    for (let idx = minIdx; idx <= maxIdx; idx++) {
        const bottom = idx * FH;
        const top = bottom + FH;
        const name = idx === 0 ? 'Zemin'
            : idx > 0 ? `${idx}. Kat`
            : `Bodrum ${-idx}`;
        floors.push({
            id: `floor-xml-${idx >= 0 ? idx : 'b' + (-idx)}-${stamp}`,
            name,
            bottomElevation: bottom,
            topElevation: top,
            visible: occupied.has(idx),
            isPlaceholder: false
        });
    }

    return floors;
}

// Import sonrası boruları uçlarından birbirine bağla ve doğrultularını normalize et.
// Sayaç giriş/çıkış fleks segmentlerinden başlayan BFS ile her boru ziyaret edilir;
// her boru için "parent'a bakan uç = p1" konvansiyonu sağlanır (gerekirse p1/p2 takas).
// Böylece computePipeDebileri'nin baslangicBaglanti.tip='boru' zinciri kesintisiz olur.
function _linkPipeNetwork(pipes) {
    if (!pipes || pipes.length === 0) return;
    // 30 cm — _topProp düzeltmesi sonrası uç-uç eşleşmeleri 0.001 cm hassasiyetinde olsa da
    // gasline'ın bazı çizimlerinde fitting/dönüş noktaları 10-20 cm sapabiliyor. 60 cm fazla gevşek
    // (komşu hatları birleştiriyordu); 15 cm çok sıkı (chain kırılıyordu). 30 güvenli orta.
    const TOL = 30;
    const eq3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) <= TOL;
    const pipeMap = new Map(pipes.map(p => [p.id, p]));
    let _linkCount = 0;

    // 'next' borusunun p1'i 'parent' borusuna en yakın uca eşit olacak şekilde gerekirse takas et,
    // sonra baslangicBaglanti'yi parent'a 'boru' tipiyle ayarla.
    function _orientAndLink(next, parent, touchingEndOfNext) {
        if (!touchingEndOfNext) {
            const d1 = Math.min(
                Math.hypot(next.p1.x - parent.p1.x, next.p1.y - parent.p1.y, (next.p1.z||0)-(parent.p1.z||0)),
                Math.hypot(next.p1.x - parent.p2.x, next.p1.y - parent.p2.y, (next.p1.z||0)-(parent.p2.z||0))
            );
            const d2 = Math.min(
                Math.hypot(next.p2.x - parent.p1.x, next.p2.y - parent.p1.y, (next.p2.z||0)-(parent.p1.z||0)),
                Math.hypot(next.p2.x - parent.p2.x, next.p2.y - parent.p2.y, (next.p2.z||0)-(parent.p2.z||0))
            );
            touchingEndOfNext = d1 <= d2 ? 'p1' : 'p2';
        }
        if (touchingEndOfNext === 'p2') {
            [next.p1, next.p2] = [next.p2, next.p1];
            const tmp = next.baslangicBaglanti;
            next.baslangicBaglanti = next.bitisBaglanti;
            next.bitisBaglanti = tmp;
        }
        // Parent'ın hangi ucunda olduğumuzu da belirle (debugging + bazı renderer'lar için)
        const dToParentP1 = Math.hypot(next.p1.x - parent.p1.x, next.p1.y - parent.p1.y, (next.p1.z||0)-(parent.p1.z||0));
        const dToParentP2 = Math.hypot(next.p1.x - parent.p2.x, next.p1.y - parent.p2.y, (next.p1.z||0)-(parent.p2.z||0));
        const parentEnd = dToParentP1 <= dToParentP2 ? 'p1' : 'p2';
        next.baslangicBaglanti = { tip: 'boru', hedefId: parent.id, noktaIndex: parentEnd };
        _linkCount++;
    }

    // Yardımcı: nokta `pt` segmentin (segP1→segP2) GÖVDESİ üzerinde mi? (T-bağlantı)
    // T-toleransı uç toleransından ÇOK daha dar olmalı: gasline'da sayaç yanındaki
    // giriş/çıkış kolonları 30cm arayla paralel iner, giriş/çıkış manifoldları 5cm
    // arayla üst üste durur; gevşek gövde toleransı bunları sahte T ile köprüler
    // (pre-meter zincir sayaç çıkışının çocuğu olur, debi söner).
    // Gerçek T'lerde çocuk ucu tam gövde üzerindedir (d ≈ 0.001cm).
    const T_TOL = 1.5;
    function _pointOnBody(pt, segP1, segP2) {
        const dx = segP2.x - segP1.x, dy = segP2.y - segP1.y, dz = (segP2.z||0) - (segP1.z||0);
        const len2 = dx*dx + dy*dy + dz*dz;
        if (len2 < 1) return null;
        const t = ((pt.x - segP1.x)*dx + (pt.y - segP1.y)*dy + ((pt.z||0)-(segP1.z||0))*dz) / len2;
        if (t < 0.05 || t > 0.95) return null; // uçları hariç tut
        const px = segP1.x + t*dx, py = segP1.y + t*dy, pz = (segP1.z||0) + t*dz;
        const d = Math.hypot(pt.x - px, pt.y - py, (pt.z||0) - pz);
        return d <= T_TOL ? t : null;
    }

    const visited = new Set();
    const queue = [];

    // Seed sırası ÖNEMLİ: akış yönü kaynaktan tüketiciye kurulmalı.
    //   1) Servis kutusu çıkış borusu (pre-meter zincirin kökü)
    //   2) Sayaç ÇIKIŞ borusu (post-meter zincirin kökü)
    // Cihaz uçları ve sayaç GİRİŞ ucu seed OLMAZ: bunlar zincirin SONU'dur;
    // seed yapılırlarsa BFS upstream boruları kendi "child"ı yapar ve
    // parent zinciri ters döner (debi/birim propagasyonu kırılır).
    const _isRootSeed = (bag) =>
        bag?.tip === 'servis_kutusu' ||
        (bag?.tip === 'sayac' && bag.baglananNokta === 'cikis');
    const _seedRank = (p) => {
        const tips = [p.baslangicBaglanti, p.bitisBaglanti];
        if (tips.some(b => b?.tip === 'servis_kutusu')) return 0;
        if (tips.some(b => b?.tip === 'sayac' && b.baglananNokta === 'cikis')) return 1;
        return -1;
    };
    pipes
        .map(p => ({ p, rank: _seedRank(p) }))
        .filter(e => e.rank >= 0)
        .sort((a, b) => a.rank - b.rank)
        .forEach(({ p }) => {
            if (_isRootSeed(p.baslangicBaglanti) || _isRootSeed(p.bitisBaglanti)) {
                if (!visited.has(p.id)) { visited.add(p.id); queue.push(p.id); }
            }
        });

    // Bir borunun verilen ucunda bileşen bağı var mı? (sayac/cihaz/servis_kutusu)
    // Böyle uçlara başka boru İLİŞTİRİLEMEZ — sayaç giriş/çıkış uçları 10-30 cm
    // yakın olduğundan tolerans eşleşmesi pre/post-meter zincirlerini köprüler.
    const COMP_TIPS = new Set(['sayac', 'cihaz', 'servis_kutusu']);
    const _endHasCompBag = (p, end) => {
        const bag = end === 'p1' ? p.baslangicBaglanti : p.bitisBaglanti;
        return COMP_TIPS.has(bag?.tip);
    };

    while (queue.length) {
        const cur = pipeMap.get(queue.shift());
        if (!cur) continue;

        // (1) cur'un her iki tarafındaki mevcut 'boru' linklerini takip et — yön normalize et
        for (const f of ['baslangicBaglanti', 'bitisBaglanti']) {
            const bag = cur[f];
            if (bag?.tip === 'boru' && bag.hedefId) {
                const next = pipeMap.get(bag.hedefId);
                if (next && !visited.has(next.id)) {
                    _orientAndLink(next, cur, null);
                    visited.add(next.id);
                    queue.push(next.id);
                }
            }
        }

        // (2) cur'un AÇIK uçlarından komşu boru uçları ara
        for (const myEnd of ['p1', 'p2']) {
            const bag = myEnd === 'p1' ? cur.baslangicBaglanti : cur.bitisBaglanti;
            if (bag?.tip === 'boru' || bag?.tip === 'sayac' ||
                bag?.tip === 'cihaz' || bag?.tip === 'servis_kutusu') continue;

            const myPt = cur[myEnd];
            // Adayları topla ve mesafeye göre sırala. Yalnızca EN İYİ eşleşmeye
            // yakın olanlar kabul edilir: TOL=30 tek başına kullanılırsa 3cm'lik
            // dirsek parçalarında bir sonraki segment de aynı uca yakın çıkar ve
            // parent zinciri "off-by-one" kayar (aradaki kısa parça 0 debi kalır).
            // Bileşene rezerve (sayaç/cihaz/kutu) uçlar "sanal en iyi aday" sayılır:
            // açık ucun dibinde bir sayaç bağlantısı varsa, sayaç kümesindeki diğer
            // borulara TOL üzerinden köprü kurulmaz (pre/post-meter ayrımı korunur).
            const cands = [];
            let dReserved = Infinity;
            for (const other of pipes) {
                if (other.id === cur.id) continue;
                if (!other.p1 || !other.p2) continue;
                const d1 = Math.hypot(myPt.x - other.p1.x, myPt.y - other.p1.y, (myPt.z||0) - (other.p1.z||0));
                const d2 = Math.hypot(myPt.x - other.p2.x, myPt.y - other.p2.y, (myPt.z||0) - (other.p2.z||0));
                if (_endHasCompBag(other, 'p1') && d1 < dReserved) dReserved = d1;
                if (_endHasCompBag(other, 'p2') && d2 < dReserved) dReserved = d2;
                if (visited.has(other.id)) continue;
                let touching = null, d = null;
                if (d1 <= TOL && d1 <= d2 && !_endHasCompBag(other, 'p1')) { touching = 'p1'; d = d1; }
                else if (d2 <= TOL && !_endHasCompBag(other, 'p2')) { touching = 'p2'; d = d2; }
                if (!touching) continue;
                cands.push({ other, touching, d });
            }
            cands.sort((a, b) => a.d - b.d);
            const dBest = Math.min(cands.length ? cands[0].d : Infinity, dReserved);
            for (const c of cands) {
                // En iyiden 0.5cm'den uzak adaylar sonraki tura: gasline hassasiyeti
                // ~0.001cm'dir; 1cm pencere bile vana-boşluğu segmentlerinde (vana
                // çizimi boruyu 1cm ofsetle böler) yanlış kardeşi kapıyordu.
                if (c.d > dBest + 0.5) break;
                if (visited.has(c.other.id)) continue;
                _orientAndLink(c.other, cur, c.touching);
                visited.add(c.other.id);
                queue.push(c.other.id);
            }
        }

        // (3) T-BAĞLANTI: cur'un GÖVDESİNE bir başka borunun ucu temas ediyor mu?
        // Bu boru cur'un "child"ı olur (debi onun üzerinden cur'a akar).
        for (const other of pipes) {
            if (other.id === cur.id || visited.has(other.id)) continue;
            if (!other.p1 || !other.p2) continue;
            // other'ın hangi ucu cur'un body'sinde? p1 öncelikli (zaten convention).
            let tP1 = _pointOnBody(other.p1, cur.p1, cur.p2);
            let tP2 = _pointOnBody(other.p2, cur.p1, cur.p2);
            // Bileşene rezerve uçlar T-bağlantı adayı olamaz
            if (tP1 != null && _endHasCompBag(other, 'p1')) tP1 = null;
            if (tP2 != null && _endHasCompBag(other, 'p2')) tP2 = null;
            if (tP1 == null && tP2 == null) continue;
            const touching = (tP1 != null && (tP2 == null || tP1 < tP2)) ? 'p1' : 'p2';
            _orientAndLink(other, cur, touching);
            visited.add(other.id);
            queue.push(other.id);
        }
    }

    // TAMAMLAMA TURU: sıkı eşleşme (dBest+1) dışında kalan borular için gevşek
    // TOL ile ziyaret edilmiş uçlara bağlanmayı dene (sloppy fitting toleransı).
    let progressed = true;
    while (progressed) {
        progressed = false;
        for (const orphan of pipes) {
            if (visited.has(orphan.id)) continue;
            if (!orphan.p1 || !orphan.p2) continue;
            let best = null;
            for (const host of pipes) {
                if (!visited.has(host.id) || host.id === orphan.id) continue;
                for (const hostEnd of ['p1', 'p2']) {
                    const hp = host[hostEnd];
                    for (const oEnd of ['p1', 'p2']) {
                        if (_endHasCompBag(orphan, oEnd)) continue;
                        const op = orphan[oEnd];
                        const d = Math.hypot(hp.x - op.x, hp.y - op.y, (hp.z||0) - (op.z||0));
                        if (d <= TOL && (!best || d < best.d)) best = { host, oEnd, d };
                    }
                }
            }
            if (best) {
                _orientAndLink(orphan, best.host, best.oEnd);
                visited.add(orphan.id);
                queue.push(orphan.id);
                progressed = true;
                // yeni bağlanan borunun downstream'i ana BFS mantığıyla değil,
                // bu turun tekrarıyla bağlanır (while progressed).
            }
        }
    }

    // ── PRE-METER REROOT: XML'de servis kutusu yoksa (veya zincir yanlış taraftan
    // yakalandıysa) sayaç GİRİŞ zinciri, tamamlama turunda sayaç ÇIKIŞ'ının (veya bir
    // cihazın) alt ağacı olarak ters yönde bağlanabilir. Bu durumda giriş borusundan
    // parent zinciri sayaç çıkışına ulaşır ve debi/birim propagasyonu kopar.
    // Tespit: giriş borusundan parentOf zinciri 'sayac'(çıkış) ya da 'cihaz' köküne
    // varıyorsa köprü var demektir → köprüyü kes, bileşeni serbest ve en alçak uçtan
    // yeniden köklendir (BFS'i o kökten tekrar çalıştır).
    try {
        const _parentOf = () => {
            const m = new Map();
            pipes.forEach(p => {
                if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId) {
                    m.set(p.id, p.baslangicBaglanti.hedefId);
                }
            });
            return m;
        };
        const girisPipes = pipes.filter(p =>
            (p.baslangicBaglanti?.tip === 'sayac' && p.baslangicBaglanti.baglananNokta === 'giris') ||
            (p.bitisBaglanti?.tip === 'sayac' && p.bitisBaglanti.baglananNokta === 'giris')
        );
        for (const gp of girisPipes) {
            const parentOf = _parentOf();
            // Giriş borusundan köke yürü
            const path = [gp.id];
            const seen = new Set([gp.id]);
            let curId = gp.id;
            while (parentOf.has(curId)) {
                curId = parentOf.get(curId);
                if (seen.has(curId)) break;
                seen.add(curId);
                path.push(curId);
            }
            const rootPipe = pipeMap.get(curId);
            const rootTip = rootPipe?.baslangicBaglanti?.tip;
            if (rootTip !== 'sayac' && rootTip !== 'cihaz') continue; // sağlıklı (kutu/serbest kök)
            if (rootTip === 'sayac' && rootPipe.baslangicBaglanti.baglananNokta === 'giris') continue;

            // Köprü kesimi: 'sayac' çıkış köküne giren path linkini kopar;
            // 'cihaz' kökünde kök bileşenin kendisi pre-meter zincirin parçasıdır.
            let compRootId;
            if (rootTip === 'sayac') {
                const bridgeChildId = path[path.length - 2]; // köke bağlanan çocuk
                if (!bridgeChildId) continue;
                const bc = pipeMap.get(bridgeChildId);
                bc.baslangicBaglanti = { tip: null, hedefId: null, noktaIndex: null };
                compRootId = bridgeChildId;
            } else {
                compRootId = curId;
            }

            // Bileşeni topla (compRoot alt ağacı)
            const kids = new Map();
            pipes.forEach(p => {
                const bag = p.baslangicBaglanti;
                if (bag?.tip === 'boru' && bag.hedefId) {
                    if (!kids.has(bag.hedefId)) kids.set(bag.hedefId, []);
                    kids.get(bag.hedefId).push(p.id);
                }
            });
            const comp = new Set();
            const cq = [compRootId];
            while (cq.length) {
                const id = cq.shift();
                if (comp.has(id)) continue;
                comp.add(id);
                (kids.get(id) || []).forEach(k => cq.push(k));
            }

            // Yeni kök: bileşen içinde bileşen-bagsız serbest uca sahip, en alçak Z'li boru.
            // (Servis kutusu / hattın kaynağı tipik olarak en alçak serbest uçtadır.)
            let newRoot = null, newRootZ = Infinity;
            comp.forEach(id => {
                const p = pipeMap.get(id);
                if (!p) return;
                [['p1', p.baslangicBaglanti], ['p2', p.bitisBaglanti]].forEach(([end, bag]) => {
                    if (bag?.tip) return; // bağlı uç
                    // Bu uca bileşen içinden başka boru dokunuyor mu? (gerçek serbest uç)
                    const pt = p[end];
                    let touched = false;
                    comp.forEach(oid => {
                        if (touched || oid === id) return;
                        const o = pipeMap.get(oid);
                        if (!o) return;
                        if (eq3(pt, o.p1) || eq3(pt, o.p2)) touched = true;
                    });
                    if (touched) return;
                    const zv = pt.z || 0;
                    if (zv < newRootZ) { newRootZ = zv; newRoot = { pipe: p, end }; }
                });
            });
            if (!newRoot || newRoot.pipe.id === compRootId) continue;

            // Bileşen içi tüm 'boru' baglarını sıfırla (sayac/cihaz bagları korunur),
            // sonra yeni kökten BFS ile yeniden yönlendir.
            comp.forEach(id => {
                const p = pipeMap.get(id);
                if (!p) return;
                if (p.baslangicBaglanti?.tip === 'boru') p.baslangicBaglanti = { tip: null, hedefId: null, noktaIndex: null };
                if (p.bitisBaglanti?.tip === 'boru') p.bitisBaglanti = { tip: null, hedefId: null, noktaIndex: null };
            });
            // Yeni kökün serbest ucu p1 olsun (kaynak taraf)
            if (newRoot.end === 'p2') {
                const p = newRoot.pipe;
                [p.p1, p.p2] = [p.p2, p.p1];
                const tmp = p.baslangicBaglanti;
                p.baslangicBaglanti = p.bitisBaglanti;
                p.bitisBaglanti = tmp;
            }
            const rq = [newRoot.pipe.id];
            const rVisited = new Set([newRoot.pipe.id]);
            while (rq.length) {
                const cid = rq.shift();
                const cp = pipeMap.get(cid);
                if (!cp) continue;
                for (const myEnd of ['p1', 'p2']) {
                    const bag = myEnd === 'p1' ? cp.baslangicBaglanti : cp.bitisBaglanti;
                    if (bag?.tip) continue;
                    const myPt = cp[myEnd];
                    const cands2 = [];
                    comp.forEach(oid => {
                        if (oid === cid || rVisited.has(oid)) return;
                        const o = pipeMap.get(oid);
                        if (!o) return;
                        const d1 = Math.hypot(myPt.x - o.p1.x, myPt.y - o.p1.y, (myPt.z||0) - (o.p1.z||0));
                        const d2 = Math.hypot(myPt.x - o.p2.x, myPt.y - o.p2.y, (myPt.z||0) - (o.p2.z||0));
                        let touching = null, d = null;
                        if (d1 <= TOL && d1 <= d2 && !_endHasCompBag(o, 'p1')) { touching = 'p1'; d = d1; }
                        else if (d2 <= TOL && !_endHasCompBag(o, 'p2')) { touching = 'p2'; d = d2; }
                        if (touching) cands2.push({ o, touching, d });
                    });
                    cands2.sort((a, b) => a.d - b.d);
                    const db = cands2.length ? cands2[0].d : 0;
                    for (const c of cands2) {
                        if (c.d > db + 1) break;
                        if (rVisited.has(c.o.id)) continue;
                        _orientAndLink(c.o, cp, c.touching);
                        rVisited.add(c.o.id);
                        rq.push(c.o.id);
                    }
                }
            }
            console.log(`  -> Pre-meter reroot: ${comp.size} borulu zincir en alçak serbest uçtan yeniden köklendi (z=${newRootZ.toFixed(0)})`);
        }
    } catch (e) {
        console.warn('Pre-meter reroot hatası:', e);
    }

    console.log(`  -> _linkPipeNetwork: ${visited.size}/${pipes.length} boru zincire dahil edildi, ${_linkCount} link kuruldu`);

    // Seed yok ise (sayaç hiç parse edilmediyse) — yine de borular arasında uç-uç
    // eşleşmesi yapılır ki istemcide grafik bütünlüğü olsun (debi olmasa da hat çizilir).
    if (visited.size === 0) {
        // Herhangi bir boruyu kök olarak seç ve BFS yap
        const root = pipes[0];
        if (root) {
            visited.add(root.id);
            queue.push(root.id);
            while (queue.length) {
                const cur = pipeMap.get(queue.shift());
                if (!cur) continue;
                for (const myEnd of ['p1', 'p2']) {
                    const myPt = cur[myEnd];
                    for (const other of pipes) {
                        if (other.id === cur.id || visited.has(other.id)) continue;
                        if (!other.p1 || !other.p2) continue;
                        let touching = null;
                        if (eq3(myPt, other.p1)) touching = 'p1';
                        else if (eq3(myPt, other.p2)) touching = 'p2';
                        if (!touching) continue;
                        _orientAndLink(other, cur, touching);
                        visited.add(other.id);
                        queue.push(other.id);
                    }
                }
            }
        }
    }
}

function _findFloorIdForZ(z, floors) {
    if (!floors || !floors.length) return null;
    const v = Number.isFinite(z) ? z : 0;
    for (const f of floors) {
        if (f.isPlaceholder) continue;
        if (v >= f.bottomElevation && v < f.topElevation) return f.id;
    }
    // Range dışında ise en yakına at
    let best = null, bestD = Infinity;
    for (const f of floors) {
        if (f.isPlaceholder) continue;
        const d = Math.min(Math.abs(v - f.bottomElevation), Math.abs(v - f.topElevation));
        if (d < bestD) { bestD = d; best = f; }
    }
    return best ? best.id : null;
}

// --------------------------------------------------------------------------

/**
 * Verilen bir mutlak X,Y koordinatına en yakın duvarı ve o duvar üzerindeki
 * göreceli pozisyonu (pos) bulan yardımcı fonksiyon.
 */
function findClosestWallAndPosition(origin) {
    let bestWall = null;
    let bestPos = 0;
    let minDisSq = Infinity;
    
    // Duvar kalınlığının iki katı kadar bir tolerans (cm cinsinden)
    const toleranceSq = Math.pow(state.wallThickness * 2, 2); 

    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue;

        const disSq = distToSegmentSquared(origin, wall.p1, wall.p2);

        if (disSq < toleranceSq && disSq < minDisSq) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;

            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            
            // Noktanın segment üzerindeki izdüşümünü bul (0-1 arası)
            let t = ((origin.x - wall.p1.x) * dx + (origin.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
            t = Math.max(0, Math.min(1, t)); // 0-1 arasında kalmasını sağla
            
            bestPos = t * wallLen; // cm cinsinden pozisyon
            bestWall = wall;
            minDisSq = disSq;
        }
    }
    return { wall: bestWall, pos: bestPos };
}


/**
 * Verilen XML metnini ayrıştırır ve ngcad state'ine ekler.
 * @param {string} xmlString - Import edilecek XML içeriği
 */
export function importFromXML(xmlString, options = {}) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Proje adını input'a yaz (dosya adı öncelikli, yoksa bina/abone ünvanı)
    try {
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) {
            let pname = options.fileName;
            if (!pname) {
                // Bina yönetimi sayacı ya da ilk sayaç ünvanını dene
                const unvanEl = xmlDoc.querySelector("O[T='clssayac'] P[F='GLAboneUnvan']");
                if (unvanEl) pname = unvanEl.getAttribute('V');
            }
            if (pname) {
                nameInput.value = pname;
                window.currentProjectName = pname;
            }
        }
    } catch (e) { /* ignore */ }

    // Hata ayıklama: XML doğru okundu mu?
    const entities = xmlDoc.querySelector("O[F='Entities']");
    if (!entities) {
        console.error("XML ayrıştırması başarısız oldu veya 'Entities' bulunamadı.");
        alert("XML ayrıştırması başarısız oldu veya 'Entities' bulunamadı.");
        return;
    }

    console.log("XML Import başlatılıyor...");
    console.log("Entities bulundu:", entities);
    console.log("Entities children count:", entities.children.length);

    // TÜM XML'deki element tiplerini topla
    const allElements = xmlDoc.querySelectorAll("O[T]");
    const elementTypes = new Map();
    allElements.forEach(el => {
        const type = el.getAttribute('T');
        elementTypes.set(type, (elementTypes.get(type) || 0) + 1);
    });

    console.log("\n=== XML'DEKİ TÜM ELEMENT TİPLERİ ===");
    console.log("Toplam O elementi:", allElements.length);
    elementTypes.forEach((count, type) => {
        console.log(`  ${type}: ${count} adet`);
    });
    console.log("====================================\n");

    console.log("Entities first 5 children:");
    for (let i = 0; i < Math.min(5, entities.children.length); i++) {
        const child = entities.children[i];
        console.log(`  ${i}: tagName=${child.tagName}, F=${child.getAttribute('F')}, T=${child.getAttribute('T')}`);

        // vdPolyhatch içini kontrol et
        if (child.getAttribute('T') === 'vdPolyhatch') {
            console.log(`    vdPolyhatch içindeki child count: ${child.children.length}`);
            console.log(`    vdPolyhatch içindeki ilk 10 child:`);
            for (let j = 0; j < Math.min(10, child.children.length); j++) {
                const subchild = child.children[j];
                console.log(`      ${j}: tagName=${subchild.tagName}, F=${subchild.getAttribute('F')}, T=${subchild.getAttribute('T')}`);
            }
        }
    }

    // --- ÖNEMLİ: Import öncesi mevcut state'i tamamen temizle ---
    // Eski katlar dahil her şey sıfırlansın ki yeni import temiz başlangıç yapsın.
    setState({
        nodes: [],
        walls: [],
        doors: [],
        rooms: [],
        columns: [],
        beams: [],
        stairs: [],
        guides: [],
        selectedObject: null,
        selectedGroup: [],
        startPoint: null,
        plumbingBlocks: [],
        plumbingPipes: [],
        plumbingNodes: [],
        plumbingLabelOffsets: {},
        floors: [],
        currentFloor: null
    });
    // --- TEMİZLİK SONU ---

    // --- Z-FARKINDA DUVAR YARDIMCILARI ---
    // Gasline çoklu kat mimarisinde duvarlar farklı Z'lerde ama aynı X/Y'de gelebilir.
    // Global getOrCreateNode/wallExists Z'yi bilmediği için ayrı katların duvarlarını
    // birleştirip eziyorlardı. Bu yardımcılar her kat (Z grubu) için izole node havuzu tutar.
    const _wallNodesByFloorIdx = new Map();  // floorIdx → Array<{x,y}>
    const _wallsByFloorIdx     = new Map();  // floorIdx → Array<wall>
    const _wallFloorIdxFor = (z) => Math.floor((Number(z) || 0) / GASLINE_FLOOR_HEIGHT);
    function _getOrCreateWallNodeAtZ(x, y, z) {
        const fi = _wallFloorIdxFor(z);
        if (!_wallNodesByFloorIdx.has(fi)) _wallNodesByFloorIdx.set(fi, []);
        const nodes = _wallNodesByFloorIdx.get(fi);
        const SNAP = 1; // cm — XML koordinatları net olduğu için dar tolerans yeterli
        for (const n of nodes) {
            if (Math.hypot(n.x - x, n.y - y) < SNAP) return n;
        }
        const nn = { x, y };
        nodes.push(nn);
        state.nodes.push(nn); // global liste (legacy okumalar için)
        return nn;
    }
    function _wallExistsAtZ(p1, p2, z) {
        const fi = _wallFloorIdxFor(z);
        const arr = _wallsByFloorIdx.get(fi) || [];
        return arr.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
    }
    function _registerWallForZ(wall, z) {
        const fi = _wallFloorIdxFor(z);
        if (!_wallsByFloorIdx.has(fi)) _wallsByFloorIdx.set(fi, []);
        _wallsByFloorIdx.get(fi).push(wall);
    }
    // --- /Z-FARKINDA DUVAR YARDIMCILARI ---

    // 1. Duvarları (VdWall) oluştur ve nodeları kaydet
    // Yeni yapı: CloseArea içindeki Walls dizisini kontrol et
    // DÜZELTME: entities içinde değil, xmlDoc'un her yerinde ara
    const closeAreas = xmlDoc.querySelectorAll("O[F='_Item'][T='CloseArea']");
    console.log(`${closeAreas.length} CloseArea bulundu (tüm XML'de arama yapıldı)`);

    closeAreas.forEach((closeArea, idx) => {
        try {
            // AreaType'ı al (mahal tipi)
            const areaTypeEl = closeArea.querySelector("P[F='AreaType']");
            const areaTypeValue = areaTypeEl ? parseInt(areaTypeEl.getAttribute('V')) : null;
            const roomName = areaTypeValue ? (VECTORDRAW_AREA_TYPES[areaTypeValue] || `MAHAL`) : `MAHAL`;

            console.log(`\nCloseArea ${idx} - AreaType: ${areaTypeValue}, İsim: ${roomName}`);

            // VertexList'ten köşe noktalarını al
            const vertexListEl = closeArea.querySelector("O[F='VertexList']");
            const vertices = [];
            if (vertexListEl) {
                console.log(`  -> VertexList bulundu`);

                // Önce P[F='_Item'] formatını dene (eski format)
                let vertexElements = vertexListEl.querySelectorAll("P[F='_Item']");

                if (vertexElements.length === 0) {
                    // Yeni format: P[F='streamed'] - base64 encoded binary data
                    const streamedEl = vertexListEl.querySelector("P[F='streamed']");
                    if (streamedEl) {
                        console.log(`  -> Streamed format bulundu, decode ediliyor...`);
                        const base64Data = streamedEl.getAttribute('V');

                        try {
                            // Base64 decode
                            const binaryString = atob(base64Data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            console.log(`  -> Toplam byte sayısı: ${bytes.length}`);

                            // İlk 4 byte vertex sayısını içerir (int32)
                            const dataView = new DataView(bytes.buffer);
                            const vertexCount = dataView.getInt32(0, true); // little-endian
                            console.log(`  -> Vertex sayısı: ${vertexCount}`);

                            // Byte per vertex hesapla
                            const bytesPerVertex = (bytes.length - 4) / vertexCount;
                            console.log(`  -> Byte per vertex: ${bytesPerVertex} (${(bytes.length - 4)} / ${vertexCount})`);

                            // Vertex'leri oku - her vertex için uygun byte sayısını kullan
                            let offset = 4; // İlk 4 byte'ı atla (vertex count)
                            for (let i = 0; i < vertexCount; i++) {
                                if (offset + 16 > bytes.length) {
                                    console.warn(`  -> Offset ${offset} aralık dışında, vertex ${i} atlandı`);
                                    break;
                                }

                                const x = dataView.getFloat64(offset, true);
                                const y = dataView.getFloat64(offset + 8, true);

                                // Kalan byte'ları atla (Z, bulge, width vs.)
                                offset += bytesPerVertex;

                                // DÜZELTME: Y eksenini ters çevir
                                vertices.push({ x: x * SCALE, y: -y * SCALE });
                            }
                            console.log(`  -> ${vertices.length} köşe noktası decode edildi`);
                        } catch (e) {
                            console.error(`  -> Streamed data decode hatası:`, e);
                        }
                    }
                } else {
                    // Eski format: P[F='_Item'] elementleri
                    vertexElements.forEach(vertexEl => {
                        const coords = vertexEl.getAttribute('V').split(',').map(Number);
                        // DÜZELTME: Y eksenini ters çevir
                        vertices.push({ x: coords[0] * SCALE, y: -coords[1] * SCALE });
                    });
                    console.log(`  -> ${vertices.length} köşe noktası bulundu (eski format)`);
                }
            } else {
                console.log(`  -> VertexList bulunamadı!`);
            }

            const wallsContainer = closeArea.querySelector("O[F='Walls']");
            console.log(`  -> Walls container:`, wallsContainer ? "bulundu" : "bulunamadı");

            if (wallsContainer) {
                const wallElements = wallsContainer.querySelectorAll("O[F='_Item'][T='VdWall']");
                console.log(`  -> ${wallElements.length} VdWall bulundu`);

                wallElements.forEach((wallEl, wallIdx) => {
                    console.log(`    -> Wall ${wallIdx} işleniyor...`);
                    processWallElement(wallEl);
                });
            }

            // Room objesini oluştur ve state.rooms'a ekle
            // Eğer vertices parse edilemedi ise, duvarlardan vertices'leri çıkar
            if (vertices.length === 0 && wallsContainer) {
                console.log(`  -> Vertices bulunamadı, duvarlardan köşe noktaları çıkarılıyor...`);
                const wallElements = wallsContainer.querySelectorAll("O[F='_Item'][T='VdWall']");
                const nodeSet = new Set();

                wallElements.forEach(wallEl => {
                    const startPointEl = wallEl.querySelector("P[F='StartPoint']");
                    const endPointEl = wallEl.querySelector("P[F='EndPoint']");

                    if (startPointEl && endPointEl) {
                        const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                        const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                        // Node'ları string key olarak sakla (köşeleri unique yapmak için)
                        const p1Key = `${(startCoords[0] * SCALE).toFixed(2)},${(-startCoords[1] * SCALE).toFixed(2)}`;
                        const p2Key = `${(endCoords[0] * SCALE).toFixed(2)},${(-endCoords[1] * SCALE).toFixed(2)}`;

                        nodeSet.add(p1Key);
                        nodeSet.add(p2Key);
                    }
                });

                // Set'ten vertices array'e çevir
                nodeSet.forEach(key => {
                    const [x, y] = key.split(',').map(Number);
                    vertices.push({ x, y });
                });

                console.log(`  -> Duvarlardan ${vertices.length} unique köşe noktası çıkarıldı`);
            }

            if (vertices.length > 0) {
                // İçindeki ilk duvardan Z (kat) bilgisini al — multi-floor mimari için kritik
                let roomZ = 0;
                if (wallsContainer) {
                    const firstWall = wallsContainer.querySelector("O[F='_Item'][T='VdWall']");
                    const spEl = firstWall?.querySelector("P[F='StartPoint']");
                    if (spEl) {
                        const coords = spEl.getAttribute('V').split(',').map(Number);
                        roomZ = (coords[2] || 0) * SCALE;
                    }
                }
                const room = {
                    type: 'room',
                    name: roomName,
                    vertices: vertices,
                    areaType: areaTypeValue,
                    _srcZ: roomZ
                };
                state.rooms.push(room);
                console.log(`  -> Room eklendi: ${roomName} (${vertices.length} köşe, srcZ=${roomZ})`);
            } else {
                console.warn(`  -> Room eklenemedi: ${roomName} (vertices bulunamadı)`);
            }
        } catch (e) {
            console.error("CloseArea işlenirken hata:", e, closeArea);
        }
    });

    // Eski yapı için backward compatibility: Doğrudan VdWall elemanlarını kontrol et
    // DÜZELTME: Tüm VdWall elemanlarını bul, sonra CloseArea içinde olanları filtrele
    const allWallElements = xmlDoc.querySelectorAll("O[T='VdWall']");
    console.log(`${allWallElements.length} toplam VdWall bulundu (tüm XML'de)`);

    // CloseArea içindeki duvarları bul
    const wallsInCloseAreas = new Set();
    closeAreas.forEach(closeArea => {
        const wallsInThisArea = closeArea.querySelectorAll("O[T='VdWall']");
        wallsInThisArea.forEach(wall => wallsInCloseAreas.add(wall));
    });

    // CloseArea içinde OLMAYAN duvarları filtrele
    const directWallElements = Array.from(allWallElements).filter(wall => !wallsInCloseAreas.has(wall));
    console.log(`${directWallElements.length} doğrudan VdWall bulundu (CloseArea dışı)`);

    directWallElements.forEach((wallEl, idx) => {
        console.log(`  -> Doğrudan wall ${idx} işleniyor...`);
        processWallElement(wallEl);
    });

    // Duvar işleme fonksiyonu (Z-farkında)
    function processWallElement(wallEl) {
        try {
            const startPointEl = wallEl.querySelector("P[F='StartPoint']");
            const endPointEl = wallEl.querySelector("P[F='EndPoint']");
            const widthEl = wallEl.querySelector("P[F='Width']"); // Kalınlık

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // Z (3. koord) gasline'da kat slab tepesini gösterir (0=Zemin, 3=1.Kat, ...).
                const zStart = (startCoords[2] || 0) * SCALE;
                const zEnd = (endCoords[2] || 0) * SCALE;
                const wallZ = (zStart + zEnd) / 2;

                // DÜZELTME: Y eksenini ters çevir (Y -> -Y)
                const p1 = { x: startCoords[0] * SCALE, y: -startCoords[1] * SCALE };
                const p2 = { x: endCoords[0] * SCALE, y: -endCoords[1] * SCALE };

                const node1 = _getOrCreateWallNodeAtZ(p1.x, p1.y, wallZ);
                const node2 = _getOrCreateWallNodeAtZ(p2.x, p2.y, wallZ);

                if (node1 !== node2 && !_wallExistsAtZ(node1, node2, wallZ)) {
                    // Kalınlığı XML'den al, yoksa varsayılanı kullan
                    const thickness = widthEl ? (parseFloat(widthEl.getAttribute('V')) * SCALE) : state.wallThickness;

                    const newWall = {
                        type: "wall",
                        p1: node1,
                        p2: node2,
                        thickness: thickness,
                        wallType: 'normal',
                        windows: [],
                        vents: [],
                        floorId: null, // gerçek floorId, kat tespiti sonrasında _srcZ'ye göre atanır
                        _srcZ: wallZ
                    };
                    state.walls.push(newWall);
                    _registerWallForZ(newWall, wallZ);
                } else {
                    // duplicate veya aynı node (sessiz geç — multi-floor'da spam olmasın)
                }
            }
        } catch (e) {
            console.error("Duvar işlenirken hata:", e, wallEl);
        }
    }

    // 2. Kolonları (KolonHavalandirmasi) oluştur
    const kolonElements = xmlDoc.querySelectorAll("O[T='KolonHavalandirmasi']");
    console.log(`\n${kolonElements.length} KolonHavalandirmasi bulundu (tüm XML'de)`);

    kolonElements.forEach((kolonEl, idx) => {
        console.log(`  -> Kolon ${idx} işleniyor...`);
        try {
            const insertionPointEl = kolonEl.querySelector("P[F='InsertionPoint']");
            const widthEl = kolonEl.querySelector("P[F='Width']");
            const heightEl = kolonEl.querySelector("P[F='Height']");
            const rotationEl = kolonEl.querySelector("P[F='Rotation']"); // Rotasyon eklendi

            if (insertionPointEl && widthEl && heightEl) {
                const centerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const height = parseFloat(heightEl.getAttribute('V')) * SCALE;
                let rotationDeg = 0;
                if (rotationEl) {
                    const rotationRad = parseFloat(rotationEl.getAttribute('V'));
                    rotationDeg = rotationRad * (180 / Math.PI);
                }

                // DÜZELTME: Y eksenini ters çevir
                const newCol = createColumn(centerCoords[0] * SCALE, -centerCoords[1] * SCALE, 0);
                newCol.width = width;
                newCol.height = height;
                newCol.size = Math.max(width, height);
                newCol.rotation = rotationDeg;

                if (!state.columns) state.columns = [];
                state.columns.push(newCol);
            }
        } catch (e) {
            console.error("Kolon işlenirken hata:", e, kolonEl);
        }
    });

    // Z-farkında en yakın duvar bulucu: kapı/pencere/menfez aynı kattaki duvarlara yapıştırılmalı.
    // Çoklu kat mimaride aynı X/Y'de farklı katlarda duvarlar var; XY-tek findClosestWallAndPosition
    // yanlış kata isabet ediyordu (kapılar başka katta görünüp aktif katta hiç görünmüyordu).
    function _closestWallAtZ(origin, z) {
        const targetFloorIdx = _wallFloorIdxFor(z);
        const candidates = state.walls.filter(w => {
            if (w._srcZ == null) return true; // legacy
            return _wallFloorIdxFor(w._srcZ) === targetFloorIdx;
        });
        let best = null, bestPos = 0, bestDsq = Infinity;
        const tolSq = Math.pow(state.wallThickness * 2, 2);
        for (const w of candidates) {
            if (!w.p1 || !w.p2) continue;
            const dsq = distToSegmentSquared(origin, w.p1, w.p2);
            if (dsq < tolSq && dsq < bestDsq) {
                const dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y;
                const len2 = dx * dx + dy * dy;
                if (len2 < 0.01) continue;
                let t = ((origin.x - w.p1.x) * dx + (origin.y - w.p1.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                bestPos = t * Math.sqrt(len2);
                bestDsq = dsq;
                best = w;
            }
        }
        return { wall: best, pos: bestPos };
    }

    // 3. Kapıları (Door) işle
    const doorElements = xmlDoc.querySelectorAll("O[T='Door']");
    console.log(`\n${doorElements.length} Door bulundu (tüm XML'de)`);

    doorElements.forEach((doorEl, idx) => {
        try {
            // Top-level Ps — descendant query Door içindeki vdRect'lerden yanlış değer alıyordu.
            const originEl = _topProp(doorEl, 'Origin') || _topProp(doorEl, 'origin');
            const widthEl = _topProp(doorEl, 'En') || _topProp(doorEl, 'Width');

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const doorZ = (originCoords[2] || 0) * SCALE;
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = _closestWallAtZ(origin, doorZ);

                if (wall) {
                    state.doors.push({
                        wall: wall,
                        pos: pos,
                        width: width,
                        type: 'door',
                        floorId: wall.floorId || null
                    });
                } else {
                    console.warn(`Kapı ${idx} için yakın duvar bulunamadı (z=${doorZ}):`, origin);
                }
            }
        } catch (e) {
            console.error("Kapı işlenirken hata:", e, doorEl);
        }
    });

    // 4. Pencereleri (Window) işle
    const windowElements = xmlDoc.querySelectorAll("O[T='Window']");
    console.log(`\n${windowElements.length} Window bulundu (tüm XML'de)`);

    windowElements.forEach((winEl, idx) => {
        try {
            const originEl = _topProp(winEl, 'Origin') || _topProp(winEl, 'origin');
            const widthEl = _topProp(winEl, 'En') || _topProp(winEl, 'Width');

            if (originEl && widthEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const winZ = (originCoords[2] || 0) * SCALE;
                const width = parseFloat(widthEl.getAttribute('V')) * SCALE;

                const { wall, pos } = _closestWallAtZ(origin, winZ);

                if (wall) {
                    if (!wall.windows) wall.windows = [];
                    wall.windows.push({
                        pos: pos,
                        width: width,
                        type: 'window'
                    });
                } else {
                    console.warn(`Pencere ${idx} için yakın duvar bulunamadı (z=${winZ}):`, origin);
                }
            }
        } catch (e) {
            console.error("Pencere işlenirken hata:", e, winEl);
        }
    });

    // 5. Menfezleri (Menfez) işle
    const ventElements = xmlDoc.querySelectorAll("O[T='Menfez']");
    console.log(`\n${ventElements.length} Menfez bulundu (tüm XML'de)`);
    ventElements.forEach((ventEl, idx) => {
        try {
            const originEl = _topProp(ventEl, 'Origin') || _topProp(ventEl, 'origin');
            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const origin = { x: originCoords[0] * SCALE, y: -originCoords[1] * SCALE };
                const ventZ = (originCoords[2] || 0) * SCALE;
                const width = 30; // Varsayılan menfez çapı

                const { wall, pos } = _closestWallAtZ(origin, ventZ);

                if (wall) {
                    if (!wall.vents) wall.vents = [];
                    wall.vents.push({
                        pos: pos,
                        width: width,
                        type: 'vent'
                    });
                } else {
                    console.warn(`Menfez ${idx} için yakın duvar bulunamadı (z=${ventZ}):`, origin);
                }
            }
        } catch (e) {
            console.error("Menfez işlenirken hata:", e, ventEl);
        }
    });
    
    // 6. Merdivenleri (clsmerdiven) işle
    const stairElements = xmlDoc.querySelectorAll("O[T='clsmerdiven']");
    console.log(`\n${stairElements.length} clsmerdiven bulundu (tüm XML'de)`);
    stairElements.forEach((stairEl, idx) => {
        console.log(`  -> Merdiven ${idx} işleniyor...`);
        try {
            const insertionPointEl = stairEl.querySelector("P[F='InsertionPoint']");
            const widthEl = stairEl.querySelector("P[F='Width']"); // XML'deki Width (X boyutu)
            const heightEl = stairEl.querySelector("P[F='Height']"); // XML'deki Height (Y boyutu)
            const lines = stairEl.querySelectorAll("O[T='vdLine']"); // Basamak sayısı için

            if (insertionPointEl && widthEl && heightEl && lines.length > 0) {

                // DÜZELTME: Y eksenini ters çevir (InsertionPoint)
                const cornerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const ipX = cornerCoords[0] * SCALE;
                const ipY = -cornerCoords[1] * SCALE;

                // XML Height değerinin orijinal işaretini koru (yön tespiti için)
                const xml_w = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const xml_h_original = parseFloat(heightEl.getAttribute('V'));
                const xml_h = -(xml_h_original * SCALE);

                // Bizim 'width'imiz (uzunluk) X eksenindedir.
                // Bizim 'height'imiz (en) Y eksenindedir.

                // XML merdiveni Y eksenine paralel (XML'de Height, bizde app_length)
                // XML merdiven eni X eksenine paralel (XML'de Width, bizde app_thickness)
                let app_length = Math.abs(xml_h);
                let app_thickness = Math.abs(xml_w);

                // Merkezi Y-terslenmiş koordinatlara göre hesapla
                const centerX = ipX + (xml_w / 2);
                const centerY = ipY + (xml_h / 2);

                // DÜZELTME: 90° CCW = -90 derece (veya 270)
                // Bu, merdivenin "yukarı" (negatif Y) yönlü olmasını sağlar
                const app_rotation = 90;

                // Basamak sayısını çizgilerden al
                const stepCount = lines.length > 0 ? (lines.length - 1) : 12; // 13 çizgi = 12 basamak

                // DÜZELTME: -90 derece rotasyon için,
                // createStairs 'width' (X-ekseni) parametresi merdivenin Y-eksenindeki uzunluğu olmalı (app_length)
                // createStairs 'height' (Y-ekseni) parametresi merdivenin X-eksenindeki eni olmalı (app_thickness)
                const newStair = createStairs(centerX, centerY, app_length, app_thickness, app_rotation, false);

                newStair.stepCount = stepCount;

                // Merdiven yönünü XML Height işaretinden belirle
                // Negatif Height = Aşağı inen merdiven (topElevation < bottomElevation)
                if (xml_h_original < 0) {
                    // Swap elevations to make it go DOWN
                    const temp = newStair.bottomElevation;
                    newStair.bottomElevation = newStair.topElevation;
                    newStair.topElevation = temp;
                } 

                if (!state.stairs) state.stairs = [];
                state.stairs.push(newStair);
            }
        } catch (e) {
            console.error("Merdiven işlenirken hata:", e, stairEl);
        }
    });


    // 7. Kirişleri (clskiris) işle
    const kirisElements = xmlDoc.querySelectorAll("O[T='clskiris']");
    console.log(`\n${kirisElements.length} clskiris bulundu (tüm XML'de)`);
    kirisElements.forEach((kirisEl, idx) => {
        console.log(`  -> Kiriş ${idx} işleniyor...`);
        try {
            const insertionPointEl = kirisEl.querySelector("P[F='InsertionPoint']");
            const widthEl = kirisEl.querySelector("P[F='Width']"); // Kiriş eni (thickness)
            const heightEl = kirisEl.querySelector("P[F='Height']"); // Kiriş uzunluğu (length)
            const rotationEl = kirisEl.querySelector("P[F='Rotation']");

            if (insertionPointEl && widthEl && heightEl && rotationEl) {
                const centerCoords = insertionPointEl.getAttribute('V').split(',').map(Number);
                const width_xml = parseFloat(widthEl.getAttribute('V')) * SCALE;
                const height_xml = parseFloat(heightEl.getAttribute('V')) * SCALE;
                const rotationRad = parseFloat(rotationEl.getAttribute('V'));
                const rotationDeg = rotationRad * (180 / Math.PI);

                // DÜZELTME: InsertionPoint merkez DEĞİL, köşe noktası
                // InsertionPoint'ten merkez koordinatına dönüştürme:
                // 1. InsertionPoint yerel koordinat sisteminde (rotation=0)
                // 2. Merkez offset = (width/2, height/2)
                // 3. Bu offset'i rotation kadar döndür
                // 4. InsertionPoint + rotated offset = gerçek merkez
                //
                // createBeam: (centerX, centerY, width=length, height=thickness, rotation)

                const insertionX = centerCoords[0] * SCALE;
                const insertionY = -centerCoords[1] * SCALE;

                // Merkez offset'i hesapla (local koordinatlarda)
                const halfWidth = width_xml / 2;
                const halfHeight = height_xml / 2;

                // Rotation uygula (InsertionPoint'ten merkeze giden vektörü döndür)
                const cos = Math.cos(rotationRad);
                const sin = Math.sin(rotationRad);

                // Rotated offset
                const offsetX = halfWidth * cos - halfHeight * sin;
                const offsetY = halfWidth * sin + halfHeight * cos;

                // Gerçek merkez = InsertionPoint + rotated offset
                const centerX = insertionX + offsetX;
                const centerY = insertionY - offsetY; // Y-eksen ters olduğu için -offsetY

                const newBeam = createBeam(
                    centerX,
                    centerY,
                    width_xml,    // length (XML Width)
                    height_xml,   // thickness (XML Height)
                    rotationDeg   // Rotation
                );

                if (!state.beams) state.beams = [];
                state.beams.push(newBeam);

                console.log(`    -> Kiriş eklendi: insertion=(${insertionX.toFixed(2)}, ${insertionY.toFixed(2)}), merkez=(${centerX.toFixed(2)}, ${centerY.toFixed(2)}), length=${width_xml.toFixed(1)}, thickness=${height_xml.toFixed(1)}, rotation=${rotationDeg.toFixed(1)}°`);
            }
        } catch (e) {
            console.error("Kiriş işlenirken hata:", e, kirisEl);
        }
    });


    // 8. Tesisat elementlerini parse et
    console.log("\n=== TESİSAT ELEMENTLERİ PARSE EDİLİYOR ===");

    // Yardımcı fonksiyon: İki nokta arasındaki mesafeyi hesapla
    function distance3D(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Yardımcı fonksiyon: Verilen noktaya en yakın boru ucunu bul.
    // skipReserved=true → başka bir bileşene (sayac/cihaz/servis_kutusu) bağlanmış
    // uçlar atlanır; çoklu sayaçlı dosyalarda iki sayacın aynı ucu kapmasını önler.
    const _RESERVED_TIPS = new Set(['sayac', 'cihaz', 'servis_kutusu']);
    function findClosestPipeEnd(point, pipes, tolerance = 10, skipReserved = false) {
        let closestPipe = null;
        let closestEnd = null;
        let minDistance = tolerance;

        for (const pipe of pipes) {
            const p1Reserved = skipReserved && _RESERVED_TIPS.has(pipe.baslangicBaglanti?.tip);
            const p2Reserved = skipReserved && _RESERVED_TIPS.has(pipe.bitisBaglanti?.tip);

            // p1 ucuna olan mesafe
            if (!p1Reserved) {
                const dist1 = distance3D(point, pipe.p1);
                if (dist1 < minDistance) {
                    minDistance = dist1;
                    closestPipe = pipe;
                    closestEnd = 'p1';
                }
            }

            // p2 ucuna olan mesafe
            if (!p2Reserved) {
                const dist2 = distance3D(point, pipe.p2);
                if (dist2 < minDistance) {
                    minDistance = dist2;
                    closestPipe = pipe;
                    closestEnd = 'p2';
                }
            }
        }

        return closestPipe ? { pipe: closestPipe, end: closestEnd, distance: minDistance } : null;
    }

    // Yardımcı fonksiyon: Noktayı boru GÖVDELERİNE projeksiyon yapıp en yakın boruyu bul.
    // Ara vanalar (AKV/EMNIYET/CIHAZ...) borunun ortasında durur; uç araması yetmez.
    function findClosestPipeBody(point, pipes, tolerance = 50) {
        let best = null;
        let bestDist = tolerance;
        for (const pipe of pipes) {
            if (!pipe.p1 || !pipe.p2) continue;
            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
            const len2 = dx * dx + dy * dy + dz * dz;
            if (len2 < 0.01) continue;
            let t = ((point.x - pipe.p1.x) * dx + (point.y - pipe.p1.y) * dy +
                     ((point.z || 0) - (pipe.p1.z || 0)) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
            const px = pipe.p1.x + t * dx;
            const py = pipe.p1.y + t * dy;
            const pz = (pipe.p1.z || 0) + t * dz;
            const d = Math.hypot(point.x - px, point.y - py, (point.z || 0) - pz);
            if (d < bestDist) {
                bestDist = d;
                best = { pipe, t, distance: d };
            }
        }
        return best;
    }

    // 8.1. ÖNCE TÜM BORULARI PARSE ET (Bağlantılar için gerekli)
    const boruElements = xmlDoc.querySelectorAll("O[T='clsboru']");
    console.log(`\n${boruElements.length} clsboru bulundu (tüm XML'de)`);

    boruElements.forEach((boruEl, idx) => {
        try {
            // ÖNEMLİ: top-level (doğrudan çocuk) Ps kullan — querySelector iç vdLine'lardan
            // yanlış StartPoint döndürüyor (clsboru içinde DrawEntities altında sketch çizgileri var).
            const startPointEl = _topProp(boruEl, 'StartPoint');
            const endPointEl   = _topProp(boruEl, 'EndPoint');
            const boruCapEl    = _topProp(boruEl, 'GLBORUCAP');

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                const p1 = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                const p2 = {
                    x: endCoords[0] * SCALE,
                    y: -endCoords[1] * SCALE,
                    z: endCoords[2] ? endCoords[2] * SCALE : 0
                };

                // Boru çapı: XML int → DN string (DN15..DN450).
                // Eski kod boruCap'i sayı olarak hesaplıyor ama nesneye atamıyordu;
                // bu yüzden tüm borular varsayılan DN25 görünüyordu (hat numaralandırması da
                // diametre değişimini göremiyordu).
                const boruCapInt = boruCapEl ? parseInt(boruCapEl.getAttribute('V')) : 25;
                const boruCap = _dnFromIntCap(boruCapInt);
                const boruTipi = boruCapInt > 30 ? 'KALIN' : 'STANDART';

                const boruData = {
                    id: `boru_xml_${idx}_${Date.now()}`,
                    type: 'boru',
                    boruTipi: boruTipi,
                    boruCap: boruCap,
                    p1: p1,
                    p2: p2,
                    colorGroup: 'YELLOW', // Varsayılan renk
                    floorId: state.currentFloor?.id,
                    baslangicBaglanti: {
                        tip: null,
                        hedefId: null,
                        noktaIndex: null
                    },
                    bitisBaglanti: {
                        tip: null,
                        hedefId: null,
                        noktaIndex: null
                    },
                    uzerindekiElemanlar: [],
                    tBaglantilar: []
                };

                state.plumbingPipes.push(boruData);
                console.log(`    -> Boru eklendi: (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) -> (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Boru işlenirken hata:", e, boruEl);
        }
    });

    // 8.1a. SERVİS KUTUSU (kutu) — gasline XML'inde servis kutusu T="kutu" elemanıdır.
    // Origin = kutu çıkış noktası (tesisata bağlanan uç). En yakın boru ucu köke bağlanır;
    // bu boru pre-meter zincirin ROOT'u olur (_linkPipeNetwork bu seed'den yönlenir).
    const kutuElements = xmlDoc.querySelectorAll("O[T='kutu']");
    console.log(`\n${kutuElements.length} kutu (servis kutusu) bulundu`);
    kutuElements.forEach((kutuEl, idx) => {
        try {
            const originEl = _topProp(kutuEl, 'Origin') || _topProp(kutuEl, 'origin');
            if (!originEl) return;
            const oc = originEl.getAttribute('V').split(',').map(Number);
            const cikisPt = { x: oc[0] * SCALE, y: -oc[1] * SCALE, z: (oc[2] || 0) * SCALE };

            const kutuBasincRaw = _topProp(kutuEl, 'kutubasinc')?.getAttribute('V');
            const kutuTipiRaw = _topProp(kutuEl, 'kututipi')?.getAttribute('V');
            const aboneUnvan = _topProp(kutuEl, 'GLAboneUnvan')?.getAttribute('V') || '';

            // En yakın boru ucunu köke bağla (gasline'da kutu-boru arası boşluk olabilir)
            const yakin = findClosestPipeEnd(cikisPt, state.plumbingPipes, 150);

            const kutuId = `servis_kutusu_xml_${idx}_${Date.now()}`;
            // Kutu merkezi: çıkış noktası local (width/2, -height/2+BORU_ACIKLIGI) = (25, -7.5)
            // olduğundan merkez = çıkış - local (rotation 0, sağ çıkış varsayımı).
            const kutuData = {
                id: kutuId,
                type: 'servis_kutusu',
                x: cikisPt.x - 25,
                y: cikisPt.y + 7.5,
                z: cikisPt.z,
                rotation: 0,
                floorId: null, // 8.7'de Z'ye göre atanır
                cikisYonu: 'sag',
                bagliBoruId: yakin ? yakin.pipe.id : null,
                cikisKullanildi: !!yakin,
                kutuTipi: kutuTipiRaw || 'S200',
                kutuBasinc: kutuBasincRaw != null ? String(parseInt(kutuBasincRaw, 10) || 21) : '21',
                cikisCap: yakin?.pipe?.boruCap || 'DN32',
                kutuBoruTipi: 'ÇELİK',
                kutuBaglantiTipi: 'KAYNAKLI',
                description: aboneUnvan ? `Abone: ${aboneUnvan}` : ''
            };

            if (yakin) {
                // Kanonik yapı: kutuya bağlı borunun p1'i kutu çıkışındadır.
                if (yakin.end === 'p2') {
                    const p = yakin.pipe;
                    [p.p1, p.p2] = [p.p2, p.p1];
                    const tmp = p.baslangicBaglanti;
                    p.baslangicBaglanti = p.bitisBaglanti;
                    p.bitisBaglanti = tmp;
                }
                yakin.pipe.baslangicBaglanti = {
                    tip: 'servis_kutusu',
                    hedefId: kutuId,
                    baglananNokta: 'cikis'
                };
            }

            state.plumbingBlocks.push(kutuData);
            console.log(`    -> Servis kutusu eklendi: (${cikisPt.x.toFixed(1)}, ${cikisPt.y.toFixed(1)}, z=${cikisPt.z.toFixed(0)}) tip=${kutuData.kutuTipi} basınç=${kutuData.kutuBasinc}${yakin ? '' : ' [boru bağlantısı bulunamadı]'}`);
        } catch (e) {
            console.error('Servis kutusu işlenirken hata:', e, kutuEl);
        }
    });

    // 8.1b. Branşman (clsbransman) → BRANSMAN vanası (sonlanma vanası)
    // Not: clsbransman gerçek servis kutusu değil, daire branşmanı vanasıdır.
    const bransmanElements = xmlDoc.querySelectorAll("O[T='clsbransman']");
    console.log(`\n${bransmanElements.length} clsbransman bulundu (daire branşmanı vana)`);

    bransmanElements.forEach((bransmanEl, idx) => {
        try {
            const sp = _topProp(bransmanEl, 'StartPoint') || _topProp(bransmanEl, 'origin');
            const ep = _topProp(bransmanEl, 'EndPoint');
            if (!sp) return;
            const sc = sp.getAttribute('V').split(',').map(Number);
            const ec = (ep ? ep.getAttribute('V') : sp.getAttribute('V')).split(',').map(Number);
            const topZ = Math.max((sc[2] || 0), (ec[2] || 0)) * SCALE;
            const point = { x: sc[0] * SCALE, y: -sc[1] * SCALE, z: topZ };

            // Branşman debisi: XML'de değer varsa onu, yoksa standart 3.5 m³/h
            const ekTukEl = _topProp(bransmanEl, 'GLEKTUKETIM');
            const xmlDebi = ekTukEl ? parseFloat(ekTukEl.getAttribute('V')) : 0;
            const bransmanDebi = (xmlDebi && xmlDebi > 0) ? xmlDebi : 3.5;

            const birimSayisiEl2 = _topProp(bransmanEl, 'GLBIRIMSAYISI');
            const dukkanSayisiEl2 = _topProp(bransmanEl, 'GLDUKKANSAYISI');
            const daireNoEl2 = _topProp(bransmanEl, 'GLDAIRENO');

            const yakin = findClosestPipeEnd(point, state.plumbingPipes, 80);
            const vanaData = {
                id: `vana_bransman_xml_${idx}_${Date.now()}`,
                type: 'vana',
                x: point.x, y: point.y, z: point.z,
                rotation: 0,
                vanaTipi: 'BRANSMAN',
                floorId: state.currentFloor?.id,
                bagliBoruId: yakin ? yakin.pipe.id : null,
                boruPozisyonu: yakin ? (yakin.end === 'p1' ? 0.0 : 1.0) : 1.0,
                fromEnd: yakin ? yakin.end : null,
                fixedDistance: 1, // uçtan 1cm — 0 falsy olduğu için fromJSON'da kayboluyordu
                girisBagliBoruId: null,
                cikisBagliBoruId: null,
                showEndCap: false,
                vanaCap: null,
                izolator: false,
                muhafaza: false,
                muhafazaGrupla: false,
                birimNo: daireNoEl2?.getAttribute('V') || '',
                tesisatNo: '',
                daireSayisi: birimSayisiEl2 ? parseInt(birimSayisiEl2.getAttribute('V')) || 0 : 0,
                dukkanSayisi: dukkanSayisiEl2 ? parseInt(dukkanSayisiEl2.getAttribute('V')) || 0 : 0,
                ekDebi: 0,
                bransmanDebi: bransmanDebi
            };
            if (yakin) {
                yakin.pipe.uzerindekiElemanlar = yakin.pipe.uzerindekiElemanlar || [];
                yakin.pipe.uzerindekiElemanlar.push({ tip: 'vana', elemanId: vanaData.id, pozisyon: 1.0 });
            }
            state.plumbingBlocks.push(vanaData);
        } catch (e) {
            console.error("Branşman vana işlenirken hata:", e, bransmanEl);
        }
    });

    // 8.2. Sayaçlar (clssayac) - Şimdi boru bağlantılarını da kur
    const sayacElements = xmlDoc.querySelectorAll("O[T='clssayac']");
    console.log(`\n${sayacElements.length} clssayac bulundu (tüm XML'de)`);

    sayacElements.forEach((sayacEl, idx) => {
        try {
            // top-level (doğrudan çocuk) StartPoint/EndPoint — querySelector iç vdLine'lardan
            // yanlış değer döndürüyor (clssayac içinde DrawEntities altında sketch çizgileri var).
            const startPointEl = _topProp(sayacEl, 'StartPoint');
            const endPointEl = _topProp(sayacEl, 'EndPoint');

            if (startPointEl && endPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const endCoords = endPointEl.getAttribute('V').split(',').map(Number);

                // Giriş ve çıkış noktalarını hesapla
                const girisPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                const cikisPoint = {
                    x: endCoords[0] * SCALE,
                    y: -endCoords[1] * SCALE,
                    z: endCoords[2] ? endCoords[2] * SCALE : 0
                };

                // Merkez koordinatı hesapla (start ve end ortası)
                const centerX = (girisPoint.x + cikisPoint.x) / 2;
                const centerY = (girisPoint.y + cikisPoint.y) / 2;
                const z = girisPoint.z;

                // Sayaç ID'si bağlantılarda kullanılacağı için önce üretilir
                const sayacId = `sayac_xml_${idx}_${Date.now()}`;

                // Giriş ve çıkış borularını bul. Tolerance=80cm (varsayılan 10cm gasline'da
                // sayaç-boru arası boşluk için yetersiz).
                // KANONİK YAPI (elle yerleştirme ile aynı):
                //   - Giriş: sayac.fleksBaglanti = {boruId, endpoint} → MEVCUT kolon borusunun
                //     ucuna sanal fleks çizilir; ayrı fleks borusu OLUŞTURULMAZ.
                //   - Çıkış: iç tesisatın ilk borusu sayaca bağlanır
                //     (baslangicBaglanti = {tip:'sayac', baglananNokta:'cikis'}).
                const girisBoru = findClosestPipeEnd(girisPoint, state.plumbingPipes, 80, true);
                const digerBorular = girisBoru
                    ? state.plumbingPipes.filter(p => p.id !== girisBoru.pipe.id)
                    : state.plumbingPipes;
                const cikisBoru = findClosestPipeEnd(cikisPoint, digerBorular, 80, true);

                let girisBoruId = null;
                let girisEndpoint = null;
                if (girisBoru) {
                    girisBoruId = girisBoru.pipe.id;
                    girisEndpoint = girisBoru.end;
                    // Giriş ucunu rezerve et: _linkPipeNetwork bu ucu başka boruya
                    // bağlayamaz (pre/post-meter köprülenmesini engeller).
                    const bagSet = { tip: 'sayac', hedefId: sayacId, baglananNokta: 'giris' };
                    if (girisBoru.end === 'p1') girisBoru.pipe.baslangicBaglanti = bagSet;
                    else girisBoru.pipe.bitisBaglanti = bagSet;
                    console.log(`    -> Sayaç girişi kolon ucuna bağlandı (${girisBoru.end}, ${girisBoru.distance.toFixed(1)}cm)`);
                }

                let cikisBoruId = null;
                if (cikisBoru) {
                    // Kanonik: çıkış borusunun p1'i sayaç tarafındadır
                    if (cikisBoru.end === 'p2') {
                        const p = cikisBoru.pipe;
                        [p.p1, p.p2] = [p.p2, p.p1];
                        const tmp = p.baslangicBaglanti;
                        p.baslangicBaglanti = p.bitisBaglanti;
                        p.bitisBaglanti = tmp;
                    }
                    cikisBoru.pipe.baslangicBaglanti = {
                        tip: 'sayac',
                        hedefId: sayacId,
                        baglananNokta: 'cikis'
                    };
                    cikisBoruId = cikisBoru.pipe.id;
                    console.log(`    -> Sayaç çıkışı iç tesisata bağlandı (${cikisBoru.distance.toFixed(1)}cm)`);
                }

                // Sayaç panel alanlarını XML'den çek (top-level Ps; iç sketch'lere bakma)
                const glSayacTipi = parseInt(_topProp(sayacEl, 'GLSAYACTIPI')?.getAttribute('V') || '1', 10);
                const glAboneUnvan = _topProp(sayacEl, 'GLAboneUnvan')?.getAttribute('V') || '';
                const glAboneTesisatNo = _topProp(sayacEl, 'GLAboneTesisatNo')?.getAttribute('V') || '';
                const glAbonePoliceNo = _topProp(sayacEl, 'GLAbonePoliceNo')?.getAttribute('V') || '';
                const glKapiNoAdi = _topProp(sayacEl, 'GLAboneKapiNoAdi')?.getAttribute('V') || '';
                const glKullanimTipi = parseInt(_topProp(sayacEl, 'GLKULLANIMTIPI')?.getAttribute('V') || '1', 10);
                // Sayaç tipi mapping: 1→G4, 2→G6, 3→G10, 4→G16, 5→G25 (Gasline konvansiyonu)
                const sayacTipiStr = ({1:'G4',2:'G6',3:'G10',4:'G16',5:'G25',6:'G40'}[glSayacTipi]) || `G${glSayacTipi}`;
                // Panel seçenekleriyle (BIRIM_TIPLERI) birebir aynı string'ler kullanılmalı;
                // 'Konut'/'Dükkan' gibi farklı yazımlar debi hesabında (TİCARİ/KAZAN DAİRESİ
                // aritmetik modu) ve panelde eşleşmiyordu.
                const birimTipiStr = ({1:'KONUT',2:'TİCARİ',3:'KAZAN DAİRESİ',4:'OFİS',5:'KAZAN DAİRESİ'}[glKullanimTipi]) || 'KONUT';

                // Sayaç objesi oluştur (kanonik: fleksBaglanti mevcut kolon borusunu gösterir)
                const sayacData = {
                    id: sayacId,
                    type: 'sayac',
                    x: centerX,
                    y: centerY,
                    z: z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    // Panel alanları
                    sayacTipi: sayacTipiStr,
                    birimTipi: birimTipiStr,
                    birimNo: glKapiNoAdi || '',
                    aboneAdi: glAboneUnvan,
                    aboneNo: glAboneTesisatNo || glAbonePoliceNo,
                    fleksBaglanti: {
                        boruId: girisBoruId,          // Kolon borusunun kendisi
                        endpoint: girisEndpoint,      // Sayaca bakan uç
                        uzunluk: girisBoru
                            ? Math.max(15, Math.min(150, Math.round(girisBoru.distance)))
                            : 30
                    },
                    cikisBagliBoruId: cikisBoruId,    // İç tesisatın ilk borusu
                    iliskiliVanaId: null
                };

                state.plumbingBlocks.push(sayacData);
                console.log(`    -> Sayaç eklendi: (${centerX.toFixed(2)}, ${centerY.toFixed(2)})`);
            }
        } catch (e) {
            console.error("Sayaç işlenirken hata:", e, sayacEl);
        }
    });

    // 8.3. Vanalar (clsvana) - Boru bağlantılarını kur
    const vanaElements = xmlDoc.querySelectorAll("O[T='clsvana']");
    console.log(`\n${vanaElements.length} clsvana bulundu (tüm XML'de)`);

    vanaElements.forEach((vanaEl, idx) => {
        try {
            const originEl = _topProp(vanaEl, 'origin');
            const vanaTipiEl = _topProp(vanaEl, 'GLVANATIPI');
            const muhafazaEl = _topProp(vanaEl, 'GLMUHAFAZALI');
            const birimSayisiEl = _topProp(vanaEl, 'GLBIRIMSAYISI');
            const dukkanSayisiEl = _topProp(vanaEl, 'GLDUKKANSAYISI');
            const ekTuketimEl = _topProp(vanaEl, 'GLEKTUKETIM');
            const daireNoEl = _topProp(vanaEl, 'GLDAIRENO');

            if (originEl) {
                const originCoords = originEl.getAttribute('V').split(',').map(Number);
                const vanaPoint = {
                    x: originCoords[0] * SCALE,
                    y: -originCoords[1] * SCALE,
                    z: originCoords[2] ? originCoords[2] * SCALE : 0
                };

                // Vana içindeki metin satırları (Tip, DN, İZOLATIRLI vb.)
                const textEls = vanaEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLines = [];
                textEls.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLines.push(l)); });

                // Vana tipi mapping
                const xmlVanaTipi = vanaTipiEl ? parseInt(vanaTipiEl.getAttribute('V')) : 1;
                const muhafazali = muhafazaEl ? (muhafazaEl.getAttribute('V') === 'True') : false;
                const { tip: vanaTipi, izolator, muhafaza, ilerdeKullanim } = _mapVanaFromXML({
                    vanaTipiInt: xmlVanaTipi, textLines, muhafazali
                });

                const isSonlanma = (vanaTipi === 'BRANSMAN' || vanaTipi === 'YAN_BINA');

                // Boruya bağlan:
                //   Sonlanma vanaları hat UCUNDA durur → uç araması öncelikli.
                //   Ara vanalar borunun ortasında durabilir → gövde projeksiyonu öncelikli.
                const ucAday = findClosestPipeEnd(vanaPoint, state.plumbingPipes, 80);
                const govdeAday = findClosestPipeBody(vanaPoint, state.plumbingPipes, 50);

                let bagliBoruId = null;
                let boruPozisyonu = 0.5;
                let fromEnd = null;
                let fixedDistance = null;
                if (isSonlanma && ucAday) {
                    bagliBoruId = ucAday.pipe.id;
                    fromEnd = ucAday.end;
                    fixedDistance = 1; // sonlanma vanası uçtan 1cm içeride
                    boruPozisyonu = ucAday.end === 'p2' ? 1.0 : 0.0;
                } else if (govdeAday) {
                    bagliBoruId = govdeAday.pipe.id;
                    boruPozisyonu = govdeAday.t;
                } else if (ucAday) {
                    bagliBoruId = ucAday.pipe.id;
                    fromEnd = ucAday.end;
                    fixedDistance = isSonlanma ? 1 : 5;
                    boruPozisyonu = ucAday.end === 'p2' ? 1.0 : 0.0;
                }
                const yakinBoruObj = bagliBoruId
                    ? state.plumbingPipes.find(p => p.id === bagliBoruId)
                    : null;

                const vanaCap = _extractVanaCap(textLines);
                const birimNo = daireNoEl?.getAttribute('V') || _extractBirimNo(textLines) || '';

                const daireSayisi = birimSayisiEl ? parseInt(birimSayisiEl.getAttribute('V')) || 0 : 0;
                const dukkanSayisi = dukkanSayisiEl ? parseInt(dukkanSayisiEl.getAttribute('V')) || 0 : 0;

                // İlerde kullanım (Domestik): birim sayısı + tipi + otomatik birim no
                const ilerdeBirimSayisi = Math.max(1, daireSayisi + dukkanSayisi);
                const ilerdeBirimTipi = dukkanSayisi > 0 && daireSayisi === 0 ? 'TİCARİ' : 'KONUT';

                const vanaData = {
                    id: `vana_xml_${idx}_${Date.now()}`,
                    type: 'vana',
                    x: vanaPoint.x,
                    y: vanaPoint.y,
                    z: vanaPoint.z,
                    rotation: 0,
                    vanaTipi: vanaTipi,
                    floorId: state.currentFloor?.id,
                    bagliBoruId: bagliBoruId,
                    boruPozisyonu: boruPozisyonu,
                    fromEnd: fromEnd,
                    fixedDistance: fixedDistance,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    // Panel alanları
                    vanaCap: vanaCap,
                    izolator: izolator,
                    muhafaza: muhafaza,
                    muhafazaGrupla: false,
                    birimNo: ilerdeKullanim
                        ? `${ilerdeBirimSayisi} ${ilerdeBirimTipi === 'TİCARİ' ? 'dükkan' : 'daire'}`
                        : birimNo,
                    tesisatNo: '',
                    daireSayisi: daireSayisi,
                    dukkanSayisi: dukkanSayisi,
                    ekDebi: ekTuketimEl ? parseFloat(ekTuketimEl.getAttribute('V')) || 0 : 0,
                    // BRANSMAN vanaları: XML değeri varsa onu, yoksa 3.5 m³/h standart
                    bransmanDebi: vanaTipi === 'BRANSMAN'
                        ? ((ekTuketimEl && parseFloat(ekTuketimEl.getAttribute('V')) > 0)
                            ? parseFloat(ekTuketimEl.getAttribute('V'))
                            : 3.5)
                        : 0,
                    // İlerde kullanım (Domestik vana) alanları
                    ilerdeKullanim: !!ilerdeKullanim,
                    birimSayisi: ilerdeKullanim ? String(ilerdeBirimSayisi) : undefined,
                    birimTipi: ilerdeKullanim ? ilerdeBirimTipi : undefined
                };

                // Borunun vanaya bağlantısını kur
                if (yakinBoruObj) {
                    yakinBoruObj.uzerindekiElemanlar = yakinBoruObj.uzerindekiElemanlar || [];
                    yakinBoruObj.uzerindekiElemanlar.push({
                        tip: 'vana',
                        elemanId: vanaData.id,
                        pozisyon: boruPozisyonu
                    });
                }

                state.plumbingBlocks.push(vanaData);
                console.log(`    -> Vana eklendi: (${vanaPoint.x.toFixed(2)}, ${vanaPoint.y.toFixed(2)}) tip: ${vanaTipi}${ilerdeKullanim ? ' [ilerde kullanım]' : ''}`);
            }
        } catch (e) {
            console.error("Vana işlenirken hata:", e, vanaEl);
        }
    });

    // 8.3b. Selenoid Vanalar (clsselenoid) → SELENOID vana
    const selenoidElements = xmlDoc.querySelectorAll("O[T='clsselenoid']");
    console.log(`\n${selenoidElements.length} clsselenoid bulundu`);
    selenoidElements.forEach((el, idx) => {
        try {
            const originEl = _topProp(el, 'origin') || _topProp(el, 'StartPoint');
            if (!originEl) return;
            const c = originEl.getAttribute('V').split(',').map(Number);
            const p = { x: c[0] * SCALE, y: -c[1] * SCALE, z: (c[2] || 0) * SCALE };
            const yakin = findClosestPipeEnd(p, state.plumbingPipes, 80);
            const vanaData = {
                id: `vana_selenoid_xml_${idx}_${Date.now()}`,
                type: 'vana',
                x: p.x, y: p.y, z: p.z,
                rotation: 0,
                vanaTipi: 'SELENOID',
                floorId: state.currentFloor?.id,
                bagliBoruId: yakin ? yakin.pipe.id : null,
                boruPozisyonu: 0.5,
                fromEnd: null,
                fixedDistance: null,
                girisBagliBoruId: null,
                cikisBagliBoruId: null,
                showEndCap: false,
                vanaCap: null,
                izolator: false,
                muhafaza: false,
                muhafazaGrupla: false,
                birimNo: '',
                tesisatNo: '',
                daireSayisi: 0,
                dukkanSayisi: 0,
                ekDebi: 0,
                bransmanDebi: 0
            };
            if (yakin) {
                yakin.pipe.uzerindekiElemanlar = yakin.pipe.uzerindekiElemanlar || [];
                yakin.pipe.uzerindekiElemanlar.push({ tip: 'vana', elemanId: vanaData.id, pozisyon: 0.5 });
            }
            state.plumbingBlocks.push(vanaData);
            console.log(`    -> SELENOID vana eklendi: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
        } catch (e) { console.error("Selenoid işlenirken hata:", e, el); }
    });

    // 8.4. Kombiler (clskombi) - Boru bağlantılarını kur VE BACA EKLE
    const kombiElements = xmlDoc.querySelectorAll("O[T='clskombi']");
    console.log(`\n${kombiElements.length} clskombi bulundu (tüm XML'de)`);

    kombiElements.forEach((kombiEl, idx) => {
        try {
            // Top-level çocuk Ps — clskombi içinde DrawEntities altındaki sketch vdLine'lardan
            // yanlış StartPoint okumamak için.
            const startPointEl = _topProp(kombiEl, 'StartPoint') || _topProp(kombiEl, 'Origin') || _topProp(kombiEl, 'origin');

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const xmlCihazPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın boru ucunu bul
                const yakinBoru = findClosestPipeEnd(xmlCihazPoint, state.plumbingPipes, 50, true);

                // Cihaz XML'deki konumunda KALIR. (Önceki 40cm öteleme, baca ve vana
                // hizalarını bozuyordu; fleks uzunluğu gerçek mesafeden hesaplanır.)
                const cihazPoint = { ...xmlCihazPoint };
                let fleksUzunluk = 30;
                if (yakinBoru) {
                    fleksUzunluk = Math.max(10, Math.min(150, Math.round(yakinBoru.distance) || 30));
                }

                // Metin (marka/model/kapasite) parse et
                const textEls = kombiEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLines = [];
                textEls.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLines.push(l)); });
                const parsed = _parseCihazText(textLines);

                const cihazData = {
                    id: `cihaz_xml_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: 'KOMBI',
                    x: cihazPoint.x,
                    y: cihazPoint.y,
                    z: cihazPoint.z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: yakinBoru ? yakinBoru.pipe.id : null,
                        endpoint: yakinBoru ? yakinBoru.end : null,
                        uzunluk: fleksUzunluk
                    },
                    iliskiliVanaId: null,
                    // Panel alanları
                    marka: parsed.marka || '',
                    model: parsed.model || '',
                    bacaTipi: parsed.bacaTipi || 'Hermetik',
                    kapasiteKcal: parsed.kapasiteKcal || 0,
                    kapasiteKW: parsed.kapasiteKW || 0,
                    yogusmali: !!parsed.yogusmali,
                    verim: 100,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    yedekCihaz: false
                };

                // Borunun cihaza bağlantısını kur
                if (yakinBoru) {
                    if (yakinBoru.end === 'p1') {
                        yakinBoru.pipe.baslangicBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    } else {
                        yakinBoru.pipe.bitisBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    }
                    console.log(`    -> Kombi boruya bağlandı: ${yakinBoru.pipe.id.substring(0, 20)}... (${yakinBoru.end}, mesafe: ${yakinBoru.distance.toFixed(2)}, ${parsed.marka || '-'} ${parsed.model || '-'}, ${parsed.kapasiteKW || 0} kW)`);
                }

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Kombi eklendi: (${cihazPoint.x.toFixed(2)}, ${cihazPoint.y.toFixed(2)})`);
                // Not: Varsayılan baca OLUŞTURULMAZ. Gerçek baca elemanları (clshermetik/clsbaca)
                // ayrı adımda parse edilir ve cihaza bağlanır. Baca yoksa cihazın bacası olmaz.
            }
        } catch (e) {
            console.error("Kombi işlenirken hata:", e, kombiEl);
        }
    });

    // 8.5. Ocaklar (clsocak) + Şofbenler (clssofben) - Boru bağlantılarını kur
    const ocakElements = [
        ...Array.from(xmlDoc.querySelectorAll("O[T='clsocak']")).map(el => ({ el, cihazTip: 'OCAK' })),
        ...Array.from(xmlDoc.querySelectorAll("O[T='clssofben']")).map(el => ({ el, cihazTip: 'SOFBEN' }))
    ];
    console.log(`\n${ocakElements.length} clsocak/clssofben bulundu (tüm XML'de)`);

    ocakElements.forEach(({ el: ocakEl, cihazTip }, idx) => {
        try {
            // Top-level (doğrudan çocuk) P; iç sketch'leri yok say.
            const startPointEl = _topProp(ocakEl, 'StartPoint') || _topProp(ocakEl, 'Origin') || _topProp(ocakEl, 'origin');

            if (startPointEl) {
                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const xmlCihazPoint = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın boru ucunu bul
                const yakinBoru = findClosestPipeEnd(xmlCihazPoint, state.plumbingPipes, 50, true);

                // Cihaz XML'deki konumunda KALIR (bkz. kombi bloğundaki not).
                const cihazPoint = { ...xmlCihazPoint };
                let fleksUzunlukO = 30;
                if (yakinBoru) {
                    fleksUzunlukO = Math.max(10, Math.min(150, Math.round(yakinBoru.distance) || 30));
                }

                // Metin parse et (marka/model)
                const textElsO = ocakEl.querySelectorAll("O[T='vdMText'] P[F='TextString'], O[T='vdText'] P[F='TextString']");
                const textLinesO = [];
                textElsO.forEach(te => { _splitTextLines(te.getAttribute('V') || '').forEach(l => textLinesO.push(l)); });
                const parsedO = _parseCihazText(textLinesO);
                const verimEl = ocakEl.querySelector("P[F='GLVerim']");
                const verim = verimEl ? parseInt(verimEl.getAttribute('V'), 10) || 100 : 100;

                // Varsayılan kapasiteler (parse edilemediyse):
                //   OCAK   → TS standart 13200 kcal/h
                //   SOFBEN → ~18150 kcal/h (≈2.2 m³/h TS min şofben debisi)
                const defKcal = cihazTip === 'SOFBEN' ? 18150 : 13200;
                const cihazData = {
                    id: `cihaz_xml_${cihazTip.toLowerCase()}_${idx}_${Date.now()}`,
                    type: 'cihaz',
                    cihazTipi: cihazTip,
                    x: cihazPoint.x,
                    y: cihazPoint.y,
                    z: cihazPoint.z,
                    rotation: 0,
                    floorId: state.currentFloor?.id,
                    fleksBaglanti: {
                        boruId: yakinBoru ? yakinBoru.pipe.id : null,
                        endpoint: yakinBoru ? yakinBoru.end : null,
                        uzunluk: fleksUzunlukO
                    },
                    iliskiliVanaId: null,
                    // Panel alanları
                    marka: parsedO.marka || '',
                    model: parsedO.model || '',
                    bacaTipi: parsedO.bacaTipi || (cihazTip === 'SOFBEN' ? 'Hermetik' : 'Bacasız'),
                    kapasiteKcal: parsedO.kapasiteKcal || defKcal,
                    kapasiteKW: parsedO.kapasiteKW || parseFloat((defKcal / 860).toFixed(2)),
                    yogusmali: false,
                    verim: verim,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    yedekCihaz: false
                };

                // Borunun cihaza bağlantısını kur
                if (yakinBoru) {
                    if (yakinBoru.end === 'p1') {
                        yakinBoru.pipe.baslangicBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    } else {
                        yakinBoru.pipe.bitisBaglanti = {
                            tip: 'cihaz',
                            hedefId: cihazData.id,
                            baglananNokta: 'giris'
                        };
                    }
                    console.log(`    -> Ocak boruya bağlandı: ${yakinBoru.pipe.id.substring(0, 20)}... (${yakinBoru.end}, mesafe: ${yakinBoru.distance.toFixed(2)})`);
                }

                state.plumbingBlocks.push(cihazData);
                console.log(`    -> Ocak eklendi: (${cihazPoint.x.toFixed(2)}, ${cihazPoint.y.toFixed(2)}) ${parsedO.marka || '-'} ${parsedO.model || '-'} verim=${verim}%`);
            }
        } catch (e) {
            console.error("Ocak işlenirken hata:", e, ocakEl);
        }
    });

    // 8.5b. Hermetik baca (clshermetik) → baca bileşeni
    // Gasline hermetik bacayı ÇİFT PARALEL çizgi olarak çizer (koaksiyel boru temsili).
    // Bu iki çizgi ardışık segment DEĞİLDİR; merkez hatta (orta çizgi) indirgenmeli.
    // Ayrıca aynı cihazın birden fazla clshermetik run'ı (kat başına bir) TEK bacada birleşir.
    const hermetikElements = xmlDoc.querySelectorAll("O[T='clshermetik']");
    console.log(`\n${hermetikElements.length} clshermetik bulundu`);
    const _hermetikRunsByCihaz = new Map(); // cihazId → [{seg, dist}]
    hermetikElements.forEach((el, idx) => {
        try {
            const lineEls = el.querySelectorAll("O[T='vdLine']");
            const lines = [];
            lineEls.forEach(ln => {
                const sp = ln.querySelector("P[F='StartPoint']");
                const ep = ln.querySelector("P[F='EndPoint']");
                if (!sp || !ep) return;
                const s = sp.getAttribute('V').split(',').map(Number);
                const e2 = ep.getAttribute('V').split(',').map(Number);
                lines.push({
                    x1: s[0] * SCALE, y1: -s[1] * SCALE, z1: (s[2] || 0) * SCALE,
                    x2: e2[0] * SCALE, y2: -e2[1] * SCALE, z2: (e2[2] || 0) * SCALE
                });
            });
            if (lines.length === 0) return;

            // Çift çizgi → merkez hat. Çizgiler paralel/yakın-eş boyluysa ortala;
            // aksi hâlde ilk çizgiyi kullan (nadir durum).
            let seg;
            if (lines.length >= 2) {
                const a = lines[0], b = lines[1];
                // b'nin yönü a ile aynı mı? (başlangıçlar birbirine daha yakın olmalı)
                const dSS = Math.hypot(a.x1 - b.x1, a.y1 - b.y1);
                const dSE = Math.hypot(a.x1 - b.x2, a.y1 - b.y2);
                const b2 = dSS <= dSE ? b : { x1: b.x2, y1: b.y2, z1: b.z2, x2: b.x1, y2: b.y1, z2: b.z1 };
                seg = {
                    x1: (a.x1 + b2.x1) / 2, y1: (a.y1 + b2.y1) / 2, z1: (a.z1 + b2.z1) / 2,
                    x2: (a.x2 + b2.x2) / 2, y2: (a.y2 + b2.y2) / 2, z2: (a.z2 + b2.z2) / 2
                };
            } else {
                seg = lines[0];
            }

            // En yakın cihazı bul (segment başı VEYA sonu — run yönü belirsiz olabilir)
            let best = null, bestD = 200, flip = false;
            for (const b of state.plumbingBlocks) {
                if (b.type !== 'cihaz') continue;
                const d1 = Math.hypot(b.x - seg.x1, b.y - seg.y1);
                const d2 = Math.hypot(b.x - seg.x2, b.y - seg.y2);
                const d = Math.min(d1, d2);
                if (d < bestD) { bestD = d; best = b; flip = d2 < d1; }
            }
            if (!best) return;
            if (flip) {
                seg = { x1: seg.x2, y1: seg.y2, z1: seg.z2, x2: seg.x1, y2: seg.y1, z2: seg.z1 };
            }

            if (!_hermetikRunsByCihaz.has(best.id)) _hermetikRunsByCihaz.set(best.id, { cihaz: best, segs: [] });
            _hermetikRunsByCihaz.get(best.id).segs.push(seg);
        } catch (e) { console.error('Hermetik baca hatası:', e, el); }
    });

    _hermetikRunsByCihaz.forEach(({ cihaz, segs }) => {
        // Run'ları yükselen Z sırasına diz (kat kat yükselen baca)
        segs.sort((s1, s2) => (s1.z1 - s2.z1) || (s1.y1 - s2.y1));
        const first = segs[0];
        const last = segs[segs.length - 1];
        const bacaData = {
            id: `baca_hermetik_xml_${cihaz.id}_${Date.now()}`,
            type: 'baca',
            parentCihazId: cihaz.id,
            floorId: cihaz.floorId,
            startX: first.x1, startY: first.y1,
            z: first.z1,
            segments: segs,
            isDrawing: false,
            currentSegmentStart: { x: last.x2, y: last.y2, z: last.z2 },
            havalandirma: {
                x: last.x2, y: last.y2,
                width: 10, height: 30,
                angle: Math.atan2(last.y2 - last.y1, last.x2 - last.x1)
            }
        };
        state.plumbingBlocks.push(bacaData);
        cihaz.bacaTipi = 'Hermetik';
        console.log(`    -> Hermetik baca eklendi (cihaz ${cihaz.cihazTipi}): ${segs.length} run birleştirildi`);
    });

    // 8.6. Bacaları (clsbaca veya benzeri) parse et ve cihazlara bağla
    // NOT: XML'de baca elemanları olabilir, eğer varsa parse edilmeli
    const bacaElements = xmlDoc.querySelectorAll("O[T='clsbaca']");
    console.log(`\n${bacaElements.length} clsbaca bulundu (tüm XML'de)`);

    // Eğer XML'de baca elemanları varsa parse et
    if (bacaElements.length > 0) {
        bacaElements.forEach((bacaEl, idx) => {
            console.log(`  -> Baca ${idx} işleniyor...`);
            try {
                // Baca başlangıç noktası
                const startPointEl = bacaEl.querySelector("P[F='StartPoint']");
                if (!startPointEl) return;

                const startCoords = startPointEl.getAttribute('V').split(',').map(Number);
                const bacaBaslangic = {
                    x: startCoords[0] * SCALE,
                    y: -startCoords[1] * SCALE,
                    z: startCoords[2] ? startCoords[2] * SCALE : 0
                };

                // En yakın cihazı bul (50cm tolerans)
                let enYakinCihaz = null;
                let minDistance = 50;

                for (const block of state.plumbingBlocks) {
                    if (block.type === 'cihaz') {
                        const distance = Math.hypot(
                            bacaBaslangic.x - block.x,
                            bacaBaslangic.y - block.y
                        );

                        if (distance < minDistance) {
                            minDistance = distance;
                            enYakinCihaz = block;
                        }
                    }
                }

                if (!enYakinCihaz) {
                    console.warn(`  -> Baca için yakın cihaz bulunamadı`);
                    return;
                }

                // Baca segment'lerini parse et (vdLine veya başka elemanlardan)
                const segments = [];
                const lineElements = bacaEl.querySelectorAll("O[T='vdLine']");

                if (lineElements.length > 0) {
                    lineElements.forEach(lineEl => {
                        const startPtEl = lineEl.querySelector("P[F='StartPoint']");
                        const endPtEl = lineEl.querySelector("P[F='EndPoint']");

                        if (startPtEl && endPtEl) {
                            const start = startPtEl.getAttribute('V').split(',').map(Number);
                            const end = endPtEl.getAttribute('V').split(',').map(Number);

                            segments.push({
                                x1: start[0] * SCALE,
                                y1: -start[1] * SCALE,
                                z1: start[2] ? start[2] * SCALE : 0,
                                x2: end[0] * SCALE,
                                y2: -end[1] * SCALE,
                                z2: end[2] ? end[2] * SCALE : 0
                            });
                        }
                    });
                }

                // Eğer segment yoksa basit dikey baca oluştur
                if (segments.length === 0) {
                    segments.push({
                        x1: bacaBaslangic.x,
                        y1: bacaBaslangic.y,
                        z1: bacaBaslangic.z,
                        x2: bacaBaslangic.x,
                        y2: bacaBaslangic.y - 100, // 100cm yukarı
                        z2: bacaBaslangic.z
                    });
                }

                // Son segment ucunu bul (havalandırma için)
                const sonSegment = segments[segments.length - 1];
                const sonUc = { x: sonSegment.x2, y: sonSegment.y2 };

                // Baca objesi oluştur
                const bacaData = {
                    id: `baca_xml_${idx}_${Date.now()}`,
                    type: 'baca',
                    parentCihazId: enYakinCihaz.id,
                    floorId: state.currentFloor?.id,
                    startX: bacaBaslangic.x,
                    startY: bacaBaslangic.y,
                    z: bacaBaslangic.z,
                    segments: segments,
                    isDrawing: false,
                    currentSegmentStart: {
                        x: sonUc.x,
                        y: sonUc.y,
                        z: sonSegment.z2
                    },
                    havalandirma: {
                        x: sonUc.x,
                        y: sonUc.y,
                        width: 10,
                        height: 30,
                        angle: Math.atan2(sonSegment.y2 - sonSegment.y1, sonSegment.x2 - sonSegment.x1)
                    }
                };

                state.plumbingBlocks.push(bacaData);
                console.log(`    -> Baca eklendi: ${segments.length} segment, cihaz: ${enYakinCihaz.cihazTipi}`);
            } catch (e) {
                console.error("Baca işlenirken hata:", e, bacaEl);
            }
        });
    } else {
        console.log("  -> XML'de ayrı baca elemanı yok, otomatik bacalar oluşturuldu");
    }

    console.log("=========================================\n");

    // --- 8.6a2. SAYAÇ YÖN DOĞRULAMA: bazı gasline çizimlerinde (özellikle tadilat)
    // clssayac StartPoint/EndPoint anlamı terstir. Kural: CİHAZLAR sayaç SONRASINDA
    // olmalıdır. Giriş tarafındaki bileşende cihaz var ve çıkış tarafında yoksa
    // giriş/çıkış atamalarını takas et. Bileşen taraması 1cm sıkı uç eşleşmesiyle
    // yapılır ve bileşen-bağlı (sayac/cihaz/kutu) uçlardan geçmez.
    try {
        const STRICT = 1; // cm
        const _reserved = new Set(['sayac', 'cihaz', 'servis_kutusu']);
        const _sideComponent = (startPipe) => {
            const compIds = new Set([startPipe.id]);
            const q2 = [startPipe];
            while (q2.length) {
                const cur = q2.shift();
                for (const end of ['p1', 'p2']) {
                    const bag = end === 'p1' ? cur.baslangicBaglanti : cur.bitisBaglanti;
                    if (_reserved.has(bag?.tip)) continue; // sayaç/cihaz ucundan geçme
                    const pt = cur[end];
                    for (const o of state.plumbingPipes) {
                        if (compIds.has(o.id)) continue;
                        for (const oe of ['p1', 'p2']) {
                            const obag = oe === 'p1' ? o.baslangicBaglanti : o.bitisBaglanti;
                            if (_reserved.has(obag?.tip)) continue;
                            const op = o[oe];
                            if (Math.hypot(pt.x - op.x, pt.y - op.y, (pt.z||0) - (op.z||0)) <= STRICT) {
                                compIds.add(o.id);
                                q2.push(o);
                                break;
                            }
                        }
                    }
                }
            }
            return compIds;
        };
        const _deviceCountIn = (compIds) => {
            let n = 0;
            state.plumbingBlocks.forEach(b => {
                if (b.type === 'cihaz' && b.fleksBaglanti?.boruId && compIds.has(b.fleksBaglanti.boruId)) n++;
            });
            state.plumbingPipes.forEach(p => {
                if (!compIds.has(p.id)) return;
                if (p.baslangicBaglanti?.tip === 'cihaz' || p.bitisBaglanti?.tip === 'cihaz') n++;
            });
            return n;
        };

        state.plumbingBlocks.filter(b => b.type === 'sayac').forEach(sayac => {
            const gPipe = sayac.fleksBaglanti?.boruId
                ? state.plumbingPipes.find(p => p.id === sayac.fleksBaglanti.boruId) : null;
            const cPipe = sayac.cikisBagliBoruId
                ? state.plumbingPipes.find(p => p.id === sayac.cikisBagliBoruId) : null;
            if (!gPipe || !cPipe) return;

            const gComp = _sideComponent(gPipe);
            const cComp = _sideComponent(cPipe);
            const gDev = _deviceCountIn(gComp);
            const cDev = _deviceCountIn(cComp);
            if (!(gDev > 0 && cDev === 0)) return; // normal durum — dokunma

            console.log(`    -> Sayaç yön düzeltme: giriş tarafında ${gDev} cihaz var, çıkışta yok → giriş/çıkış takas ediliyor`);

            // Eski çıkış borusu (cPipe, p1'i sayaçta) → yeni GİRİŞ
            cPipe.baslangicBaglanti = { tip: 'sayac', hedefId: sayac.id, baglananNokta: 'giris' };
            const oldUzunluk = sayac.fleksBaglanti?.uzunluk || 30;
            sayac.fleksBaglanti = { boruId: cPipe.id, endpoint: 'p1', uzunluk: oldUzunluk };

            // Eski giriş borusu (gPipe) → yeni ÇIKIŞ (bag'li ucu p1 yap)
            const gEnd = gPipe.baslangicBaglanti?.tip === 'sayac' ? 'p1'
                : gPipe.bitisBaglanti?.tip === 'sayac' ? 'p2' : null;
            if (gEnd === 'p2') {
                [gPipe.p1, gPipe.p2] = [gPipe.p2, gPipe.p1];
                const tmp = gPipe.baslangicBaglanti;
                gPipe.baslangicBaglanti = gPipe.bitisBaglanti;
                gPipe.bitisBaglanti = tmp;
            }
            gPipe.baslangicBaglanti = { tip: 'sayac', hedefId: sayac.id, baglananNokta: 'cikis' };
            sayac.cikisBagliBoruId = gPipe.id;
        });
    } catch (e) {
        console.warn('Sayaç yön doğrulama hatası:', e);
    }

    // --- 8.6b. BORU AĞINI BAĞLA: uç-uç eşleştirmesiyle baslangicBaglanti zincirini kur
    // Bu adım, computePipeDebileri'nin sayaç→cihaz BFS'inin tüm hatlara erişmesini
    // sağlar; aksi halde XML'den null bağlantılarla gelen borular debi propagasyonunu
    // kıracak ve tüm hatlar 0.00 görünecektir.
    try {
        _linkPipeNetwork(state.plumbingPipes);
        console.log('  -> Boru ağı uçlardan birbirine bağlandı (debi propagasyonu için)');
    } catch (e) {
        console.warn('Boru ağ bağlama hatası:', e);
    }

    // --- 8.6b2. RECONCILIATION: _linkPipeNetwork yön normalizasyonu sırasında
    // boruların p1/p2'si takas edilebilir. Bağlantı bag'leri takasla birlikte taşınır
    // ama bileşenlerdeki İSİM bazlı referanslar (fleksBaglanti.endpoint, vana fromEnd,
    // boruPozisyonu) bayatlar. Geometriden yeniden hesapla.
    try {
        const pipeById = new Map(state.plumbingPipes.map(p => [p.id, p]));
        const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

        state.plumbingBlocks.forEach(b => {
            // Sayaç/cihaz fleks ucu: borunun bileşene yakın olan ucu
            if ((b.type === 'sayac' || b.type === 'cihaz') && b.fleksBaglanti?.boruId) {
                const p = pipeById.get(b.fleksBaglanti.boruId);
                if (p?.p1 && p?.p2) {
                    const me = { x: b.x, y: b.y, z: b.z || 0 };
                    b.fleksBaglanti.endpoint = dist3(me, p.p1) <= dist3(me, p.p2) ? 'p1' : 'p2';
                }
            }

            // Vana: pozisyonu boruya projeksiyon ile yeniden hesapla
            if (b.type === 'vana' && b.bagliBoruId) {
                const p = pipeById.get(b.bagliBoruId);
                if (!p?.p1 || !p?.p2) return;
                const dx = p.p2.x - p.p1.x, dy = p.p2.y - p.p1.y, dz = (p.p2.z || 0) - (p.p1.z || 0);
                const len = Math.hypot(dx, dy, dz);
                if (len < 0.1) return;

                if (b.fromEnd && b.fixedDistance != null) {
                    // Uca sabit vana (sonlanma/uç vanası): ucu geometriden yeniden seç,
                    // vanayı o uçtan fixedDistance içeriye yerleştir.
                    const me = { x: b.x, y: b.y, z: b.z || 0 };
                    b.fromEnd = dist3(me, p.p1) <= dist3(me, p.p2) ? 'p1' : 'p2';
                    const fd = Math.max(0.5, b.fixedDistance);
                    const t = b.fromEnd === 'p1'
                        ? Math.min(fd / len, 0.95)
                        : Math.max(1 - fd / len, 0.05);
                    b.boruPozisyonu = t;
                    b.x = p.p1.x + t * dx;
                    b.y = p.p1.y + t * dy;
                    b.z = (p.p1.z || 0) + t * dz;
                } else {
                    // Ara vana: XML konumunu boruya projeksiyon yap
                    let t = ((b.x - p.p1.x) * dx + (b.y - p.p1.y) * dy + ((b.z || 0) - (p.p1.z || 0)) * dz) / (len * len);
                    t = Math.max(0.02, Math.min(0.98, t));
                    b.boruPozisyonu = t;
                }
            }
        });
        console.log('  -> Bileşen bağlantı uçları geometriden yeniden hesaplandı (reconciliation)');
    } catch (e) {
        console.warn('Reconciliation hatası:', e);
    }

    // --- 8.6c. OTOMATİK SERVİS KUTUSU: gasline XML'inde clsservis tag'i yok; kullanıcı
    // tercihine göre kolon zincirinin en alttaki açık ucuna otomatik servis kutusu konur
    // ve o boru kutuya bağlanır. Böylece pre-meter zincir bir kaynaktan beslenmiş olur.
    try {
        if (!(state.plumbingBlocks || []).some(b => b.type === 'servis_kutusu')) {
            // Sayaç SONRASI (iç tesisat) borular aday olamaz — kutu daima pre-meter uçtadır.
            const _childrenOfSK = new Map();
            (state.plumbingPipes || []).forEach(p => {
                const bag = p.baslangicBaglanti;
                if (bag?.tip === 'boru' && bag.hedefId) {
                    if (!_childrenOfSK.has(bag.hedefId)) _childrenOfSK.set(bag.hedefId, []);
                    _childrenOfSK.get(bag.hedefId).push(p.id);
                }
            });
            const _postMeterIds = new Set();
            (state.plumbingBlocks || []).forEach(c => {
                if (c.type !== 'sayac' || !c.cikisBagliBoruId) return;
                const q3 = [c.cikisBagliBoruId];
                while (q3.length) {
                    const id = q3.shift();
                    if (_postMeterIds.has(id)) continue;
                    _postMeterIds.add(id);
                    (_childrenOfSK.get(id) || []).forEach(k => q3.push(k));
                }
            });

            let lowest = null; // {pipe, endpoint, z, x, y}
            (state.plumbingPipes || []).forEach(pipe => {
                if (_postMeterIds.has(pipe.id)) return;
                [
                    { end: 'p1', bag: pipe.baslangicBaglanti, pt: pipe.p1 },
                    { end: 'p2', bag: pipe.bitisBaglanti,     pt: pipe.p2 }
                ].forEach(({ end, bag, pt }) => {
                    if (!pt) return;
                    if (bag && bag.tip) return; // serbest uç değil
                    const z = pt.z || 0;
                    if (!lowest || z < lowest.z) {
                        lowest = { pipe, endpoint: end, z, x: pt.x, y: pt.y };
                    }
                });
            });

            if (lowest) {
                const kutuId = `servis_kutusu_xml_${Date.now()}`;
                const kutuData = {
                    id: kutuId,
                    type: 'servis_kutusu',
                    x: lowest.x, y: lowest.y, z: lowest.z,
                    rotation: 0,
                    floorId: null, // post-pass'te Z'ye göre atanır
                    cikisYonu: 'sag',
                    bagliBoruId: lowest.pipe.id,
                    cikisKullanildi: true,
                    kutuTipi: 'S.K.',
                    kutuBasinc: 21,
                    cikisCap: lowest.pipe.boruCap || 'DN25',
                    kutuBoruTipi: 'KAYNAKLI',
                    kutuBaglantiTipi: 'KAYNAK',
                    description: ''
                };
                const bagSet = { tip: 'servis_kutusu', hedefId: kutuId, baglananNokta: 'cikis' };
                if (lowest.endpoint === 'p1') lowest.pipe.baslangicBaglanti = bagSet;
                else                          lowest.pipe.bitisBaglanti     = bagSet;
                state.plumbingBlocks.push(kutuData);
                console.log(`  -> Otomatik servis kutusu: (${lowest.x.toFixed(2)}, ${lowest.y.toFixed(2)}, z=${lowest.z.toFixed(2)})`);
            }
        }
    } catch (e) {
        console.warn('Otomatik servis kutusu hatası:', e);
    }

    // --- 8.7. KAT YÖNETİMİ: Z kotlarından katları tespit et ve floorId ata ---
    try {
        const zPool = [];
        // Yatay borular: kot değeri = Z (p1.z ≈ p2.z). Her yatay boruyu zPool'a ekle.
        state.plumbingPipes.forEach(p => {
            const z1 = p.p1?.z || 0, z2 = p.p2?.z || 0;
            if (Math.abs(z1 - z2) < 20) {
                zPool.push((z1 + z2) / 2);
            }
        });
        // Bileşenler (sayaç, vana, cihaz, servis kutusu, baca) kat belirleyici
        state.plumbingBlocks.forEach(b => { if (b.z != null) zPool.push(b.z); });

        const newFloors = _ensureFloorsFromZValues(zPool, state.floors || []);
        if (newFloors && newFloors.length >= 1) {
            // currentFloor: ilk GÖRÜNÜR (yani projenin gerçekten başladığı) kat olsun.
            const firstVisible = newFloors.find(f => f.visible !== false) || newFloors[0];
            setState({ floors: newFloors, currentFloor: firstVisible });
            console.log(`\n=== KATLAR OLUŞTURULDU: ${newFloors.length} kat ===`);
            newFloors.forEach(f => console.log(`  ${f.name}: ${f.bottomElevation} - ${f.topElevation} cm  [${f.visible === false ? 'GİZLİ' : 'görünür'}]`));
        }

        const activeFloors = (state.floors || []).filter(f => !f.isPlaceholder);
        if (activeFloors.length >= 1) {
            // Borulara: kendi Z'sinin ortalamasına göre floorId
            state.plumbingPipes.forEach(p => {
                const zMid = ((p.p1?.z || 0) + (p.p2?.z || 0)) / 2;
                const fid = _findFloorIdForZ(zMid, activeFloors);
                if (fid) p.floorId = fid;
            });
            // Bileşenlere
            state.plumbingBlocks.forEach(b => {
                const fid = _findFloorIdForZ(b.z || 0, activeFloors);
                if (fid) b.floorId = fid;
            });

            // Mimari: walls/rooms _srcZ'ye göre kendi katlarına dağıtılır.
            // Birden fazla benzersiz Z varsa XML zaten multi-floor mimari içeriyor → klonlama YAPMA.
            const wallSrcZs = new Set((state.walls || []).map(w => Math.round(w._srcZ ?? -1e9)));
            wallSrcZs.delete(-1e9);
            const hasMultiFloorArch = wallSrcZs.size > 1;

            const projectFloor = (state.currentFloor && activeFloors.find(f => f.id === state.currentFloor.id))
                || activeFloors.find(f => f.visible !== false)
                || activeFloors[0];
            const projectFloorId = projectFloor.id;

            (state.walls || []).forEach(w => {
                const z = w._srcZ;
                w.floorId = (z != null)
                    ? (_findFloorIdForZ(z, activeFloors) || projectFloorId)
                    : projectFloorId;
            });
            (state.rooms || []).forEach(r => {
                const z = r._srcZ;
                r.floorId = (z != null)
                    ? (_findFloorIdForZ(z, activeFloors) || projectFloorId)
                    : projectFloorId;
            });
            // Kolon/kiriş/merdiven Z bilgisi import edilmiyor → projeye ata; multi-floor durumda
            // kloncuyu atlayacağız, dolayısıyla bunlar tek katta kalır (kullanıcı isterse ekler).
            (state.columns || []).forEach(c => { c.floorId = projectFloorId; });
            (state.beams || []).forEach(b => { b.floorId = projectFloorId; });
            (state.stairs || []).forEach(s => { s.floorId = projectFloorId; });
            (state.doors || []).forEach(d => {
                if (d.wall?.floorId) d.floorId = d.wall.floorId;
                else d.floorId = projectFloorId;
            });
            console.log(`  -> Mimari: ${state.walls.length} duvar, ${state.rooms.length} oda ${hasMultiFloorArch ? `${wallSrcZs.size} kata dağıtıldı (XML multi-floor)` : `"${projectFloor.name}" katına atandı (tek kat)`}`);

            // --- MİMARİ KLONLAMA (yalnızca XML tek-kat mimari verdiyse) ---
            // Gasline çoklu-kat dosyalarında walls zaten Z'ye göre dağıtıldı; klonlama
            // ek/yanlış katlara aynı mimariyi basıp döngüsel çakışma yaratır.
            const visibleFloors = activeFloors.filter(f => f.visible !== false && f.id !== projectFloorId);
            if (!hasMultiFloorArch && visibleFloors.length > 0) {
                const sourceWalls = (state.walls || []).filter(w => w.floorId === projectFloorId);
                const sourceRooms = (state.rooms || []).filter(r => r.floorId === projectFloorId);
                const sourceColumns = (state.columns || []).filter(c => c.floorId === projectFloorId);
                const sourceBeams = (state.beams || []).filter(b => b.floorId === projectFloorId);
                const sourceStairs = (state.stairs || []).filter(s => s.floorId === projectFloorId);
                const sourceDoors = (state.doors || []).filter(d => d.wall && d.wall.floorId === projectFloorId);

                visibleFloors.forEach(tf => {
                    const tfId = tf.id;
                    const nodeMap = new Map();
                    const wallMap = new Map(); // sourceWall -> newWall

                    sourceWalls.forEach(sw => {
                        const k1 = `${sw.p1.x},${sw.p1.y}`;
                        const k2 = `${sw.p2.x},${sw.p2.y}`;
                        let p1 = nodeMap.get(k1);
                        if (!p1) { p1 = { x: sw.p1.x, y: sw.p1.y }; nodeMap.set(k1, p1); }
                        let p2 = nodeMap.get(k2);
                        if (!p2) { p2 = { x: sw.p2.x, y: sw.p2.y }; nodeMap.set(k2, p2); }
                        const nw = {
                            type: 'wall', p1, p2,
                            thickness: sw.thickness,
                            wallType: sw.wallType || 'normal',
                            windows: sw.windows ? JSON.parse(JSON.stringify(sw.windows)) : [],
                            vents: sw.vents ? JSON.parse(JSON.stringify(sw.vents)) : [],
                            floorId: tfId
                        };
                        state.walls.push(nw);
                        wallMap.set(sw, nw);
                    });
                    nodeMap.forEach(n => { if (!state.nodes.includes(n)) state.nodes.push(n); });

                    sourceDoors.forEach(sd => {
                        const nw = wallMap.get(sd.wall);
                        if (!nw) return;
                        state.doors.push({ ...sd, wall: nw, floorId: tfId });
                    });

                    sourceColumns.forEach(sc => {
                        state.columns.push({ ...sc, center: sc.center ? { ...sc.center } : sc.center, floorId: tfId });
                    });
                    sourceBeams.forEach(sb => {
                        state.beams.push({ ...sb, center: sb.center ? { ...sb.center } : sb.center, floorId: tfId });
                    });
                    sourceStairs.forEach(ss => {
                        state.stairs.push({
                            ...ss,
                            center: ss.center ? { ...ss.center } : ss.center,
                            id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                            connectedStairId: null,
                            floorId: tfId
                        });
                    });
                    sourceRooms.forEach(sr => {
                        state.rooms.push({
                            ...sr,
                            center: sr.center ? [...sr.center] : sr.center,
                            centerOffset: sr.centerOffset ? { ...sr.centerOffset } : sr.centerOffset,
                            polygon: sr.polygon ? JSON.parse(JSON.stringify(sr.polygon)) : sr.polygon,
                            vertices: sr.vertices ? sr.vertices.map(v => ({ ...v })) : sr.vertices,
                            floorId: tfId
                        });
                    });
                });
                console.log(`  -> Mimari ${visibleFloors.length} ek görünür kata da klonlandı`);
            }
        }
    } catch (e) {
        console.warn('Kat tespiti hatası:', e);
    }

    // --- 8.8a. CİHAZ VANASI: Her kombi/ocak için CIHAZ vanası ilişkilendir/oluştur ---
    try {
        const cihazlar = state.plumbingBlocks.filter(b => b.type === 'cihaz');
        cihazlar.forEach((cihaz, i) => {
            if (cihaz.iliskiliVanaId) return;
            const fleksBoruId = cihaz.fleksBaglanti?.boruId;
            let candidate = null;
            if (fleksBoruId) {
                candidate = state.plumbingBlocks.find(b =>
                    b.type === 'vana' && b.bagliBoruId === fleksBoruId
                );
            }
            if (!candidate) {
                let bestD = 80;
                state.plumbingBlocks.forEach(b => {
                    if (b.type !== 'vana') return;
                    const d = Math.hypot(b.x - cihaz.x, b.y - cihaz.y);
                    if (d < bestD) { bestD = d; candidate = b; }
                });
            }
            if (candidate) {
                // Mevcut vanayı CIHAZ olarak işaretle (sonlanma vanaları korunur)
                if (!['EMNIYET', 'SELENOID', 'SISMIK', 'BRANSMAN', 'YAN_BINA'].includes(candidate.vanaTipi)) {
                    candidate.vanaTipi = 'CIHAZ';
                }
                cihaz.iliskiliVanaId = candidate.id;
            } else {
                // Vana, cihazın bağlı olduğu borunun UCUNDAN 5cm içeriye yerleştirilir
                // (elle yerleştirme davranışıyla aynı: handleCihazEkleme).
                const fleksBoru = fleksBoruId ? state.plumbingPipes.find(p => p.id === fleksBoruId) : null;
                const endpoint = cihaz.fleksBaglanti?.endpoint || 'p2';
                let vx = cihaz.x, vy = cihaz.y + 20, vz = cihaz.z || 0, vt = 0.9;
                if (fleksBoru?.p1 && fleksBoru?.p2) {
                    const dx = fleksBoru.p2.x - fleksBoru.p1.x;
                    const dy = fleksBoru.p2.y - fleksBoru.p1.y;
                    const dz = (fleksBoru.p2.z || 0) - (fleksBoru.p1.z || 0);
                    const len = Math.hypot(dx, dy, dz);
                    if (len > 1) {
                        vt = endpoint === 'p1'
                            ? Math.min(5 / len, 0.95)
                            : Math.max(1 - 5 / len, 0.05);
                        vx = fleksBoru.p1.x + vt * dx;
                        vy = fleksBoru.p1.y + vt * dy;
                        vz = (fleksBoru.p1.z || 0) + vt * dz;
                    }
                }
                const vanaId = `vana_auto_cihaz_${i}_${Date.now()}`;
                const vanaData = {
                    id: vanaId,
                    type: 'vana',
                    x: vx, y: vy, z: vz,
                    rotation: 0,
                    vanaTipi: 'CIHAZ',
                    floorId: cihaz.floorId,
                    bagliBoruId: fleksBoruId || null,
                    boruPozisyonu: vt,
                    fromEnd: endpoint,
                    fixedDistance: 5,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    vanaCap: null,
                    izolator: false,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    birimNo: '', tesisatNo: '',
                    daireSayisi: 0, dukkanSayisi: 0, ekDebi: 0, bransmanDebi: 0
                };
                state.plumbingBlocks.push(vanaData);
                cihaz.iliskiliVanaId = vanaId;
                console.log(`    -> Cihaz (${cihaz.cihazTipi}) için otomatik CIHAZ vanası eklendi`);
            }
        });
    } catch (e) { console.warn('Cihaz vana entegrasyonu hatası:', e); }

    // --- 8.8. SAYAÇ ENTEGRASYONU: Her sayaca bir CIHAZ vanası ilişkilendir ---
    // XML'de ayrı vana varsa en yakınını iliskiliVanaId olarak bağla, yoksa oluştur.
    try {
        const sayaclar = state.plumbingBlocks.filter(b => b.type === 'sayac');
        sayaclar.forEach((sayac, i) => {
            if (sayac.iliskiliVanaId) return;
            // Sayacın giriş fleks borusuna bağlı bir vana var mı?
            const girisBoruId = sayac.fleksBaglanti?.boruId;
            let candidate = null;
            if (girisBoruId) {
                candidate = state.plumbingBlocks.find(b =>
                    b.type === 'vana' && b.bagliBoruId === girisBoruId
                );
            }
            // Yoksa pozisyon bazlı en yakını dene (50cm)
            if (!candidate) {
                let bestD = 80;
                state.plumbingBlocks.forEach(b => {
                    if (b.type !== 'vana') return;
                    const d = Math.hypot((b.x - sayac.x), (b.y - sayac.y));
                    if (d < bestD) { bestD = d; candidate = b; }
                });
            }
            if (candidate) {
                sayac.iliskiliVanaId = candidate.id;
                // Sayaç vanası EMNIYET'tir (elle yerleştirmede BRANSMAN → EMNIYET dönüşür)
                if (candidate.vanaTipi === 'BRANSMAN') {
                    if (candidate.birimNo && !sayac.birimNo) sayac.birimNo = candidate.birimNo;
                    candidate.vanaTipi = 'EMNIYET';
                } else if (!['EMNIYET', 'SELENOID', 'SISMIK', 'YAN_BINA'].includes(candidate.vanaTipi)) {
                    candidate.vanaTipi = 'EMNIYET';
                }
            } else {
                // Sayacın giriş borusunun ucundan 5cm içeriye EMNIYET vanası ekle
                // (elle yerleştirme davranışıyla aynı: handleSayacEkleme → EMNIYET).
                const girisBoru = sayac.fleksBaglanti?.boruId
                    ? state.plumbingPipes.find(p => p.id === sayac.fleksBaglanti.boruId)
                    : null;
                const endpoint = sayac.fleksBaglanti?.endpoint || 'p2';
                let vx = sayac.x - 18, vy = sayac.y - 20, vz = sayac.z || 0, vt = 0.9;
                if (girisBoru?.p1 && girisBoru?.p2) {
                    const dx = girisBoru.p2.x - girisBoru.p1.x;
                    const dy = girisBoru.p2.y - girisBoru.p1.y;
                    const dz = (girisBoru.p2.z || 0) - (girisBoru.p1.z || 0);
                    const len = Math.hypot(dx, dy, dz);
                    if (len > 1) {
                        vt = endpoint === 'p1'
                            ? Math.min(5 / len, 0.95)
                            : Math.max(1 - 5 / len, 0.05);
                        vx = girisBoru.p1.x + vt * dx;
                        vy = girisBoru.p1.y + vt * dy;
                        vz = (girisBoru.p1.z || 0) + vt * dz;
                    }
                }
                const vanaId = `vana_auto_sayac_${i}_${Date.now()}`;
                const vanaData = {
                    id: vanaId,
                    type: 'vana',
                    x: vx, y: vy, z: vz,
                    rotation: 0,
                    vanaTipi: 'EMNIYET',
                    floorId: sayac.floorId,
                    bagliBoruId: sayac.fleksBaglanti?.boruId || null,
                    boruPozisyonu: vt,
                    fromEnd: girisBoru ? endpoint : null,
                    fixedDistance: girisBoru ? 5 : null,
                    girisBagliBoruId: null,
                    cikisBagliBoruId: null,
                    showEndCap: false,
                    vanaCap: null,
                    izolator: false,
                    muhafaza: false,
                    muhafazaGrupla: false,
                    birimNo: sayac.birimNo || '',
                    tesisatNo: '',
                    daireSayisi: 0,
                    dukkanSayisi: 0,
                    ekDebi: 0,
                    bransmanDebi: 0
                };
                state.plumbingBlocks.push(vanaData);
                sayac.iliskiliVanaId = vanaId;
                console.log(`    -> Sayaç için otomatik EMNIYET vanası eklendi: ${sayac.birimNo || sayac.aboneAdi || sayac.id}`);
            }
        });
    } catch (e) {
        console.warn('Sayaç vana entegrasyonu hatası:', e);
    }

    // 9. Son işlemler
    console.log("\n=== İMPORT ÖZETİ ===");
    console.log(`Duvarlar: ${state.walls.length}`);
    console.log(`Node'lar: ${state.nodes.length}`);
    console.log(`Odalar: ${state.rooms.length}`);
    console.log(`Kapılar: ${state.doors.length}`);
    console.log(`Kolonlar: ${state.columns ? state.columns.length : 0}`);
    console.log(`Kirişler: ${state.beams ? state.beams.length : 0}`);
    console.log(`Merdivenler: ${state.stairs ? state.stairs.length : 0}`);
    console.log(`Tesisat Borular: ${state.plumbingPipes ? state.plumbingPipes.length : 0}`);
    console.log(`Tesisat Bileşenler: ${state.plumbingBlocks ? state.plumbingBlocks.length : 0}`);
    console.log("===================\n");

    // Room'lar için polygon ve center hesapla (turf.js kullanarak) - processWalls'tan ÖNCE
    if (state.rooms && state.rooms.length > 0) {
        console.log("\n=== ROOM POLYGON VE CENTER HESAPLANIYOR ===");
        console.log(`state.rooms.length: ${state.rooms.length}`);
        state.rooms.forEach((room, idx) => {
            console.log(`  forEach room ${idx}:`, room);
            console.log(`  room.vertices:`, room.vertices);
            console.log(`  room.vertices?.length:`, room.vertices?.length);
            if (room.vertices && room.vertices.length >= 3) {
                console.log(`  --> IF BLOĞUNA GİRDİ room ${idx}`);
                try {
                    // turf undefined check
                    if (typeof turf === 'undefined') {
                        console.error(`  Room ${idx} (${room.name}): turf undefined! CDN yüklenmemiş olabilir.`);
                        return;
                    }

                    // Turf.js için koordinat formatı: [[x, y], [x, y], ...]
                    const turfCoords = room.vertices.map(v => [v.x, v.y]);
                    // İlk ve son nokta aynı olmalı (kapalı polygon)
                    turfCoords.push(turfCoords[0]);

                    console.log(`  Room ${idx} (${room.name}): ${turfCoords.length} koordinat`);

                    // Turf polygon oluştur
                    room.polygon = turf.polygon([turfCoords]);

                    // Center hesapla - inscribed rectangle yöntemi
                    const bestPos = findBestLabelPosition(room.polygon);
                    if (bestPos) {
                        room.center = bestPos;
                    } else {
                        const centerPoint = turf.center(room.polygon);
                        room.center = centerPoint.geometry.coordinates;
                    }

                    // Alan hesapla (m²) - Planar area calculation (Shoelace formula)
                    room.area = calculatePlanarArea(room.polygon.geometry.coordinates) / 10000; // cm² to m²

                    console.log(`  Room ${idx} (${room.name}): center=[${room.center[0].toFixed(2)}, ${room.center[1].toFixed(2)}], area=${room.area.toFixed(2)} m²`);
                } catch (e) {
                    console.error(`  Room ${idx} (${room.name}) polygon hesaplama hatası:`, e);
                    console.error(`  Error name: ${e.name}, message: ${e.message}`);
                    console.error(`  Stack:`, e.stack);
                }
            }
        });
        console.log("==========================================\n");
    }

    // Duvarları process et ama room detection'ı skip et (room'lar XML'den geldi)
    console.log("\nprocessWalls çağrılıyor (skipRoomDetection=true, processAllFloors=true)...");
    processWalls(false, true, true); // skipMerge=false, skipRoomDetection=true, processAllFloors=true

    // DÜZELTME: Mahal isimlerini otomatik olarak göster (XML yüklendiğinde)
    if (!state.tempVisibility) {
        state.tempVisibility = {};
    }
    state.tempVisibility.showRoomNames = true;
    console.log("Mahal isimleri otomatik olarak aktif edildi (showRoomNames=true)");

    saveState();

    // Tesisat verilerini yükle
    if (state.plumbingBlocks?.length > 0 || state.plumbingPipes?.length > 0) {
        console.log("\n=== TESİSAT VERİLERİ YÜKLENMEK ÜZERE ===");
        console.log(`plumbingBlocks: ${state.plumbingBlocks.length}`);
        console.log(`plumbingPipes: ${state.plumbingPipes.length}`);

        // PlumbingManager'ı dinamik import ile yükle
        if (window.plumbingManager) {
            window.plumbingManager.loadFromState();
            console.log("PlumbingManager.loadFromState() çağrıldı!");
        } else {
            console.warn("PlumbingManager bulunamadı! Tesisat verileri yüklenemedi.");
        }
    }

    // 'dom' artık import edildiği için bu kontrol çalışacaktır
    if (dom.mainContainer.classList.contains('show-3d')) {
         setTimeout(update3DScene, 0);
    }
    // Ekrana sığdır
    setTimeout(fitDrawingToScreen, 100);

    console.log("XML başarıyla import edildi!", state);
}