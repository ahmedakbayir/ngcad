/**
 * PlumbingRenderer (v2)
 * Tesisat elemanlarını ekrana çizer - yeni bileşenlerle entegre
 */

import { BORU_TIPLERI } from './objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG, CIKIS_YONLERI } from './objects/service-box.js';
import { SAYAC_CONFIG } from './objects/meter.js';
import { VANA_CONFIG, VANA_TIPLERI } from './objects/valve.js';
import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';
import { getObjectOpacity } from '../general-files/main.js';

export class PlumbingRenderer {
    constructor() {
        this.secilenRenk = '#00BFFF'; // Seçili nesne rengi
    }

    render(ctx, manager) {
        if (!manager) return;

        // Borular
        this.drawPipes(ctx, manager.pipes);

        // Bileşenler
        this.drawComponents(ctx, manager.components);

        // Geçici boru çizgisi (boru çizim modunda)
        const geciciBoru = manager.interactionManager?.getGeciciBoruCizgisi();
        if (geciciBoru) {
            this.drawGeciciBoru(ctx, geciciBoru);
        }

        // Ghost eleman
        if (manager.tempComponent) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            this.drawComponent(ctx, manager.tempComponent);
            ctx.restore();
        }

        // Snap göstergesi
        const activeSnap = manager.interactionManager?.activeSnap;
        if (activeSnap) {
            this.drawSnapIndicator(ctx, activeSnap);
        }
    }

    drawPipes(ctx, pipes) {
        if (!pipes) return;

        // Çizim moduna göre opacity ayarla
        const opacity = getObjectOpacity('plumbing');
        ctx.save();
        ctx.globalAlpha = opacity;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Önce kırılım noktalarını bul (birden fazla borunun birleştiği noktalar)
        const breakPoints = this.findBreakPoints(pipes);

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;

            ctx.beginPath();
            ctx.moveTo(pipe.p1.x, pipe.p1.y);
            ctx.lineTo(pipe.p2.x, pipe.p2.y);

            ctx.lineWidth = config.lineWidth;
            ctx.strokeStyle = pipe.isSelected
                ? this.secilenRenk
                : this.hexToRgba(config.color, 1);
            ctx.stroke();
        });

        // Dirsek görüntülerini çiz
        this.drawElbows(ctx, pipes, breakPoints);

        ctx.restore(); // Opacity'yi geri al
    }

    findBreakPoints(pipes) {
        const pointMap = new Map();
        const tolerance = 0.5;

        pipes.forEach(pipe => {
            const config = BORU_TIPLERI[pipe.boruTipi] || BORU_TIPLERI.STANDART;

            // p1 noktası
            const key1 = `${Math.round(pipe.p1.x / tolerance) * tolerance},${Math.round(pipe.p1.y / tolerance) * tolerance}`;
            if (!pointMap.has(key1)) {
                pointMap.set(key1, { x: pipe.p1.x, y: pipe.p1.y, pipes: [], directions: [], diameters: [] });
            }
            const entry1 = pointMap.get(key1);
            entry1.pipes.push(pipe);
            entry1.directions.push(Math.atan2(pipe.p2.y - pipe.p1.y, pipe.p2.x - pipe.p1.x));
            entry1.diameters.push(config.diameter);

            // p2 noktası
            const key2 = `${Math.round(pipe.p2.x / tolerance) * tolerance},${Math.round(pipe.p2.y / tolerance) * tolerance}`;
            if (!pointMap.has(key2)) {
                pointMap.set(key2, { x: pipe.p2.x, y: pipe.p2.y, pipes: [], directions: [], diameters: [] });
            }
            const entry2 = pointMap.get(key2);
            entry2.pipes.push(pipe);
            entry2.directions.push(Math.atan2(pipe.p1.y - pipe.p2.y, pipe.p1.x - pipe.p2.x));
            entry2.diameters.push(config.diameter);
        });

        // Sadece 2 veya daha fazla borunun birleştiği noktaları döndür
        const breakPoints = [];
        pointMap.forEach(entry => {
            if (entry.pipes.length >= 2) {
                breakPoints.push(entry);
            }
        });

        return breakPoints;
    }

    drawElbows(ctx, pipes, breakPoints) {
        ctx.fillStyle = '#808080'; // Gri renk

        breakPoints.forEach(bp => {
            // En büyük genişliği bul (merkez daire için)
            let maxArmWidth = 0;

            // Her yön için dirsek kolu çiz
            for (let i = 0; i < bp.directions.length; i++) {
                const angle = bp.directions[i];
                const diameter = bp.diameters[i];

                // Boyutlar (cm cinsinden)
                const armLength = 3;      // 3 cm kol uzunluğu
                const armExtraWidth = 1;  // Sağdan soldan 1 cm fazla (toplam 2 cm)

                const armWidth = diameter + armExtraWidth * 2;

                if (armWidth > maxArmWidth) maxArmWidth = armWidth;

                ctx.save();
                ctx.translate(bp.x, bp.y);
                ctx.rotate(angle);

                // 3 cm'lik ana kol (dikdörtgen)
                ctx.fillStyle = '#808080';
                ctx.fillRect(0, -armWidth / 2, armLength, armWidth);

                // Uçta kalın çizgi (sağdan soldan 0.2 cm taşan, 1.5x kalın)
                const lineWidth = armWidth + 0.4; // 0.2 cm her taraftan
                const lineThickness = 1.5;
                ctx.fillRect(armLength - 0.2, -lineWidth / 2, lineThickness, lineWidth);

                ctx.restore();
            }

            // Merkeze daire çiz (boşluğu kapat)
            ctx.fillStyle = '#808080';
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, maxArmWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawPipeEndpoints(ctx, pipe) {
        ctx.fillStyle = '#333';
        const r = 2;

        ctx.beginPath();
        ctx.arc(pipe.p1.x, pipe.p1.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pipe.p2.x, pipe.p2.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGeciciBoru(ctx, geciciBoru) {
        ctx.save();
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(geciciBoru.p1.x, geciciBoru.p1.y);
        ctx.lineTo(geciciBoru.p2.x, geciciBoru.p2.y);
        ctx.stroke();

        ctx.restore();
    }

    drawComponents(ctx, components) {
        if (!components) return;
        components.forEach(comp => this.drawComponent(ctx, comp));
    }

    drawComponent(ctx, comp) {
        ctx.save();

        // Çizim moduna göre opacity ayarla
        const opacity = getObjectOpacity('plumbing');
        ctx.globalAlpha = opacity;

        ctx.translate(comp.x, comp.y);
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        switch (comp.type) {
            case 'servis_kutusu':
                this.drawServisKutusu(ctx, comp);
                break;
            case 'sayac':
                this.drawSayac(ctx, comp);
                break;
            case 'vana':
                this.drawVana(ctx, comp);
                break;
            case 'cihaz':
                this.drawCihaz(ctx, comp);
                break;
        }

        // Seçim göstergesi
        if (comp.isSelected) {
            this.drawSelectionBox(ctx, comp);
        }

        ctx.restore();
    }

    drawServisKutusu(ctx, comp) {
        const { width, height, color } = SERVIS_KUTUSU_CONFIG;

        // Kutu
        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : '#333';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        // "S.K." yazısı
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S.K.', 0, 0);

        // Çıkış noktası göstergesi - sadece boru bağlı değilse göster, boru çapında
        if (!comp.cikisKullanildi) {
            const cikisLocal = comp.getCikisLocalKoordinat();
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            // Boru çapı 2cm, yarıçap 1cm
            ctx.arc(cikisLocal.x, cikisLocal.y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawSayac(ctx, comp) {
        const { width, height, color } = SAYAC_CONFIG;

        // Giriş kolu çiz
        const girisKol = comp.girisKolUzunlugu || 10;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.lineTo(-width / 2 - girisKol, 0);
        ctx.stroke();

        // Sayaç gövdesi
        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : '#333';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // İç gösterge
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, width / 3, 0, Math.PI * 2);
        ctx.fill();

        // Sayaç ikonu
        ctx.fillStyle = '#333';
        ctx.font = '6px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('m³', 0, 0);
    }

    drawVana(ctx, comp) {
        const { width, height, color } = VANA_CONFIG;
        const tipBilgisi = VANA_TIPLERI[comp.vanaTipi] || VANA_TIPLERI.AKV;

        ctx.fillStyle = this.hexToRgba(color, 1);

        // Kelebek vana şekli
        ctx.beginPath();
        ctx.moveTo(-width, -height / 2);
        ctx.lineTo(-width, height / 2);
        ctx.lineTo(0, 0);
        ctx.lineTo(width, height / 2);
        ctx.lineTo(width, -height / 2);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        // Sonlanma vanası - kapama sembolü
        if (tipBilgisi.sembol === 'kapama') {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(width + 2, -height);
            ctx.lineTo(width + 2, height);
            ctx.stroke();
        }

        // Selenoid vana - elektrik sembolü
        if (tipBilgisi.sembol === 'elektrik') {
            ctx.strokeStyle = '#0000FF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -height - 2);
            ctx.lineTo(0, -height - 6);
            ctx.stroke();

            // Şimşek
            ctx.fillStyle = '#0000FF';
            ctx.font = '6px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', 0, -height - 8);
        }
    }

    drawCihaz(ctx, comp) {
        const config = CIHAZ_TIPLERI[comp.cihazTipi] || CIHAZ_TIPLERI.KOMBI;
        const { width, height, color } = config;

        // Fleks çizgisi
        ctx.restore(); // Rotasyonu kaldır fleks için
        ctx.save();
        ctx.translate(comp.x, comp.y);

        const fleks = comp.getFleksCizgi();
        if (fleks) {
            ctx.strokeStyle = this.hexToRgba(FLEKS_CONFIG.renk, 1);
            ctx.lineWidth = FLEKS_CONFIG.kalinlik;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(fleks.baslangic.x - comp.x, fleks.baslangic.y - comp.y);
            ctx.lineTo(fleks.bitis.x - comp.x, fleks.bitis.y - comp.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Rotasyonu uygula
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        // Cihaz gövdesi
        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = comp.isSelected ? this.secilenRenk : '#333';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        // Cihaz adı
        ctx.fillStyle = '#000';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.name, 0, 0);

        // Baca göstergesi
        if (config.bacaGerekli) {
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.rect(-5, -height / 2 - 10, 10, 10);
            ctx.fill();
        }
    }

    drawSelectionBox(ctx, comp) {
        const bbox = comp.getBoundingBox ? comp.getBoundingBox() : null;
        if (!bbox) return;

        // Koordinatları local'e çevir
        const w = bbox.maxX - bbox.minX;
        const h = bbox.maxY - bbox.minY;

        ctx.strokeStyle = this.secilenRenk;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
        ctx.setLineDash([]);
    }

    drawSnapIndicator(ctx, snap) {
        // Snap göstergesi kaldırıldı - kullanıcı istemiyor
        // ctx.save();
        // ctx.fillStyle = '#00FF00';
        // ctx.beginPath();
        // ctx.arc(snap.x, snap.y, 5, 0, Math.PI * 2);
        // ctx.fill();
        // ctx.fillStyle = '#00FF00';
        // ctx.font = '10px Arial';
        // ctx.textAlign = 'left';
        // ctx.fillText(snap.type.name, snap.x + 8, snap.y - 8);
        // ctx.restore();
    }

    hexToRgba(hex, alpha) {
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
