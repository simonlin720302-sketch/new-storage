import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { TableData, InventoryData } from '../types.ts';
import { InventoryTooltip } from './InventoryTooltip.tsx';

interface TableEditorProps {
  table: TableData;
  onUpdate: (updatedTable: TableData) => void;
  onDelete: (id: string) => void;
  onDuplicate: () => void;
  onToggleInventoryConfirm?: (partNumber: string, location: string) => void;
  onUpdateInventoryNewQuantity?: (partNumber: string, location: string, newQuantity: string) => void;
  isEditMode: boolean;
  inventoryData?: InventoryData;
  dbInventory?: Record<string, { p2: number, p3: number }>;
  activePageName?: string;
  searchQuery?: string;
  isFirstMatch?: boolean;
}

// 精確文字高亮組件與料號提示整合
const HighlightedText: React.FC<{ 
  text: string; 
  query: string;
  inventoryData?: InventoryData;
  activePageName?: string;
  onToggleInventoryConfirm?: (partNumber: string, location: string) => void;
  onUpdateInventoryNewQuantity?: (partNumber: string, location: string, newQuantity: string) => void;
  dbInventory?: Record<string, { p2: number, p3: number }>;
}> = ({ text, query, inventoryData, activePageName, onToggleInventoryConfirm, onUpdateInventoryNewQuantity, dbInventory }) => {
  const normalizeKey = (key: any) => (key || '').toString().replace(/[\s\u3000]/g, '').toUpperCase();

  // 動態建立正則表達式來尋找所有可能的料號 (包含資料庫中的料號)
  const partRegex = useMemo(() => {
    const keysSet = new Set<string>();
    
    // 從本地錄入資料抓取
    if (inventoryData) {
      Object.keys(inventoryData).forEach(k => { if(k.trim()) keysSet.add(k.trim()); });
    }
    
    // 從資料庫清單抓取 (這是解決「沒上傳 CSV 也能比對」的核心)
    if (dbInventory) {
      Object.keys(dbInventory).forEach(k => { if(k.trim()) keysSet.add(k.trim()); });
    }

    if (keysSet.size === 0) return null;
    
    const sortedKeys = Array.from(keysSet).sort((a, b) => b.length - a.length);
    const escapedKeys = sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(${escapedKeys.join('|')})`, 'gi');
  }, [inventoryData, dbInventory]);

  // 第一階段切割：料號
  const parts = partRegex ? text.split(partRegex) : [text];

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;

        const normPart = normalizeKey(part);
        
        // 比對是否為料號
        let matchedKey: string | undefined;
        let dbValue: { p2: number, p3: number } | undefined;
        let inventorySection: any = undefined;

        if (partRegex && partRegex.test(part)) {
           // 優先尋找資料庫匹配
           if (dbInventory) {
             const dbKey = Object.keys(dbInventory).find(k => normalizeKey(k) === normPart);
             if (dbKey) {
               dbValue = dbInventory[dbKey];
               matchedKey = dbKey; // 以資料庫的 Key 為準
             }
           }
           
           // 尋找本地錄入匹配
           if (inventoryData) {
             const invKey = Object.keys(inventoryData).find(k => normalizeKey(k) === normPart);
             if (invKey) {
               inventorySection = inventoryData[invKey];
               if (!matchedKey) matchedKey = invKey;
             }
           }
        }

        const isPartNumber = !!matchedKey;
        if (partRegex) partRegex.lastIndex = 0;

        // 第二階段切割：搜尋高亮
        const renderInner = () => {
          const q = query.trim();
          if (!q) return <>{part}</>;
          const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuery})`, 'gi');
          const subParts = part.split(regex);
          return (
            <>
              {subParts.map((sub, j) => 
                regex.test(sub) ? (
                  <mark key={j} className="bg-fuchsia-500 text-white border border-black px-1 rounded-sm font-bold shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] inline-block leading-tight">
                    {sub}
                  </mark>
                ) : (
                  <span key={j}>{sub}</span>
                )
              )}
            </>
          );
        };

        if (isPartNumber && matchedKey && activePageName) {
          return (
            <InventoryTooltip 
              key={i} 
              inventory={inventorySection || {}} 
              dbValue={dbValue}
              activePageName={activePageName}
              onToggleConfirm={() => onToggleInventoryConfirm?.(matchedKey!, activePageName!)}
              onNewQuantityChange={(val) => onUpdateInventoryNewQuantity?.(matchedKey!, activePageName!, val)}
            >
              {renderInner()}
            </InventoryTooltip>
          );
        }

        return <React.Fragment key={i}>{renderInner()}</React.Fragment>;
      })}
    </>
  );
};

