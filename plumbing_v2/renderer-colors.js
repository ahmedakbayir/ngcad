// plumbing_v2/renderer-colors.js
// Renk ve tema ile ilgili yardımcı metodlar

import { getRenkGruplari } from './objects/pipe.js';
import { isLightMode } from '../general-files/main.js';
import { CUSTOM_COLORS } from './renderer-utils.js';

/**
 * Renk yönetimi ile ilgili mixin metodları
 */
export const ColorMixin = {
    /**
     * Renk grubundan opacity ile renk al (TEMAya göre dinamik)
     */
    getRenkByGroup(colorGroup, tip, opacity) {
        const renkGruplari = getRenkGruplari(); // Dinamik olarak temaya göre al
        const group = renkGruplari[colorGroup] || renkGruplari.YELLOW;
        const template = group[tip];

        if (template.includes('{opacity}')) {
            return template.replace('{opacity}', opacity);
        }
        return template;
    },

    /**
     * Şu anki temayı kontrol et (light mode mu?)
     */
    isLightMode() {
        // main.js'ten import edilen fonksiyonu kullan
        return isLightMode();
    },

    /**
     * Seçili eleman rengi al
     */
    getSecilenRenk(colorGroup) {
        // İsteğiniz üzerine tüm seçili durumlar için standart gri
        return CUSTOM_COLORS.SELECTED;
    },

    /**
     * Hex rengi RGB'ye çevir
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 191, b: 255 }; // Varsayılan
    },

    /**
     * Hex rengi RGBA string'e çevir
     */
    hexToRgba(hex, alpha) {
        const hexStr = hex.toString(16).padStart(6, '0');
        const r = parseInt(hexStr.substring(0, 2), 16);
        const g = parseInt(hexStr.substring(2, 4), 16);
        const b = parseInt(hexStr.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    /**
     * Rengi aydınlatma helper fonksiyonu
     */
    lightenColor(color, amount) {
        // rgba formatı için
        if (color.startsWith('rgba')) {
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                let r = parseInt(match[1]);
                let g = parseInt(match[2]);
                let b = parseInt(match[3]);
                const a = match[4] ? parseFloat(match[4]) : 1;

                r = Math.min(255, Math.floor(r + (255 - r) * amount));
                g = Math.min(255, Math.floor(g + (255 - g) * amount));
                b = Math.min(255, Math.floor(b + (255 - b) * amount));

                return `rgba(${r}, ${g}, ${b}, ${a})`;
            }
        }
        // rgb formatı için
        if (color.startsWith('rgb')) {
            const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                let r = parseInt(match[1]);
                let g = parseInt(match[2]);
                let b = parseInt(match[3]);

                r = Math.min(255, Math.floor(r + (255 - r) * amount));
                g = Math.min(255, Math.floor(g + (255 - g) * amount));
                b = Math.min(255, Math.floor(b + (255 - b) * amount));

                return `rgb(${r}, ${g}, ${b})`;
            }
        }
        // hex formatı için
        if (color.startsWith('#')) {
            const hex = color.substring(1);
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);

            r = Math.min(255, Math.floor(r + (255 - r) * amount));
            g = Math.min(255, Math.floor(g + (255 - g) * amount));
            b = Math.min(255, Math.floor(b + (255 - b) * amount));

            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        return color;
    }
};
