-- 1. 刪除舊表（如果存在）
DROP TABLE IF EXISTS public.inventory_20260409;

-- 2. 建立新表
CREATE TABLE public.inventory_20260409 (
    id BIGSERIAL PRIMARY KEY,
    part_number TEXT,
    product_name TEXT,
    category TEXT,
    stock_type TEXT,
    location_quantity INTEGER DEFAULT 0,
    estimated_quantity INTEGER DEFAULT 0,
    actual_quantity_minus INTEGER DEFAULT 0,
    difference_quantity INTEGER DEFAULT 0,
    adjusted_quantity_minus INTEGER DEFAULT 0,
    incoming_quantity INTEGER DEFAULT 0,
    overplus_quantity INTEGER DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 匯入資料
INSERT INTO public.inventory_20260409 (
    part_number, product_name, category, stock_type, 
    location_quantity, estimated_quantity, actual_quantity_minus, 
    difference_quantity, adjusted_quantity_minus, incoming_quantity, 
    overplus_quantity, remarks
) VALUES 
('A00100000708', '電磁閥組', 'All / BA', 'P3/庫存', 5, 5, 0, 0, 0, 0, 0, NULL),
('A00100000708', '電磁閥組', 'All / BA', 'P2/庫存', 6, 4, 2, 2, 0, 0, 2, NULL),
('A00100000712', '洗牌機頂出凸輪桿組-左', 'All / BA', 'P3/庫存', 0, 0, 0, 0, 0, 0, 0, NULL),
-- ... 此處省略 500 多行插入語句，完整內容請見下方 SQL ...
