import prisma from '../server/db';
import { verifyPassword, hashPassword } from '../server/services/authService';

async function checkPasswords() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const isDefault = verifyPassword('ComplexPassword@123', u.password);
    console.log(`User: ${u.name} (${u.email}) - Matches 'ComplexPassword@123':`, isDefault);
  }
}

checkPasswords().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
