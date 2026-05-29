/**
 * PlumbingManager (v2)
 * Merkezi tesisat yönetim sınıfı - yeni bileşenlerle entegre
 */

import { state, setBoruCursor, dom, setMode } from '../general-files/main.js';
import { InteractionManager, TESISAT_MODLARI } from './interactions/interaction-manager.js';
import { PlumbingRenderer } from './plumbing-renderer.js';
import { ServisKutusu } from './objects/service-box.js';
import { Boru, createBoru, BAGLANTI_TIPLERI } from './objects/pipe.js';
import { Sayac, createSayac } from './objects/meter.js';
import { Vana, createVana } from './objects/valve.js';
import { Regulator, createRegulator } from './objects/regulator.js';
import { PipeFitting, createPipeFitting, FITTING_DEFS } from './objects/pipe-fitting.js';
import { Cihaz, createCihaz } from './objects/device.js';
import { recomputeAllPressures } from './utils/pressure-recompute.js';
import { Baca, createBaca } from './objects/chimney.js';
import { initVerticalPanelListeners } from './interactions/vertical-panel-handler.js';
import { initPropertiesButton, initObjectDefaults } from './properties/properties-panel.js';
import { getLabelOffsetsJSON, setLabelOffsetsJSON } from './renderer/renderer-labels.js';
import { seedSayacFromRooms, syncBirimState } from '../draw/draw-birim-labels.js';

export class PlumbingManager {
    constructor() {
        this.pipes = [];
        this.components = []; // Servis kutusu, sayaç, vana, cihaz
        this.nodes = new Map(); // nodeId -> { _nodeId, x, y, z }
        this._activeTool = null;
        this.tempComponent = null; // Ghost eleman

        // Alt modüller
        this.interactionManager = new InteractionManager(this);
        this.renderer = new PlumbingRenderer();

        // Singleton
        if (!window.plumbingManager) {
            window.plumbingManager = this;
        }
    }

    static getInstance() {
        return window.plumbingManager || new PlumbingManager();
    }

    // ─── DÜĞÜM (NODE) YÖNETİMİ ───────────────────────────────────────────────

