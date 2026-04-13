import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as xlsx from 'xlsx';
import { TableData, PageData, InventoryData } from './types.ts';
import { TableEditor } from './components/TableEditor.tsx';
import { supabase } from './supabase.ts';

const STORAGE_KEY = 'table_architect_v5_final';
const INVENTORY_STORAGE_KEY = 'table_architect_inventory_data';

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
};

const normalizeKey = (key: any) => (key || '').toString().replace(/[\s\u3000]/g, '').toUpperCase();

const App: React.FC = () => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingPageName, setIsEditingPageName] = useState<string | null>(null);
  const [pageIdToConfirmDelete, setPageIdToConfirmDelete] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(true); 
  const [inventoryData, setInventoryData] = useState<InventoryData>({});
  const [dbInventory, setDbInventory] = useState<Record<string, { p2: number, p3: number }>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);

  const fetchDatabaseInventory = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('sample_inventory')
        .select('part_number, p2_quantity, p3_quantity');

      if (error) throw error;
      
      const mapped: Record<string, { p2: number, p3: number }> = {};
      data.forEach(item => {
        mapped[item.part_number] = {
          p2: item.p2_quantity || 0,
          p3: item.p3_quantity || 0
        };
      });
      setDbInventory(mapped);
    } catch (err) {
      console.error('Failed to fetch DB inventory:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchDatabaseInventory();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsedPages = JSON.parse(saved);
        if (Array.isArray(parsedPages) && parsedPages.length > 0) {
          setPages(parsedPages);
          setActivePageId(parsedPages[0].id);
        } else {
          createDefaultPage();
        }
      } catch (e) {
        createDefaultPage();
      }
    } else {
      createDefaultPage();
    }

    const savedInventory = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (savedInventory) {
      try {
        setInventoryData(JSON.parse(savedInventory));
      } catch (e) {
        console.error("Failed to load inventory data:", e);
      }
    }
  }, []);

  const createDefaultPage = () => {
    const defaultId = generateId();
    const defaultPage: PageData = {
      id: defaultId,
      name: '預設工作區',
      tables: []
    };
    setPages([defaultPage]);
    setActivePageId(defaultId);
  };

  useEffect(() => {
    if (pages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    }
  }, [pages]);

  useEffect(() => {
    if (inventoryData && Object.keys(inventoryData).length > 0) {
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventoryData));
    }
  }, [inventoryData]);

  const updateInventoryNewQuantity = (partNumber: string, location: string, newQuantity: string) => {
    if (!partNumber || !location) return;
    
    setInventoryData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pnKey = Object.keys(next).find(k => k.toLowerCase().trim() === partNumber.toLowerCase().trim());
      if (!pnKey) return prev;

      const locKey = Object.keys(next[pnKey]).find(l => {
        const k1 = l.toLowerCase().trim();
        const k2 = location.toLowerCase().trim();
        return k1.includes(k2) || k2.includes(k1);
      });

      if (locKey) {
        next[pnKey][locKey].newQuantity = newQuantity;
        return next;
      }
      return prev;
    });
  };

  const toggleInventoryConfirm = (partNumber: string, location: string) => {
    if (!partNumber || !location) return;
    
    setInventoryData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pnKey = Object.keys(next).find(k => k.toLowerCase().trim() === partNumber.toLowerCase().trim());
      if (!pnKey) return prev;

      const locKey = Object.keys(next[pnKey]).find(l => {
        const k1 = l.toLowerCase().trim();
        const k2 = location.toLowerCase().trim();
        return k1.includes(k2) || k2.includes(k1);
      });

      if (locKey) {
        const newStatus = !next[pnKey][locKey].confirmed;
        next[pnKey][locKey].confirmed = newStatus;

        // 同步回填到表格
        setPages(currentPages => {
          return currentPages.map(p => {
            if (p.id !== activePageId) return p;
            return {
              ...p,
              tables: p.tables.map(table => {
                const confirmColIdx = table.columns.findIndex(c => c.trim() === '數量確認');
                if (confirmColIdx === -1) return table;

                const newRows = table.rows.map(row => {
                  const hasPartNumber = row.some(cell => 
                    cell.toString().toLowerCase().includes(partNumber.toLowerCase())
                  );
                  if (hasPartNumber) {
                    const newRow = [...row];
                    newRow[confirmColIdx] = newStatus ? 'OK' : '';
                    return newRow;
                  }
                  return row;
                });

                return { ...table, rows: newRows };
              })
            };
          });
        });

        return next;
      }
      return prev;
    });
  };

  // 監聽表格變動，反向連動：手動打 OK 則自動勾選庫存提示，並補完品名資訊
  useEffect(() => {
    if (!activePage) return;
    
    const nextInventory = JSON.parse(JSON.stringify(inventoryData));
    let hasChange = false;

    activePage.tables.forEach(table => {
      // 寬鬆比對欄位名稱
      const findColIdx = (targets: string[]) => table.columns.findIndex(c => {
        if (!c) return false;
        const cleanCol = c.toString().replace(/[\s\u3000]/g, '').toLowerCase();
        return targets.some(t => cleanCol.includes(t.toLowerCase()));
      });

      const confirmColIdx = findColIdx(['數量確認', '核對', '確認', 'check']);
      const pnIdx = findColIdx(['料號', 'partno', 'pn', '品號', '編號', '物料編號', 'itemno']);
      const nameIdx = findColIdx(['品名', '產品名稱', '料號名稱', 'itemname', 'description', '名稱', '規格', '物料名稱']);
      const catIdx = findColIdx(['產品類別', '類別', 'category', 'type', '分類', '產品種類', '物料類別']);

      if (pnIdx === -1) return;

      table.rows.forEach(row => {
        const rawPn = (row[pnIdx] || '').toString();
        if (!rawPn) return;

        // 處理多料號
        const pns = rawPn.split(/[\s,\u3000;\n]+/).map(p => p.trim()).filter(p => p.length > 0);
        
        const isOK = confirmColIdx !== -1 && (['OK', 'V', 'TRUE'].includes(row[confirmColIdx]?.toString().toUpperCase().trim()));
        const rowName = nameIdx !== -1 ? (row[nameIdx]?.toString().trim() || '') : '';
        const rowCat = catIdx !== -1 ? (row[catIdx]?.toString().trim() || '') : '';

        pns.forEach(pn => {
          const normPn = normalizeKey(pn);
          // 在 inventoryData 中尋找匹配的料號 (以原始鍵值比對，但使用 normalization輔助)
          const actualPnKey = Object.keys(nextInventory).find(k => normalizeKey(k) === normPn);
          
          if (actualPnKey) {
            // 全域同步：更新該料號下「所有」廠區的品名與類別
            Object.keys(nextInventory[actualPnKey]).forEach(l => {
              if (rowName && !nextInventory[actualPnKey][l].name) {
                nextInventory[actualPnKey][l].name = rowName;
                hasChange = true;
              }
              if (rowCat && !nextInventory[actualPnKey][l].category) {
                nextInventory[actualPnKey][l].category = rowCat;
                hasChange = true;
              }
            });

            // 尋找匹配當前工作區的廠區 (activePage.name) 以更新確認狀態
            const locKey = Object.keys(nextInventory[actualPnKey]).find(l => {
              const k1 = l.toLowerCase().trim();
              const k2 = activePage.name.toLowerCase().trim();
              return k1.includes(k2) || k2.includes(k1);
            });

            if (locKey) {
              // 更新確認狀態
              if (confirmColIdx !== -1 && nextInventory[actualPnKey][locKey].confirmed !== isOK) {
                nextInventory[actualPnKey][locKey].confirmed = isOK;
                hasChange = true;
              }
            }
          }
        });
      });
    });

    if (hasChange) {
      setInventoryData(nextInventory);
    }
  }, [pages, activePageId]); // 當頁面或表格內容變動時觸發

  const activePage = useMemo(() => 
    pages.find(p => p.id === activePageId) || null, 
    [pages, activePageId]
  );

  const addNewPage = () => {
    if (!isEditMode) return;
    const newId = generateId();
    const newPage: PageData = { id: newId, name: `新工作區 ${pages.length + 1}`, tables: [] };
    setPages(prev => [...prev, newPage]);
    setActivePageId(newId);
    setTimeout(() => setIsEditingPageName(newId), 50);
  };

  const renamePage = (id: string, newName: string) => {
    setPages(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const executeDeletePage = (id: string) => {
    const deletedIndex = pages.findIndex(p => p.id === id);
    const newPages = pages.filter(p => p.id !== id);
    if (newPages.length === 0) {
      createDefaultPage();
    } else {
      setPages(newPages);
      if (activePageId === id) {
        const nextIndex = Math.max(0, Math.min(deletedIndex, newPages.length - 1));
        setActivePageId(newPages[nextIndex].id);
      }
    }
    setPageIdToConfirmDelete(null);
  };

  const addNewTable = () => {
    if (!activePageId || !isEditMode) return;
    const newTable: TableData = {
      id: generateId(),
      title: '未命名表格',
      columns: ['標題 1', '標題 2', '標題 3'],
      rows: [['', '', '']]
    };
    setPages(prev => prev.map(p => p.id === activePageId ? { ...p, tables: [newTable, ...p.tables] } : p));
    setSearchQuery('');
  };

  const updateTable = (updatedTable: TableData) => {
    if (!isEditMode) return;
    setPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, tables: p.tables.map(t => t.id === updatedTable.id ? updatedTable : t) } : p
    ));
  };

  const deleteTable = (id: string) => {
    if (!isEditMode) return;
    setPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, tables: p.tables.filter(t => t.id !== id) } : p
    ));
  };

  const handleInventoryImportClick = () => {
    if (!isEditMode) return;
    inventoryInputRef.current?.click();
  };

  const handleInventoryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const processJsonData = (jsonData: any[]) => {
      if (jsonData.length === 0) return;
      
      setInventoryData(prev => {
        const newInventory: InventoryData = JSON.parse(JSON.stringify(prev)); 
        
        // 匯入新表時，先清空所有舊的盤點與備註內容
        Object.keys(newInventory).forEach(pn => {
          Object.keys(newInventory[pn]).forEach(loc => {
            newInventory[pn][loc].newQuantity = '';
            newInventory[pn][loc].remarks = '';
          });
        });
        
        // 1. 從現有表格抓取最新 metadata 對照表 (Scraper)
        const tableMetadata: Record<string, { name: string, category: string }> = {};
        pages.forEach(page => {
          page.tables.forEach(table => {
            const findColIdx = (targets: string[]) => table.columns.findIndex(c => {
              if (!c) return false;
              const cleanCol = c.toString().replace(/[\s\u3000]/g, '').toLowerCase();
              return targets.some(t => cleanCol.includes(t.toLowerCase()));
            });

            const pnIdx = findColIdx(['料號', 'partno', 'pn', '品號', '編號', '物料編號', 'itemno']);
            const nameIdx = findColIdx(['品名', '產品名稱', '料號名稱', 'itemname', 'description', '名稱', '規格', '物料名稱']);
            const catIdx = findColIdx(['產品類別', '類別', 'category', 'type', '分類', '產品種類', '物料類別']);

            if (pnIdx !== -1) {
              table.rows.forEach(row => {
                const rawPn = (row[pnIdx] || '').toString();
                if (!rawPn) return;
                const pns = rawPn.split(/[\s,\u3000;\n]+/).map(p => p.trim()).filter(p => p.length > 0);
                pns.forEach(pn => {
                  const normPn = normalizeKey(pn);
                  if (!tableMetadata[normPn]) tableMetadata[normPn] = { name: '', category: '' };
                  if (nameIdx !== -1 && row[nameIdx] && !tableMetadata[normPn].name) 
                    tableMetadata[normPn].name = row[nameIdx].toString().trim();
                  if (catIdx !== -1 && row[catIdx] && !tableMetadata[normPn].category) 
                    tableMetadata[normPn].category = row[catIdx].toString().trim();
                });
              });
            }
          });
        });

        // 2. 處理匯入資料 (支援標準格式與交叉表)
        jsonData.forEach(row => {
          const cleanRow: Record<string, any> = {};
          const originalKeys: string[] = [];
          for (const k in row) {
            const cleanK = k.toString().replace(/[\s\u3000]/g, '').toLowerCase();
            cleanRow[cleanK] = row[k];
            originalKeys.push(k);
          }

          const findExcelKey = (targets: string[]) => Object.keys(cleanRow).find(k => targets.some(t => k.includes(t.toLowerCase())));

          const partNumberKey = findExcelKey(['料號', 'partno', 'pn', '品號', '編號', '物料編號', 'itemno']) || Object.keys(cleanRow)[0];
          const productNameKey = findExcelKey(['品名', '產品名稱', '料號名稱', 'itemname', 'description', '名稱', '規格', '物料名稱']);
          const categoryKey = findExcelKey(['產品類別', '類別', 'category', 'type', '分類', '產品種類', '物料類別']);
          const locationKey = findExcelKey(['產品位置', '位置', 'location', '儲位', '存放位置']);
          const quantityKey = findExcelKey(['庫存數量', '數量', 'qty', 'quantity', '庫存']);
          const confirmKey = findExcelKey(['數量確認', '核對', '確認', 'check', 'status']);
          const newQuantityKey = findExcelKey(['新數量', 'new_qty', 'new_quantity']);
          const remarksKey = findExcelKey(['備註', 'remarks', 'note', '備註欄', '其他']);
          
          const rawPN = String(cleanRow[partNumberKey || ''] || '').trim();
          if (!rawPN) return;

          if (!newInventory[rawPN]) newInventory[rawPN] = {};

          const normPN = normalizeKey(rawPN);
          // 彙整 metadata (優先序：Excel > 當前表格 > 舊庫存)
          const productName = (productNameKey ? String(cleanRow[productNameKey]).trim() : '') 
                            || tableMetadata[normPN]?.name 
                            || (newInventory[rawPN] ? Object.values(newInventory[rawPN])[0]?.name : '');
          
          const category = (categoryKey ? String(cleanRow[categoryKey]).trim() : '') 
                         || tableMetadata[normPN]?.category 
                         || (newInventory[rawPN] ? Object.values(newInventory[rawPN])[0]?.category : '');
          
          const importedNewQuantity = newQuantityKey ? String(cleanRow[newQuantityKey] || '').trim() : '';
          const importedRemarks = remarksKey ? String(cleanRow[remarksKey] || '').trim() : '';

          const hasStandardLocation = locationKey && cleanRow[locationKey];
          if (hasStandardLocation) {
            // 標準格式： 料號, 位置, 數量
            const location = String(cleanRow[locationKey]).trim();
            const quantity = quantityKey ? cleanRow[quantityKey] : '';
            const confirmed = confirmKey ? (['V', 'OK', 'TRUE'].includes(String(cleanRow[confirmKey]).toUpperCase().trim())) : false;
            newInventory[rawPN][location] = { 
              quantity, 
              confirmed, 
              name: productName, 
              category, 
              newQuantity: importedNewQuantity,
              remarks: importedRemarks
            };
          } else {
            // 交叉表格式：料號, 廠區A, 廠區B...
            originalKeys.forEach(origKey => {
              const cleanK = origKey.replace(/[\s\u3000]/g, '').toLowerCase();
              const isReserved = [partNumberKey, productNameKey, categoryKey, locationKey, quantityKey, confirmKey, '數量確認', newQuantityKey, remarksKey].includes(cleanK);
              if (!isReserved) {
                const val = row[origKey];
                if (val !== undefined && val !== null && val !== "") {
                  newInventory[rawPN][origKey] = { 
                    quantity: val, 
                    confirmed: false,
                    name: productName,
                    category,
                    newQuantity: importedNewQuantity,
                    remarks: importedRemarks
                  };
                }
              }
            });
          }

          // 核心補完：確保該料號的所有位置 metadata 同步
          if (newInventory[rawPN]) {
            Object.keys(newInventory[rawPN]).forEach(l => {
              if (productName && !newInventory[rawPN][l].name) newInventory[rawPN][l].name = productName;
              if (category && !newInventory[rawPN][l].category) newInventory[rawPN][l].category = category;
            });
          }
        });
        
        return newInventory;
      });
    };

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      if (!result) return;

      if (isCsv) {
        let text = '';
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          text = utf8Decoder.decode(result);
        } catch (err) {
          const big5Decoder = new TextDecoder('big5');
          text = big5Decoder.decode(result);
        }

        const parseCSVToRows = (csvText: string): string[][] => {
          const rows: string[][] = [];
          let currentRow: string[] = [];
          let currentCell = '';
          let inQuotes = false;
          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            if (inQuotes) {
              if (char === '"' && nextChar === '"') { currentCell += '"'; i++; }
              else if (char === '"') { inQuotes = false; }
              else { currentCell += char; }
            } else {
              if (char === '"') { inQuotes = true; }
              else if (char === ',') { currentRow.push(currentCell); currentCell = ''; }
              else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                if (char === '\r') i++;
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
              } else if (char !== '\r') { currentCell += char; }
            }
          }
          if (currentCell !== '' || currentRow.length > 0) { currentRow.push(currentCell); rows.push(currentRow); }
          return rows;
        };

        const rows = parseCSVToRows(text);
        if (rows.length < 1) return;
        const headers = rows[0];
        const jsonData = rows.slice(1).map(row => {
          const obj: any = {};
          headers.forEach((h, i) => { if (h !== undefined) obj[h.trim()] = row[i]; });
          return obj;
        });
        processJsonData(jsonData);
      } else {
        const data = new Uint8Array(result);
        const workbook = xlsx.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: "" }) as any[];
        processJsonData(jsonData);
      }
      if (inventoryInputRef.current) inventoryInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImportClick = () => {
    if (!isEditMode) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activePageId) return;

    const fileName = file.name.split('.').slice(0, -1).join('.') || '匯入的表格';

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      let text = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        text = utf8Decoder.decode(buffer);
      } catch (err) {
        const big5Decoder = new TextDecoder('big5');
        text = big5Decoder.decode(buffer);
      }

      if (!text) return;

      const parseCSVToRows = (csvText: string): string[][] => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
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

      const allParsedRows = parseCSVToRows(text);
      if (allParsedRows.length === 0) return;

      const detectedTables: TableData[] = [];
      
      // 檢查是否為系統匯出的多表格格式 (含 >>> 表格： 標記)
      const isSystemMultiTableFile = allParsedRows.some(row => 
        (row[0] || '').trim().startsWith('>>> 表格：')
      );

      if (isSystemMultiTableFile) {
        let currentTable: TableData | null = null;
        allParsedRows.forEach(row => {
          const firstCellContent = (row[0] || '').trim();
          if (firstCellContent.startsWith('>>> 表格：') && firstCellContent.endsWith('<<<')) {
            const extractedTitle = firstCellContent.replace('>>> 表格：', '').replace('<<<', '').trim();
            currentTable = { id: generateId(), title: extractedTitle, columns: [], rows: [] };
            detectedTables.push(currentTable);
          } else if (currentTable) {
            if (!row.some(c => c.trim() !== "")) return;
            if (currentTable.columns.length === 0) {
              currentTable.columns = row.map(c => c.trim());
            } else {
              currentTable.rows.push(row.map(c => c.toString()));
            }
          }
        });
      } else {
        // 處理一般 CSV：根據空行切分區塊
        let currentBlockRows: string[][] = [];
        
        allParsedRows.forEach((row) => {
          const isRowEmpty = !row.some(cell => cell.trim() !== "");
          
          if (isRowEmpty) {
            if (currentBlockRows.length > 0) {
              const headers = currentBlockRows[0];
              const data = currentBlockRows.slice(1);
              detectedTables.push({
                id: generateId(),
                title: detectedTables.length === 0 ? fileName : `${fileName} - 區塊 ${detectedTables.length + 1}`,
                columns: headers,
                rows: data.length > 0 ? data : [new Array(headers.length).fill('')]
              });
              currentBlockRows = [];
            }
          } else {
            currentBlockRows.push(row);
          }
        });

        // 處理最後一個區塊
        if (currentBlockRows.length > 0) {
          const headers = currentBlockRows[0];
          const data = currentBlockRows.slice(1);
          detectedTables.push({
            id: generateId(),
            title: detectedTables.length === 0 ? fileName : `${fileName} - 區塊 ${detectedTables.length + 1}`,
            columns: headers,
            rows: data.length > 0 ? data : [new Array(headers.length).fill('')]
          });
        }
      }

      // 確保所有表格都有基本列
      detectedTables.forEach(t => {
        if (t.rows.length === 0) {
          t.rows = [new Array(t.columns.length).fill('')];
        }
      });

      if (detectedTables.length > 0) {
        setPages(prev => prev.map(p => 
          p.id === activePageId 
            ? { ...p, tables: [...p.tables, ...detectedTables] } 
            : p
        ));
        setSearchQuery('');
      }
      
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const exportAllTablesOnPage = () => {
    if (!activePage || activePage.tables.length === 0) return;
    const escapeCSV = (str: string) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    const csvContent = activePage.tables.map(table => {
      const titleRow = [`>>> 表格：${table.title} <<<`].map(escapeCSV).join(',');
      const headerRow = table.columns.map(escapeCSV).join(',');
      const dataRows = table.rows.map(row => row.map(escapeCSV).join(',')).join('\n');
      return `${titleRow}\n${headerRow}\n${dataRows}`;
    }).join('\n\n\n'); 

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activePage.name}_全頁匯出.csv`;
    link.click();
  };

  const exportInventory = () => {
    if (!inventoryData || Object.keys(inventoryData).length === 0) return;
    const escapeCSV = (str: string) => `"${(str || '').toString().replace(/"/g, '""')}"`;

    // 建立一個從現有表格抓取的 metadata map 作為輔助，補足匯出時可能缺失的品名資訊
    const tableMetadata: Record<string, { name: string, category: string }> = {};
    pages.forEach(page => {
      page.tables.forEach(table => {
        // 極其寬鬆的欄位偵測邏輯
        const findColIdx = (targets: string[]) => table.columns.findIndex(c => {
          if (!c) return false;
          const cleanCol = c.toString().replace(/[\s\u3000]/g, '').toLowerCase();
          return targets.some(t => cleanCol.includes(t.toLowerCase()));
        });

        const pnIdx = findColIdx(['料號', 'partno', 'pn', '品號', '編號', '物料編號', 'itemno']);
        const nameIdx = findColIdx(['品名', '產品名稱', '料號名稱', 'itemname', 'description', '名稱', '規格', '物料名稱']);
        const catIdx = findColIdx(['產品類別', '類別', 'category', 'type', '分類', '產品種類', '物料類別']);

        if (pnIdx !== -1) {
          table.rows.forEach(row => {
            const rawPn = (row[pnIdx] || '').toString();
            if (!rawPn) return;
            
            // 處理多料號狀況 (支援空白、逗號、分號、換行)
            const pns = rawPn.split(/[\s,\u3000;\n]+/).map(p => p.trim()).filter(p => p.length > 0);
            
            pns.forEach(pn => {
              const normPn = normalizeKey(pn);
              if (!tableMetadata[normPn]) tableMetadata[normPn] = { name: '', category: '' };
              
              if (nameIdx !== -1 && row[nameIdx] && !tableMetadata[normPn].name) 
                tableMetadata[normPn].name = row[nameIdx].toString().trim();
              if (catIdx !== -1 && row[catIdx] && !tableMetadata[normPn].category) 
                tableMetadata[normPn].category = row[catIdx].toString().trim();
            });
          });
        }
      });
    });

    console.log('Final Scraped Metadata Map:', tableMetadata);

    // 建立 CSV 標題：料號, 品名, 產品類別, 產品位置, 庫存數量, 數量確認, 新數量, 備註
    const headers = ['料號', '品名', '產品類別', '產品位置', '庫存數量', '數量確認', '新數量', '備註'];
    const rows: string[][] = [];

    Object.entries(inventoryData).forEach(([partNumber, locMap]) => {
      const normPN = normalizeKey(partNumber);
      
      // 找出該料號下任何一個位置中存有的品名或類別，作為回退 (Fallback)
      const locEntries = Object.values(locMap);
      const fallbackName = locEntries.find(d => d.name)?.name || tableMetadata[normPN]?.name || '';
      const fallbackCategory = locEntries.find(d => d.category)?.category || tableMetadata[normPN]?.category || '';

      Object.entries(locMap).forEach(([location, data]) => {
        rows.push([
          partNumber,
          data.name || fallbackName,
          data.category || fallbackCategory,
          location,
          data.quantity.toString(),
          data.confirmed ? 'V' : '',
          data.newQuantity || '',
          data.remarks || ''
        ]);
      });
    });

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `更新後庫存表_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
    link.click();
  };

  const filteredTables = useMemo(() => {
    if (!activePage) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activePage.tables;
    return activePage.tables.filter(table => 
      table.title.toLowerCase().includes(q) || 
      table.columns.some(col => (col || '').toLowerCase().includes(q)) ||
      table.rows.some(row => row.some(cell => (cell || '').toString().toLowerCase().includes(q)))
    );
  }, [activePage, searchQuery]);

  const firstMatchTableId = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || filteredTables.length === 0) return null;
    return filteredTables[0].id;
  }, [filteredTables, searchQuery]);

  return (
    <div className="min-h-screen pb-32 bg-[#fcfcfc] text-black font-medium selection:bg-yellow-200">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
      <input type="file" ref={inventoryInputRef} onChange={handleInventoryFileChange} accept=".xlsx, .xls, .csv" className="hidden" />
      
      <header className="sticky top-0 z-[100] bg-white border-b-4 border-black px-8 py-5 flex flex-col md:flex-row items-center justify-between shadow-sm gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black border-2 border-black rounded flex items-center justify-center text-white shadow-[4px_4px_0px_0px_rgba(255,255,0,1)]">
            <i className="fas fa-table-list text-2xl"></i>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">Table Expert</h1>
            <p className="text-[10px] font-black mt-1 bg-black text-white px-1 w-fit">NEOBRUTALISM v5</p>
          </div>
        </div>

        <div className="flex-1 max-w-lg relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-black"></i>
          <input 
            type="text" 
            placeholder="搜尋關鍵字..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-gray-50 border-4 border-black rounded-xl py-2 pl-12 pr-4 font-black focus:outline-none focus:bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all" 
          />
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={fetchDatabaseInventory}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2 border-4 border-black rounded-xl font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all ${isSyncing ? 'bg-gray-200 cursor-wait' : 'bg-blue-400 hover:bg-blue-500'}`}
          >
            <i className={`fas fa-sync-alt ${isSyncing ? 'animate-spin' : ''}`}></i>
            {isSyncing ? '比對中...' : '資料庫比對'}
          </button>

          <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl border-2 border-black">
            <span className={`text-[10px] font-black uppercase ml-1 ${!isEditMode ? 'text-black' : 'text-gray-400'}`}>檢視</span>
            <button 
              onClick={() => setIsEditMode(!isEditMode)}
              className={`relative w-12 h-6 rounded-full border-2 border-black transition-colors ${isEditMode ? 'bg-yellow-400' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-black rounded-full transition-all ${isEditMode ? 'left-[24px]' : 'left-1'}`} />
            </button>
            <span className={`text-[10px] font-black uppercase mr-1 ${isEditMode ? 'text-black' : 'text-gray-400'}`}>編輯</span>
          </div>

          <div className="h-8 w-[2px] bg-black/10 hidden lg:block"></div>

          <div className="flex items-center gap-2">
            {isEditMode && (
              <>
                <div className="flex bg-black/5 rounded-xl p-1 gap-1 border border-black/10">
                  <button 
                    onClick={handleInventoryImportClick} 
                    className="bg-white hover:bg-yellow-50 text-black px-4 py-2 rounded-lg font-black text-sm border-2 border-black flex items-center gap-2 transition-all active:translate-y-0.5"
                  >
                    <i className="fas fa-file-excel text-green-600"></i>
                    更新數量表
                  </button>
                  {inventoryData && Object.keys(inventoryData).length > 0 && (
                      <button 
                        onClick={exportInventory} 
                        title="匯出含核對紀錄的庫存表"
                        className="bg-black hover:bg-gray-800 text-white px-3 py-2 rounded-lg font-black text-sm border-2 border-black transition-all active:translate-y-0.5"
                      >
                        <i className="fas fa-file-export"></i>
                      </button>
                    )}
                  </div>
                <button onClick={handleImportClick} className="px-4 py-2.5 rounded-lg font-black border-2 border-black bg-white hover:bg-gray-100 transition-all active:translate-y-0.5 text-sm">
                  <i className="fas fa-file-import mr-2"></i>匯入 CSV
                </button>
                <button onClick={addNewTable} className="px-4 py-2.5 bg-black text-white rounded-lg font-black border-2 border-black hover:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(255,255,0,0.5)] active:translate-y-0.5 transition-all text-sm">
                  <i className="fas fa-plus mr-2"></i>新增
                </button>
              </>
            )}
            <button onClick={exportAllTablesOnPage} className="px-4 py-2.5 rounded-lg font-black border-2 border-black bg-white hover:bg-yellow-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all text-sm">
              <i className="fas fa-file-export mr-2"></i>匯出
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b-4 border-black px-8 pt-6 flex items-end gap-1 overflow-x-auto no-scrollbar">
        {pages.map((page) => (
          <div 
            key={page.id} 
            className={`group relative flex items-center transition-all px-5 py-3 border-t-4 border-x-4 border-black rounded-t-xl cursor-pointer min-w-[180px] ${activePageId === page.id ? 'bg-yellow-400 -mb-1 translate-y-[-4px] z-10 shadow-[0px_-2px_0px_0px_rgba(0,0,0,1)]' : 'bg-gray-100 hover:bg-gray-200'}`} 
            onClick={() => setActivePageId(page.id)}
          >
            {pageIdToConfirmDelete === page.id ? (
              <div className="flex items-center justify-between w-full gap-2 animate-pulse" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-black uppercase text-red-600 italic">刪除？</span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); executeDeletePage(page.id); }} className="px-2 py-1 bg-red-600 text-white text-[10px] rounded border border-black font-black">是</button>
                  <button onClick={(e) => { e.stopPropagation(); setPageIdToConfirmDelete(null); }} className="px-2 py-1 bg-white text-black text-[10px] rounded border border-black font-black">否</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  <i className={`fas ${activePageId === page.id ? 'fa-folder-open' : 'fa-folder'} text-sm`}></i>
                  {isEditingPageName === page.id && isEditMode ? (
                    <input autoFocus className="bg-white/50 border-b-2 border-black font-black w-full outline-none px-1" value={page.name} onChange={(e) => renamePage(page.id, e.target.value)} onBlur={() => setIsEditingPageName(null)} onKeyDown={(e) => e.key === 'Enter' && setIsEditingPageName(null)} onClick={(e) => e.stopPropagation()} />
                  ) : (
                    <span className="font-black truncate text-base" onDoubleClick={() => isEditMode && setIsEditingPageName(page.id)}>{page.name}</span>
                  )}
                </div>
                {isEditMode && (
                  <button onClick={(e) => { e.stopPropagation(); setPageIdToConfirmDelete(page.id); }} className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white rounded-md text-red-600 transition-all ml-2"><i className="fas fa-times text-xs"></i></button>
                )}
              </>
            )}
          </div>
        ))}
        {isEditMode && (
          <button onClick={addNewPage} className="mb-3 ml-4 w-10 h-10 bg-black text-white rounded-full hover:scale-110 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] flex items-center justify-center"><i className="fas fa-plus"></i></button>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-8 pt-12">
        {activePage && activePage.tables.length === 0 ? (
          <div className="py-48 text-center border-4 border-dashed border-black rounded-[2rem] bg-white shadow-[16px_16px_0px_0px_rgba(0,0,0,0.05)]">
            <h2 className="text-4xl font-black mb-10 italic uppercase tracking-tight">「{activePage.name}」目前沒有表格</h2>
            <div className="flex justify-center gap-4">
              {isEditMode ? (
                <>
                  <button onClick={handleImportClick} className="bg-white text-black px-8 py-4 rounded-xl font-black text-xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 transition-all">匯入 CSV 檔案</button>
                  <button onClick={addNewTable} className="bg-black text-white px-8 py-4 rounded-xl font-black text-xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(255,255,0,0.4)] active:translate-y-1 transition-all">手動新增表格</button>
                </>
              ) : (
                <p className="text-xl font-black uppercase text-gray-400">目前為唯讀模式，請開啟編輯開關以新增內容</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-24">
            {filteredTables.map(table => (
              <TableEditor 
                key={table.id} 
                table={table} 
                isEditMode={isEditMode} 
                inventoryData={inventoryData}
                dbInventory={dbInventory}
                activePageName={activePage?.name || ''}
                onUpdate={updateTable} 
                onDelete={deleteTable} 
                onDuplicate={() => {
                  const newTable = { ...JSON.parse(JSON.stringify(table)), id: generateId(), title: `${table.title} (副本)` };
                  setPages(prev => prev.map(p => p.id === activePageId ? { ...p, tables: [newTable, ...p.tables] } : p));
                }} 
                onToggleInventoryConfirm={toggleInventoryConfirm}
                onUpdateInventoryNewQuantity={updateInventoryNewQuantity}
                searchQuery={searchQuery} 
                isFirstMatch={table.id === firstMatchTableId}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
