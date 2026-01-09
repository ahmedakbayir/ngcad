import * as THREE from 'three';
import { PLUMBING_PIPE_TYPES, PLUMBING_COMPONENT_TYPES } from '../plumbing_v2/plumbing-types.js';
import { BORU_TIPLERI } from '../plumbing_v2/objects/pipe.js';
// PLUMBING_BLOCK_TYPES artık PLUMBING_COMPONENT_TYPES olarak v2'de
const PLUMBING_BLOCK_TYPES = PLUMBING_COMPONENT_TYPES;

/**
 * TESİSAT BLOKLARI 3D RENDERING
 *
 * Her blok tipi için özel geometri ve mesh oluşturma fonksiyonları
 */

/**
 * Yuvarlatılmış köşeli kutu geometrisi oluşturur
 */
function createRoundedBoxGeometry(width, height, depth, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const w = width;
    const h = height;
    const r = Math.min(radius, Math.min(w, h) / 2);

    // Yuvarlatılmış dikdörtgen çiz
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

/**
 * Çift kesik koni geometrisi (vana için)
 */
function createDoubleConeFrustumGeometry(length, largeRadius, smallRadius) {
    const geometry = new THREE.BufferGeometry();

    const segments = 16;
    const vertices = [];
    const indices = [];
    const normals = [];

    // Sol koni (kesik)
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Sol geniş uç
        vertices.push(-length / 2, largeRadius * cos, largeRadius * sin);
        normals.push(-0.5, cos * 0.866, sin * 0.866);

        // Ortada dar uç
        vertices.push(0, smallRadius * cos, smallRadius * sin);
        normals.push(0, cos, sin);
    }

    // Sağ koni (kesik)
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Ortada dar uç
        vertices.push(0, smallRadius * cos, smallRadius * sin);
        normals.push(0, cos, sin);

        // Sağ geniş uç
        vertices.push(length / 2, largeRadius * cos, largeRadius * sin);
        normals.push(0.5, cos * 0.866, sin * 0.866);
    }

    // İndeksler
    for (let i = 0; i < segments; i++) {
        // Sol koni
        const base1 = i * 2;
        indices.push(base1, base1 + 2, base1 + 1);
        indices.push(base1 + 1, base1 + 2, base1 + 3);

        // Sağ koni
        const base2 = (segments + 1) * 2 + i * 2;
        indices.push(base2, base2 + 2, base2 + 1);
        indices.push(base2 + 1, base2 + 2, base2 + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    return geometry;
}

/**
 * Servis Kutusu mesh'i oluşturur
 */
function createServisKutusuMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.SERVIS_KUTUSU;

    // Ana kutu (3D'de: width=X, depth=yükseklik, height3D=Z)
    const geometry = createRoundedBoxGeometry(
        config.width,
        config.height,
        config.depth,
        config.cornerRadius
    );

    // Geometriyi döndür: XY düzleminde -> XZ düzlemine
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, config.depth / 2, 0); // Zeminden yükselt

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    // Tüm bağlantı noktalarını göster (6 adet)
    config.connectionPoints.forEach((cp, i) => {
        const connectionGeom = new THREE.SphereGeometry(2, 8, 8);
        const connectionMat = new THREE.MeshStandardMaterial({
            color: 0xFF0000,
            emissive: 0xFF0000,
            emissiveIntensity: 0.3
        });
        const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
        connectionMesh.position.set(cp.x, cp.z, cp.y); // z koordinatını Y eksenine kullan
        group.add(connectionMesh);
    });

    return group;
}

/**
 * Sayaç mesh'i oluşturur
 */
function createSayacMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.SAYAC;

    const geometry = createRoundedBoxGeometry(
        config.width,
        config.height,
        config.depth,
        config.cornerRadius
    );

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, config.depth / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    // Bağlantı noktaları (giriş-çıkış)
    config.connectionPoints.forEach((cp, i) => {
        const connectionGeom = new THREE.SphereGeometry(2, 8, 8);
        const connectionMat = new THREE.MeshStandardMaterial({
            color: i === 0 ? 0x00FF00 : 0xFF0000, // Yeşil=giriş, Kırmızı=çıkış
            emissive: i === 0 ? 0x00FF00 : 0xFF0000,
            emissiveIntensity: 0.3
        });
        const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
        connectionMesh.position.set(cp.x, cp.z, cp.y); // z koordinatını Y eksenine kullan
        group.add(connectionMesh);
    });

    return group;
}

/**
 * Vana mesh'i oluşturur
 */
