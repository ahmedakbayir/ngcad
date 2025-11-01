// scene3d-structures.js
// Kolon, kiriş ve merdivenler için 3D mesh oluşturma fonksiyonları.

import * as THREE from "three";
import { state, WALL_HEIGHT } from "./main.js";
import {
    columnMaterial, beamMaterial, stairMaterial, stairMaterialTop,
    stepNosingMaterial, handrailWoodMaterial, balusterMaterial
} from "./scene3d-core.js"; // Malzemeleri import et

/**
 * Bir kolon mesh'i oluşturur.
 */
export function createColumnMesh(column, material) {
    const columnWidth = column.width || column.size;
    const columnHeight3D = WALL_HEIGHT;
    const columnDepth = column.height || column.size;
    if (columnWidth < 1 || columnDepth < 1) return null;
    
    const columnGeom = new THREE.BoxGeometry(columnWidth, columnHeight3D, columnDepth);
    columnGeom.translate(0, columnHeight3D / 2, 0);
    const columnMesh = new THREE.Mesh(columnGeom, material);
    columnMesh.position.set(column.center.x, 0, column.center.y);
    columnMesh.rotation.y = -(column.rotation || 0) * Math.PI / 180;
    return columnMesh;
}

/**
 * Bir kiriş mesh'i oluşturur.
 */
export function createBeamMesh(beam, material) {
     const beamLength = beam.width;
     const beamThickness = beam.height;
     const beamDepth = beam.depth || 20;
     if (beamLength < 1) return null;
     
    const beamGeom = new THREE.BoxGeometry(beamLength, beamDepth, beamThickness);
    const yPosition = WALL_HEIGHT - (beamDepth / 2);
    const beamMesh = new THREE.Mesh(beamGeom, material);
    beamMesh.position.set(beam.center.x, yPosition, beam.center.y);
    beamMesh.rotation.y = -(beam.rotation || 0) * Math.PI / 180;
    return beamMesh;
}

/**
 * Basamaklar, sahanlık ve korkuluklar dahil bir merdiven mesh'i oluşturur.
 */
