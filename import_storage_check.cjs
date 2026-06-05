const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');

// Load environment variables from .env.local
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function importData() {
    try {
        // 1. Delete all existing rows for a clean import
        console.log('Cleaning up all existing rows in "check storage"...');
        const { error: deleteError } = await supabase
            .from('check storage')
            .delete()
            .neq('id', 0);
        
        if (deleteError) {
            console.error('Failed to clean up table:', deleteError);
            throw deleteError;
        }

        // 2. Read the Excel workbook
        console.log('Reading storage check.xlsx...');
        const workbook = XLSX.readFile('storage check.xlsx');
        const sheetName = workbook.SheetNames.includes('工作表1') ? '工作表1' : (workbook.SheetNames.includes('storage check') ? 'storage check' : workbook.SheetNames[0]);
        console.log(`Using sheet: "${sheetName}"`);
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
            throw new Error(`Sheet "${sheetName}" not found in the Excel file!`);
        }

        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        console.log(`Found ${data.length} total rows (including header)`);

        const sqlRows = [];
        // Skip header row (index 0)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const part_number = row[0] !== undefined && row[0] !== null ? row[0].toString().trim() : null;
            // If the row doesn't have a part number and is completely empty, skip it
            if (!part_number && row.every(val => val === undefined || val === null || val === '')) {
                continue;
            }

            const cleanInt = (val) => {
                if (val === undefined || val === null || val === '') return 0;
                const parsed = parseInt(val, 10);
                return isNaN(parsed) ? 0 : parsed;
            };

            const dbRow = {
                part_number: part_number,
                product_name: row[1] !== undefined && row[1] !== null ? row[1].toString().trim() : null,
                category: row[2] !== undefined && row[2] !== null ? row[2].toString().trim() : null,
                stock_type: row[3] !== undefined && row[3] !== null ? row[3].toString().trim() : null,
                location_quantity: cleanInt(row[4]),
                estimated_quantity: cleanInt(row[5]),
                actual_quantity_minus: cleanInt(row[6]),
                difference_quantity: cleanInt(row[7]),
                adjusted_quantity_minus: cleanInt(row[8]),
                incoming_quantity: cleanInt(row[9]),
                overplus_quantity: cleanInt(row[10]),
                remarks: row[11] !== undefined && row[11] !== null ? row[11].toString().trim() : null
            };

            sqlRows.push(dbRow);
        }

        console.log(`Parsed ${sqlRows.length} valid rows to insert.`);

        // 3. Batch insert to Supabase
        const batchSize = 100;
        let insertedCount = 0;

        for (let i = 0; i < sqlRows.length; i += batchSize) {
            const chunk = sqlRows.slice(i, i + batchSize);
            const { data: insertResult, error } = await supabase
                .from('check storage')
                .insert(chunk)
                .select();

            if (error) {
                console.error(`Error inserting batch ${i} to ${i + chunk.length}:`, error);
                throw error;
            }

            insertedCount += chunk.length;
            console.log(`Inserted ${insertedCount}/${sqlRows.length} rows...`);
        }

        console.log('Import completed successfully!');
        
        // 4. Verify count
        const { count, error: countError } = await supabase
            .from('check storage')
            .select('*', { count: 'exact', head: true });
        
        if (countError) {
            console.error('Verification error:', countError);
        } else {
            console.log(`Verified total count in "check storage" table: ${count} rows`);
        }

    } catch (e) {
        console.error('Import failed:', e);
    }
}

importData();
