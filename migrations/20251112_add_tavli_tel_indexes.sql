-- ==========================================
-- Performance Optimization for Tavli/Balya Tel
-- Date: 2025-11-12
-- ==========================================
-- This migration adds database indexes ONLY for tavli_balya_tel tables
-- to improve DELETE and SELECT performance without affecting other products

-- ==========================================
-- 1. Add indexes for tavli_balya_tel_mm_recete
-- ==========================================

-- Index on mm_id for fast filtering by product (used in GET and bulk DELETE)
CREATE INDEX IF NOT EXISTS idx_tavli_mm_recete_mm_id
ON tavli_balya_tel_mm_recete(mm_id);

-- Index on mamul_kodu for fast filtering by product code (used in GET)
CREATE INDEX IF NOT EXISTS idx_tavli_mm_recete_mamul_kodu
ON tavli_balya_tel_mm_recete(mamul_kodu);

-- Composite index on mm_id + sira_no for ordered queries
CREATE INDEX IF NOT EXISTS idx_tavli_mm_recete_mm_id_sira_no
ON tavli_balya_tel_mm_recete(mm_id, sira_no);

-- ==========================================
-- 2. Add indexes for tavli_netsis_ym_tt_recete
-- ==========================================

-- Index on ym_tt_stok_kodu for fast filtering
CREATE INDEX IF NOT EXISTS idx_tavli_ym_tt_recete_stok_kodu
ON tavli_netsis_ym_tt_recete(ym_tt_stok_kodu);

-- Index on mamul_kodu for fast filtering
CREATE INDEX IF NOT EXISTS idx_tavli_ym_tt_recete_mamul_kodu
ON tavli_netsis_ym_tt_recete(mamul_kodu);

-- ==========================================
-- 3. Add indexes for tavli_netsis_ym_stp_recete
-- ==========================================

-- Index on ym_stp_stok_kodu for fast filtering
CREATE INDEX IF NOT EXISTS idx_tavli_ym_stp_recete_stok_kodu
ON tavli_netsis_ym_stp_recete(ym_stp_stok_kodu);

-- Index on mamul_kodu for fast filtering
CREATE INDEX IF NOT EXISTS idx_tavli_ym_stp_recete_mamul_kodu
ON tavli_netsis_ym_stp_recete(mamul_kodu);

-- ==========================================
-- 4. Add index for tavli_balya_tel_mm (main product table)
-- ==========================================

-- Index on stok_kodu for fast lookups
CREATE INDEX IF NOT EXISTS idx_tavli_mm_stok_kodu
ON tavli_balya_tel_mm(stok_kodu);

-- ==========================================
-- Verification Queries
-- ==========================================

-- Check if indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN (
    'tavli_balya_tel_mm_recete',
    'tavli_netsis_ym_tt_recete',
    'tavli_netsis_ym_stp_recete',
    'tavli_balya_tel_mm'
)
AND indexname LIKE 'idx_tavli%'
ORDER BY tablename, indexname;

-- ==========================================
-- Performance Test Queries (Run AFTER creating indexes)
-- ==========================================

-- Test 1: Should use idx_tavli_mm_recete_mm_id
EXPLAIN ANALYZE
SELECT * FROM tavli_balya_tel_mm_recete WHERE mm_id = 1;

-- Test 2: Should use idx_tavli_mm_recete_mm_id_sira_no
EXPLAIN ANALYZE
SELECT * FROM tavli_balya_tel_mm_recete
WHERE mm_id = 1 ORDER BY sira_no;

-- Test 3: Bulk delete should be fast now
EXPLAIN ANALYZE
DELETE FROM tavli_balya_tel_mm_recete WHERE mm_id = 999999;