export function createStairMesh(stair) {
    const totalRun = stair.width;
    const stairWidth = stair.height;
    const stepCount = Math.max(1, stair.stepCount || 1);
    const bottomElevation = stair.bottomElevation || 0;
    const topElevation = stair.topElevation || WALL_HEIGHT;
    const totalRise = topElevation - bottomElevation;
    const isLanding = stair.isLanding || false;
    const landingThickness = 10;
    const marbleThickness = 2;

    if (totalRun < 1 || stairWidth < 1 || stepCount < 1 || (!isLanding && totalRise <= 0)) {
        return null;
    }

    const stairGroup = new THREE.Group();
    stairGroup.position.set(stair.center.x, 0, stair.center.y);
    stairGroup.rotation.y = -(stair.rotation || 0) * Math.PI / 180;

    // --- SAHANLIK DURUMU ---
    if (isLanding) {
        const landingGeom = new THREE.BoxGeometry(totalRun, landingThickness, stairWidth);
        landingGeom.translate(0, -landingThickness/2 , 0); 
        const landingMesh = new THREE.Mesh(landingGeom, stairMaterial);
        landingMesh.position.y = topElevation;
        stairGroup.add(landingMesh);

        const marbleGeom = new THREE.BoxGeometry(totalRun, marbleThickness, stairWidth);
        marbleGeom.translate(0, marbleThickness / 2, 0);
        const marbleMesh = new THREE.Mesh(marbleGeom, stepNosingMaterial);
        marbleMesh.position.y = topElevation;
        stairGroup.add(marbleMesh);

        // --- SAHANLIK KORKULUĞU ---
        if (stair.showRailing) {
            const HANDRAIL_HEIGHT = 80, HANDRAIL_INSET = 5, POST_RADIUS = 3, HANDRAIL_RADIUS = 4;
            const postMaterial = handrailWoodMaterial, handrailMaterialUsed = handrailWoodMaterial, sphereMaterial = handrailWoodMaterial;
            const connectsFromBelow = (state.stairs || []).some(s => s.connectedStairId === stair.id);
            const connectsToAbove = !!stair.connectedStairId;
            const postHeight = HANDRAIL_HEIGHT - HANDRAIL_RADIUS;
            const postGeom = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, postHeight, 16);
            postGeom.translate(0, postHeight / 2, 0);
            const postY = topElevation + marbleThickness;

            for (let side = -1; side <= 1; side += 2) {
                const zOffset = side * (stairWidth / 2 - HANDRAIL_INSET);
                const handrailGroup = new THREE.Group();
                if (!connectsFromBelow) {
                    const startPost = new THREE.Mesh(postGeom.clone(), postMaterial);
                    startPost.position.set(-totalRun / 2 + POST_RADIUS, postY, zOffset);
                    handrailGroup.add(startPost);
                }
                if (!connectsToAbove) {
                    const endPost = new THREE.Mesh(postGeom.clone(), postMaterial);
                    endPost.position.set(totalRun / 2 - POST_RADIUS, postY, zOffset);
                    handrailGroup.add(endPost);
                }

                const railingStartY = postY + postHeight + HANDRAIL_RADIUS;
                let railingStartX = -totalRun / 2 + POST_RADIUS;
                let railingEndX = totalRun / 2 - POST_RADIUS;
                if (connectsFromBelow) railingStartX = -totalRun / 2;
                if (connectsToAbove) railingEndX = totalRun / 2;
                const railingLengthX = railingEndX - railingStartX;
                const railingCenterY = railingStartY;
                const sphereGeom = new THREE.SphereGeometry(HANDRAIL_RADIUS, 16, 8);
                let cylinderLength = railingLengthX;
                let startSphereNeeded = !connectsFromBelow;
                let endSphereNeeded = !connectsToAbove;
                if (startSphereNeeded) cylinderLength -= HANDRAIL_RADIUS;
                if (endSphereNeeded) cylinderLength -= HANDRAIL_RADIUS;
                cylinderLength = Math.max(0.1, cylinderLength);
                const railingGeom = new THREE.CylinderGeometry(HANDRAIL_RADIUS, HANDRAIL_RADIUS, cylinderLength, 16);
                railingGeom.rotateZ(Math.PI / 2);
                const railingMesh = new THREE.Mesh(railingGeom, handrailMaterialUsed);

                if (startSphereNeeded) {
                    const startSphere = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                    startSphere.position.set(railingStartX, railingCenterY, zOffset);
                    handrailGroup.add(startSphere);
                }
                if (endSphereNeeded) {
                    const endSphere = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                    endSphere.position.set(railingEndX, railingCenterY, zOffset);
                    handrailGroup.add(endSphere);
                }
                let cylinderCenterX = (railingStartX + railingEndX) / 2;
                if (startSphereNeeded && !endSphereNeeded) cylinderCenterX += HANDRAIL_RADIUS / 2;
                else if (!startSphereNeeded && endSphereNeeded) cylinderCenterX -= HANDRAIL_RADIUS / 2;
                railingMesh.position.set(cylinderCenterX, railingCenterY, zOffset);
                handrailGroup.add(railingMesh);
                stairGroup.add(handrailGroup);
            } // for side sonu

            if (!connectsFromBelow) {
                 const frontRailingLength = stairWidth - 2 * HANDRAIL_INSET;
                 const frontRailingY = postY + postHeight + HANDRAIL_RADIUS;
                 const frontRailingX = -totalRun / 2 + HANDRAIL_RADIUS;
                 const frontCylinderLength = Math.max(0.1, frontRailingLength - HANDRAIL_RADIUS * 2);
                 const frontRailingGeom = new THREE.CylinderGeometry(HANDRAIL_RADIUS, HANDRAIL_RADIUS, frontCylinderLength, 16);
                 frontRailingGeom.rotateX(Math.PI / 2);
                 const frontRailingMesh = new THREE.Mesh(frontRailingGeom, handrailMaterialUsed);
                 frontRailingMesh.position.set(frontRailingX, frontRailingY, 0);
                 stairGroup.add(frontRailingMesh);
                 const sphereGeom = new THREE.SphereGeometry(HANDRAIL_RADIUS, 16, 8);
                 const frontSphere1 = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                 frontSphere1.position.set(frontRailingX, frontRailingY, stairWidth / 2 - HANDRAIL_INSET);
                 stairGroup.add(frontSphere1);
                 const frontSphere2 = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                 frontSphere2.position.set(frontRailingX, frontRailingY, -stairWidth / 2 + HANDRAIL_INSET);
                 stairGroup.add(frontSphere2);
             }
            if (!connectsToAbove) {
                const backRailingLength = stairWidth - 2 * HANDRAIL_INSET;
                const backRailingY = postY + postHeight + HANDRAIL_RADIUS;
                const backRailingX = totalRun / 2 - HANDRAIL_RADIUS;
                const backCylinderLength = Math.max(0.1, backRailingLength - HANDRAIL_RADIUS * 2);
                const backRailingGeom = new THREE.CylinderGeometry(HANDRAIL_RADIUS, HANDRAIL_RADIUS, backCylinderLength, 16);
                backRailingGeom.rotateX(Math.PI / 2);
                const backRailingMesh = new THREE.Mesh(backRailingGeom, handrailMaterialUsed);
                backRailingMesh.position.set(backRailingX, backRailingY, 0);
                stairGroup.add(backRailingMesh);
                const sphereGeom = new THREE.SphereGeometry(HANDRAIL_RADIUS, 16, 8);
                const backSphere1 = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                backSphere1.position.set(backRailingX, backRailingY, stairWidth / 2 - HANDRAIL_INSET);
                stairGroup.add(backSphere1);
                const backSphere2 = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
                backSphere2.position.set(backRailingX, backRailingY, -stairWidth / 2 + HANDRAIL_INSET);
                stairGroup.add(backSphere2);
             }
        }
        return stairGroup;
    }
    // --- SAHANLIK DURUMU SONU ---

    // --- NORMAL MERDİVEN HESAPLAMALARI ---
    const stepRun = totalRun / stepCount;
    const stepRise = totalRise / stepCount;
    const overlap = 10;
    const NOSING_THICKNESS = marbleThickness;
    const NOSING_OVERHANG = 2;
    const stepMaterials = [ stairMaterial, stairMaterial, stairMaterialTop, stairMaterial, stairMaterial, stairMaterial ];
    const stepNosingMaterials = [ stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial ];

    for (let i = 0; i < stepCount; i++) {
        const yPosBase = bottomElevation + i * stepRise;
        const stepStartX = -totalRun / 2 + i * stepRun;
        const concreteStepRun = stepRun+10;
        const concreteStepGeom = new THREE.BoxGeometry(concreteStepRun, stepRise, stairWidth);
        concreteStepGeom.translate(concreteStepRun / 2, stepRise / 2, 0);
        const concreteStepMesh = new THREE.Mesh(concreteStepGeom, stepMaterials);
        concreteStepMesh.position.set(stepStartX, yPosBase, 0);
        stairGroup.add(concreteStepMesh);

        const tablaRun = stepRun + NOSING_OVERHANG + overlap;
        const tablaGeom = new THREE.BoxGeometry(tablaRun, NOSING_THICKNESS, stairWidth+2*NOSING_THICKNESS);
        tablaGeom.translate(tablaRun / 2, NOSING_THICKNESS / 2, 0);
        const tablaMesh = new THREE.Mesh(tablaGeom, stepNosingMaterials);
        tablaMesh.position.set(stepStartX-NOSING_OVERHANG, yPosBase + stepRise, 0);
        stairGroup.add(tablaMesh);
    }

    // --- Korkuluklar (Normal Merdiven) ---
    if (stair.showRailing) {
        const HANDRAIL_HEIGHT = 90, HANDRAIL_INSET = 10, POST_RADIUS = 3, BALUSTER_RADIUS = 1.5, HANDRAIL_RADIUS = 4;
        const postMaterial = handrailWoodMaterial, balusterMaterialUsed = balusterMaterial, handrailMaterialUsed = handrailWoodMaterial, sphereMaterial = handrailWoodMaterial;

        for (let side = -1; side <= 1; side += 2) {
            const handrailGroup = new THREE.Group();
            const zOffset = side * (stairWidth / 2 - HANDRAIL_INSET);
            
            const startHandrailCenterY = bottomElevation + NOSING_THICKNESS + HANDRAIL_HEIGHT;
            const startPostHeight = startHandrailCenterY - (bottomElevation + NOSING_THICKNESS) - HANDRAIL_RADIUS;
            const startPostGeom = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, startPostHeight, 16);
            startPostGeom.translate(0, startPostHeight / 2, 0);
            const startPost = new THREE.Mesh(startPostGeom, postMaterial);
            startPost.position.set(-totalRun / 2 + POST_RADIUS, bottomElevation + NOSING_THICKNESS, zOffset);
            handrailGroup.add(startPost);

            const endHandrailCenterY = topElevation + HANDRAIL_HEIGHT;
            const endPostHeight = endHandrailCenterY - topElevation - HANDRAIL_RADIUS;
            const endPostGeom = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, endPostHeight, 16);
            endPostGeom.translate(0, endPostHeight / 2, 0);
            const endPost = new THREE.Mesh(endPostGeom, postMaterial);
            endPost.position.set(totalRun / 2 - POST_RADIUS, topElevation, zOffset);
            handrailGroup.add(endPost);

            const stairSlope = totalRise / totalRun;
            for (let i = 0; i < stepCount - 1; i++) {
                const balusterX = -totalRun / 2 + (i + 1) * stepRun;
                const balusterYBase = bottomElevation + (i + 1) * stepRise + NOSING_THICKNESS;
                const handrailCenterYAtX = startHandrailCenterY + (balusterX - (-totalRun / 2 + POST_RADIUS)) * stairSlope;
                const balusterHeight = handrailCenterYAtX - balusterYBase - HANDRAIL_RADIUS;

                if (balusterHeight > 0.1) {
                    const balusterGeom = new THREE.CylinderGeometry(BALUSTER_RADIUS, BALUSTER_RADIUS, balusterHeight, 12);
                    balusterGeom.translate(0, balusterHeight / 2, 0);
                    const baluster = new THREE.Mesh(balusterGeom, balusterMaterialUsed);
                    baluster.position.set(balusterX, balusterYBase, zOffset);
                    handrailGroup.add(baluster);
                }
            }

            const railingStartX = startPost.position.x, railingStartY = startHandrailCenterY;
            const railingEndX = endPost.position.x, railingEndY = endHandrailCenterY;
            const deltaX = railingEndX - railingStartX, deltaY = railingEndY - railingStartY;
            const railingLength = Math.hypot(deltaX, deltaY);
            const railingAngle = Math.atan2(deltaY, deltaX);
            const cylinderLength = Math.max(0.1, railingLength - HANDRAIL_RADIUS * 2);
            const railingGeom = new THREE.CylinderGeometry(HANDRAIL_RADIUS, HANDRAIL_RADIUS, cylinderLength, 16);
            const railingMesh = new THREE.Mesh(railingGeom, handrailMaterialUsed);
            const sphereGeom = new THREE.SphereGeometry(HANDRAIL_RADIUS, 16, 8);
            const startSphere = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
            startSphere.position.set(railingStartX, railingStartY, zOffset);
            handrailGroup.add(startSphere);
            const endSphere = new THREE.Mesh(sphereGeom.clone(), sphereMaterial);
            endSphere.position.set(railingEndX, railingEndY, zOffset);
            handrailGroup.add(endSphere);
            const railingCenterX = (railingStartX + railingEndX) / 2;
            const railingCenterY = (railingStartY + railingEndY) / 2;
            railingMesh.position.set(railingCenterX, railingCenterY, zOffset);
            railingMesh.rotation.z = Math.PI / 2 + railingAngle;
            handrailGroup.add(railingMesh);
            stairGroup.add(handrailGroup);
        }
    }
    return stairGroup;
}