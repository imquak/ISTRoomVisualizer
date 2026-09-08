import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'lib/data/data.json');
const BLUEPRINTS_DIR = path.join(process.cwd(), 'public/blueprints');
const DELAY_MS = 250; // Polite delay to prevent rate-limiting

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function downloadRoomBlueprints() {
  try {
    // 1. Load the existing data.json
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const roomsDatabase = JSON.parse(fileContent);

    // 2. Ensure the output directory exists
    await fs.mkdir(BLUEPRINTS_DIR, { recursive: true });

    const roomIds = Object.keys(roomsDatabase);
    console.log(`Found ${roomIds.length} rooms. Starting blueprint downloads...`);

    let processedCount = 0;
    let downloadedCount = 0;

    // 3. Iterate through each room
    for (const id of roomIds) {
      processedCount++;
      const room = roomsDatabase[id];

      // Skip if it already has a downloaded blueprint
      if (room.roomBlueprintUrl) {
        continue;
      }

      const url = `https://fenix.tecnico.ulisboa.pt/api/fenix/v1/spaces/${id}/blueprint?format=jpeg`;
      
      try {
        const response = await fetch(url);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          
          // Ensure we actually got an image back (Fenix might return JSON on error)
          if (contentType && contentType.includes('image')) {
            const arrayBuffer = await response.arrayBuffer();
            const fileName = `room_${id}.jpeg`;
            const filePath = path.join(BLUEPRINTS_DIR, fileName);
            
            await fs.writeFile(filePath, Buffer.from(arrayBuffer));
            
            // Update the JSON object
            room.roomBlueprintUrl = `/blueprints/${fileName}`;
            downloadedCount++;
          } else {
            room.roomBlueprintUrl = null;
          }
        } else {
          // 404 Not Found usually means no blueprint exists for this space
          room.roomBlueprintUrl = null;
        }
      } catch (err) {
        console.error(`\nFailed to fetch blueprint for room ${id}:`, err);
      }

      process.stdout.write(`\rProcessed ${processedCount}/${roomIds.length} | Downloaded: ${downloadedCount}`);
      
      // Wait before the next request
      await delay(DELAY_MS);
    }

    // 4. Write the updated object back to data.json
    await fs.writeFile(DATA_FILE, JSON.stringify(roomsDatabase, null, 2));
    
    console.log(`\n\nProcess Complete!`);
    console.log(`New Blueprints Downloaded: ${downloadedCount}`);
    console.log(`Database updated at: ${DATA_FILE}`);

  } catch (error) {
    console.error('\nScript terminated with error:', error);
  }
}

downloadRoomBlueprints();