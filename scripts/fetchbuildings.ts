import fs from 'fs/promises';
import path from 'path';

const ALAMEDA_CAMPUS_ID = '2448131360897';
const FENIX_API = 'https://fenix.tecnico.ulisboa.pt/api/fenix/v1/spaces';
const OUTPUT_JSON = path.join(process.cwd(), 'lib/data/data.json');
const BLUEPRINTS_DIR = path.join(process.cwd(), 'public/blueprints');
const DELAY_MS = 250; // Polite delay 

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

let roomCount = 0;
let blueprintCount = 0;
const roomsDatabase: Record<string, any> = {};

interface SpaceContext {
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorName?: string;
  floorBlueprintUrl?: string | null;
}

async function fetchSpace(id: string) {
  const response = await fetch(`${FENIX_API}/${id}`);
  if (!response.ok) {
    console.error(`\nFailed to fetch space ${id}: ${response.statusText}`);
    return null;
  }
  await delay(DELAY_MS);
  return response.json();
}

async function downloadBlueprint(blueprintUrl: string, spaceId: string): Promise<string | null> {
  try {
    const response = await fetch(blueprintUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const extension = contentType.includes('svg') ? 'svg' : contentType.includes('png') ? 'png' : 'jpg';
    const fileName = `${spaceId}.${extension}`;
    const filePath = path.join(BLUEPRINTS_DIR, fileName);

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));
    
    return `/blueprints/${fileName}`;
  } catch (error) {
    console.error(`\nFailed to download blueprint for ${spaceId}:`, error);
    return null;
  }
}

// Universal recursive crawler
async function crawlSpace(spaceId: string, context: SpaceContext) {
  const spaceData = await fetchSpace(spaceId);
  if (!spaceData) return;

  const nextContext: SpaceContext = { ...context };

  // Lock in the Building
  if (spaceData.type === 'BUILDING') {
    nextContext.buildingId = spaceData.id;
    nextContext.buildingName = spaceData.name;
    // Reset floor context for new buildings
    nextContext.floorId = undefined;
    nextContext.floorName = undefined;
    nextContext.floorBlueprintUrl = undefined;
  } 
  // Lock in the FIRST Floor encountered in this branch
  else if (spaceData.type === 'FLOOR' && !context.floorId) {
    nextContext.floorId = spaceData.id;
    nextContext.floorName = spaceData.name;
    
    if (spaceData.blueprintUrl) {
      const localUrl = await downloadBlueprint(spaceData.blueprintUrl, spaceData.id);
      if (localUrl) {
        nextContext.floorBlueprintUrl = localUrl;
        blueprintCount++;
      }
    }
  } 
  // Extract Room using accumulated context
  else if (spaceData.type === 'ROOM') {
    let roomBlueprintUrl = null;
    if (spaceData.blueprintUrl) {
      roomBlueprintUrl = await downloadBlueprint(spaceData.blueprintUrl, spaceData.id);
      if (roomBlueprintUrl) blueprintCount++;
    }

    roomsDatabase[spaceData.id] = {
      id: spaceData.id,
      name: spaceData.name,
      buildingId: nextContext.buildingId || "Unknown",
      buildingName: nextContext.buildingName || "Unknown",
      // If a room exists without a floor, default to "Unknown"
      floorId: nextContext.floorId || "Unknown", 
      floorName: nextContext.floorName || "Unknown",
      floorBlueprintUrl: nextContext.floorBlueprintUrl || null,
      roomBlueprintUrl: roomBlueprintUrl
    };
    
    roomCount++;
    process.stdout.write(`\rCrawled ${roomCount} rooms...`);
    return; // Rooms are leaf nodes, stop descending here
  }

  // Recursively process any child spaces (Wings, Corridors, Sub-floors, etc.)
  if (spaceData.containedSpaces && spaceData.containedSpaces.length > 0) {
    for (const child of spaceData.containedSpaces) {
      await crawlSpace(child.id, nextContext);
    }
  }
}

async function fetchRoomsAndBlueprints() {
  try {
    await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
    await fs.mkdir(BLUEPRINTS_DIR, { recursive: true });

    console.log(`Fetching Alameda Campus...`);
    const campusData = await fetchSpace(ALAMEDA_CAMPUS_ID);
    if (!campusData || !campusData.containedSpaces) throw new Error("Could not fetch Campus data");

    console.log(`Discovered top-level structures. Starting universal deep crawl...\n`);

    // Start recursive crawl for every top level item in the Campus
    for (const buildingRef of campusData.containedSpaces) {
      console.log(`\n🏢 Entering Structure: ${buildingRef.name}`);
      await crawlSpace(buildingRef.id, {});
    }

    await fs.writeFile(OUTPUT_JSON, JSON.stringify(roomsDatabase, null, 2));
    
    console.log(`\n\n✅ Process Complete!`);
    console.log(`Rooms saved: ${roomCount}`);
    console.log(`Blueprints downloaded: ${blueprintCount}`);
    console.log(`Database generated at: ${OUTPUT_JSON}`);

  } catch (error) {
    console.error('\nScript terminated with error:', error);
  }
}

fetchRoomsAndBlueprints();