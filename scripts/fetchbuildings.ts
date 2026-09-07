import fs from 'fs/promises';
import path from 'path';

const CAMPUS_DATA_PATH = path.join(process.cwd(), 'lib/data/buildings.json');
const OUTPUT_PATH = path.join(process.cwd(), 'lib/data/data.json');
const FENIX_API = 'https://fenix.tecnico.ulisboa.pt/api/fenix/v1/spaces';
const DELAY_MS = 500; // Polite delay to avoid Fénix API rate limits

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchSpace(id: string) {
  const response = await fetch(`${FENIX_API}/${id}`);
  if (!response.ok) {
    console.error(`Failed to fetch ${id}: ${response.statusText}`);
    return null;
  }
  await delay(DELAY_MS);
  return response.json();
}

async function fetchAllRooms() {
  try {
    const fileContent = await fs.readFile(CAMPUS_DATA_PATH, 'utf-8');
    const campusData = JSON.parse(fileContent);
    const buildingIds = campusData.containedSpaces.map((s: any) => s.id);
    
    // We will build a flat dictionary mapped by Room ID for instant O(1) lookups
    const roomsDatabase: Record<string, any> = {};
    let roomCount = 0;

    console.log(`Starting deep crawl of ${buildingIds.length} buildings...`);

    for (const buildingId of buildingIds) {
      console.log(`Fetching Building: ${buildingId}`);
      const buildingData = await fetchSpace(buildingId);
      if (!buildingData || !buildingData.containedSpaces) continue;

      // Iterate through the Floors inside the Building
      for (const floorRef of buildingData.containedSpaces) {
        console.log(`  -> Fetching Floor: ${floorRef.name} (${floorRef.id})`);
        const floorData = await fetchSpace(floorRef.id);
        if (!floorData || !floorData.containedSpaces) continue;

        // Extract Rooms inside the Floor
        for (const roomRef of floorData.containedSpaces) {
          if (roomRef.type === 'ROOM') {
            roomsDatabase[roomRef.id] = {
              id: roomRef.id,
              name: roomRef.name,
              buildingId: buildingData.id,
              buildingName: buildingData.name,
              floorId: floorData.id,
              floorName: floorData.name,
              floorBlueprintUrl: floorData.blueprintUrl || null
            };
            roomCount++;
          }
        }
      }
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(roomsDatabase, null, 2));
    
    console.log(`\nSuccess! Saved ${roomCount} rooms to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error('Script failed:', error);
  }
}

fetchAllRooms();