-- ============================================================
-- Diligence Checklist — Default Template Seed Data
-- Phases 5–7 of 7
-- ============================================================

-- ============================================================
-- Phase 5: Design & Construction Documents
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0005-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Design & Construction Documents',
    'Architectural and engineering design from schematic through construction documents. Each phase builds on the prior and requires team coordination and owner approval before advancing.',
    5, 'construction_start', '#F59E0B');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0005-0001-0000-000000000001','00000000-0005-0000-0000-000000000001','Schematic Design (SD)','Establish overall design concept, building massing, unit layouts, site plan, and amenity program. SD set is the basis for initial GC pricing.',1),
('00000000-0005-0002-0000-000000000001','00000000-0005-0000-0000-000000000001','SD Owner Review & Approval','Development team reviews SD package against proforma assumptions, market positioning, and construction budget.',2),
('00000000-0005-0003-0000-000000000001','00000000-0005-0000-0000-000000000001','Design Development (DD Set)','Refine design with detailed dimensions, structural system, MEP coordination, and material selections. DD set is the basis for GMP negotiation.',3),
('00000000-0005-0004-0000-000000000001','00000000-0005-0000-0000-000000000001','DD Owner Review & Approval','Development team reviews DD package. Final major decision point before CDs.',4),
('00000000-0005-0005-0000-000000000001','00000000-0005-0000-0000-000000000001','Construction Documents (CD Set)','Complete permit-ready construction documents. CDs must be fully coordinated across all disciplines.',5),
('00000000-0005-0006-0000-000000000001','00000000-0005-0000-0000-000000000001','GMP / Construction Budget Finalization','Negotiate and execute GMP amendment or final construction budget based on CD set. Reconcile against proforma budget.',6),
('00000000-0005-0007-0000-000000000001','00000000-0005-0000-0000-000000000001','Permit Set Submission','Submit final permit set to building department.',7),
('00000000-0005-0008-0000-000000000001','00000000-0005-0000-0000-000000000001','Plan Review Comments & Resubmission','Respond to building department plan review comments. Track rounds of review.',8),
('00000000-0005-0009-0000-000000000001','00000000-0005-0000-0000-000000000001','Value Engineering','If GMP exceeds budget, conduct structured value engineering process.',9),
('00000000-0005-0010-0000-000000000001','00000000-0005-0000-0000-000000000001','Long-Lead Procurement Identification','Identify all long-lead items (elevators, switchgear, generators, custom windows, etc.) and initiate procurement.',10);

-- Checklist items for Phase 5 tasks
INSERT INTO checklist_template_checklist_items (task_id, label, sort_order) VALUES
-- 5.1 Schematic Design
('00000000-0005-0001-0000-000000000001','Floor plans for all unit types',1),
('00000000-0005-0001-0000-000000000001','Building sections and elevations (preliminary)',2),
('00000000-0005-0001-0000-000000000001','Site plan with parking, amenities, and landscape concept',3),
('00000000-0005-0001-0000-000000000001','Amenity program and space allocation',4),
('00000000-0005-0001-0000-000000000001','Preliminary material and finish palette',5),
('00000000-0005-0001-0000-000000000001','SD cost estimate from GC',6),
-- 5.3 Design Development
('00000000-0005-0003-0000-000000000001','Detailed floor plans with dimensions and unit counts confirmed',1),
('00000000-0005-0003-0000-000000000001','Structural system defined and coordinated with geotech',2),
('00000000-0005-0003-0000-000000000001','MEP systems designed and coordinated',3),
('00000000-0005-0003-0000-000000000001','Building envelope and exterior material selections',4),
('00000000-0005-0003-0000-000000000001','Interior finish selections and specifications',5),
('00000000-0005-0003-0000-000000000001','Detailed site plan with civil engineering coordination',6),
('00000000-0005-0003-0000-000000000001','DD cost estimate from GC — basis for GMP discussion',7),
('00000000-0005-0003-0000-000000000001','Code review and life safety plan',8),
-- 5.5 Construction Documents
('00000000-0005-0005-0000-000000000001','Architectural construction documents complete',1),
('00000000-0005-0005-0000-000000000001','Structural construction documents complete',2),
('00000000-0005-0005-0000-000000000001','MEP construction documents complete',3),
('00000000-0005-0005-0000-000000000001','Civil / site construction documents complete',4),
('00000000-0005-0005-0000-000000000001','Landscape construction documents complete',5),
('00000000-0005-0005-0000-000000000001','Interior design specifications and finish schedules',6),
('00000000-0005-0005-0000-000000000001','Specification manual (Divisions 1–33 as applicable)',7),
('00000000-0005-0005-0000-000000000001','Cross-discipline coordination review completed',8),
('00000000-0005-0005-0000-000000000001','Code compliance review by third-party if required',9);

-- ============================================================
-- Phase 6: Financing & Loan Closing
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0006-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Financing & Loan Closing',
    'Construction loan and equity closing process from lender selection through funding. Typically runs in parallel with later design phases and entitlements.',
    6, 'closing', '#DC2626');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0006-0001-0000-000000000001','00000000-0006-0000-0000-000000000001','Lender Selection & Term Sheet','Solicit construction loan proposals from target lenders. Negotiate term sheet.',1),
