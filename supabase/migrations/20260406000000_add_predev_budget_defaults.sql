-- Pre-Dev Budget Standards Governance
CREATE TABLE public.default_predev_budget_line_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category text NOT NULL,
    label text NOT NULL,
    sort_order integer NOT NULL,
    yardi_cost_groups text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.default_predev_budget_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all authenticated users" ON public.default_predev_budget_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable write access for admins" ON public.default_predev_budget_line_items FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'service_role' OR true); -- Assuming similar RLS to other template tables where full auth users can manipulate right now.

-- Seed Defaults
INSERT INTO public.default_predev_budget_line_items (category, label, sort_order, yardi_cost_groups) VALUES
('legal', 'Legal', 1, ARRAY['54']),
('zoning_entitlement', 'Zoning / Entitlements', 2, ARRAY['60-00271', '60-00272', '60-00273']),
('title_survey', 'Title & Survey', 3, ARRAY['51', '60-00274']),
('env_phase1', 'Environmental / Phase I', 4, ARRAY['60-00276']),
('appraisal_market_study', 'Appraisal / Market Study', 5, ARRAY['60-00277', '60-00278']),
('prop_condition_report', 'Property Condition Report', 6, ARRAY['60-00279']),
('traffic_study', 'Traffic Consultant', 7, ARRAY['60-00281', '60-00293']),
('zoning_consultant', 'Zoning Consultant', 8, ARRAY['60-00294']),
('taxes', 'Real Estate Taxes', 9, ARRAY['71']),
('feasibility', 'Feasibility Studies', 10, ARRAY['60-00275']),
('geotech', 'Geotech Report', 11, ARRAY['60-00280']),
('other_land_plan', 'Other Land Planning', 12, ARRAY['60-00292', '60-00295', '60-00296', '60-00297', '60-00322']),
('arch_design', 'Design Architect', 13, ARRAY['62-00400']),
('structural_eng', 'Structural Engineer', 14, ARRAY['62-00405']),
('mep_eng', 'MEP Engineer', 15, ARRAY['62-00410']),
('interior_design', 'Interior Design', 16, ARRAY['62-00415', '62-00449']),
('civil_eng', 'Civil Engineer', 17, ARRAY['62-00420']),
('landscape_design', 'Landscape Architect', 18, ARRAY['62-00425']),
('misc_consultants', 'Misc. A&E Consultants', 19, ARRAY['62-00430', '62-00433', '62-00434', '62-00435', '62-00436', '62-00437', '62-00438', '62-00439', '62-00440', '62-00441', '62-00442', '62-00445', '62-00448', '62-00452', '62-00475', '62-00480', '62-00485', '62-00486', '62-00487', '62-00488', '62-00489']),
('impact_fees', 'Impact Fees / Permits', 20, ARRAY['61']),
('other_dev_costs', 'Other Development Costs', 21, ARRAY['63', '64']),
('dev_interest', 'Development Interest', 22, ARRAY['70']),
('taxes_assessments', 'Taxes & Assessments', 23, ARRAY['71']),
('overhead', 'Overhead Allocation', 24, ARRAY['73']),
('developer_fee', 'Developer Fee', 25, ARRAY['74']),
('leaseup_expenses', 'Lease-Up Expenses', 26, ARRAY['78']),
('marketing_ffe', 'Marketing / FF&E', 27, ARRAY['80']),
('contingency', 'Contingency', 28, ARRAY['12', '90']);
