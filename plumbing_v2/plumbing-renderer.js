/**
 * PlumbingRenderer (v2)
 * Tesisat elemanlarını ekrana çizer - yeni bileşenlerle entegre
 */

import { BORU_TIPLERI } from './objects/pipe.js';
import { SERVIS_KUTUSU_CONFIG, CIKIS_YONLERI } from './objects/service-box.js';
import { SAYAC_CONFIG } from './objects/meter.js';
import { VANA_CONFIG, VANA_TIPLERI } from './objects/valve.js';
import { CIHAZ_TIPLERI, FLEKS_CONFIG } from './objects/device.js';

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
        const snap = manager.interactionManager?.activeSnap;
        if (snap) {
            this.drawSnapIndicator(ctx, snap);
        }
    }

    drawPipes(ctx, pipes) {
        if (!pipes) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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

            // Uç noktalar
            this.drawPipeEndpoints(ctx, pipe);
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
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 3;

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

        // Çıkış noktası göstergesi
        const cikisLocal = comp.getCikisLocalKoordinat();
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(cikisLocal.x, cikisLocal.y, 3, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.save();

        // Snap noktası
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(snap.x, snap.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Snap tipi yazısı
        ctx.fillStyle = '#00FF00';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(snap.type.name, snap.x + 8, snap.y - 8);

        ctx.restore();
    }

    hexToRgba(hex, alpha) {
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