('00000000-0006-0002-0000-000000000001','00000000-0006-0000-0000-000000000001','Loan Application Submitted','Submit formal loan application with all required exhibits.',2),
('00000000-0006-0003-0000-000000000001','00000000-0006-0000-0000-000000000001','Appraisal Ordered','Lender orders appraisal from approved MAI appraiser. Track timeline closely as appraisals are frequently on the critical path.',3),
('00000000-0006-0004-0000-000000000001','00000000-0006-0000-0000-000000000001','Appraisal Received & Reviewed','Review appraisal for as-stabilized value, as-complete value, and as-is land value. Confirm LTV/LTC ratios.',4),
('00000000-0006-0005-0000-000000000001','00000000-0006-0000-0000-000000000001','Lender Due Diligence','Coordinate lender''s independent due diligence process.',5),
('00000000-0006-0006-0000-000000000001','00000000-0006-0000-0000-000000000001','Loan Commitment Received','Receive and review formal loan commitment letter.',6),
('00000000-0006-0007-0000-000000000001','00000000-0006-0000-0000-000000000001','Loan Document Review & Negotiation','Review and negotiate all loan documents with lender''s counsel.',7),
('00000000-0006-0008-0000-000000000001','00000000-0006-0000-0000-000000000001','Equity Capital Call / Funding','Issue capital call notice to LP/equity partner per partnership agreement.',8),
('00000000-0006-0009-0000-000000000001','00000000-0006-0000-0000-000000000001','Rate Lock / Hedge Execution','If applicable, execute interest rate cap or hedge instrument per loan requirements.',9),
('00000000-0006-0010-0000-000000000001','00000000-0006-0000-0000-000000000001','Pre-Closing Title & Survey Update','Order updated title commitment and survey endorsements required by lender.',10),
('00000000-0006-0011-0000-000000000001','00000000-0006-0000-0000-000000000001','Closing Checklist Coordination','Prepare and circulate comprehensive closing checklist with all parties. Track completion status daily in the final week.',11),
('00000000-0006-0012-0000-000000000001','00000000-0006-0000-0000-000000000001','Loan Closing & Initial Funding','Execute all loan documents, fund equity, and close the transaction.',12),
('00000000-0006-0013-0000-000000000001','00000000-0006-0000-0000-000000000001','Post-Closing Deliverables','Complete all post-closing requirements including recorded documents, title policy issuance, and original document delivery.',13);

-- Checklist items for Phase 6
INSERT INTO checklist_template_checklist_items (task_id, label, sort_order) VALUES
-- 6.5 Lender Due Diligence
('00000000-0006-0005-0000-000000000001','Lender''s environmental review and reliance letter',1),
('00000000-0006-0005-0000-000000000001','Lender''s engineering / plan & cost review (PCA)',2),
('00000000-0006-0005-0000-000000000001','Lender''s market study or third-party market consultant review',3),
('00000000-0006-0005-0000-000000000001','Lender''s insurance review',4),
('00000000-0006-0005-0000-000000000001','Lender''s legal review of organizational documents',5);

-- ============================================================
-- Phase 7: Insurance & Risk Management
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0007-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Insurance & Risk Management',
    'Insurance program design and procurement for the development period. Must be in place before construction start and coordinated with lender requirements.',
    7, 'construction_start', '#6366F1');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0007-0001-0000-000000000001','00000000-0007-0000-0000-000000000001','Insurance Broker Engagement','Engage insurance broker with multifamily development experience.',1),
('00000000-0007-0002-0000-000000000001','00000000-0007-0000-0000-000000000001','Builder''s Risk Insurance','Procure builder''s risk policy covering the full construction value.',2),
('00000000-0007-0003-0000-000000000001','00000000-0007-0000-0000-000000000001','General Liability Insurance','Confirm general liability coverage for the owner entity during the development period.',3),
('00000000-0007-0004-0000-000000000001','00000000-0007-0000-0000-000000000001','OCIP / CCIP Decision','Determine whether to use an Owner-Controlled Insurance Program (OCIP) or Contractor-Controlled Insurance Program (CCIP).',4),
('00000000-0007-0005-0000-000000000001','00000000-0007-0000-0000-000000000001','Professional Liability Coordination','Confirm professional liability (E&O) insurance for all design professionals.',5),
('00000000-0007-0006-0000-000000000001','00000000-0007-0000-0000-000000000001','Environmental Insurance','If recommended by environmental counsel, procure Pollution Legal Liability (PLL) policy.',6),
('00000000-0007-0007-0000-000000000001','00000000-0007-0000-0000-000000000001','Contractor Insurance Verification','Collect and verify certificates of insurance from GC and all major subcontractors.',7),
('00000000-0007-0008-0000-000000000001','00000000-0007-0000-0000-000000000001','Lender Insurance Requirements Review','Obtain lender''s insurance requirements matrix. Confirm all policies meet or exceed lender minimums.',8),
('00000000-0007-0009-0000-000000000001','00000000-0007-0000-0000-000000000001','Umbrella / Excess Liability','Procure umbrella or excess liability policy to supplement underlying GL, auto, and employer''s liability coverage.',9),
('00000000-0007-0010-0000-000000000001','00000000-0007-0000-0000-000000000001','Workers'' Compensation Compliance','Confirm workers'' compensation compliance for all parties.',10);
