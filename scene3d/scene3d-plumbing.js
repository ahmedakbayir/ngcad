import * as THREE from 'three';
import { PLUMBING_PIPE_TYPES, PLUMBING_COMPONENT_TYPES } from '../plumbing_v2/plumbing-types.js';
import { BORU_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { CIHAZ_TIPLERI } from '../plumbing_v2/objects/device.js';

// PLUMBING_BLOCK_TYPES undefined gelme ihtimaline karşı boş obje ile koruma
const PLUMBING_BLOCK_TYPES = PLUMBING_COMPONENT_TYPES || {};

/**
 * TESİSAT BLOKLARI 3D RENDERING
 */

function createRoundedBoxGeometry(width, height, depth, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const w = width;
    const h = height;
    const r = Math.min(radius, Math.min(w, h) / 2);

    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    const extrudeSettings = {
        depth: depth,
        bevelEnabled: false
    };

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function createDoubleConeFrustumGeometry(length, largeRadius, smallRadius) {
    const geometry = new THREE.BufferGeometry();
    const segments = 16;
    const vertices = [];
    const indices = [];
    const normals = [];

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(-length / 2, largeRadius * cos, largeRadius * sin);
        normals.push(-0.5, cos * 0.866, sin * 0.866);
        vertices.push(0, smallRadius * cos, smallRadius * sin);
        normals.push(0, cos, sin);
    }

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(0, smallRadius * cos, smallRadius * sin);
        normals.push(0, cos, sin);
        vertices.push(length / 2, largeRadius * cos, largeRadius * sin);
        normals.push(0.5, cos * 0.866, sin * 0.866);
    }

    for (let i = 0; i < segments; i++) {
        const base1 = i * 2;
        indices.push(base1, base1 + 2, base1 + 1);
        indices.push(base1 + 1, base1 + 2, base1 + 3);

        const base2 = (segments + 1) * 2 + i * 2;
        indices.push(base2, base2 + 2, base2 + 1);
        indices.push(base2 + 1, base2 + 2, base2 + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return geometry;
}

function createServisKutusuMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.SERVIS_KUTUSU || {};

    const geometry = createRoundedBoxGeometry(
        config.width || 40,
        config.height || 40,
        config.depth || 20,
        config.cornerRadius || 2
    );

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, (config.depth || 20) / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (config.color) mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    if (config.connectionPoints && Array.isArray(config.connectionPoints)) {
        config.connectionPoints.forEach((cp) => {
            const connectionGeom = new THREE.SphereGeometry(2, 8, 8);
            const connectionMat = new THREE.MeshStandardMaterial({
                color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.3
            });
            const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
            connectionMesh.position.set(cp.x || 0, cp.z || 0, cp.y || 0); 
            group.add(connectionMesh);
        });
    }

    return group;
}

function createSayacMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.SAYAC || {};

    const geometry = createRoundedBoxGeometry(
        config.width || 30,
        config.height || 20,
        config.depth || 15,
        config.cornerRadius || 2
    );

    geometry.rotateX(Math.PI / 2);
    // Sayaç borunun eksenine oturacak şekilde merkezlenmeli (translate kaldırıldı).

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (config.color) mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    if (config.connectionPoints && Array.isArray(config.connectionPoints)) {
        config.connectionPoints.forEach((cp, i) => {
            const connectionGeom = new THREE.SphereGeometry(2, 8, 8);
            const connectionMat = new THREE.MeshStandardMaterial({
                color: i === 0 ? 0x00FF00 : 0xFF0000, 
                emissive: i === 0 ? 0x00FF00 : 0xFF0000,
                emissiveIntensity: 0.3
            });
            const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
            connectionMesh.position.set(cp.x || 0, cp.z || 0, cp.y || 0); 
            group.add(connectionMesh);
        });
    }

    return group;
}

