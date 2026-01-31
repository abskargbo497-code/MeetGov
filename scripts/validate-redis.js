#!/usr/bin/env node

/**
 * Build-time validation script to prevent direct Redis instantiation
 * This script fails the build if any file attempts to create new Redis()
 * 
 * Usage: node scripts/validate-redis.js
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const ALLOWED_FILE = path.join(SRC_DIR, 'lib', 'redis.ts');

function findFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist' && file !== 'build') {
                findFiles(filePath, fileList);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

function validateFile(filePath) {
    if (filePath === ALLOWED_FILE) {
        return null; // Skip the centralized redis file
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const violations = [];
    
    lines.forEach((line, index) => {
        if (line.match(/new\s+(Redis|IORedis)\s*\(/)) {
            violations.push({
                file: path.relative(process.cwd(), filePath),
                line: index + 1,
                content: line.trim()
            });
        }
    });
    
    return violations.length > 0 ? violations : null;
}

function main() {
    console.log('🔍 Validating Redis connection usage...\n');
    
    const files = findFiles(SRC_DIR);
    const allViolations = [];
    
    files.forEach(file => {
        const violations = validateFile(file);
        if (violations) {
            allViolations.push(...violations);
        }
    });
    
    if (allViolations.length > 0) {
        console.error('❌ BUILD FAILED: Direct Redis instantiation detected!\n');
        console.error('The following files violate the centralized Redis connection rule:\n');
        
        allViolations.forEach(v => {
            console.error(`  ${v.file}:${v.line}`);
            console.error(`    ${v.content}\n`);
        });
        
        console.error('⚠️  CRITICAL: Direct Redis instantiation causes connection exhaustion.');
        console.error('✅  FIX: Import from "src/lib/redis" instead:\n');
        console.error('    import { bullmqConnection } from "../lib/redis";\n');
        console.error('    // For BullMQ Queue/Worker:');
        console.error('    new Queue("name", { connection: bullmqConnection });\n');
        
        process.exit(1);
    }
    
    console.log('✅ All files use centralized Redis connection');
    console.log(`   Validated ${files.length} files\n`);
}

main();