    /** Yeni düğüm oluştur ve nodes map'e kaydet */
    createNode(x, y, z = 0) {
        const node = { _nodeId: `n_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, x, y, z };
        this.nodes.set(node._nodeId, node);
        return node;
    }

    /**
     * Verilen koordinata zaten bir düğüm varsa onu döndür, yoksa yeni oluştur.
     * Bu sayede iki boru aynı noktada buluştuğunda otomatik olarak aynı nesneyi paylaşır.
     */
    getOrCreateNodeAt(x, y, z = 0, tol = 0.5) {
        for (const node of this.nodes.values()) {
            if (Math.hypot(node.x - x, node.y - y, (node.z || 0) - (z || 0)) < tol) {
                return node;
            }
        }
        return this.createNode(x, y, z);
    }

    /** Bir borunun iki düğümünü map'e kaydet (yoksa ekle) */
    registerPipeNodes(pipe) {
        if (!this.nodes.has(pipe.p1NodeId)) this.nodes.set(pipe.p1NodeId, pipe.p1);
        if (!this.nodes.has(pipe.p2NodeId)) this.nodes.set(pipe.p2NodeId, pipe.p2);
    }

    /** Belirli bir düğümü kullanan borular (excludePipe hariç) */
    getPipesAtNode(node, excludePipe = null) {
        return this.pipes.filter(p =>
            p !== excludePipe && (p.p1 === node || p.p2 === node)
        );
    }

    get activeTool() { return this._activeTool; }
    set activeTool(val) {
        this._activeTool = val;

        // CSS class yönetimi ile kalemi göster/gizle
        const p2dPanel = document.getElementById("p2d");
        if (p2dPanel) {
            if (val === 'boru') {
                p2dPanel.classList.add('drawing-pipe-mode');
                // YENİ: Boru butonu aktifse mavi ışığı yak
                if (dom.bBoru) dom.bBoru.classList.add('active');
            } else {
                p2dPanel.classList.remove('drawing-pipe-mode');
                // YENİ: Boru butonu aktif değilse ışığı söndür
                if (dom.bBoru) dom.bBoru.classList.remove('active');
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    init() {
        // Düşey panel event listener'larını başlat
        initVerticalPanelListeners();
        // Özellikler butonu bağlantısı
        initPropertiesButton(this);
    }

    /**
     * Bileşen yerleştirme modunu başlat
     */
    startPlacement(type, options = {}) {
        this.activeTool = type;

        // Yeni placement başladığında eski mouse pozisyonunu sıfırla
        // Böylece ghost görüntü önceki cihazın konumunda başlamaz
        this.interactionManager.lastMousePoint = null;

        // Ghost bileşen oluştur
        switch (type) {
            case TESISAT_MODLARI.SERVIS_KUTUSU:
                this.tempComponent = new ServisKutusu(0, 0, {
                    floorId: state.currentFloor?.id,
                    cikisYonu: options.cikisYonu,
                    z: 1 // YENİ: Servis kutusu daima Z=20 kotunda başlar
                });
                break;

            case TESISAT_MODLARI.SAYAC:
                this.tempComponent = createSayac(0, 0, {
                    floorId: state.currentFloor?.id
                });
                break;

            case TESISAT_MODLARI.VANA:
                this.tempComponent = createVana(0, 0, options.vanaTipi || 'AKV', {
                    floorId: state.currentFloor?.id
                });
                break;

            case TESISAT_MODLARI.REGULATOR:
                this.tempComponent = createRegulator(0, 0, {
                    floorId: state.currentFloor?.id
                });
                break;

            case TESISAT_MODLARI.FILTRE:
            case TESISAT_MODLARI.IZOLASYON_FLANSI:
            case TESISAT_MODLARI.KOMPANSATOR:
            case TESISAT_MODLARI.MANOMETRE:
            case TESISAT_MODLARI.TOPRAKLAMA:
                if (FITTING_DEFS[type]) {
                    this.tempComponent = createPipeFitting(type, 0, 0, {
                        floorId: state.currentFloor?.id
                    });
                }
                break;

            case TESISAT_MODLARI.CIHAZ:
                this.tempComponent = createCihaz(0, 0, options.cihazTipi || 'KOMBI', {
                    floorId: state.currentFloor?.id
                });
                break;

            case TESISAT_MODLARI.BACA:
                // Baca için geçici nesne - henüz cihaza bağlı değil
                this.tempComponent = createBaca(0, 0, null, {
                    floorId: state.currentFloor?.id
                });
                break;

            default:
                return;
        }

    }

    /**
     * Modu ayarla
     */
    setMode(mode) {
        this.activeTool = mode;

        if (mode === null) {
            this.tempComponent = null;
            this.interactionManager.cancelCurrentAction();
        }
    }

    /**
     * Boru ekleme modunu başlat
     */
    startPipeMode() {
        this.activeTool = TESISAT_MODLARI.BORU;
        // Boru modu InteractionManager tarafından yönetilir
    }

    /**
     * ID ile bileşen bul
     */
    findComponentById(id) {
        return this.components.find(c => c.id === id);
    }

    /**
     * ID ile boru bul
     */
    findPipeById(id) {
        return this.pipes.find(p => p.id === id);
    }

    /**
     * Bileşen sil
     */
    deleteComponent(id) {
        const index = this.components.findIndex(c => c.id === id);
        if (index !== -1) {
            this.components.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Boru sil
     */
    deletePipe(id) {
        const index = this.pipes.findIndex(p => p.id === id);
        if (index !== -1) {
            this.pipes.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Tümünü temizle
     */
    clearAll() {
        this.pipes = [];
        this.components = [];
        this.tempComponent = null;
        this.activeTool = null;
    }

    /**
     * Boş boru uçlarını bul (başlangıç veya bitiş ucu boş olan borular)
     * @returns {Array} Her boru için {pipe, end: 'p1' veya 'p2'} döndürür
     */
    getBosBitisBorular() {
        const bosUclar = [];
        const currentFloorId = state.currentFloor?.id;

        for (const pipe of this.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && pipe.floorId && pipe.floorId !== currentFloorId) {
                continue;
            }

            // p1 ucu kontrol et
            if (!pipe.baslangicBaglanti.hedefId) {
                // Gerçekten boş mu? (T-junction veya başka bir boru bağlı değil mi?)
                if (this.isTrulyFreeEndpoint(pipe.p1)) {
                    bosUclar.push({ pipe, end: 'p1' });
                }
            }

            // p2 ucu kontrol et
            if (!pipe.bitisBaglanti.hedefId) {
                // Gerçekten boş mu? (T-junction veya başka bir boru bağlı değil mi?)
                if (this.isTrulyFreeEndpoint(pipe.p2)) {
                    bosUclar.push({ pipe, end: 'p2' });
                }
            }
        }

        return bosUclar;
    }

    /**
     * Bir noktanın gerçekten boş uç olup olmadığını kontrol eder
     * (T-junction, başka boru bağlantısı yok)
     * DÜZELTME: 3D koordinatları da dikkate alır (Z değeri)
     */
    isTrulyFreeEndpoint(point, tolerance = 1) {
        let pipeCount = 0;
        const currentFloorId = state.currentFloor?.id;
        const pointZ = point.z || 0;

        for (const boru of this.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
                continue;
            }

            // 3D mesafe hesabı - Z koordinatını da dahil et
            const p1Z = boru.p1.z || 0;
            const p2Z = boru.p2.z || 0;
            const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y, pointZ - p1Z);
            const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y, pointZ - p2Z);

            if (distP1 < tolerance || distP2 < tolerance) {
                pipeCount++;
            }

            // T-junction veya daha karmaşık (3+ boru) - DOLU UÇ
            if (pipeCount > 2) {
                return false;
            }
        }

        // Sadece 1 boru varsa gerçek boş uç
        // 2 boru varsa birleşim noktası - DOLU sayılır
        return pipeCount === 1;
    }

    /**
     * Çizim döngüsü
     */
    render(ctx) {
        this.renderer.render(ctx, this);
    }

    /**
     * State'e kaydet
     */
    saveToState() {
        // Tüm boru düğümlerini topla ve kaydet
        const nodeMap = new Map();
        this.pipes.forEach(pipe => {
            nodeMap.set(pipe.p1NodeId, pipe.p1);
            nodeMap.set(pipe.p2NodeId, pipe.p2);
        });
        state.plumbingNodes = Array.from(nodeMap.values()).map(n => ({
            _nodeId: n._nodeId, x: n.x, y: n.y, z: n.z || 0
        }));
        state.plumbingPipes = this.pipes.map(p => p.toJSON());
        state.plumbingBlocks = this.components.map(c => c.toJSON());
        state.plumbingLabelOffsets = getLabelOffsetsJSON();
    }

    /**
     * State'den yükle
     */
    loadFromState() {
        // Düğümleri yükle (yeni format)
        this.nodes = new Map();
        if (state.plumbingNodes) {
            state.plumbingNodes.forEach(n => {
                const node = { _nodeId: n._nodeId, x: n.x, y: n.y, z: n.z || 0 };
                this.nodes.set(node._nodeId, node);
            });
        }

        // Boruları yükle
        if (state.plumbingPipes) {
            this.pipes = state.plumbingPipes.map(data => {
                let node1, node2;
                if (data.p1NodeId && data.p2NodeId &&
                    this.nodes.has(data.p1NodeId) && this.nodes.has(data.p2NodeId)) {
                    // Yeni format: düğümler hazır
                    node1 = this.nodes.get(data.p1NodeId);
                    node2 = this.nodes.get(data.p2NodeId);
                } else {
                    // Eski format: koordinatlardan düğüm bul/oluştur (0.5cm tolerans ile otomatik birleştir)
                    node1 = this.getOrCreateNodeAt(data.p1.x, data.p1.y, data.p1.z || 0);
                    node2 = this.getOrCreateNodeAt(data.p2.x, data.p2.y, data.p2.z || 0);
                }
                const boru = Boru.fromJSON(data, node1, node2);
                this.nodes.set(boru.p1NodeId, boru.p1);
                this.nodes.set(boru.p2NodeId, boru.p2);
                return boru;
            });
        }

        // Bileşenleri yükle
        if (state.plumbingBlocks) {
            this.components = state.plumbingBlocks.map(data => {
                switch (data.type) {
                    case 'servis_kutusu':
                        return ServisKutusu.fromJSON(data);
                    case 'sayac':
                        return Sayac.fromJSON(data);
                    case 'vana':
                        return Vana.fromJSON(data);
                    case 'regulator':
                        return Regulator.fromJSON(data);
                    case 'cihaz':
                        return Cihaz.fromJSON(data);
                    case 'baca':
                        return Baca.fromJSON(data);
                    case 'filtre':
                    case 'izolasyon_flansi':
                    case 'kompansator':
                    case 'manometre':
                    case 'topraklama':
                        return PipeFitting.fromJSON(data);
                    default:
                        return null;
                }
            }).filter(c => c !== null);
        }

        // Yüklenen topolojiye göre tüm boruların kök kaynağını (parent)
        // ve colorGroup'unu tek seferde hesapla
        this.recomputePipeParents();

        // Tüm vanaların kapama sembolü durumunu güncelle
        const valves = this.components.filter(c => c.type === 'vana');
        valves.forEach(vana => {
            if (vana.updateEndCapStatus) {
                vana.updateEndCapStatus(this);
            }
        });

        // Tüm boruların basıncını zincirden yeniden hesapla
        recomputeAllPressures(this);

        // Etiket konumlarını yükle
        setLabelOffsetsJSON(state.plumbingLabelOffsets || {});
    }

    /**
     * Belirli bir boruya bağlı vanaların pozisyonlarını güncelle
     * @param {string} pipeId - Boru ID

    /**
     * Belirli bir boruya bağlı vanaların pozisyonlarını güncelle
     * @param {string} pipeId - Boru ID
     */
    updateValvePositionsForPipe(pipeId) {
        const pipe = this.findPipeById(pipeId);
        if (!pipe) return;

        // Boruda bağlı vana, regülatör ve tesisat aksesuarlarını bul
        const valves = this.components.filter(
            c => _isOnPipeComponent(c.type) && c.bagliBoruId === pipeId
        );

        // Her vananın pozisyonunu güncelle
        valves.forEach(vana => {
            vana.updatePositionFromPipe(pipe);
        });
    }

    /**
     * Tüm vanaların pozisyonlarını güncelle
     */
    updateAllValvePositions() {
        const valves = this.components.filter(c => _isOnPipeComponent(c.type));

        valves.forEach(vana => {
            if (vana.bagliBoruId) {
                const pipe = this.findPipeById(vana.bagliBoruId);
                if (pipe) {
                    vana.updatePositionFromPipe(pipe);
                    // Kapama sembolü durumunu güncelle (sadece vana için)
                    if (vana.type === 'vana' && vana.updateEndCapStatus) {
                        vana.updateEndCapStatus(this);
                    }
                }
            }
        });
    }

    /**
     * Boş bir boru ucuna "Kombi" veya "Ocak" gibi bir cihaz yerleştirir.
     * handleCihazEkleme ile tam entegre - vana, fleks otomatik eklenir
     * @param {string} deviceType - Yerleştirilecek cihazın tipi ('KOMBI', 'OCAK', vb.)
     * @param {object} boruUcuInfo - Opsiyonel boru ucu bilgisi {pipe, end, point}
     */
    placeDeviceAtOpenEnd(deviceType, boruUcuInfo = null) {
        // Sadece 'KOMBI' ve 'OCAK' tiplerine izin ver
        if (deviceType !== 'KOMBI' && deviceType !== 'OCAK') {
            // console.warn(`Unsupported device type for automatic placement: ${deviceType}`);
            return false;
        }

        let targetPipe, targetEnd, targetPoint;

        // Eğer özel boru ucu bilgisi verilmişse onu kullan
        if (boruUcuInfo) {
            targetPipe = boruUcuInfo.pipe;
            targetEnd = boruUcuInfo.end;
            targetPoint = boruUcuInfo.point;
        } else {
            // Yoksa, boş boru uçlarını bul
            const openEnds = this.getBosBitisBorular();
            if (openEnds.length === 0) {
                // console.log("Otomatik yerleştirme için boşta boru ucu bulunamadı.");
                return false;
            }

            const { pipe, end } = openEnds[0];
            targetPipe = pipe;
            targetEnd = end;
            targetPoint = pipe[end];
        }

        const floorId = targetPipe.floorId || state.currentFloor?.id;

        // Cihazı oluştur; yön = boş uca gelen SON yatay segmentin "dışa" yönü.
        // Borunun kendisi yatay ise borunun yönü, dikey ise yukarı zincirde
        // bulunan ilk yatay segmentin yönü kullanılır. Yatay segment yoksa +Y.
        const DEVICE_HALF = 15;
        const FLEKS_UZUNLUK = 15;
        const dir = _getOutwardHorizontalDir(this, targetPipe, targetEnd) || { x: 0, y: 1 };
        const devX = targetPoint.x + dir.x * (DEVICE_HALF + FLEKS_UZUNLUK);
        const devY = targetPoint.y + dir.y * (DEVICE_HALF + FLEKS_UZUNLUK);

        const newDevice = createCihaz(devX, devY, deviceType, { floorId });

        if (!newDevice) {
            // console.error("Cihaz oluşturulamadı.");
            return false;
        }

        // Z değerini boru ucundan al
        newDevice.z = targetPoint.z || 0;

        // Ghost connection info ekle (handleCihazEkleme kullanır)
        newDevice.ghostConnectionInfo = {
            boruUcu: {
                boruId: targetPipe.id,
                nokta: targetPoint,
                uc: targetEnd,
                boru: targetPipe
            }
        };

        // Mouse ile yerleştirme yolundaki gibi default property değerlerini
        // (etiketler dahil) en başta uygula — yoksa cihaz seçilene kadar etiket eksik kalır.
        initObjectDefaults(newDevice, this);

        const success = this.interactionManager.handleCihazEkleme(newDevice);

        if (success) {
            // Etiketler/birimler tıklama yolundaki gibi senkronlansın
            seedSayacFromRooms();
            syncBirimState();
            // Cihaz terminaldir; select moduna geç
            this.activeTool = null;
            setMode("select", true);
            return true;
        } else {
            // console.error(`✗ Cihaz ekleme başarısız oldu. handleCihazEkleme false döndü.`);
            return false;
        }
    }

    /**
     * Boş bir boru ucuna sayaç yerleştirir.
     * Mouse ile yerleştirmeyle aynı görsel: sayaç boru hattının ALTINDA durur
     * (perpendicular). Giriş tam boru ucunda; gövde fleks uzunluğu kadar aşağıda.
     * Yön ölçütü: boş uca gelen son yatay segmentin "dışa" yönü → perpendicular
     * olarak güney tercihli alınır.
     * @param {object} boruUcuInfo - {pipe, end, point}
     */
    placeMeterAtOpenEnd(boruUcuInfo = null) {
        let targetPipe, targetEnd, targetPoint;
        if (boruUcuInfo) {
            targetPipe = boruUcuInfo.pipe;
            targetEnd = boruUcuInfo.end;
            targetPoint = boruUcuInfo.point;
        } else {
            const openEnds = this.getBosBitisBorular();
            if (openEnds.length === 0) return false;
            const { pipe, end } = openEnds[0];
            targetPipe = pipe;
            targetEnd = end;
            targetPoint = pipe[end];
        }

        const floorId = targetPipe.floorId || state.currentFloor?.id;

        // Yön (pipe boyunca dışa) — son yatay segmenttin yönü. Yatay yoksa +Y.
        const dir = _getOutwardHorizontalDir(this, targetPipe, targetEnd) || { x: 0, y: 1 };

        // Perpendicular: pipe yönünün dik istikameti; "güney" (ekran aşağı) tercihli
        // — mouse ile yerleştirmenin varsayılan tarafıyla aynı.
        let perp = { x: -dir.y, y: dir.x };
        if (perp.y < 0 || (perp.y === 0 && perp.x < 0)) {
            perp = { x: -perp.x, y: -perp.y };
        }

        const FLEKS_UZUNLUK = 15;

        // Sayacı oluştur. Local +Y eksenini perp'e hizala: rotation = atan2(-perpX, perpY)
        const sayac = createSayac(0, 0, { floorId });
        const theta = Math.atan2(-perp.x, perp.y);
        sayac.rotation = theta * 180 / Math.PI;

        // Giriş hedefi: boru ucundan perpendicular yönde fleksUzunluk kadar uzakta.
        // Center = girisHedef - R(theta) * girisLocal
        const girisHedefX = targetPoint.x + perp.x * FLEKS_UZUNLUK;
        const girisHedefY = targetPoint.y + perp.y * FLEKS_UZUNLUK;
        const girisLocal = sayac.getGirisLocalKoordinat();
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        sayac.x = girisHedefX - (girisLocal.x * cos - girisLocal.y * sin);
        sayac.y = girisHedefY - (girisLocal.x * sin + girisLocal.y * cos);
        sayac.z = targetPoint.z || 0;

        sayac.ghostConnectionInfo = {
            boruUcu: {
                boruId: targetPipe.id,
                nokta: targetPoint,
                uc: targetEnd,
                boru: targetPipe
            }
        };

        // Default property'leri (etiketler dahil) önceden uygula — yoksa
        // sayaç seçilene kadar etiketler eksik gözüküyor.
        initObjectDefaults(sayac, this);

        const success = this.interactionManager.handleSayacEndPlacement(sayac);

        if (success) {
            // Downstream borular sayaç sonrası TURQUAZ olmalı
            this.recomputePipeParents();

            // Etiketler/birimler tıklama yolundaki gibi senkronlansın
            seedSayacFromRooms();
            syncBirimState();

            // Sayaç eklendi → çizimi sayacın ÇIKIŞINDAN sürdür (mouse yolundaki
            // gibi). Kullanıcı iniş+sayaç veya S kısayolundan sonra iç tesisat
            // çizimine doğrudan devam edebilsin.
            const cikisNoktasi = sayac.getCikisNoktasi();
            this.interactionManager.startBoruCizim(
                cikisNoktasi,
                sayac.id,
                BAGLANTI_TIPLERI.SAYAC
            );
            this.activeTool = 'boru';
            setMode("plumbingV2", true);
        }

        return success;
    }


    /**
         * Verilen noktadaki nesneyi bul (3D/İzometrik destekli)
         * @param {object} pos - {x, y} koordinatları
         * @param {number} tolerance - Tolerans değeri
         * @returns {object|null} - Bulunan nesne veya null
         */
    getObjectAtPoint(pos, tolerance = 10) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
            return null;
        }

        const currentFloorId = state.currentFloor?.id;
        // 3D blend oranı: hem tam perspektif hem de blend modunu kapsar
        const blendT = state.is3DPerspectiveActive ? 1 : (state.viewBlendFactor || 0);

        // Manager'ın kendi pipe/component dizilerini kullan
        const pipes = this.pipes || [];
        const blocks = this.components || [];

        // Floor eşleşme kontrolü
        const floorMatches = (objFloorId) => {
            if (!currentFloorId) return true;
            if (!objFloorId) return true;
            return objFloorId === currentFloorId;
        };

        // Helper: Noktayı ekran koordinatına çevir — renderer ile aynı formül (x+z*t, y-z*t)
        const getScreenPoint = (p) => {
            const z = (p.z || 0) * blendT;
            return { x: p.x + z, y: p.y - z };
        };

        // 1. Önce uç noktaları kontrol et (handle'lar)
        const endpointTolerance = 8; // Nokta seçimi için 8 cm
        for (const pipe of pipes) {
            if (!floorMatches(pipe.floorId)) continue;
            if (!pipe.p1 || !pipe.p2) continue;

            // Uç noktaların izdüşümlerini hesapla
            const p1Screen = getScreenPoint(pipe.p1);
            const distP1 = Math.hypot(pos.x - p1Screen.x, pos.y - p1Screen.y);
            if (distP1 < endpointTolerance) {
                return { type: 'pipe', object: pipe, handle: 'p1' };
            }

            const p2Screen = getScreenPoint(pipe.p2);
            const distP2 = Math.hypot(pos.x - p2Screen.x, pos.y - p2Screen.y);
            if (distP2 < endpointTolerance) {
                return { type: 'pipe', object: pipe, handle: 'p2' };
            }
        }

        // 2 + 3. Bileşen ve pipe gövde adaylarını topla, EN YAKINI seç
        // (Önceki kod sayaç toleransını 20 cm'e açıp pipe gövdesinden ÖNCE döndürüyordu;
        //  3D perspektifte üst kotlardaki pipe sayaç merkezine yaklaşınca sayaç kazanıyordu.)
        let bestHit = null;
        let bestDist = Infinity;

        for (const comp of blocks) {
            if (!floorMatches(comp.floorId)) continue;

            if (comp.type === 'baca') {
                if (comp.containsPoint(pos, tolerance)) {
                    return { type: 'baca', object: comp, handle: 'body' };
                }
                continue;
            }

            const cx = comp.x ?? comp.center?.x;
            const cy = comp.y ?? comp.center?.y;
            if (cx === undefined || cy === undefined) continue;

            const compScreen = getScreenPoint({ x: cx, y: cy, z: comp.z || 0 });
            const dist = Math.hypot(pos.x - compScreen.x, pos.y - compScreen.y);
            const selectTolerance = _isOnPipeComponent(comp.type) ? 6 : tolerance * 2;
            if (dist < selectTolerance && dist < bestDist) {
                bestDist = dist;
                bestHit = { type: 'component', object: comp, handle: 'body' };
            }

            // Topraklama: drop-arm bölgesi de tıklanabilir olmalı (sembol borudan
            // ~17cm uzağa iniyor). Lokal koordinatta dik kol +/-Y yönünde.
            if (comp.type === 'topraklama') {
                const sign = comp.direction === -1 ? -1 : 1;
                const rad = (comp.rotation || 0) * Math.PI / 180;
                const cos = Math.cos(rad), sin = Math.sin(rad);
                // Sembol kutusu local: x ∈ [-14, +2], y ∈ [0, sign*18]
                const lxMin = -14, lxMax = 2;
                const lyMin = sign === 1 ? 0 : -18;
                const lyMax = sign === 1 ? 18 : 0;
                const dxw = pos.x - compScreen.x;
                const dyw = pos.y - compScreen.y;
                // ekran → lokal (ters rotasyon)
                const lx = dxw * cos + dyw * sin;
                const ly = -dxw * sin + dyw * cos;
                const PAD = 4;
                if (lx >= lxMin - PAD && lx <= lxMax + PAD
                    && ly >= lyMin - PAD && ly <= lyMax + PAD) {
                    // Drop-arm içinde — sıkı bir uzaklık ata ki pipe gövdesine
                    // yenik düşmesin
                    const armDist = 3;
                    if (armDist < bestDist) {
                        bestDist = armDist;
                        bestHit = { type: 'component', object: comp, handle: 'body' };
                    }
                }
            }
        }

        for (const pipe of pipes) {
            if (!floorMatches(pipe.floorId)) continue;
            if (!pipe.p1 || !pipe.p2) continue;

            const p1Screen = getScreenPoint(pipe.p1);
            const p2Screen = getScreenPoint(pipe.p2);
            const dx = p2Screen.x - p1Screen.x;
            const dy = p2Screen.y - p1Screen.y;
            const length = Math.hypot(dx, dy);

            if (length < 0.1) {
                const dist = Math.hypot(pos.x - p1Screen.x, pos.y - p1Screen.y);
                if (dist < tolerance && dist < bestDist) {
                    bestDist = dist;
                    bestHit = { type: 'pipe', object: pipe, handle: 'body' };
                }
                continue;
            }

            const tParam = ((pos.x - p1Screen.x) * dx + (pos.y - p1Screen.y) * dy) / (length * length);
            if (tParam < 0 || tParam > 1) continue;
            const projX = p1Screen.x + tParam * dx;
            const projY = p1Screen.y + tParam * dy;
            const dist = Math.hypot(pos.x - projX, pos.y - projY);
            if (dist < tolerance && dist < bestDist) {
                bestDist = dist;
                bestHit = { type: 'pipe', object: pipe, handle: 'body', splitT: tParam };
            }
        }

        return bestHit;
    }

    /**
     * JSON'a dönüştür
     */
    toJSON() {
        const nodeMap = new Map();
        this.pipes.forEach(pipe => {
            nodeMap.set(pipe.p1NodeId, pipe.p1);
            nodeMap.set(pipe.p2NodeId, pipe.p2);
        });
        return {
            nodes: Array.from(nodeMap.values()).map(n => ({ _nodeId: n._nodeId, x: n.x, y: n.y, z: n.z || 0 })),
            pipes: this.pipes.map(p => p.toJSON()),
            components: this.components.map(c => c.toJSON())
        };
    }

    /**
     * JSON'dan yükle
     */
    fromJSON(data) {
        // Düğümleri yükle
        this.nodes = new Map();
        if (data.nodes) {
            data.nodes.forEach(n => {
                const node = { _nodeId: n._nodeId, x: n.x, y: n.y, z: n.z || 0 };
                this.nodes.set(node._nodeId, node);
            });
        }

        if (data.pipes) {
            this.pipes = data.pipes.map(pData => {
                let node1, node2;
                if (pData.p1NodeId && this.nodes.has(pData.p1NodeId)) {
                    node1 = this.nodes.get(pData.p1NodeId);
                    node2 = this.nodes.get(pData.p2NodeId);
                } else {
                    node1 = this.getOrCreateNodeAt(pData.p1.x, pData.p1.y, pData.p1.z || 0);
                    node2 = this.getOrCreateNodeAt(pData.p2.x, pData.p2.y, pData.p2.z || 0);
                }
                return Boru.fromJSON(pData, node1, node2);
            });
        }

        if (data.components) {
            this.components = data.components.map(c => {
                switch (c.type) {
                    case 'servis_kutusu':
                        return ServisKutusu.fromJSON(c);
                    case 'sayac':
                        return Sayac.fromJSON(c);
                    case 'vana':
                        return Vana.fromJSON(c);
                    case 'regulator':
                        return Regulator.fromJSON(c);
                    case 'cihaz':
                        return Cihaz.fromJSON(c);
                    case 'baca':
                        return Baca.fromJSON(c);
                    case 'filtre':
                    case 'izolasyon_flansi':
                    case 'kompansator':
                    case 'manometre':
                    case 'topraklama':
                        return PipeFitting.fromJSON(c);
                    default:
                        return null;
                }
            }).filter(c => c !== null);
        }

        // Tüm vanaların kapama sembolü durumunu güncelle
        const valves = this.components.filter(c => c.type === 'vana');
        valves.forEach(vana => {
            if (vana.updateEndCapStatus) {
                vana.updateEndCapStatus(this);
            }
        });

        recomputeAllPressures(this);
    }

    // --- ÖZEL EYLEMLER ---

    /**
     * Tüm boruların kök kaynağını (parent) baslangicBaglanti zincirini
     * YUKARI doğru yürüyerek hesapla, ve buna göre colorGroup'u türet.
     *
     * Kural: Bir boru "iç tesisat" (TURQUAZ) sayılması için zincirin
     * yukarısında bir SAYAÇ olması ŞARTTIR. Aksi halde (servis kutusu
     * altı, kopuk hat, döngü) "kolon" (YELLOW) olarak işaretlenir.
     *
     * Her boruya pipe.parent = { tip: 'sayac'|'servis_kutusu'|null, hedefId } yazılır.
     * Bu, downstream-traversal hatalarına (T-listesinde olmayan
     * çocuk dalları kaçırma) karşı bağışıktır.
     */
    recomputePipeParents() {
        const cache = new Map(); // pipeId -> { tip, hedefId } | null

        const resolve = (pipeId, visiting) => {
            if (cache.has(pipeId)) return cache.get(pipeId);
            if (visiting.has(pipeId)) {
                // Döngü — kök bulunamadı say
                cache.set(pipeId, null);
                return null;
            }
            visiting.add(pipeId);

            const pipe = this.findPipeById(pipeId);
            if (!pipe) { cache.set(pipeId, null); return null; }
            const bag = pipe.baslangicBaglanti;
            if (!bag || !bag.hedefId || !bag.tip) {
                cache.set(pipeId, null);
                return null;
            }
            if (bag.tip === 'sayac') {
                const r = { tip: 'sayac', hedefId: bag.hedefId };
                cache.set(pipeId, r);
                return r;
            }
            if (bag.tip === 'servis_kutusu') {
                const r = { tip: 'servis_kutusu', hedefId: bag.hedefId };
                cache.set(pipeId, r);
                return r;
            }
            if (bag.tip === 'boru') {
                const upstream = resolve(bag.hedefId, visiting);
                cache.set(pipeId, upstream);
                return upstream;
            }
            cache.set(pipeId, null);
            return null;
        };

        for (const pipe of this.pipes) {
            const root = resolve(pipe.id, new Set());
            pipe.parent = root;
            pipe.colorGroup = (root && root.tip === 'sayac') ? 'TURQUAZ' : 'YELLOW';
        }

        // Topoloji değişti — izoda yapılmış manuel boy/öteleme düzenlemelerinin
        // yeni borulara da yansıması için joint haritasından explicit offset yaz.
        this.syncIsoOffsetsToNewPipes();
    }

    /**
     * İzometride manuel sürüklemeyle yapılmış offsetleri (state.isoPipeOffsets)
     * topoloji değişiklikleri sonrası yeni eklenen/yeniden bağlanan borulara
     * yayar. Render-time propagation aynısını yapıyor ama o sahnede kalıcı
     * değil; burada explicit entry yazınca:
     *   - yeni boru kendi id'si ile drag/snapshot/undo akışına girer,
     *   - sonraki topoloji değişikliği bu boruyu bilinen joint olarak kullanır,
     *   - iniş çıkış / yeni branş / regülatör split sonrası "eğri/kopuk" görünüm
     *     yerine iso düzenlemeyle tutarlı rijit ötelenme görünür.
     *
     * Algoritma scene-isometric.js'teki rigid-translate ile birebir aynı:
     *   1) Mevcut explicit entry'lerden joint key → world offset haritası kur
     *   2) Entry'siz borulara ucu offsetli junction'a denk gelirse diğer ucuna
     *      kopyala (yakınsayana kadar iterate)
     *   3) Hâlâ entry'siz ama joint'i offsetli kalan borulara explicit entry yaz
     */
    syncIsoOffsetsToNewPipes() {
        const stateOffsets = state.isoPipeOffsets;
        if (!stateOffsets || Object.keys(stateOffsets).length === 0) return;

        const cos30 = Math.cos(Math.PI / 6);
        const sin30 = Math.sin(Math.PI / 6);
        const toWorld = (dx, dy) => ({
            dwx: 0.5 * (dx / cos30 - dy / sin30),
            dwy: 0.5 * (dx / cos30 + dy / sin30),
        });
        const toScreen = (dwx, dwy) => ({
            dx: cos30 * (dwx + dwy),
            dy: sin30 * (dwy - dwx),
        });
        const jointKey = (p) => `${Math.round(p.x)}_${Math.round(p.y)}_${Math.round(p.z || 0)}`;

        const jointOffsets = new Map();
        for (const pipe of this.pipes) {
            if (!pipe.p1 || !pipe.p2) continue;
            const off = stateOffsets[pipe.id];
            if (!off) continue;
            if (off.startDx || off.startDy) {
                jointOffsets.set(jointKey(pipe.p1), toWorld(off.startDx || 0, off.startDy || 0));
            }
            if (off.endDx || off.endDy) {
                jointOffsets.set(jointKey(pipe.p2), toWorld(off.endDx || 0, off.endDy || 0));
            }
        }
        if (jointOffsets.size === 0) return;

        const rigidTranslatePass = () => {
            let changed = true;
            let iter = 0;
            while (changed && iter < 10) {
                changed = false; iter++;
                for (const pipe of this.pipes) {
                    if (!pipe.p1 || !pipe.p2) continue;
                    if (stateOffsets[pipe.id]) continue;
                    const k1 = jointKey(pipe.p1);
                    const k2 = jointKey(pipe.p2);
                    const off1 = jointOffsets.get(k1);
                    const off2 = jointOffsets.get(k2);
                    if (off1 && !off2) { jointOffsets.set(k2, { ...off1 }); changed = true; }
                    else if (off2 && !off1) { jointOffsets.set(k1, { ...off2 }); changed = true; }
                }
            }
        };
        rigidTranslatePass();

        // Midpoint fallback: yeni branş bir borunun ORTASINDAN ayrıldığında
        // ucu hiçbir joint'e denk gelmiyor. Üzerinde bulunduğu segment'in iki
        // ucundaki offsetlerden lineer interpolasyon ile pick et.
        const TOL_ON_SEG = 1.0; // cm — segment üstünde sayma toleransı
        for (const pipe of this.pipes) {
            if (!pipe.p1 || !pipe.p2) continue;
            if (stateOffsets[pipe.id]) continue;
            for (const ek of ['p1', 'p2']) {
                const p = pipe[ek];
                const k = jointKey(p);
                if (jointOffsets.has(k)) continue;
                for (const M of this.pipes) {
                    if (M === pipe) continue;
                    if (!M.p1 || !M.p2) continue;
                    const o1 = jointOffsets.get(jointKey(M.p1));
                    const o2 = jointOffsets.get(jointKey(M.p2));
                    if (!o1 && !o2) continue;
                    const vx = M.p2.x - M.p1.x;
                    const vy = M.p2.y - M.p1.y;
                    const vz = (M.p2.z || 0) - (M.p1.z || 0);
                    const len2 = vx * vx + vy * vy + vz * vz;
                    if (len2 < 0.01) continue;
                    const wx = p.x - M.p1.x;
                    const wy = p.y - M.p1.y;
                    const wz = (p.z || 0) - (M.p1.z || 0);
                    const t = (wx * vx + wy * vy + wz * vz) / len2;
                    if (t < 0.01 || t > 0.99) continue; // uçlar joint matchten geçer
                    const cx = M.p1.x + t * vx;
                    const cy = M.p1.y + t * vy;
                    const cz = (M.p1.z || 0) + t * vz;
                    const dist = Math.hypot(p.x - cx, p.y - cy, (p.z || 0) - cz);
                    if (dist > TOL_ON_SEG) continue;
                    const a = o1 || { dwx: 0, dwy: 0 };
                    const b = o2 || { dwx: 0, dwy: 0 };
                    jointOffsets.set(k, {
                        dwx: (1 - t) * a.dwx + t * b.dwx,
                        dwy: (1 - t) * a.dwy + t * b.dwy,
                    });
                    break;
                }
            }
        }
        // Midpoint pick'ten sonra yeni joint'leri downstream'e bir kez daha yay
        rigidTranslatePass();

        let mutated = false;
        for (const pipe of this.pipes) {
            if (!pipe.p1 || !pipe.p2) continue;
            if (stateOffsets[pipe.id]) continue;
            const off1 = jointOffsets.get(jointKey(pipe.p1));
            const off2 = jointOffsets.get(jointKey(pipe.p2));
            if (!off1 && !off2) continue;
            const entry = {};
            if (off1) {
                const s = toScreen(off1.dwx, off1.dwy);
                if (s.dx) entry.startDx = s.dx;
                if (s.dy) entry.startDy = s.dy;
            }
            if (off2) {
                const s = toScreen(off2.dwx, off2.dwy);
                if (s.dx) entry.endDx = s.dx;
                if (s.dy) entry.endDy = s.dy;
            }
            if (Object.keys(entry).length) {
                stateOffsets[pipe.id] = entry;
                mutated = true;
            }
        }

        // Mutated state.isoPipeOffsets in place; iso renderer her frame'de
        // okuyor, ekstra setState gerekmiyor. saveState çağıran kod (mutasyon
        // sahibi) snapshot'ı bizim yazımızdan sonra alıyor.
        void mutated;
    }

    /**
     * Geriye dönük uyumluluk — eski API. Tüm parent'ları yeniden hesaplar.
     * @deprecated recomputePipeParents() kullanın.
     */
    updatePipeColorsAfterMeter(_sayacId) {
        this.recomputePipeParents();
    }
}

/**
 * Boruya bağlı (boru üstünde kayan) bileşen mi?
 * Vana, regülatör ve tesisat aksesuarları (filtre, izolasyon flanşı,
 * kompansatör, manometre) bu kategoridedir.
 */
function _isOnPipeComponent(type) {
    return type === 'vana' || type === 'regulator'
        || type === 'filtre' || type === 'izolasyon_flansi'
        || type === 'kompansator' || type === 'manometre'
        || type === 'topraklama';
}

/**
 * Bir borunun boş ucundan (openEnd) dışarı doğru "endward" yön vektörünü döndürür.
 * - Boru yataysa: kendi yönü (farPt → openPt) normalize edilir.
 * - Boru dikeyse (2D uzunluk < eşik): farPt'a bağlı diğer boru bulunur,
 *   yatay olana ulaşılana kadar zincir takip edilir.
 * - Yatay segment yoksa null döner; çağıran fallback (örn. +Y) verebilir.
 */
function _getOutwardHorizontalDir(manager, openPipe, openEnd) {
    const TH = 2.0; // cm — bu eşiğin altı dikey sayılır
    const NODE_TOL = 1.5;
    const visited = new Set();
    let pipe = openPipe;
    let nearEnd = openEnd;

    while (pipe && !visited.has(pipe.id)) {
        visited.add(pipe.id);
        const nearPt = nearEnd === 'p1' ? pipe.p1 : pipe.p2;
        const farPt = nearEnd === 'p1' ? pipe.p2 : pipe.p1;
        const dx = nearPt.x - farPt.x;
        const dy = nearPt.y - farPt.y;
        const len2d = Math.hypot(dx, dy);

        if (len2d >= TH) {
            return { x: dx / len2d, y: dy / len2d };
        }

        // Dikey segment — farPt'a bağlı bir sonraki boruyu bul
        let next = null;
        let nextEndAtFar = null;
        for (const p of manager.pipes) {
            if (p.id === pipe.id) continue;
            if (visited.has(p.id)) continue;
            const d1 = Math.hypot(p.p1.x - farPt.x, p.p1.y - farPt.y, (p.p1.z || 0) - (farPt.z || 0));
            const d2 = Math.hypot(p.p2.x - farPt.x, p.p2.y - farPt.y, (p.p2.z || 0) - (farPt.z || 0));
            if (d1 < NODE_TOL) { next = p; nextEndAtFar = 'p1'; break; }
            if (d2 < NODE_TOL) { next = p; nextEndAtFar = 'p2'; break; }
        }
        if (!next) break;
        pipe = next;
        nearEnd = nextEndAtFar;
    }
    return null;
}

export const plumbingManager = PlumbingManager.getInstance();

// Düşey panel listener'larını başlat
plumbingManager.init();

// Export modları da
export { TESISAT_MODLARI };