const AutoHeightTextarea: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  textAlign?: 'left' | 'center' | 'right';
  searchQuery?: string;
  readOnly?: boolean;
  inventoryData?: Record<string, Record<string, { quantity: number | string, confirmed: boolean }>>;
  activePageName?: string;
  disableInventory?: boolean;
  onToggleInventoryConfirm?: (partNumber: string, location: string) => void;
  onUpdateInventoryNewQuantity?: (partNumber: string, location: string, newQuantity: string) => void;
  dbInventory?: Record<string, { p2: number, p3: number }>;
}> = ({ value, onChange, className, placeholder, textAlign = 'left', searchQuery = '', readOnly = false, inventoryData, activePageName, disableInventory = false, onToggleInventoryConfirm, onUpdateInventoryNewQuantity, dbInventory }) => {
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const node = textareaRef.current;
    if (node) {
      node.style.height = '0px';
      node.style.height = `${node.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    if (isFocused) {
      adjustHeight();
    }
  }, [value, isFocused]);

  useEffect(() => {
    if (isFocused) {
      window.addEventListener('resize', adjustHeight);
      return () => window.removeEventListener('resize', adjustHeight);
    }
  }, [isFocused]);

  if (!isFocused) {
    return (
      <div 
        onClick={() => !readOnly && setIsFocused(true)}
        style={{ textAlign }}
        className={`w-full break-words whitespace-pre-wrap min-h-[1.5em] leading-normal transition-all py-1.5 ${
          readOnly ? 'cursor-default' : 'cursor-text'
        } ${className}`}
      >
        {value ? (
          <HighlightedText 
            text={value} 
            query={searchQuery || ''} 
            inventoryData={disableInventory ? undefined : inventoryData} 
            activePageName={activePageName} 
            onToggleInventoryConfirm={onToggleInventoryConfirm}
            onUpdateInventoryNewQuantity={onUpdateInventoryNewQuantity}
            dbInventory={dbInventory}
          />
        ) : (
          <span className="opacity-30">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      rows={1}
      style={{ textAlign }}
      className={`resize-none overflow-hidden block w-full bg-transparent focus:outline-none leading-normal transition-all whitespace-pre-wrap break-words py-1.5 ${className}`}
      onInput={adjustHeight}
    />
  );
};

export const TableEditor: React.FC<TableEditorProps> = ({ 
  table, 
  onUpdate, 
  onDelete, 
  onDuplicate, 
  onToggleInventoryConfirm,
  onUpdateInventoryNewQuantity,
  isEditMode, 
  inventoryData = {}, 
  dbInventory = {},
  activePageName = '', 
  searchQuery = '', 
  isFirstMatch = false 
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkMatch = (text: string) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return false;
    return (text || '').toString().toLowerCase().includes(q);
  };

  useEffect(() => {
    const q = searchQuery.toLowerCase().trim();
    if (isFirstMatch && q && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });

      setTimeout(() => {
        if (scrollContainerRef.current) {
          const matchTarget = scrollContainerRef.current.querySelector('[data-matched="true"]');
          if (matchTarget) {
            matchTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        }
      }, 500);
    }
  }, [searchQuery, isFirstMatch]);

  const addRow = () => {
    if (!isEditMode) return;
    onUpdate({ ...table, rows: [...table.rows, new Array(table.columns.length).fill('')] });
  };

  const addColumn = () => {
    if (!isEditMode) return;
    onUpdate({ 
      ...table, 
      columns: [...table.columns, `新欄位`], 
      rows: table.rows.map(row => [...row, '']) 
    });
  };

  const removeRow = (index: number) => {
    if (!isEditMode) return;
    const newRows = table.rows.length <= 1 ? [new Array(table.columns.length).fill('')] : table.rows.filter((_, i) => i !== index);
    onUpdate({ ...table, rows: newRows });
  };

  const removeColumn = (index: number) => {
    if (!isEditMode || table.columns.length <= 1) return;
    onUpdate({ 
      ...table, 
      columns: table.columns.filter((_, i) => i !== index),
      rows: table.rows.map(row => row.filter((_, i) => i !== index))
    });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    if (!isEditMode) return;
    const newRows = [...table.rows];
    newRows[rowIndex][colIndex] = value;
    onUpdate({ ...table, rows: newRows });
  };

  const updateHeader = (colIndex: number, value: string) => {
    if (!isEditMode) return;
    const newColumns = [...table.columns];
    newColumns[colIndex] = value;
    onUpdate({ ...table, columns: newColumns });
  };

  const downloadCSV = () => {
    const escapeCSV = (str: string) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    const csvContent = [
      table.columns.map(escapeCSV).join(','),
      ...table.rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${table.title || 'table'}.csv`;
    link.click();
  };

  return (
    <div ref={containerRef} className={`bg-white rounded-xl border-4 border-black mb-16 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-colors ${!isEditMode ? 'bg-gray-50/30' : ''}`}>
      <div className="p-6 border-b-4 border-black flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white relative z-50">
        <div className="flex-1">
          <AutoHeightTextarea
            value={table.title}
            onChange={(val) => onUpdate({ ...table, title: val })}
            readOnly={!isEditMode}
            searchQuery={searchQuery}
            className="text-3xl font-black text-black border-b-2 border-black pb-1 uppercase italic"
            placeholder="表格標題..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode && (
            <button onClick={onDuplicate} title="複製表格" className="p-2 border-2 border-black rounded-lg hover:bg-gray-100 transition-all text-sm font-black"><i className="fas fa-copy"></i></button>
          )}
          <button onClick={downloadCSV} title="匯出 CSV" className="p-2 border-2 border-black rounded-lg bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:translate-y-0.5 transition-all text-sm font-black"><i className="fas fa-download"></i></button>
          
          {isEditMode && (
            isConfirmingDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => setIsConfirmingDelete(false)} className="px-3 py-1.5 rounded-lg font-black border-2 border-black bg-white text-xs">取消</button>
                <button onClick={() => onDelete(table.id)} className="px-3 py-1.5 rounded-lg font-black border-2 border-black bg-red-600 text-white text-xs">刪除</button>
              </div>
            ) : (
              <button onClick={() => setIsConfirmingDelete(true)} title="刪除表格" className="p-2 rounded-lg font-black border-2 border-black bg-red-600 text-white hover:bg-red-700 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 text-sm"><i className="fas fa-trash-alt"></i></button>
            )
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="max-h-[700px] overflow-auto max-w-full custom-scrollbar relative bg-white pb-20">
        <table className="border-separate border-spacing-0 min-w-full table-fixed">
          <thead>
            <tr className="sticky top-0 z-[30]">
              {table.columns.map((col, idx) => {
                const isFirstCol = idx === 0;
                const colWidth = isFirstCol ? '200px' : '250px';
                return (
                  <th 
                    key={idx} 
                    style={{ minWidth: colWidth }}
                    className={`p-3 border-b-4 border-r-2 border-black relative group text-center align-top transition-colors
                      ${isFirstCol 
                        ? 'sticky left-0 z-[40] border-r-4 bg-yellow-400' 
                        : 'bg-white text-left'
                      }
                    `}
                  >
                    <AutoHeightTextarea 
                      value={col} 
                      onChange={(v) => updateHeader(idx, v)} 
                      readOnly={!isEditMode}
                      searchQuery={searchQuery}
                      className={`text-black uppercase placeholder:text-black/30 ${isFirstCol ? 'text-lg font-black italic' : 'text-xs font-black'}`} 
                      placeholder={isFirstCol ? "ID" : `欄位 ${idx + 1}`}
                      textAlign={isFirstCol ? 'center' : 'left'}
                    />
                    {isEditMode && (
                      <button onClick={() => removeColumn(idx)} className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-black/20 hover:text-red-600 transition-opacity p-1"><i className="fas fa-times-circle text-[10px]"></i></button>
                    )}
                  </th>
                );
              })}
              {isEditMode && (
                <th className="p-3 w-10 border-b-4 border-black bg-gray-100 text-center sticky right-0 top-0 z-[65]">
                  <button onClick={addColumn} className="hover:scale-125 transition-transform"><i className="fas fa-plus-circle text-lg text-black"></i></button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-gray-50/50 transition-colors group">
                {row.map((cell, cIdx) => {
                  const isFirstCol = cIdx === 0;
                  const colWidth = isFirstCol ? '200px' : '250px';

                  return (
                    <td 
                      key={cIdx} 
                      data-matched={checkMatch(cell)}
                      style={{ minWidth: colWidth }}
                      className={`p-3 border-b-2 border-r-2 border-black text-black transition-all align-top
                        ${isFirstCol 
                          ? 'sticky left-0 z-50 bg-yellow-400 font-black border-r-4 text-center shadow-[2px_0px_0px_0px_rgba(0,0,0,1)]' 
                          : 'font-medium bg-white text-left'
                        }
                      `}
                    >
                      <AutoHeightTextarea 
                        value={cell} 
                        onChange={(v) => updateCell(rIdx, cIdx, v)} 
                        readOnly={!isEditMode}
                        searchQuery={searchQuery}
                        textAlign={isFirstCol ? 'center' : 'left'}
                        className={`text-black ${isFirstCol ? 'text-lg font-black' : 'text-xs'}`} 
                        inventoryData={inventoryData}
                        activePageName={activePageName}
                        disableInventory={isFirstCol || isEditMode}
                        onToggleInventoryConfirm={onToggleInventoryConfirm}
                        onUpdateInventoryNewQuantity={onUpdateInventoryNewQuantity}
                        dbInventory={dbInventory}
                      />
                    </td>
                  );
                })}
                {isEditMode && (
                  <td className="p-1 border-b-2 border-black text-center w-10 bg-white sticky right-0 z-20">
                    <button onClick={() => removeRow(rIdx)} className="hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash-can text-sm"></i></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEditMode && (
        <div className="p-6 bg-white flex justify-center border-t-4 border-black relative z-50">
          <button onClick={addRow} className="flex items-center gap-3 bg-black text-white px-10 py-3 rounded-lg font-black text-base border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] hover:bg-gray-900 active:translate-y-0.5 transition-all uppercase italic">
            <i className="fas fa-plus-square"></i> 插入新行
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #fff; border: 1px solid black; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #000; border: 2px solid #fff; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #333; }
        .sticky.left-0::after { content: ''; position: absolute; top: 0; right: -4px; bottom: 0; width: 4px; pointer-events: none; }
        mark { background-color: #d946ef; color: white; border: 1px solid black; border-radius: 2px; padding: 0 4px; font-weight: 900; box-shadow: 1px 1px 0px 0px rgba(0,0,0,1); }
      `}</style>
    </div>
  );
};
