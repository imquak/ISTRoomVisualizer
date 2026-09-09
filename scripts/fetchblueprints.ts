import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'lib/data/data.json');
const BLUEPRINTS_DIR = path.join(process.cwd(), 'public/blueprints');
const DELAY_MS = 250;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function downloadRoomBlueprints() {
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const roomsDatabase = JSON.parse(fileContent);

    await fs.mkdir(BLUEPRINTS_DIR, { recursive: true });

    const roomIds = Object.keys(roomsDatabase);
    console.log(`Found ${roomIds.length} rooms. Starting blueprint downloads...`);

    let processedCount = 0;
    let downloadedCount = 0;

    for (const id of roomIds) {
      processedCount++;
      const room = roomsDatabase[id];

      if (room.roomBlueprintUrl) {
        continue;
      }

      const url = `https://fenix.tecnico.ulisboa.pt/api/fenix/v1/spaces/${id}/blueprint?format=jpeg`;
      
      try {
        const response = await fetch(url);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          
          if (contentType && contentType.includes('image')) {
            const arrayBuffer = await response.arrayBuffer();
            const fileName = `room_${id}.jpeg`;
            const filePath = path.join(BLUEPRINTS_DIR, fileName);
            
            await fs.writeFile(filePath, Buffer.from(arrayBuffer));
            
            room.roomBlueprintUrl = `/blueprints/${fileName}`;
            downloadedCount++;
          } else {
            room.roomBlueprintUrl = null;
          }
        } else {
          room.roomBlueprintUrl = null;
        }
      } catch (err) {
        console.error(`\nFailed to fetch blueprint for room ${id}:`, err);
      }

      process.stdout.write(`\rProcessed ${processedCount}/${roomIds.length} | Downloaded: ${downloadedCount}`);
      
      await delay(DELAY_MS);
    }

    await fs.writeFile(DATA_FILE, JSON.stringify(roomsDatabase, null, 2));
    
    console.log(`\n\nProcess Complete!`);
    console.log(`New Blueprints Downloaded: ${downloadedCount}`);
    console.log(`Database updated at: ${DATA_FILE}`);

  } catch (error) {
    console.error('\nScript terminated with error:', error);
  }
}

downloadRoomBlueprints();