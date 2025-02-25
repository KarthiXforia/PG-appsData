import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the JSON file
const filePath = path.join(__dirname, '../utils/AllAppsList.json');

// Read the JSON file
fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading the file:', err);
        return;
    }
    
    try {
        // Parse JSON
        const jsonData = JSON.parse(data);
        
        // Assuming the JSON file contains an array of objects
        if (!Array.isArray(jsonData)) {
            console.error('Invalid JSON format: Expected an array of objects');
            return;
        }
        
        // Find duplicates by title
        const titleMap = new Map();
        const duplicates = [];
        
        jsonData.forEach((item, index) => {
            if (item.title) {
                if (titleMap.has(item.title)) {
                    duplicates.push(item.title);
                } else {
                    titleMap.set(item.title, index);
                }
            }
        });
        
        if (duplicates.length > 0) {
            console.log('Duplicate entries found:', duplicates);
        } else {
            console.log('No duplicate titles found.');
        }
        
    } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
    }
});