export function createVanaMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.VANA;

    // Çift kesik koni geometrisi (dar uçlar ortada birleşik)
    const geometry = createDoubleConeFrustumGeometry(
        config.width,
        config.height / 2,  // Geniş yarıçap
        1                    // Dar yarıçap
    );

    // Geometri zaten X ekseni boyunca doğru yönde, rotasyon gerekmez
    geometry.translate(0, config.height / 2, 0); // Yerden yükselt

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.material.color.setHex(config.color);
    mesh.material.metalness = 0.6;
    mesh.material.roughness = 0.3;

    const group = new THREE.Group();
    group.add(mesh);

    // Bağlantı noktaları
    config.connectionPoints.forEach((cp, i) => {
        const connectionGeom = new THREE.SphereGeometry(1.5, 8, 8);
        const connectionMat = new THREE.MeshStandardMaterial({
            color: i === 0 ? 0x00FF00 : 0xFF0000,
            emissive: i === 0 ? 0x00FF00 : 0xFF0000,
            emissiveIntensity: 0.3
        });
        const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
        connectionMesh.position.set(cp.x, cp.z, cp.y); // z koordinatını Y eksenine kullan
        group.add(connectionMesh);
    });

    return group;
}

/**
 * Kombi mesh'i oluşturur
 * SADELEŞTIRILMIŞ: Fazladan panel şekilleri kaldırıldı
 * DİK DURUŞ: Kombi duvara monte, dik olarak durmalı
 */
function createKombiMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.KOMBI;

    // Kombi için geometri: genişlik x yükseklik x derinlik
    // X: 41 (genişlik), Y: 29 (yükseklik/derinlik için shape), Z: 72 (extrude - dik yükseklik)
    const geometry = createRoundedBoxGeometry(
        config.width,      // 41 -> X (genişlik)
        config.depth,      // 29 -> Y (shape yüksekliği)
        config.height,     // 72 -> Z (extrude - dik yükseklik)
        config.cornerRadius
    );

    // Kombi dik duracak, rotateX YAPMA
    // Ama shape XY düzleminde, biz XZ düzleminde istiyoruz
    // O yüzden 90 derece rotasyonla XZ düzlemine getir
    geometry.rotateX(-Math.PI / 2); // -90 derece: Y -> Z, Z -> -Y

    // Merkezi ayarla: Dik yükseklik (height=72) Y ekseninde olmalı
    geometry.translate(0, config.height / 2, 0);

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    // Bağlantı noktası (altta, zemin seviyesinde)
    const connectionGeom = new THREE.SphereGeometry(3, 8, 8);
    const connectionMat = new THREE.MeshStandardMaterial({
        color: 0xFF0000,
        emissive: 0xFF0000,
        emissiveIntensity: 0.3
    });
    const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
    const cpKombi = config.connectionPoints[0];
    connectionMesh.position.set(cpKombi.x, cpKombi.z, cpKombi.y); // z koordinatını Y eksenine kullan
    group.add(connectionMesh);

    return group;
}

/**
 * Ocak mesh'i oluşturur
 */
function createOcakMesh(block, material) {
    const config = PLUMBING_BLOCK_TYPES.OCAK;

    // Ana gövde
    const geometry = createRoundedBoxGeometry(
        config.width,
        config.height, // 2D Y boyutu (shape height)
        config.depth,  // 3D Y eksenindeki yükseklik (extrude depth)
        config.cornerRadius
    );

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, config.depth / 2, 0); // depth kullan (59 cm yükseklik)

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.material.color.setHex(config.color);

    const group = new THREE.Group();
    group.add(mesh);

    // Ocak gözleri (4 adet silindir) - 2D ile uyumlu (offset = 10 cm)
    // DÜZELTME: Gözler ocağın üst yüzeyine yakın, ocaktan kopuk değil
    const burnerOffset = 10; // 2D'deki offset ile aynı
    const burnerPositions = [
        { x: -burnerOffset, z: -burnerOffset },
        { x: burnerOffset, z: -burnerOffset },
        { x: -burnerOffset, z: burnerOffset },
        { x: burnerOffset, z: burnerOffset }
    ];

    burnerPositions.forEach(pos => {
        const burnerGeom = new THREE.CylinderGeometry(7, 7, 1, 16); // 7 cm radius, 1 cm yükseklik (daha ince)
        const burnerMat = new THREE.MeshStandardMaterial({
            color: 0x101010,
            metalness: 0.8,
            roughness: 0.2
        });
        const burnerMesh = new THREE.Mesh(burnerGeom, burnerMat);
        // Ocağın üst yüzeyinin hemen üstünde (depth + 0.5 cm)
        burnerMesh.position.set(pos.x, config.depth + 0.5, pos.z);
        group.add(burnerMesh);
    });

    // Bağlantı noktası (arka ortada)
    const connectionGeom = new THREE.SphereGeometry(3, 8, 8);
    const connectionMat = new THREE.MeshStandardMaterial({
        color: 0xFF0000,
        emissive: 0xFF0000,
        emissiveIntensity: 0.3
    });
    const connectionMesh = new THREE.Mesh(connectionGeom, connectionMat);
    const cpOcak = config.connectionPoints[0];
    connectionMesh.position.set(cpOcak.x, cpOcak.z, cpOcak.y); // z koordinatını Y eksenine kullan
    group.add(connectionMesh);

    return group;
}

