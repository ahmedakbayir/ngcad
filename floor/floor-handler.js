// floor-handler.js
import { state, setState } from '../general-files/main.js';

/**
 * Default katları initialize eder
 * İlk açılışta: alt kat (placeholder), zemin (aktif), üst kat (placeholder)
 */
export function initializeDefaultFloors() {
    // Eğer zaten katlar varsa, tekrar initialize etme
    if (state.floors && state.floors.length > 0) {
        return;
    }

    const defaultHeight = state.defaultFloorHeight;

    // Alt kat (placeholder)
    const lowerFloor = {
        id: 'floor-lower-placeholder',
        name: 'BODRUM (Hazır)',
        bottomElevation: -defaultHeight,
        topElevation: 0,
        visible: false,
        isPlaceholder: true
    };

    // Zemin kat (aktif)
    const groundFloor = {
        id: 'floor-ground',
        name: 'ZEMİN',
        bottomElevation: 0,
        topElevation: defaultHeight,
        visible: true,
        isPlaceholder: false
    };

    // Üst kat (placeholder)
    const upperFloor = {
        id: 'floor-upper-placeholder',
        name: '1.KAT (Hazır)',
        bottomElevation: defaultHeight,
        topElevation: defaultHeight * 2,
        visible: false,
        isPlaceholder: true
    };

    setState({
        floors: [lowerFloor, groundFloor, upperFloor],
        currentFloor: groundFloor
    });
}

/**
 * Belirli bir kata geçiş yapar
 * @param {string} floorId - Kat ID'si
 */
export function switchToFloor(floorId) {
    const floor = state.floors.find(f => f.id === floorId);

    if (floor && !floor.isPlaceholder) {
        setState({ currentFloor: floor });
    }
}

/**
 * Yeni bir kat ekler
 * @param {number} bottomElevation - Alt kot (cm)
 * @param {number} topElevation - Üst kot (cm)
 * @param {string} name - Kat adı
 * @returns {object} Yeni kat objesi
 */
export function addFloor(bottomElevation, topElevation, name) {
    const newFloor = {
        id: `floor-${Date.now()}`,
        name: name || `Kat ${state.floors.length + 1}`,
        bottomElevation,
        topElevation,
        visible: true,
        isPlaceholder: false
    };

    const floors = [...state.floors, newFloor];

    // Katları yüksekliğe göre sırala (alçaktan yükseğe)
    floors.sort((a, b) => a.bottomElevation - b.bottomElevation);

    setState({ floors });

    return newFloor;
}

/**
 * Bir katı siler
 * @param {string} floorId - Silinecek katın ID'si
 */
export function deleteFloor(floorId) {
    const floors = state.floors.filter(f => f.id !== floorId);

    // Eğer aktif kat silindiyse, başka bir kata geç
    if (state.currentFloor?.id === floorId) {
        const newCurrentFloor = floors.find(f => !f.isPlaceholder) || null;
        setState({ currentFloor: newCurrentFloor });
    }

    setState({ floors });
}

/**
 * Bir katın adını günceller
 * @param {string} floorId - Kat ID'si
 * @param {string} newName - Yeni isim
 */
export function renameFloor(floorId, newName) {
    const floors = state.floors.map(f => {
        if (f.id === floorId) {
            return { ...f, name: newName };
        }
        return f;
    });

    setState({ floors });
}

/**
 * Bir katın yüksekliğini günceller
 * @param {string} floorId - Kat ID'si
 * @param {number} bottomElevation - Yeni alt kot
 * @param {number} topElevation - Yeni üst kot
 */
export function updateFloorElevation(floorId, bottomElevation, topElevation) {
    const floors = state.floors.map(f => {
        if (f.id === floorId) {
            return {
                ...f,
                bottomElevation,
                topElevation
            };
        }
        return f;
    });

    // Katları yüksekliğe göre yeniden sırala
    floors.sort((a, b) => a.bottomElevation - b.bottomElevation);

    setState({ floors });
}

/**
 * Aktif katın yükseklik aralığını döndürür
 * @returns {object} { bottom: number, top: number } veya null
 */
export function getCurrentFloorElevation() {
    if (!state.currentFloor) {
        return null;
    }

    return {
        bottom: state.currentFloor.bottomElevation,
        top: state.currentFloor.topElevation,
        height: state.currentFloor.topElevation - state.currentFloor.bottomElevation
    };
}

/**
 * Tüm görünür katları döndürür
 * @returns {Array} Görünür katlar
 */
export function getVisibleFloors() {
    return state.floors.filter(f => f.visible && !f.isPlaceholder);
}

/**
 * Belirli bir yükseklikte hangi kat olduğunu bulur
 * @param {number} elevation - Yükseklik (cm)
 * @returns {object|null} Kat objesi veya null
 */
export function getFloorAtElevation(elevation) {
    return state.floors.find(f =>
        !f.isPlaceholder &&
        elevation >= f.bottomElevation &&
        elevation < f.topElevation
    ) || null;
}