export function createVanaMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.VANA || {};

    const geometry = createDoubleConeFrustumGeometry(
        config.width || 10,
        (config.height || 10) / 2,  
        1                    
    );

    // SORUN BURADAYDI: Vana havaya kaldırılıyordu.
    // Borunun tam merkezine (eksenine) oturması için bu satırı İPTAL EDİYORUZ.
    // geometry.translate(0, (config.height || 10) / 2, 0); 

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (config.color) mesh.material.color.setHex(config.color);
    mesh.material.metalness = 0.6;
    mesh.material.roughness = 0.3;

    const group = new THREE.Group();
    group.add(mesh);

    if (config.connectionPoints && Array.isArray(config.connectionPoints)) {
        config.connectionPoints.forEach((cp, i) => {
            const connectionGeom = new THREE.SphereGeometry(1.5, 8, 8);
            const connectionMat = new THREE.MeshStandardMaterial({
                color: i === 0 ? 0x00FF00 : 0xFF0000,
                emissive: i === 0 ? 0x00FF00 : 0xFF0000,
                emissiveIntensity: 0.3
            });
            const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
            connectionMesh.position.set(cp.x || 0, cp.z || 0, cp.y || 0); 
            group.add(connectionMesh);
        });
    }

    return group;
}

function createKombiMesh(block, material) {
    // Boyutlar PLUMBING_BLOCK_TYPES yerine gerçek cihaz tanımından (CIHAZ_TIPLERI.KOMBI) okunur
    const config = { ...(PLUMBING_BLOCK_TYPES.KOMBI || {}), ...((CIHAZ_TIPLERI && CIHAZ_TIPLERI.KOMBI) || {}) };

    const geometry = createRoundedBoxGeometry(
        config.width || 41,
        config.depth || 29,
        config.height || 72,
        config.cornerRadius || 2
    );

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, (config.height || 72) / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (config.color) mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    if (config.connectionPoints && Array.isArray(config.connectionPoints) && config.connectionPoints.length > 0) {
        const connectionGeom = new THREE.SphereGeometry(3, 8, 8);
        const connectionMat = new THREE.MeshStandardMaterial({
            color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.3
        });
        const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
        const cpKombi = config.connectionPoints[0];
        connectionMesh.position.set(cpKombi.x || 0, cpKombi.z || 0, cpKombi.y || 0); 
        group.add(connectionMesh);
    }

    return group;
}

function createOcakMesh(block, material) {
    // Boyutlar PLUMBING_BLOCK_TYPES yerine gerçek cihaz tanımından (CIHAZ_TIPLERI.OCAK) okunur
    const config = { ...(PLUMBING_BLOCK_TYPES.OCAK || {}), ...((CIHAZ_TIPLERI && CIHAZ_TIPLERI.OCAK) || {}) };

    const geometry = createRoundedBoxGeometry(
        config.width || 60,
        config.height || 60,
        config.depth || 5,
        config.cornerRadius || 2
    );

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, (config.depth || 5) / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (config.color) mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    const burnerOffset = 10;
    const burnerPositions = [
        { x: -burnerOffset, z: -burnerOffset },
        { x: burnerOffset, z: -burnerOffset },
        { x: -burnerOffset, z: burnerOffset },
        { x: burnerOffset, z: burnerOffset }
    ];

    burnerPositions.forEach(pos => {
        const burnerGeom = new THREE.CylinderGeometry(7, 7, 1, 16);
        const burnerMat = new THREE.MeshStandardMaterial({
            color: 0x101010, metalness: 0.8, roughness: 0.2
        });
        const burnerMesh = new THREE.Mesh(burnerGeom, burnerMat);
        burnerMesh.position.set(pos.x, (config.depth || 5) + 0.5, pos.z);
        group.add(burnerMesh);
    });

    if (config.connectionPoints && Array.isArray(config.connectionPoints) && config.connectionPoints.length > 0) {
        const connectionGeom = new THREE.SphereGeometry(3, 8, 8);
        const connectionMat = new THREE.MeshStandardMaterial({
            color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.3
        });
        const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
        const cpOcak = config.connectionPoints[0];
        connectionMesh.position.set(cpOcak.x || 0, cpOcak.z || 0, cpOcak.y || 0); 
        group.add(connectionMesh);
    }

    return group;
}

