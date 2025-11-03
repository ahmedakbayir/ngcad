// Test script for XML parser
import { readFileSync } from 'fs';

// Simple DOMParser implementation for Node.js
import { DOMParser } from 'xmldom';
global.DOMParser = DOMParser;

// Import the parser
import { parseXMLToProject } from './general-files/xml-io.js';

// Read test XML file
const xmlContent = readFileSync('./test-import.xml', 'utf-8');

try {
    console.log('Parsing XML...\n');
    const projectData = parseXMLToProject(xmlContent);

    console.log('✓ XML parsed successfully!\n');
    console.log('Project Data Summary:');
    console.log('====================');
    console.log(`Nodes: ${projectData.nodes.length}`);
    console.log(`Walls: ${projectData.walls.length}`);
    console.log(`Doors: ${projectData.doors.length}`);
    console.log(`Columns: ${projectData.columns.length}`);
    console.log(`Stairs: ${projectData.stairs.length}`);

    // Count windows and vents on walls
    let totalWindows = 0;
    let totalVents = 0;
    projectData.walls.forEach(wall => {
        totalWindows += wall.windows.length;
        totalVents += wall.vents.length;
    });
    console.log(`Windows (on walls): ${totalWindows}`);
    console.log(`Vents (on walls): ${totalVents}`);

    console.log('\n--- Details ---\n');

    console.log('Nodes:');
    projectData.nodes.forEach((node, i) => {
        console.log(`  [${i}] (${node.x.toFixed(2)}, ${node.y.toFixed(2)})`);
    });

    console.log('\nWalls:');
    projectData.walls.forEach((wall, i) => {
        console.log(`  [${i}] Node ${wall.p1Index} → Node ${wall.p2Index} (${wall.wallType}, ${wall.thickness}cm)`);
        if (wall.windows.length > 0) {
            wall.windows.forEach((w, wi) => {
                console.log(`    └─ Window ${wi}: pos=${w.pos.toFixed(2)}cm, width=${w.width}cm`);
            });
        }
        if (wall.vents.length > 0) {
            wall.vents.forEach((v, vi) => {
                console.log(`    └─ Vent ${vi}: pos=${v.pos.toFixed(2)}cm, width=${v.width}cm`);
            });
        }
    });

    console.log('\nDoors:');
    projectData.doors.forEach((door, i) => {
        console.log(`  [${i}] Wall ${door.wallIndex}, pos=${door.pos.toFixed(2)}cm, width=${door.width}cm`);
    });

    console.log('\nColumns:');
    projectData.columns.forEach((col, i) => {
        console.log(`  [${i}] Center: (${col.center.x.toFixed(2)}, ${col.center.y.toFixed(2)}), Size: ${col.width}x${col.height}cm`);
    });

    console.log('\nStairs:');
    projectData.stairs.forEach((stair, i) => {
        console.log(`  [${i}] Center: (${stair.center.x.toFixed(2)}, ${stair.center.y.toFixed(2)}), Size: ${stair.width.toFixed(2)}x${stair.height.toFixed(2)}cm, Steps: ${stair.stepCount}`);
    });

    // Write output JSON for inspection
    import { writeFileSync } from 'fs';
    writeFileSync('./test-output.json', JSON.stringify(projectData, null, 2));
    console.log('\n✓ Output written to test-output.json');

} catch (error) {
    console.error('❌ Error parsing XML:', error);
    console.error(error.stack);
}
