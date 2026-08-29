import prisma from '../server/db';
import { getSystemState } from '../server/services/stateService';
import fs from 'fs';
import path from 'path';

async function sync() {
  const cleanState = await getSystemState(true);
  const dataPath = path.join(process.cwd(), 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(cleanState, null, 2), 'utf-8');
  console.log('Successfully synced data.json from SQLite database.');
  console.log(`Users: ${cleanState.users.length}, Tasks: ${cleanState.tasks.length}`);
}

sync().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
