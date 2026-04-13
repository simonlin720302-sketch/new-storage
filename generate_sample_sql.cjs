const XLSX = require('xlsx');
const fs = require('fs');

try {
    // 使用 UTF-8 讀取 (預設)
    const workbook = XLSX.readFile('sample_inventory.csv');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const sqlRows = [];
    // 從第 1 列開始（跳過標題）
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const values = [
            row[0] ? `'${row[0].toString().replace(/'/g, "''")}'` : 'NULL', // part_number
            row[1] ? `'${row[1].toString().replace(/'/g, "''")}'` : 'NULL', // product_name
            row[2] ? `'${row[2].toString().replace(/'/g, "''")}'` : 'NULL', // unit
            parseFloat(row[3]) || 0, // unit_price
            parseInt(row[4]) || 0,   // p2_quantity
            parseInt(row[5]) || 0,   // p3_quantity
            parseFloat(row[6]) || 0  // total_amount
        ];

        sqlRows.push(`(${values.join(', ')})`);
    }

    const schema = `
-- 建立表格
DROP TABLE IF EXISTS public.sample_inventory;
CREATE TABLE public.sample_inventory (
    id BIGSERIAL PRIMARY KEY,
    part_number TEXT,
    product_name TEXT,
    unit TEXT,
    unit_price NUMERIC,
    p2_quantity INTEGER,
    p3_quantity INTEGER,
    total_amount NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 匯入資料
`;

    const batchSize = 100;
    let finalSql = schema;
    for (let i = 0; i < sqlRows.length; i += batchSize) {
        const chunk = sqlRows.slice(i, i + batchSize);
        finalSql += `INSERT INTO public.sample_inventory (
    part_number, product_name, unit, unit_price, p2_quantity, p3_quantity, total_amount
) VALUES 
${chunk.join(',\n')};\n\n`;
    }

    fs.writeFileSync('import_sample_inventory.sql', finalSql);
    console.log(`Successfully generated import_sample_inventory.sql with ${sqlRows.length} rows.`);
} catch (e) {
    console.error('Error generating SQL:', e);
}
