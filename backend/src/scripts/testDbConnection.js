import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const commonPasswords = ['', 'root', 'password', 'admin'];

async function testConnection(password) {
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'meet_gov',
    process.env.DB_USER || 'root',
    password,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false,
    }
  );

  try {
    await sequelize.authenticate();
    console.log(`✅ SUCCESS! Password works: "${password || '(empty)'}"`);
    await sequelize.close();
    return true;
  } catch (error) {
    console.log(`❌ Failed with password: "${password || '(empty)'}"`);
    await sequelize.close();
    return false;
  }
}

async function main() {
  console.log('Testing MySQL connection with common XAMPP passwords...\n');
  
  for (const password of commonPasswords) {
    const success = await testConnection(password);
    if (success) {
      console.log(`\n🎉 Found working password! Update your .env file:`);
      console.log(`DB_PASSWORD=${password}`);
      process.exit(0);
    }
  }
  
  console.log('\n❌ None of the common passwords worked.');
  console.log('\nTo reset your MySQL root password:');
  console.log('1. Open XAMPP Control Panel');
  console.log('2. Stop MySQL');
  console.log('3. Open Terminal and run:');
  console.log('   sudo /Applications/XAMPP/xamppfiles/bin/mysql_safe --skip-grant-tables &');
  console.log('4. Then connect and set a new password');
  console.log('\nOr check XAMPP documentation for your specific installation.');
  process.exit(1);
}

main();

