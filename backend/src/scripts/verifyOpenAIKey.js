import dotenv from 'dotenv';
import { config } from '../config.js';

dotenv.config();

console.log('🔍 Checking OpenAI API Key Configuration...\n');

const apiKey = config.openaiApiKey;

if (!apiKey || apiKey.trim() === '' || apiKey.includes('your-openai')) {
  console.log('❌ OpenAI API key is NOT configured');
  console.log('\n📝 To configure it:');
  console.log('1. Get your API key from: https://platform.openai.com/api-keys');
  console.log('2. Open backend/.env file');
  console.log('3. Update the line: OPENAI_API_KEY=your-actual-key-here');
  console.log('4. Restart the backend server\n');
  process.exit(1);
} else if (apiKey.startsWith('sk-')) {
  console.log('✅ OpenAI API key is configured');
  console.log(`   Key starts with: ${apiKey.substring(0, 7)}...`);
  console.log(`   Key length: ${apiKey.length} characters`);
  console.log('\n🎉 Your API key looks valid!');
  console.log('   Transcription should work when you start recording.\n');
  process.exit(0);
} else {
  console.log('⚠️  OpenAI API key is set, but format looks incorrect');
  console.log('   Valid keys start with "sk-"');
  console.log(`   Your key starts with: ${apiKey.substring(0, 10)}...\n`);
  process.exit(1);
}