function createGenericCihazMesh(block, material) {
    const cfg = (CIHAZ_TIPLERI && CIHAZ_TIPLERI[block.blockType]) || { width: 40, height: 40, depth: 40, color: 0xC0C0C0 };

    const geometry = createRoundedBoxGeometry(
        cfg.width || 40,
        cfg.depth || 40,   // Yükseklik (dik eksen)
        cfg.height || 40,  // Derinlik (yatay)
        2
    );

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, (cfg.height || 40) / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    if (cfg.color) mesh.material.color.setHex(cfg.color);

    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

export function createPlumbingBlockMesh(block, material) {
    try {
        if (!block || !block.center) {
            console.warn("Blok veya block.center eksik geldi!", block);
            return null;
        }

        const blockType = (block.blockType || block.type || '').toUpperCase();
        let group;

        switch (blockType) {
            case 'SERVIS_KUTUSU': group = createServisKutusuMesh(block, material); break;
            case 'SAYAC': group = createSayacMesh(block, material); break;
            case 'VANA': group = createVanaMesh(block, material); break;
            case 'KOMBI': group = createKombiMesh(block, material); break;
            case 'OCAK': group = createOcakMesh(block, material); break;
            case 'SOBA':
            case 'SOFBEN':
            case 'KAZAN':
            case 'TICARI':
                group = createGenericCihazMesh(block, material); break;
            default:
                console.warn(`Render atlandı. Bilinmeyen blok tipi: '${blockType}'`);
                return null;
        }

        if (!group) return null;

        const elevation = block.elevation || (block.center && block.center.z) || block.z || 0;
        
        group.position.set(block.center.x || 0, elevation, block.center.y || 0);
        group.rotation.y = -(block.rotation || 0) * Math.PI / 180;

        return group;
    } catch (error) {
        console.error("Blok render edilirken bir hata oluştu:", error, block);
        return null; // Çökmeyi engelle, sadece objeyi çizme
    }
}

export function createPlumbingBlockMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xD9DCE0,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
}

/**
 * TESİSAT BORULARI 3D RENDERING
 */

export function createPlumbingPipeMesh(pipe, material) {
    try {
        if (!pipe || !pipe.p1 || !pipe.p2) {
            console.warn("Boru p1 veya p2 noktaları eksik!", pipe);
            return null;
        }

        const config = pipe.typeConfig
            || (PLUMBING_PIPE_TYPES && PLUMBING_PIPE_TYPES[pipe.pipeType])
            || (BORU_TIPLERI && BORU_TIPLERI[pipe.boruTipi])
            || (BORU_TIPLERI && BORU_TIPLERI.STANDART)
            || {}; 

        const dx = (pipe.p2.x || 0) - (pipe.p1.x || 0);
        const dy = (pipe.p2.y || 0) - (pipe.p1.y || 0);
        const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);

        const length = Math.hypot(dx, dy, dz);
        if (length < 0.1 || isNaN(length)) return null;

        const radius = (config.diameter || 2) / 2;
        const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);

        const pipeMaterial = new THREE.MeshStandardMaterial({
            color: config.color || 0x808080,
            metalness: 0.6,
            roughness: 0.4
        });

        const mesh = new THREE.Mesh(geometry, pipeMaterial);

        const midX = ((pipe.p1.x || 0) + (pipe.p2.x || 0)) / 2;
        const midY = ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2; 
        const midZ = ((pipe.p1.y || 0) + (pipe.p2.y || 0)) / 2; 

        mesh.position.set(midX, midY, midZ);

        const horizontalDist = Math.hypot(dx, dy);
        const verticalDist = Math.abs(dz);
        const isVertical = horizontalDist < length * 0.05 && verticalDist > 0.1;

        if (!isVertical) {
            const direction = new THREE.Vector3(dx, dz, dy).normalize();
            
            // Sıfır vektörü kontrolü (NaN hatasını engeller)
            if (direction.lengthSq() > 0) {
                const defaultDirection = new THREE.Vector3(0, 1, 0);
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(defaultDirection, direction);
                mesh.setRotationFromQuaternion(quaternion);
            }
        }

        return mesh;
    } catch (error) {
        console.error("Boru render edilirken bir hata oluştu:", error, pipe);
        return null; // Çökmeyi engelle, sadece hatalı boruyu çizme
    }
}

export function createPlumbingPipeMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.4,
        metalness: 0.6
    });
}