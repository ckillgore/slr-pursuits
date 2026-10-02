-- ============================================================
-- Carry as its own budget line
-- ============================================================
-- Carry (construction-period interest, taxes, insurance) was either buried in
-- the soft-cost % or typed as a "Carry Costs" soft-cost detail line. It is
-- now carry_cost_pct x (hard + soft + land), added to the total budget.
--
-- Existing one-pagers get 0, so none of their numbers change. The standard
-- templates move carry out of soft: carry 4% of total cost (5% boutique Mid
-- Rise, in line with the Manor deals' 4.7-6.1%), and soft drops by the amount
-- that keeps each product's typical total budget the same at its median
-- land-to-hard-cost ratio.

ALTER TABLE public.one_pagers
  ADD COLUMN IF NOT EXISTS carry_cost_pct numeric(6,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calc_carry_cost numeric;
COMMENT ON COLUMN public.one_pagers.carry_cost_pct IS 'Carry as a share of hard + soft + land cost.';

ALTER TABLE public.data_model_templates
  ADD COLUMN IF NOT EXISTS default_carry_cost_pct numeric(6,4) NOT NULL DEFAULT 0.04;
ALTER TABLE public.data_model_templates
  ALTER COLUMN default_soft_cost_pct SET DEFAULT 0.177;

UPDATE public.data_model_templates t
   SET default_soft_cost_pct = v.soft, default_carry_cost_pct = v.carry
  FROM (VALUES
    ('Wrap — SLR Standard',          0.177, 0.04),
    ('High Rise — SLR Standard',     0.150, 0.04),
    ('Mid Rise — SLR Standard',      0.158, 0.04),
    ('Mid Rise — Boutique / Luxury', 0.230, 0.05),
    ('Garden — SLR Standard',        0.175, 0.04),
    ('Townhomes — SLR Standard',     0.148, 0.04)
  ) AS v(name, soft, carry)
 WHERE t.name = v.name;

-- Templates not in the list above (none today) keep their soft % and get no carry
UPDATE public.data_model_templates
   SET default_carry_cost_pct = 0
 WHERE name NOT IN ('Wrap — SLR Standard', 'High Rise — SLR Standard', 'Mid Rise — SLR Standard',
                    'Mid Rise — Boutique / Luxury', 'Garden — SLR Standard', 'Townhomes — SLR Standard');
