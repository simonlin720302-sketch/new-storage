const { createClient } = require('@supabase/supabase-js');
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

const parseCSVToRows = (csvText) => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentCell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                if (char === '\r') i++;
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else if (char !== '\r') {
                currentCell += char;
            }
        }
    }
    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    return rows;
};

async function importData() {
    try {
        console.log('Reading P3 position.csv...');
        let text;
        try {
            text = fs.readFileSync('P3 position.csv', 'utf8');
        } catch (e) {
            // Try different encoding
            const buf = fs.readFileSync('P3 position.csv');
            text = buf.toString('utf8');
        }
        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }

        const allParsedRows = parseCSVToRows(text);
        console.log(`Parsed ${allParsedRows.length} total lines from CSV.`);

        const tables = [];
        let currentTableTitle = null;
        let currentTableRows = [];

        allParsedRows.forEach(row => {
            const firstCellContent = (row[0] || '').trim();
            if (firstCellContent.startsWith('>>> 表格：') && firstCellContent.endsWith('<<<')) {
                if (currentTableTitle && currentTableRows.length > 0) {
                    tables.push({ title: currentTableTitle, rows: currentTableRows });
                }
                currentTableTitle = firstCellContent.replace('>>> 表格：', '').replace('<<<', '').trim();
                currentTableRows = [];
            } else if (currentTableTitle) {
                if (row.some(c => c.trim() !== '')) {
                    currentTableRows.push(row);
                }
            }
        });
        if (currentTableTitle && currentTableRows.length > 0) {
            tables.push({ title: currentTableTitle, rows: currentTableRows });
        }

        console.log(`Found ${tables.length} tables:`);
        tables.forEach(t => console.log(`  - ${t.title} (${t.rows.length} rows)`));

        // 1. Delete all existing rows for a clean import
        console.log('\nCleaning up "P3 position" table in Supabase...');
        const { error: deleteError } = await supabase
            .from('P3 position')
            .delete()
            .neq('id', 0);

        if (deleteError) {
            console.error('Failed to clean up table:', deleteError.message);
            throw deleteError;
        }

        // 2. Prepare database rows
        const dbRows = [];
        tables.forEach(table => {
            table.rows.forEach((row, rowIndex) => {
                const dbRow = {
                    table_name: table.title,
                    row_index: rowIndex,
                    col0: row[0] !== undefined && row[0] !== '' ? row[0] : null,
                    col1: row[1] !== undefined && row[1] !== '' ? row[1] : null,
                    col2: row[2] !== undefined && row[2] !== '' ? row[2] : null,
                    col3: row[3] !== undefined && row[3] !== '' ? row[3] : null,
                    col4: row[4] !== undefined && row[4] !== '' ? row[4] : null,
                    col5: row[5] !== undefined && row[5] !== '' ? row[5] : null,
                    col6: row[6] !== undefined && row[6] !== '' ? row[6] : null,
                    col7: row[7] !== undefined && row[7] !== '' ? row[7] : null,
                    col8: row[8] !== undefined && row[8] !== '' ? row[8] : null,
                    col9: row[9] !== undefined && row[9] !== '' ? row[9] : null,
                };
                dbRows.push(dbRow);
            });
        });

        console.log(`\nInserting ${dbRows.length} rows into "P3 position"...`);

        // 3. Insert in batches
        const batchSize = 50;
        let insertedCount = 0;
        for (let i = 0; i < dbRows.length; i += batchSize) {
            const chunk = dbRows.slice(i, i + batchSize);
            const { error: insertError } = await supabase
                .from('P3 position')
                .insert(chunk);

            if (insertError) {
                console.error(`Error inserting batch ${i}:`, insertError.message);
                throw insertError;
            }
            insertedCount += chunk.length;
            console.log(`Inserted ${insertedCount}/${dbRows.length} rows...`);
        }

        console.log('\nImport to "P3 position" completed successfully!');

        // 4. Verify count
        const { count, error: countError } = await supabase
            .from('P3 position')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('Verification error:', countError.message);
        } else {
            console.log(`Verified total count in "P3 position" table: ${count} rows`);
        }

    } catch (e) {
        console.error('Import failed:', e.message || e);
    }
}

importData();
