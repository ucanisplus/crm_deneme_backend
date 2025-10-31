-- ==========================================
-- Migration: Add priority column to Tavlı/Balya Tel recipe tables
-- Date: 2025-10-31
-- Purpose: Support alternative recipes with priority matrix for YM TT and YM STP
-- ==========================================

-- Check if priority column exists before adding (safe to run multiple times)

-- Add priority column to tavli_netsis_ym_tt_recete
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tavli_netsis_ym_tt_recete'
        AND column_name = 'priority'
    ) THEN
        ALTER TABLE tavli_netsis_ym_tt_recete
        ADD COLUMN priority INTEGER DEFAULT 0;

        RAISE NOTICE '✅ Added priority column to tavli_netsis_ym_tt_recete';
    ELSE
        RAISE NOTICE '⚠️ priority column already exists in tavli_netsis_ym_tt_recete';
    END IF;
END $$;

-- Add priority column to tavli_netsis_ym_stp_recete
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tavli_netsis_ym_stp_recete'
        AND column_name = 'priority'
    ) THEN
        ALTER TABLE tavli_netsis_ym_stp_recete
        ADD COLUMN priority INTEGER DEFAULT 0;

        RAISE NOTICE '✅ Added priority column to tavli_netsis_ym_stp_recete';
    ELSE
        RAISE NOTICE '⚠️ priority column already exists in tavli_netsis_ym_stp_recete';
    END IF;
END $$;

-- Verify the changes
SELECT
    table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name IN ('tavli_netsis_ym_tt_recete', 'tavli_netsis_ym_stp_recete')
AND column_name = 'priority';

-- ==========================================
-- NOTES:
-- ==========================================
-- Priority values:
--   0 = Main recipe (Ana reçete)
--   1 = Alternative 1 (ALT_1)
--   2 = Alternative 2 (ALT_2)
--
-- This column allows the system to store multiple recipe variations
-- for each YM TT and YM STP product, using different YM ST sources
-- based on the priority matrix (YM_ST_FILMASIN_PRIORITY_MAP).
-- ==========================================
