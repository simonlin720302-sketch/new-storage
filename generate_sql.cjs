const XLSX = require('xlsx');
const fs = require('fs');

// Read the CSV file
// We use codepage 950 for Big5
const workbook = XLSX.readFile('sample_inventory.csv', { codepage: 950 });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

// The columns we want (total 12)
// mapping to the SQL table:
// 0: part_number
// 1: product_name
// 2: category
// 3: stock_type
// 4: location_quantity
// 5: estimated_quantity
// 6: actual_quantity_minus
// 7: difference_quantity
// 8: adjusted_quantity_minus
// 9: incoming_quantity
// 10: overplus_quantity
// 11: remarks

const sqlRows = [];
for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const values = [
        row[0] ? `'${row[0].toString().replace(/'/g, "''")}'` : 'NULL',
        row[1] ? `'${row[1].toString().replace(/'/g, "''")}'` : 'NULL',
        row[2] ? `'${row[2].toString().replace(/'/g, "''")}'` : 'NULL',
        row[3] ? `'${row[3].toString().replace(/'/g, "''")}'` : 'NULL',
        parseInt(row[4]) || 0,
        parseInt(row[5]) || 0,
        parseInt(row[6]) || 0,
        parseInt(row[7]) || 0,
        parseInt(row[8]) || 0,
        parseInt(row[9]) || 0,
        parseInt(row[10]) || 0,
        row[11] ? `'${row[11].toString().replace(/'/g, "''")}'` : 'NULL'
    ];

    sqlRows.push(`(${values.join(', ')})`);
}

const batchSize = 100;
let finalSql = '';
for (let i = 0; i < sqlRows.length; i += batchSize) {
    const chunk = sqlRows.slice(i, i + batchSize);
    finalSql += `INSERT INTO public.inventory_20260409 (
    part_number, product_name, category, stock_type, 
    location_quantity, estimated_quantity, actual_quantity_minus, 
    difference_quantity, adjusted_quantity_minus, incoming_quantity, 
    overplus_quantity, remarks
) VALUES \n${chunk.join(',\n')};\n\n`;
}

fs.writeFileSync('import_data.sql', finalSql);
console.log(`Generated SQL for ${sqlRows.length} rows.`);
