import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface InventoryTooltipProps {
  inventory: Record<string, { quantity: number | string, confirmed: boolean, name?: string, category?: string }>;
  dbValue?: { p2: number, p3: number };
  activePageName: string;
  children: React.ReactNode;
  onToggleConfirm?: () => void;
  onNewQuantityChange?: (newQuantity: string) => void;
}

export const InventoryTooltip: React.FC<InventoryTooltipProps> = ({ inventory, dbValue, activePageName, children, onToggleConfirm, onNewQuantityChange }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  // 尋找符合當前工作區名稱 (也就是廠區名稱) 的資料
  const targetInventoryKey = Object.keys(inventory).find(
    key => key.trim().toLowerCase().includes(activePageName.trim().toLowerCase())
  );

  const inventoryData = targetInventoryKey ? inventory[targetInventoryKey] : undefined;
  const inventoryValue = inventoryData?.quantity;
  const isConfirmed = inventoryData?.confirmed || false;
  const productName = inventoryData?.name || '';
  const category = inventoryData?.category || '';
  const newQuantityValue = inventoryData?.newQuantity || '';
  const originalRemarks = inventoryData?.remarks || '';

  // 比對邏輯
  const localQty = inventoryValue !== undefined ? parseFloat(inventoryValue.toString()) : NaN;
  
  // 核心邏輯：是否有資料庫對應值
  const hasDBValue = !!dbValue;
  const isMatch = hasDBValue ? (
    (activePageName.toLowerCase().includes('p2') && localQty === dbValue.p2) ||
    (activePageName.toLowerCase().includes('p3') && localQty === dbValue.p3) ||
    (!activePageName.toLowerCase().includes('p2') && !activePageName.toLowerCase().includes('p3') && (localQty === dbValue.p2 || localQty === dbValue.p3))
  ) : false;

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const needsBottom = rect.top < 300;
      setPosition(needsBottom ? 'bottom' : 'top');
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width
      });
    }
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    updatePosition();
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(false);
    }, 300); // 增加延遲到 300ms 更穩定
  };

  // 監聽捲軸與視窗縮放，確保 Portal 位置正確
  React.useEffect(() => {
    if (showTooltip) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showTooltip]);

  const tooltipElement = showTooltip && (
    <div 
      className="fixed z-[99999] pointer-events-auto select-none"
      style={{
        top: position === 'top' ? coords.top : coords.top + 32,
        left: coords.left + (coords.width / 2),
        transform: `translateX(-50%) ${position === 'top' ? 'translateY(-100%)' : 'translateY(0)'}`,
        marginTop: position === 'top' ? '-16px' : '16px'
      }}
      onMouseEnter={() => {
        if (closeTimeoutRef.current) {
          window.clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      }}
      onMouseLeave={handleMouseLeave}
    >
      {/* 隱形透明橋接器 */}
      <div 
        className={`absolute left-0 right-0 h-10 bg-transparent ${position === 'top' ? 'top-full' : 'bottom-full'}`}
      ></div>

      <div className={`bg-white border-4 p-5 rounded-3xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative min-w-[280px] max-w-[320px] animate-in fade-in zoom-in duration-200 
        ${isConfirmed ? 'border-green-600' : 'border-black'}`}
      >
        {/* 已確認標籤 */}
        {isConfirmed && (
          <div className="absolute -top-4 -right-4 bg-green-600 text-white text-[10px] font-black px-3 py-1 rounded-full border-2 border-black rotate-12 shadow-md z-10">
            ✓ 已核對
          </div>
        )}

        {/* Tooltip 箭頭 */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white transform rotate-45 
          ${isConfirmed ? 'border-green-600' : 'border-black'}
          ${position === 'top' ? '-bottom-2.5 border-b-4 border-r-4' : '-top-2.5 border-t-4 border-l-4'}`}>
        </div>
        
        <div className="flex flex-col gap-1.5 mb-4">
          <div className="flex items-center justify-between">
            <h4 className="font-black text-[10px] uppercase text-gray-400 tracking-wider flex items-center gap-1">
               📍 {activePageName} 廠區庫存
            </h4>
            {category && (
              <span className="bg-black text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">
                {category}
              </span>
            )}
          </div>
          
          {productName && (
            <div className="flex items-start gap-1.5 mt-1 border-l-4 border-yellow-400 pl-3">
              <i className="fas fa-box text-gray-400 mt-1 text-xs"></i>
              <span className="text-sm font-black text-black leading-tight">
                {productName}
              </span>
            </div>
          )}
        </div>
        
        <div className={`text-6xl font-black italic tracking-tighter mb-4 drop-shadow-[3px_3px_0px_white] ${isConfirmed ? 'text-green-600' : 'text-blue-600'}`}>
           {inventoryValue !== undefined ? inventoryValue : (hasDBValue ? <span className="text-gray-400 text-base font-normal not-italic">本地無紀錄</span> : <span className="text-red-500 text-base font-normal not-italic">查無資料</span>)}
        </div>

        {/* 資料庫比對資訊 */}
        {dbValue && (
          <div className={`mb-6 p-4 rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isMatch ? 'bg-green-50' : 'bg-red-50'}`}>
            <h5 className="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest flex items-center gap-2">
              <i className="fas fa-database text-blue-500"></i> 資料庫比對狀態
            </h5>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-600 text-[10px]">資料庫 P2:</span>
                <span className="font-black font-mono">{dbValue.p2}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-600 text-[10px]">資料庫 P3:</span>
                <span className="font-black font-mono">{dbValue.p3}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-black/10 flex justify-between items-center">
                <span className="font-black text-[10px] uppercase">當前狀態:</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${isMatch ? 'bg-green-500 text-white' : 'bg-red-500 text-white animate-pulse'}`}>
                  {isMatch ? '一致 ✓' : '不一致 ✗'}
                </span>
              </div>
            </div>
          </div>
        )}

        {originalRemarks && (
          <div className="mb-6 p-4 bg-gray-50 border-2 border-black rounded-2xl text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <label className="text-[10px] font-black uppercase text-gray-500 block mb-1 tracking-wider">原始備註</label>
            <p className="text-sm font-bold text-gray-800 leading-relaxed">{originalRemarks}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 mb-6">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
            新數量填寫 (對應匯出)
          </label>
          <div className="relative">
            <i className="fas fa-pen-to-square absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input 
              type="text" 
              value={newQuantityValue}
              onChange={(e) => onNewQuantityChange?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="輸入新數量..."
              className="w-full bg-gray-50 border-2 border-black rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold focus:outline-none focus:bg-yellow-50 focus:ring-2 focus:ring-yellow-400 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>
        </div>

        <div 
          role="button"
          tabIndex={0}
          className={`flex items-center gap-3 p-4 rounded-2xl border-4 transition-all cursor-pointer select-none active:scale-90
            ${isConfirmed 
              ? 'bg-green-600 border-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' 
              : 'bg-white border-black text-black hover:bg-yellow-100 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]'
            }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleConfirm?.();
          }}
        >
          <div className={`w-10 h-10 rounded-xl border-4 flex items-center justify-center transition-all bg-white
            ${isConfirmed ? 'border-black text-green-600' : 'border-black text-transparent group-hover:border-green-600'}
          `}>
            <i className={`fas ${isConfirmed ? 'fa-check-double' : 'fa-check'} text-xl`}></i>
          </div>
          <div className="flex flex-col items-start">
            <span className="font-black text-lg uppercase leading-none">{isConfirmed ? '核對正確' : '數量確認'}</span>
            <span className={`text-[10px] font-bold ${isConfirmed ? 'text-green-100' : 'text-gray-400'}`}>
              {isConfirmed ? '點擊取消標記' : '點擊標記正確'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <span 
      ref={triggerRef}
      className={`relative inline-block cursor-help transition-all duration-300 ${isConfirmed ? 'bg-green-50 rounded-md px-1' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`border-b-4 border-dashed transition-all ${isConfirmed ? 'border-green-600 font-black text-green-700' : 'border-black'}`}>
        {children}
        {isConfirmed && <i className="fas fa-check-circle text-green-600 ml-1 text-xs"></i>}
      </span>
      {createPortal(tooltipElement, document.body)}
    </span>
  );
};
