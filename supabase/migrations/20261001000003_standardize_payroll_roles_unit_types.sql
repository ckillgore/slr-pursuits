-- ============================================================
-- One-time cleanup: standard payroll role names and unit types
-- ============================================================
-- Mirrors src/lib/standardNames.ts, which the editor now applies on save.
--  * Payroll: "Asst. Maint.", "Asst Maint", "AMaint" ... -> "Assistant Maintenance",
--    etc. Ambiguous names (AM, AGM, LP, P, M, House, HC), combined roles
--    ("Asst Mgr / Leasing") and payroll totals are left as typed.
--  * Unit mix: rows still typed 'other' get the bedroom type their label
--    names ("2 BR" -> two_bed, "Penthouse" -> penthouse). Labels themselves
--    are not changed, and rows typed by the prototype library are not touched.

CREATE FUNCTION pg_temp.standard_role(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  raw text := btrim(regexp_replace(name, '\s+', ' ', 'g'));
  key text;
BEGIN
  IF raw ~ '[/+&]' THEN RETURN raw; END IF;
  key := btrim(replace(lower(raw), '.', ''));
  RETURN CASE
    WHEN key ~ '^((asst|assistant|assitant) ?maint(enance|enace)?|amaint)$' THEN 'Assistant Maintenance'
    WHEN key ~ '^(lead ?maint(enance|enace)?|lmaint|maint(enance|enace)?( tech(nician)?| (manager|manger|mgr))?|main tech)$' THEN 'Lead Maintenance'
    WHEN key ~ '^(asst|assistant|assitant) (property )?(manager|manger|mgr)$' THEN 'Assistant Manager'
    WHEN key ~ '^(property |community )?(manager|manger|mgr)$' THEN 'Manager'
    WHEN key ~ '^leasing( agent| position| consultant)?s?( [0-9]+)?$' THEN 'Leasing'
    WHEN key ~ '^porters?$' THEN 'Porter'
    WHEN key ~ '^house ?keep(er|ing)s?$' THEN 'Housekeeper'
    WHEN key ~ '^conc(ie|ei)rge$' THEN 'Concierge'
    WHEN key ~ '^val(et|ey)$' THEN 'Valet'
    ELSE raw
  END;
END;
$$;

CREATE FUNCTION pg_temp.unit_type_for(label text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN l ~ '\y(studio|efficiency|micro)\y' OR l ~ '^s[0-9]?\y' THEN 'studio'
    WHEN l ~ '\y(ph|penthouse)\y' THEN 'penthouse'
    WHEN l ~ '\y(th|townhomes?|townhouses?)\y' THEN 'townhome'
    WHEN l ~ '\y(1|one) ?(br|bd|bed|bedroom)s?\y' THEN 'one_bed'
    WHEN l ~ '\y(2|two) ?(br|bd|bed|bedroom)s?\y' THEN 'two_bed'
    WHEN l ~ '\y(3|three|4|four) ?(br|bd|bed|bedroom)s?\y' THEN 'three_bed'
  END
  FROM (SELECT lower(btrim(label)) AS l) x;
$$;

UPDATE one_pager_payroll
   SET role_name = pg_temp.standard_role(role_name)
 WHERE role_name IS DISTINCT FROM pg_temp.standard_role(role_name);

UPDATE data_model_payroll_defaults
   SET role_name = pg_temp.standard_role(role_name)
 WHERE role_name IS DISTINCT FROM pg_temp.standard_role(role_name);

UPDATE one_pager_unit_mix
   SET unit_type = pg_temp.unit_type_for(unit_type_label)
 WHERE unit_type = 'other'
   AND pg_temp.unit_type_for(unit_type_label) IS NOT NULL;