/**
 * Tesisat bloğu için mesh oluşturur (factory pattern)
 */
export function createPlumbingBlockMesh(block, material) {
    const blockType = block.blockType;
    let group;

    switch (blockType) {
        case 'SERVIS_KUTUSU':
            group = createServisKutusuMesh(block, material);
            break;
        case 'SAYAC':
            group = createSayacMesh(block, material);
            break;
        case 'VANA':
            group = createVanaMesh(block, material);
            break;
        case 'KOMBI':
            group = createKombiMesh(block, material);
            break;
        case 'OCAK':
            group = createOcakMesh(block, material);
            break;
        default:
            console.error(`Bilinmeyen blok tipi: ${blockType}`);
            return null;
    }

    // Pozisyon ve rotasyon
    group.position.set(block.center.x, 0, block.center.y);
    group.rotation.y = -(block.rotation || 0) * Math.PI / 180;

    return group;
}

/**
 * Materyal oluşturur
 */
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

/**
 * Tek bir boruyu 3D silindir olarak oluşturur
 * @param {object} pipe - Boru nesnesi
 * @param {THREE.Material} material - Varsayılan materyal
 * @returns {THREE.Mesh} - Boru mesh'i
 */
export function createPlumbingPipeMesh(pipe, material) {
    // Hem yeni sistem (pipeType) hem eski sistem (boruTipi) ile uyumlu
    const config = pipe.typeConfig
        || PLUMBING_PIPE_TYPES[pipe.pipeType]
        || BORU_TIPLERI[pipe.boruTipi]
        || BORU_TIPLERI.STANDART; // Fallback

    // Koordinat farkları
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);

    // Boru uzunluğu (3D mesafe, Z koordinatını da dahil et)
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.1) return null; // Çok kısa boru

    // Silindir geometrisi
    const radius = config.diameter / 2; // Yarıçap
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);

    // Materyal oluştur
    const pipeMaterial = new THREE.MeshStandardMaterial({
        color: config.color,
        metalness: 0.6,
        roughness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, pipeMaterial);

    // Merkez noktası (3D)
    const midX = (pipe.p1.x + pipe.p2.x) / 2;
    const midY = ((pipe.p1.z || 0) + (pipe.p2.z || 0)) / 2; // Z koordinatı THREE.js'te Y ekseni
    const midZ = (pipe.p1.y + pipe.p2.y) / 2; // Y koordinatı THREE.js'te Z ekseni

    mesh.position.set(midX, midY, midZ);

    // Düşey boru kontrolü (sadece Z farkı varsa)
    const isVertical = Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && Math.abs(dz) > 0.1;

    // Debug: Boru bilgilerini logla
    console.log('🔧 Boru:', {
        id: pipe.id?.substring(0, 15),
        dx, dy, dz,
        length,
        isVertical,
        p1: pipe.p1,
        p2: pipe.p2
    });

    if (isVertical) {
        // Düşey boru: Silindir zaten Y ekseninde, rotasyon gerekmiyor
        // (THREE.CylinderGeometry varsayılan olarak Y ekseni boyunca oluşturulur)
        console.log('✅ Düşey boru - rotasyon yok');
        // Ek test: Mesh'i açıkça kontrol et
        console.log('   Position:', mesh.position);
        console.log('   Rotation:', mesh.rotation);
    } else {
        // Yatay veya eğik boru: Silindiri döndür

        // Borunun yönünü hesapla (2D koordinatlardan THREE.js koordinatlarına)
        const direction = new THREE.Vector3(dx, dz, dy).normalize();

        // Varsayılan silindir yönü (Y ekseni)
        const defaultDirection = new THREE.Vector3(0, 1, 0);

        // Rotasyon için quaternion hesapla
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(defaultDirection, direction);
        mesh.setRotationFromQuaternion(quaternion);

        console.log('🔄 Yatay/eğik boru - direction:', direction, 'quaternion:', quaternion);
    }

    return mesh;
}

/**
 * Boru materyal oluşturur
 */
export function createPlumbingPipeMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.4,
        metalness: 0.6
    });
}
