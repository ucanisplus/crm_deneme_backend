-- Drop the restrictive yaglama constraints that are blocking Tavli/Balya Tel products
-- These constraints were too restrictive and prevented BALYA products with empty yaglama_tipi

-- Drop constraint on requests table
ALTER TABLE tavli_balya_tel_sal_requests
DROP CONSTRAINT IF EXISTS chk_request_product_type_yaglama;

-- Drop constraint on MM table
ALTER TABLE tavli_balya_tel_mm
DROP CONSTRAINT IF EXISTS chk_product_type_yaglama;

-- Drop constraint on YM TT table if exists
ALTER TABLE tavli_netsis_ym_tt
DROP CONSTRAINT IF EXISTS chk_product_type_yaglama;

-- Drop constraint on YM YB table if exists
ALTER TABLE tavli_netsis_ym_yb
DROP CONSTRAINT IF EXISTS chk_product_type_yaglama;

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE '✅ Dropped yaglama constraints from all Tavli/Balya tables';
  RAISE NOTICE '   - tavli_balya_tel_sal_requests';
  RAISE NOTICE '   - tavli_balya_tel_mm';
  RAISE NOTICE '   - tavli_netsis_ym_tt';
  RAISE NOTICE '   - tavli_netsis_ym_yb';
END $$;
