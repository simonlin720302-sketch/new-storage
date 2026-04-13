const fs = require('fs');
const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('sample_inventory.csv', { codepage: 950 });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length > 0) {
        console.log('Header count:', data[0].length);
        console.log('Headers:', data[0]);
        console.log('Row 1 count:', data[1].length);
        console.log('Row 1:', data[1]);
    }
} catch (e) {
    console.error(e);
}
