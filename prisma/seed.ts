import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default admin user
  const defaultUsername = 'admin@taxteck.com';
  const defaultPassword = '1234567890'; // Change this in production!
  
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const user = await prisma.user.upsert({
    where: { username: defaultUsername },
    update: {
      password: hashedPassword,
    },
    create: {
      username: defaultUsername,
      password: hashedPassword,
      name: 'Administrator',
      email: 'admin@example.com',
    },
  });

  console.log('✅ Default user created:', user.username);
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   ⚠️  Please change the password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
