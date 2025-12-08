/**
 * Tesisat Modülü Tip Tanımları (v2)
 */

export const PLUMBING_CONSTANTS = {
    WALL_THICKNESS: 20, // Varsayılan duvar kalınlığı (cm)
    PIPE_OFFSET: 5,     // Boru açıklığı (cm) - Kullanıcı değiştirebilir
    SNAP_DISTANCE: 10,  // Snap yakalama mesafesi (cm)
    MIN_PIPE_LENGTH: 5, // Minimum boru uzunluğu

    // *** VANA VE NESNE MESAFE KURALLARI ***
    MIN_EDGE_DISTANCE: 2,   // Boru uçlarından minimum mesafe (cm)
    OBJECT_MARGIN: 2,       // Her nesnenin sağında ve solunda bırakılacak margin (cm)
};

export const PLUMBING_PIPE_TYPES = {
    STANDARD: {
        id: 'standard',
        name: 'Standart Boru',
        diameter: 2,
        color: 0x2d7a2d,
        lineWidth: 6,
    },
    THICK: {
        id: 'thick',
        name: 'Kalın Boru',
        diameter: 4,
        color: 0x1b5e20,
        lineWidth: 10,
    }
};

export const PLUMBING_COMPONENT_TYPES = {
    SERVICE_BOX: {
        id: 'service_box',
        name: 'Servis Kutusu',
        width: 40,
        height: 20,
        depth: 70,
        color: 0xA8A8A8,
        mountType: 'wall', // Duvara monte
        hasOutput: true,
        hasInput: false
    },
    METER: {
        id: 'meter',
        name: 'Sayaç',
        width: 18,
        height: 18,
        depth: 40,
        color: 0xA8A8A8,
        mountType: 'pipe', // Boru üzeri/ucu
        connectionLength: 10 // Giriş kolu esnekliği için ref
    },
    VALVE: {
        id: 'valve',
        name: 'Vana',
        width: 6,
        height: 6,
        color: 0xA0A0A0,
        mountType: 'pipe',
        subTypes: {
            INTERMEDIATE: ['AKV', 'KKV', 'EMNIYET', 'CIHAZ', 'SELENOID', 'SAYAC'],
            TERMINATION: ['BRANSMAN', 'YAN_BINA', 'DOMESTIK']
        }
    },
    DEVICE: {
        id: 'device',
        name: 'Cihaz',
        width: 50,
        height: 50,
        color: 0xC0C0C0,
        mountType: 'wall_or_floor',
        hasFlex: true
    }
};

export const SNAP_TYPES = {
    INTERSECTION: { priority: 1, name: 'Kesişim' },
    PERPENDICULAR: { priority: 2, name: 'Diklik' },
    ON_LINE: { priority: 3, name: 'Hat Üzeri' },
    GRID: { priority: 4, name: 'Grid' } // En düşük öncelik veya kapalı
};
