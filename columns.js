// ahmedakbayir/ngcad/ngcad-b3712dab038a327c261e2256cbd1d4d58a069f34/columns.js

import { state } from './main.js';

// Kolon nesnesi oluşturur
export function createColumn(centerX, centerY, size = 40) {
    return {
        type: 'column',
        center: { x: centerX, y: centerY },
        size: size, // Başlangıç boyutu, width/height öncelikli
        width: size,
        height: size,
        rotation: 0,
        // Hollow özellikleri (İçi boşaltma kaldırıldığı için artık aktif kullanılmıyor)
        hollowWidth: 0,
        hollowHeight: 0,
        hollowOffsetX: 0,
        hollowOffsetY: 0
    };
}

// Kolonun dünya koordinatlarındaki köşe noktalarını hesaplar
export function getColumnCorners(column) {
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;
    const cx = column.center.x;
    const cy = column.center.y;
    const rot = (column.rotation || 0) * Math.PI / 180; // Dereceyi radyana çevir

    // Lokal koordinatlardaki köşeler (merkeze göre)
    const corners = [
        { x: -halfWidth, y: -halfHeight },  // Sol üst   (index 0)
        { x: halfWidth, y: -halfHeight },   // Sağ üst   (index 1)
        { x: halfWidth, y: halfHeight },    // Sağ alt   (index 2)
        { x: -halfWidth, y: halfHeight }    // Sol alt   (index 3)
    ];

    // Döndürme uygula ve dünya koordinatlarına çevir
    return corners.map(corner => {
        // Döndürme matrisi uygulaması
        const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot);
        const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot);
        // Merkez koordinatlarını ekleyerek dünya koordinatlarına çevir
        return {
            x: cx + rotatedX,
            y: cy + rotatedY
        };
    });
}

// --- GÜNCELLENMİŞ YARDIMCI FONKSİYON: Kenar VEYA Köşe Handle Tespiti ---
// Verilen noktanın, kolonun hangi kenarına veya köşesine denk geldiğini belirler.
// point: Dünya koordinatlarında {x, y}
// column: Kontrol edilecek kolon nesnesi
// tolerance: Yakınlık toleransı (dünya birimi cinsinden)
export function getColumnHandleAtPoint(point, column, tolerance) {
    const cx = column.center.x;
    const cy = column.center.y;
    
    // 1. Köşeleri Kontrol Et (Daha yüksek öncelikli)
    const corners = getColumnCorners(column);
    const cornerTolerance = tolerance * 1.5; // Köşeler için biraz daha fazla tolerans
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) {
            return `corner_${i}`; // Köşe handle'ı (örn: "corner_0")
        }
    }

    // 2. Kenarları Kontrol Et
    // Noktayı kolonun lokal koordinat sistemine çevirmek için ters döndürme açısı
    const rot = -(column.rotation || 0) * Math.PI / 180;

    // Noktanın kolona göre göreli koordinatları (dx, dy)
    const dx = point.x - cx;
    const dy = point.y - cy;
    // Göreli koordinatları kolonun açısına göre döndürerek lokal koordinatları bul
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);

    // Kolonun yarı genişlik ve yüksekliği (güncel width/height kullanılır)
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;

    // Lokal koordinatlara göre kenarlara olan mesafeleri kontrol et
    // Üst kenar: localY ≈ -halfHeight ve |localX| <= halfWidth
    if (Math.abs(localY + halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) { // Genişlikte de küçük bir tolerans
        return 'edge_top';
    }
    // Alt kenar: localY ≈ +halfHeight ve |localX| <= halfWidth
    if (Math.abs(localY - halfHeight) < tolerance && Math.abs(localX) <= halfWidth + tolerance) {
        return 'edge_bottom';
    }
    // Sol kenar: localX ≈ -halfWidth ve |localY| <= halfHeight
    if (Math.abs(localX + halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) {
        return 'edge_left';
    }
    // Sağ kenar: localX ≈ +halfWidth ve |localY| <= halfHeight
    if (Math.abs(localX - halfWidth) < tolerance && Math.abs(localY) <= halfHeight + tolerance) {
        return 'edge_right';
    }

    return null; // Herhangi bir kenara veya köşeye yakın değil
}
// --- YARDIMCI FONKSİYON SONU ---


// Verilen noktada hangi nesnenin (kolon, kenar, köşe, gövde) olduğunu belirler
export function getColumnAtPoint(point) {
    const { columns, zoom, selectedObject } = state;
    // Kenar/Köşe yakalama toleransı (Zoom'a göre ayarlı, dünya birimi)
    const handleTolerance = 8 / zoom;
    // Gövde yakalama toleransı (kenardan biraz daha büyük olabilir)
    // const bodyTolerance = 12 / zoom; // Bu aslında isPointInColumn içinde örtük olarak var

    // Önce seçili kolonun kenarlarını/köşelerini kontrol et (daha hassas seçim için)
    if (selectedObject?.type === 'column') {
        const column = selectedObject.object;

        // Kenar veya köşe tutamacını ara
        const handle = getColumnHandleAtPoint(point, column, handleTolerance);
        if (handle) {
            // Bir tutamaç bulunduysa, onu döndür
            return { type: 'column', object: column, handle: handle };
        }
        // Seçili kolonun merkezi artık kontrol edilmiyor
    }

    // Seçili kolonun tutamacı tıklanmadıysa veya başka bir kolon seçiliyse,
    // tıklanan noktadaki kolonun gövdesini ara
    // Not: Üst üste binen kolonlarda en üsttekini seçmek için tersten iterate ediyoruz.
    for (const column of [...columns].reverse()) {
        // Nokta bu kolonun içinde mi?
        if (isPointInColumn(point, column)) {
            // Nokta içinde, ama acaba bir tutamaca mı daha yakın? (Özellikle seçili olmayan kolonlarda önemli)
            // Eğer seçili olmayan bir kolonun kenarına/köşesine tıklanırsa, onu seçmek yerine gövdesinden sürüklemeli.
            // Bu yüzden seçili OLMAYAN kolonlar için tutamaç kontrolü yapmıyoruz burada.
            // Sadece gövde içinde mi diye bakıyoruz.
            return { type: 'column', object: column, handle: 'body' };
        }
    }

    return null; // Tıklanan noktada kolon veya tutamacı bulunamadı
}


// Noktanın kolon içinde olup olmadığını kontrol eder
// point: Dünya koordinatlarında {x, y}
// column: Kontrol edilecek kolon nesnesi
export function isPointInColumn(point, column) {
    const cx = column.center.x;
    const cy = column.center.y;
    // Ters döndürme açısı
    const rot = -(column.rotation || 0) * Math.PI / 180;
    // Göreli koordinatlar
    const dx = point.x - cx;
    const dy = point.y - cy;
    // Lokal koordinatlar
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    // Yarı boyutlar (güncel width/height kullanılır)
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;
    // Lokal X ve Y, yarı boyutların içinde mi? (Eşitlik dahil)
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
}