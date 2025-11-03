// ahmedakbayir/ngcad XML Import Module
// Converts VdDocument XML format to ngcad JSON format

/**
 * Parses XML string and converts to ngcad project data structure
 * @param {string} xmlString - XML content as string
 * @param {Object} currentSettings - Current state settings to preserve (optional)
 * @returns {Object} ngcad project data object
 */
export function parseXMLToProject(xmlString, currentSettings = null) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing error: ' + parserError.textContent);
    }

    // Extract all entities
    const entitiesNode = xmlDoc.querySelector('O[F="Entities"]');
    if (!entitiesNode) {
        throw new Error('No Entities node found in XML');
    }

    // Initialize project data with current settings if available
    const projectData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        gridOptions: currentSettings?.gridOptions || { visible: true, color: "#e0e0e0", weight: 1, spacing: 100 },
        snapOptions: currentSettings?.snapOptions || { endpoint: true, midpoint: true, endpointExtension: false, midpointExtension: false, nearestOnly: false },
        dimensionOptions: currentSettings?.dimensionOptions || { fontSize: 14, color: "#000000", defaultView: "both", showArea: "selected", showOuter: "none" },
        wallBorderColor: currentSettings?.wallBorderColor || "#000000",
        roomFillColor: currentSettings?.roomFillColor || "#f0f0f0",
        lineThickness: currentSettings?.lineThickness || 2,
        wallThickness: currentSettings?.wallThickness || 20,
        drawingAngle: currentSettings?.drawingAngle || 90,
        nodes: [],
        walls: [],
        doors: [],
        rooms: [],
        columns: [],
        beams: [],
        stairs: [],
        guides: []
    };

    // Parse all elements
    const closeAreas = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="CloseArea"]'));
    const doors = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="Door"]'));
    const windows = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="Window"]'));
    const kolons = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="Kolon"]'));
    const menfezler = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="Menfez"]'));
    const stairs = Array.from(entitiesNode.querySelectorAll('O[F="_Item"][T="clsmerdiven"]'));

    // Step 0: Find max Y value for coordinate system conversion (flip Y-axis)
    let maxY = -Infinity;
    closeAreas.forEach(closeArea => {
        const vdWalls = Array.from(closeArea.querySelectorAll('O[F="Walls"] O[F="_Item"][T="VdWall"]'));
        vdWalls.forEach(vdWall => {
            const startPointStr = vdWall.querySelector('P[F="StartPoint"]')?.getAttribute('V');
            const endPointStr = vdWall.querySelector('P[F="EndPoint"]')?.getAttribute('V');
            if (startPointStr) {
                const pt = parsePoint(startPointStr);
                maxY = Math.max(maxY, pt.y);
            }
            if (endPointStr) {
                const pt = parsePoint(endPointStr);
                maxY = Math.max(maxY, pt.y);
            }
        });
    });

    // Step 1: Extract all unique nodes from walls
    const nodeMap = new Map(); // key: "x,y" -> value: node object
    const wallData = []; // Store wall info temporarily

    closeAreas.forEach(closeArea => {
        const vdWalls = Array.from(closeArea.querySelectorAll('O[F="Walls"] O[F="_Item"][T="VdWall"]'));

        vdWalls.forEach(vdWall => {
            const handle = vdWall.querySelector('P[F="Handle"]')?.getAttribute('V');
            const startPointStr = vdWall.querySelector('P[F="StartPoint"]')?.getAttribute('V');
            const endPointStr = vdWall.querySelector('P[F="EndPoint"]')?.getAttribute('V');

            if (startPointStr && endPointStr) {
                const startPoint = parsePoint(startPointStr);
                const endPoint = parsePoint(endPointStr);

                // Add nodes to map (flip Y-axis: maxY - y)
                const startKey = `${startPoint.x},${startPoint.y}`;
                const endKey = `${endPoint.x},${endPoint.y}`;

                if (!nodeMap.has(startKey)) {
                    nodeMap.set(startKey, {
                        x: startPoint.x * 100, // Convert to cm
                        y: (maxY - startPoint.y) * 100, // Flip Y-axis
                        isColumn: false,
                        columnSize: 30
                    });
                }
                if (!nodeMap.has(endKey)) {
                    nodeMap.set(endKey, {
                        x: endPoint.x * 100,
                        y: (maxY - endPoint.y) * 100, // Flip Y-axis
                        isColumn: false,
                        columnSize: 30
                    });
                }

                wallData.push({
                    handle: handle,
                    startKey: startKey,
                    endKey: endKey,
                    startPoint: { x: startPoint.x * 100, y: (maxY - startPoint.y) * 100 },
                    endPoint: { x: endPoint.x * 100, y: (maxY - endPoint.y) * 100 }
                });
            }
        });
    });

    // Convert nodeMap to array
    projectData.nodes = Array.from(nodeMap.values());
    const nodeKeys = Array.from(nodeMap.keys());

    // Step 2: Create walls with node indices
    wallData.forEach(wd => {
        const p1Index = nodeKeys.indexOf(wd.startKey);
        const p2Index = nodeKeys.indexOf(wd.endKey);

        projectData.walls.push({
            type: 'wall',
            p1Index: p1Index,
            p2Index: p2Index,
            thickness: 20,
            wallType: 'normal',
            windows: [],
            vents: [],
            isArc: false,
            arcControl1: null,
            arcControl2: null,
            _handle: wd.handle, // Store for door/window/vent matching
            _p1: wd.startPoint,
            _p2: wd.endPoint
        });
    });

    // Step 3: Add doors
    doors.forEach(doorNode => {
        const origin = parsePoint(doorNode.querySelector('P[F="Origin"]')?.getAttribute('V'));
        const rotation = parseFloat(doorNode.querySelector('P[F="Rotation"]')?.getAttribute('V') || 0);
        const width = parseFloat(doorNode.querySelector('P[F="En"]')?.getAttribute('V') || 0.9) * 100; // Convert to cm

        // Find closest wall (flip Y-axis)
        const wallMatch = findClosestWall(projectData.walls, { x: origin.x * 100, y: (maxY - origin.y) * 100 });

        if (wallMatch) {
            projectData.doors.push({
                wallIndex: wallMatch.wallIndex,
                pos: wallMatch.pos,
                width: width,
                type: 'door',
                isWidthManuallySet: false
            });
        }
    });

    // Step 4: Add windows
    windows.forEach(windowNode => {
        const origin = parsePoint(windowNode.querySelector('P[F="Origin"]')?.getAttribute('V'));
        const rotation = parseFloat(windowNode.querySelector('P[F="Rotation"]')?.getAttribute('V') || 0);
        const width = parseFloat(windowNode.querySelector('P[F="En"]')?.getAttribute('V') || 1.5) * 100; // Convert to cm

        // Find closest wall (flip Y-axis)
        const wallMatch = findClosestWall(projectData.walls, { x: origin.x * 100, y: (maxY - origin.y) * 100 });

        if (wallMatch) {
            // Add window to wall
            projectData.walls[wallMatch.wallIndex].windows.push({
                pos: wallMatch.pos,
                width: width,
                type: 'window',
                isWidthManuallySet: false
            });
        }
    });

    // Step 5: Add columns (Kolon)
    kolons.forEach(kolonNode => {
        const insertionPoint = parsePoint(kolonNode.querySelector('P[F="InsertionPoint"]')?.getAttribute('V'));
        const width = parseFloat(kolonNode.querySelector('P[F="Width"]')?.getAttribute('V') || 0.6) * 100;
        const height = parseFloat(kolonNode.querySelector('P[F="Height"]')?.getAttribute('V') || 0.6) * 100;

        projectData.columns.push({
            type: 'column',
            center: { x: insertionPoint.x * 100, y: (maxY - insertionPoint.y) * 100 }, // Flip Y-axis
            size: Math.max(width, height), // Use larger dimension as size
            width: width,
            height: height,
            rotation: 0,
            hollowWidth: 0,
            hollowHeight: 0,
            hollowOffsetX: 0,
            hollowOffsetY: 0
        });
    });

    // Step 6: Add vents (Menfez)
    menfezler.forEach(menfezNode => {
        const origin = parsePoint(menfezNode.querySelector('P[F="Origin"]')?.getAttribute('V'));
        const rotation = parseFloat(menfezNode.querySelector('P[F="Rotation"]')?.getAttribute('V') || 0);

        // Find closest wall (flip Y-axis)
        const wallMatch = findClosestWall(projectData.walls, { x: origin.x * 100, y: (maxY - origin.y) * 100 });

        if (wallMatch) {
            // Add vent to wall
            projectData.walls[wallMatch.wallIndex].vents.push({
                pos: wallMatch.pos,
                width: 30, // Default vent width
                type: 'vent'
            });
        }
    });

    // Step 7: Add stairs (clsmerdiven)
    stairs.forEach(stairNode => {
        const insertionPoint = parsePoint(stairNode.querySelector('P[F="InsertionPoint"]')?.getAttribute('V'));
        const widthRaw = parseFloat(stairNode.querySelector('P[F="Width"]')?.getAttribute('V') || 1.7);
        const heightRaw = parseFloat(stairNode.querySelector('P[F="Height"]')?.getAttribute('V') || 3.88);
        const width = Math.abs(widthRaw) * 100;
        const height = Math.abs(heightRaw) * 100;

        // Calculate rotation from arrow direction (mfleader)
        let rotation = 0;
        const mfleader = stairNode.querySelector('O[F="DrawEntities"] O[F="_Item"][T="mfleader"]');
        if (mfleader) {
            const arrowStart = parsePoint(mfleader.querySelector('P[F="StartPoint"]')?.getAttribute('V'));
            const arrowEnd = parsePoint(mfleader.querySelector('P[F="EndPoint"]')?.getAttribute('V'));

            // Calculate arrow direction vector (in original XML coordinates)
            const dx = arrowEnd.x - arrowStart.x;
            const dy = arrowEnd.y - arrowStart.y;

            // Convert to rotation in degrees
            // Note: Y-axis is flipped in canvas, so we need to adjust
            // atan2 returns angle from positive X-axis
            let angleRad = Math.atan2(-dy, dx); // Negate dy because Y is flipped
            rotation = (angleRad * 180 / Math.PI + 360) % 360; // Normalize to 0-360
        }

        // Calculate step count based on height (25-30cm per step)
        const stepCount = Math.max(1, Math.round(height / 28));

        projectData.stairs.push({
            type: 'stairs',
            id: `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name: 'Merdiven',
            center: { x: insertionPoint.x * 100, y: (maxY - insertionPoint.y) * 100 }, // Flip Y-axis
            width: width,
            height: height,
            rotation: rotation,
            stepCount: stepCount,
            bottomElevation: 0,
            topElevation: 270,
            connectedStairId: null,
            isLanding: false,
            showRailing: true
        });
    });

    // Clean up temporary properties
    projectData.walls.forEach(wall => {
        delete wall._handle;
        delete wall._p1;
        delete wall._p2;
    });

    return projectData;
}

/**
 * Parses a point string "x,y,z" into object
 */
function parsePoint(pointStr) {
    if (!pointStr) return { x: 0, y: 0, z: 0 };
    const parts = pointStr.split(',').map(p => parseFloat(p.trim()));
    return {
        x: parts[0] || 0,
        y: parts[1] || 0,
        z: parts[2] || 0
    };
}

/**
 * Finds the closest wall to a point and returns wall index and position on wall
 */
function findClosestWall(walls, point) {
    let closestWall = null;
    let minDistance = Infinity;
    let closestPos = 0;

    walls.forEach((wall, wallIndex) => {
        const p1 = wall._p1;
        const p2 = wall._p2;

        // Calculate closest point on wall segment to given point
        const wallLength = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (wallLength === 0) return;

        // Vector from p1 to point
        const dx = point.x - p1.x;
        const dy = point.y - p1.y;

        // Vector along wall
        const wallDx = p2.x - p1.x;
        const wallDy = p2.y - p1.y;

        // Project point onto wall line
        const t = Math.max(0, Math.min(1, (dx * wallDx + dy * wallDy) / (wallLength ** 2)));

        // Closest point on wall
        const closestX = p1.x + t * wallDx;
        const closestY = p1.y + t * wallDy;

        // Distance from point to wall
        const distance = Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);

        if (distance < minDistance) {
            minDistance = distance;
            closestWall = wallIndex;
            closestPos = t * wallLength;
        }
    });

    if (closestWall !== null && minDistance < 50) { // Within 50cm tolerance
        return { wallIndex: closestWall, pos: closestPos };
    }

    return null;
}
