/**
 * PlumbingRenderer (v2)
 * Tesisat elemanlarını ekrana çizer.
 */

import { PLUMBING_PIPE_TYPES, PLUMBING_COMPONENT_TYPES } from './plumbing-types.js';

export class PlumbingRenderer {
    constructor() {
        // Gerekirse görsel ayarlar buraya
    }

    /**
     * Tüm tesisatı çizer
     * @param {CanvasRenderingContext2D} ctx 
     * @param {PlumbingManager} manager 
     */
    render(ctx, manager) {
        if (!manager) return;

        this.drawPipes(ctx, manager.pipes);
        this.drawComponents(ctx, manager.components);

        // Ghost (yerleştirilmekte olan) eleman
        if (manager.tempComponent) {
            ctx.save();
            ctx.globalAlpha = 0.6; // Yarı saydam
            this.drawComponent(ctx, manager.tempComponent);
            ctx.restore();
        }
    }

    drawPipes(ctx, pipes) {
        if (!pipes) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        pipes.forEach(pipe => {
            const typeConfig = PLUMBING_PIPE_TYPES[pipe.type] || PLUMBING_PIPE_TYPES.STANDARD;

            ctx.beginPath();
            ctx.moveTo(pipe.p1.x, pipe.p1.y);
            ctx.lineTo(pipe.p2.x, pipe.p2.y);

            ctx.lineWidth = typeConfig.lineWidth;
            ctx.strokeStyle = this.hexToRgba(typeConfig.color, 1);
            ctx.stroke();

            // Debug: Node noktaları
            // ctx.fillStyle = 'red';
            // ctx.fillRect(pipe.p1.x - 2, pipe.p1.y - 2, 4, 4);
            // ctx.fillRect(pipe.p2.x - 2, pipe.p2.y - 2, 4, 4);
        });
    }

    drawComponents(ctx, components) {
        if (!components) return;
        components.forEach(comp => this.drawComponent(ctx, comp));
    }

    drawComponent(ctx, comp) {
        ctx.save();

        // Pozisyon ve Rotasyon
        ctx.translate(comp.x, comp.y);
        if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

        // Tip bazlı çizim
        switch (comp.type) {
            case 'service_box':
                this.drawServiceBox(ctx, comp);
                break;
            case 'meter':
                this.drawMeter(ctx, comp);
                break;
            case 'valve':
                this.drawValve(ctx, comp);
                break;
            case 'device':
                this.drawDevice(ctx, comp);
                break;
        }

        ctx.restore();
    }

    drawServiceBox(ctx, comp) {
        const { width, height, color } = PLUMBING_COMPONENT_TYPES.SERVICE_BOX;

        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        // Kutu
        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        // "S.K." Yazısı
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S.K.', 0, 0);
    }

    drawMeter(ctx, comp) {
        const { width, height, color } = PLUMBING_COMPONENT_TYPES.METER;

        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        // Sayaç gövdesi (Dairemsi)
        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Gösterge
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, width / 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawValve(ctx, comp) {
        const { width, height, color } = PLUMBING_COMPONENT_TYPES.VALVE;

        ctx.fillStyle = this.hexToRgba(color, 1);

        // Kelebek vana şekli (iki üçgen)
        ctx.beginPath();
        ctx.moveTo(-width, -height / 2);
        ctx.lineTo(-width, height / 2);
        ctx.lineTo(0, 0);
        ctx.lineTo(width, height / 2);
        ctx.lineTo(width, -height / 2);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        // Eğer sonlanma vanası ise kapama çizgisi
        if (comp.subType && ['BRANSMAN', 'YAN_BINA', 'DOMESTIK'].includes(comp.subType)) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(width + 2, -height);
            ctx.lineTo(width + 2, height);
            ctx.stroke();
        }
    }

    drawDevice(ctx, comp) {
        const { width, height, color } = PLUMBING_COMPONENT_TYPES.DEVICE;

        ctx.fillStyle = this.hexToRgba(color, 1);
        ctx.strokeStyle = '#333';

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        // Cihaz ismi veya sembolü
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Cihaz', 0, 0);
    }

    // Helper
    hexToRgba(hex, alpha) {
        // Hex number to string
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
