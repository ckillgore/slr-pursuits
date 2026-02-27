-- ============================================================
-- Diligence Checklist — Default Template Seed Data
-- Phases 1–4 of 7 (continued in 005c)
-- ============================================================

-- Create the default template
INSERT INTO checklist_templates (id, name, description, is_default, is_active, version)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Standard Ground-Up Multifamily',
    'Comprehensive template covering the standard ground-up multifamily development lifecycle from contract execution through construction mobilization.',
    true, true, 1
);

-- ============================================================
-- Phase 1: Development Agreement / Land Contribution
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Development Agreement / Land Contribution',
    'Legal and contractual framework for site acquisition, land contribution, or joint venture structuring. Initiated at LOI execution and completed by closing.',
    1, 'closing', '#2563EB');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0001-0001-0000-000000000001','00000000-0001-0000-0000-000000000001','Contract Summary','Prepare a summary of all executed and pending agreements for the deal file. Include key dates, obligations, and contingencies.',1),
('00000000-0001-0002-0000-000000000001','00000000-0001-0000-0000-000000000001','Term Sheet','Define what agreements are required for your specific site. Identify the full set of legal documents needed based on deal structure (JV, fee simple purchase, ground lease, land contribution, etc.).',2),
('00000000-0001-0003-0000-000000000001','00000000-0001-0000-0000-000000000001','Purchase & Sale Agreement','Negotiate and execute the PSA. Track all amendments, side letters, and extension notices.',3),
('00000000-0001-0004-0000-000000000001','00000000-0001-0000-0000-000000000001','Development Agreement','Agreement between developer and capital partner defining roles, responsibilities, fees, and approval rights during the development period.',4),
('00000000-0001-0005-0000-000000000001','00000000-0001-0000-0000-000000000001','Contribution Agreement','If land is being contributed (not purchased), define contribution value, timing, tax treatment, and partner credit.',5),
('00000000-0001-0006-0000-000000000001','00000000-0001-0000-0000-000000000001','Development Cooperation & Funding Agreement','Governs co-development arrangements where multiple parties share development responsibilities and funding obligations.',6),
('00000000-0001-0007-0000-000000000001','00000000-0001-0000-0000-000000000001','Limited Partnership Agreement','LP agreement defining capital structure, waterfall, promote thresholds, key person provisions, and governance.',7),
('00000000-0001-0008-0000-000000000001','00000000-0001-0000-0000-000000000001','General Partnership Agreement','GP-level agreement defining management responsibilities, fee structures, and decision-making authority between GP partners.',8),
('00000000-0001-0009-0000-000000000001','00000000-0001-0000-0000-000000000001','CCR Agreement','Covenants, Conditions & Restrictions agreement. Particularly relevant for master-planned communities or mixed-use developments with shared infrastructure.',9),
('00000000-0001-0010-0000-000000000001','00000000-0001-0000-0000-000000000001','Horizontal Development Agreement','Agreement governing site work, infrastructure, and horizontal improvements when site development is separated from vertical construction.',10),
('00000000-0001-0011-0000-000000000001','00000000-0001-0000-0000-000000000001','Multifamily Contractor / Owner Agreement','GMP or stipulated sum contract between owner entity and general contractor for the multifamily vertical construction.',11),
('00000000-0001-0012-0000-000000000001','00000000-0001-0000-0000-000000000001','Retail Contractor / Owner Agreement','Separate construction contract for ground-floor retail or commercial components if applicable.',12),
('00000000-0001-0013-0000-000000000001','00000000-0001-0000-0000-000000000001','Title Report Order','Order preliminary title report immediately upon PSA execution. Title issues discovered late can delay or kill a deal.',13),
('00000000-0001-0014-0000-000000000001','00000000-0001-0000-0000-000000000001','Power Company Agreement','Power companies are notorious for slow responses. Start agreement discussion during schematic design. Push power company engineering team to provide estimate of potential work by end of Design Development.',14),
('00000000-0001-0015-0000-000000000001','00000000-0001-0000-0000-000000000001','Cable Company Agreement','Cable companies are notorious for slow responses. Start agreement discussion during schematic design. Push cable company engineering team to provide estimate of potential work by end of Design Development.',15),
('00000000-0001-0016-0000-000000000001','00000000-0001-0000-0000-000000000001','Attain Earnest Money Wiring Instructions','Obtain wiring instructions from title company or escrow agent for earnest money deposit. Verify instructions independently to prevent wire fraud.',16),
('00000000-0001-0017-0000-000000000001','00000000-0001-0000-0000-000000000001','Pre-Development Funds Request','Submit request to capital partner for pre-development funding. Include detailed budget for DD costs, design fees, deposits, and legal expenses.',17),
('00000000-0001-0018-0000-000000000001','00000000-0001-0000-0000-000000000001','Set Up Project Files','Create standardized project folder structure in Box. Establish naming conventions and access permissions for the deal team.',18),
('00000000-0001-0019-0000-000000000001','00000000-0001-0000-0000-000000000001','Broker Commission Agreements','Agreement per Purchase & Sale Agreement. Coordinated in proforma. Confirm terms of broker agreement are reflected in proforma and that commission timing and conditions are clearly documented.',19);

-- ============================================================
-- Phase 2: Due Diligence
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Due Diligence',
    'Comprehensive investigation of the site covering legal, environmental, geotechnical, civil, zoning, and market conditions. Most items must be completed within the DD period defined in the PSA.',
    2, 'dd_expiration', '#F97316');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order, is_critical_path) VALUES
('00000000-0002-0001-0000-000000000001','00000000-0002-0000-0000-000000000001','DD Kickoff Call with Legal & Key Stakeholders','Schedule kickoff call within 48 hours of PSA execution. Assign task owners, establish DD timeline, and confirm critical path items.',1,true),
('00000000-0002-0002-0000-000000000001','00000000-0002-0000-0000-000000000001','Review Seller''s Underlying Contracts','For sites with existing buildings: review in-place leases, service contracts, maintenance agreements, parking arrangements, and all third-party obligations that transfer with the property.',2,false),
('00000000-0002-0003-0000-000000000001','00000000-0002-0000-0000-000000000001','Title Commitment','Obtain and review the title commitment from the title company. This is a critical-path item that must be started immediately.',3,true),
('00000000-0002-0004-0000-000000000001','00000000-0002-0000-0000-000000000001','Buyer''s Objection Letter','Prepare and deliver formal objection letter regarding title and survey matters within the timeframe specified in the PSA. Coordinate with legal counsel on cure items.',4,false),
('00000000-0002-0005-0000-000000000001','00000000-0002-0000-0000-000000000001','Revised Title Commitment','Obtain revised title commitment after seller cures objected items. Confirm all objections have been satisfactorily resolved or waived.',5,false),
('00000000-0002-0006-0000-000000000001','00000000-0002-0000-0000-000000000001','Legal Description / Title Survey','Obtain ALTA survey and confirm legal description matches title commitment. Surveyor and purchaser''s counsel must coordinate.',6,false),
('00000000-0002-0007-0000-000000000001','00000000-0002-0000-0000-000000000001','Bankruptcy & Lien Search','Conduct bankruptcy and lien searches on seller entity and principals. Confirm no pending actions that could cloud title or delay closing.',7,false),
('00000000-0002-0008-0000-000000000001','00000000-0002-0000-0000-000000000001','Guarantees & Warranties with Respect to Property','Identify and review all existing guarantees and warranties that transfer with the property.',8,false),
('00000000-0002-0009-0000-000000000001','00000000-0002-0000-0000-000000000001','UCC Searches','Conduct Uniform Commercial Code searches to identify any security interests, fixtures filings, or personal property liens affecting the site.',9,false),
('00000000-0002-0010-0000-000000000001','00000000-0002-0000-0000-000000000001','Verify No Prohibited Persons','Screen seller, seller principals, and all counterparties against OFAC SDN list, other sanctions lists, and anti-money laundering databases.',10,false),
('00000000-0002-0011-0000-000000000001','00000000-0002-0000-0000-000000000001','List of Pending & Threatened Litigation','Obtain from seller and independently verify through court records.',11,false),
('00000000-0002-0012-0000-000000000001','00000000-0002-0000-0000-000000000001','Deed Restriction Review','Confirm during title review with closing attorney if deed has use restrictions. Examples: no apartments, no grocery store, dry overlay (no alcohol sales), age restrictions, height limitations. This is a deal-killer item if missed.',12,true),
('00000000-0002-0013-0000-000000000001','00000000-0002-0000-0000-000000000001','Tax Analysis','Obtain tax summary memo from tax consultants. Confirm analysis is captured in proforma. Investigate LIDs, CFDs, real estate taxes, rollback taxes, franchise taxes.',13,false),
('00000000-0002-0014-0000-000000000001','00000000-0002-0000-0000-000000000001','Planning Department - Preliminary Site Plan Review','Submit preliminary site plan to local planning department for informal review and feedback before formal application.',14,false),
('00000000-0002-0015-0000-000000000001','00000000-0002-0000-0000-000000000001','Land Use Approvals','PZR is the first step during DD for zoning review. For complicated sites, hire a local code consultant or zoning attorney to confirm the design concept meets zoning code.',15,false),
('00000000-0002-0016-0000-000000000001','00000000-0002-0000-0000-000000000001','Aerial Photograph','Obtain current aerial photograph of the site and surrounding area.',16,false),
('00000000-0002-0017-0000-000000000001','00000000-0002-0000-0000-000000000001','SLR Market Study','Commission or prepare internal market study covering: submarket fundamentals, competitive supply pipeline, absorption rates, rent comps, demographic trends, and employment drivers.',17,false),
('00000000-0002-0018-0000-000000000001','00000000-0002-0000-0000-000000000001','Review Seller''s Information Package','Systematically review all materials provided by the seller during due diligence.',18,false),
('00000000-0002-0019-0000-000000000001','00000000-0002-0000-0000-000000000001','Regulations / No Violations Letter','For sites with existing buildings: obtain a letter from the city confirming no outstanding code violations, open permits, or compliance orders against the property.',19,false),
('00000000-0002-0020-0000-000000000001','00000000-0002-0000-0000-000000000001','Historical Report','Research the historical use of the site through Sanborn maps, aerial photographs, city directories, and fire insurance records.',20,false),
('00000000-0002-0021-0000-000000000001','00000000-0002-0000-0000-000000000001','Review CCRs','If applicable, review all Covenants, Conditions & Restrictions. Confirm POA/HOA fees are coordinated in the proforma.',21,false),
('00000000-0002-0022-0000-000000000001','00000000-0002-0000-0000-000000000001','Site Visit / Property Inspection','Conduct physical site inspection with key team members. Document existing conditions, adjacent property uses, access points, utilities, topography, drainage patterns, and any visible environmental concerns.',22,false),
('00000000-0002-0023-0000-000000000001','00000000-0002-0000-0000-000000000001','Architect - Preliminary Design','Engage architect for preliminary design work during DD to validate development concept.',23,false),
('00000000-0002-0024-0000-000000000001','00000000-0002-0000-0000-000000000001','Civil Engineer Due Diligence Report','Commission the civil DD report immediately after PSA execution. Typical cost: $7,500 over 3 weeks. Confirm impact fees and permit fees are in proforma.',24,true),
('00000000-0002-0025-0000-000000000001','00000000-0002-0000-0000-000000000001','Easement Issues','Identify all existing and required easements. Check if the property will need to drain to neighboring properties.',25,false),
('00000000-0002-0026-0000-000000000001','00000000-0002-0000-0000-000000000001','Phase I Environmental Report','Commission Phase I ESA from qualified environmental consultant. Critical-path item with expiration constraints.',26,true),
('00000000-0002-0027-0000-000000000001','00000000-0002-0000-0000-000000000001','Geotechnical Report','Commission geotechnical investigation. Confirm structural engineer has classified seismic zone during DD.',27,false),
('00000000-0002-0028-0000-000000000001','00000000-0002-0000-0000-000000000001','Environmental Attorney Recommendation Letter','Obtain formal recommendation letter from environmental legal counsel summarizing findings from Phase I.',28,false),
('00000000-0002-0029-0000-000000000001','00000000-0002-0000-0000-000000000001','Environmental Report - Additional Studies','Additional environmental investigations beyond Phase I as warranted by site conditions.',29,false),
('00000000-0002-0030-0000-000000000001','00000000-0002-0000-0000-000000000001','Service Contracts','Review all existing service contracts that may transfer with the property or need to be terminated.',30,false),
('00000000-0002-0031-0000-000000000001','00000000-0002-0000-0000-000000000001','Will Serve Letters','Most civil engineers will complete all will serve letters as part of the DD report. Research if local gas companies have rebates.',31,false),
('00000000-0002-0032-0000-000000000001','00000000-0002-0000-0000-000000000001','Overhead Utility Relocation Requirements','Confirm if overhead utility lines must be buried. This can be a significant unbudgeted cost.',32,false),
('00000000-0002-0033-0000-000000000001','00000000-0002-0000-0000-000000000001','Notify Seller of Non-Assumed Contracts','Provide formal written notice to seller of any service contracts or agreements that buyer will not assume at closing.',33,false),
('00000000-0002-0034-0000-000000000001','00000000-0002-0000-0000-000000000001','Aerial Rights / Crane Plan','Determine if construction will require crane operations over adjacent properties or public rights-of-way.',34,false),
('00000000-0002-0035-0000-000000000001','00000000-0002-0000-0000-000000000001','Contractor Pre-Construction Review','Engage general contractor for pre-construction services and site assessment during DD.',35,false);

-- Checklist items for Phase 2 tasks
INSERT INTO checklist_template_checklist_items (task_id, label, sort_order) VALUES
-- 2.3 Title Commitment
('00000000-0002-0003-0000-000000000001','Review title commitment for liens, encumbrances, and restrictions',1),
('00000000-0002-0003-0000-000000000001','Review all exception documents listed in Schedule B',2),
('00000000-0002-0003-0000-000000000001','Confirm legal description matches survey',3),
('00000000-0002-0003-0000-000000000001','Identify any title defects requiring cure before closing',4),
-- 2.6 Legal Description / Title Survey
('00000000-0002-0006-0000-000000000001','Commission or update ALTA survey to current standards',1),
('00000000-0002-0006-0000-000000000001','Obtain seller''s affidavit regarding boundary disputes, encroachments, and unrecorded agreements',2),
('00000000-0002-0006-0000-000000000001','Confirm survey matches legal description in title commitment',3),
-- 2.11 Litigation
('00000000-0002-0011-0000-000000000001','Conduct litigation searches from state and federal courts in jurisdiction',1),
('00000000-0002-0011-0000-000000000001','Review any pending or threatened actions involving the property or seller',2),
-- 2.15 Land Use Approvals
('00000000-0002-0015-0000-000000000001','SLR internal zoning review and assessment',1),
('00000000-0002-0015-0000-000000000001','Obtain Zoning Certificate / Verification Letter',2),
('00000000-0002-0015-0000-000000000001','Commission zoning consultant or attorney letter confirming permitted use and density',3),
('00000000-0002-0015-0000-000000000001','Review existing plat and filed plans for the site',4),
('00000000-0002-0015-0000-000000000001','Confirm entitlement process, timeline, and required approvals',5),
('00000000-0002-0015-0000-000000000001','Confirm signage constraints and permitted signage types',6),
('00000000-0002-0015-0000-000000000001','Confirm affordable housing requirements or voluntary programs',7),
-- 2.18 Seller Info Package
('00000000-0002-0018-0000-000000000001','Phase I Environmental Site Assessment',1),
('00000000-0002-0018-0000-000000000001','ALTA Survey',2),
('00000000-0002-0018-0000-000000000001','In-place leases and rent roll',3),
('00000000-0002-0018-0000-000000000001','Tenant notice letters',4),
('00000000-0002-0018-0000-000000000001','Geotechnical report',5),
('00000000-0002-0018-0000-000000000001','Dewatering report (if applicable)',6),
-- 2.23 Architect Preliminary Design
('00000000-0002-0023-0000-000000000001','Density study / preliminary site plan to confirm achievable unit count',1),
('00000000-0002-0023-0000-000000000001','Site plan submission to planning department for preliminary feedback',2),
-- 2.24 Civil Engineer DD Report
('00000000-0002-0024-0000-000000000001','Survey review and boundary confirmation',1),
('00000000-0002-0024-0000-000000000001','Floodplain analysis and FEMA map review',2),
('00000000-0002-0024-0000-000000000001','Wetland delineation or determination',3),
('00000000-0002-0024-0000-000000000001','Endangered species habitat assessment',4),
('00000000-0002-0024-0000-000000000001','Impact fee research and documentation',5),
('00000000-0002-0024-0000-000000000001','Building permit fee research and documentation',6),
('00000000-0002-0024-0000-000000000001','Confirm all impact fees and permit fees are captured in proforma',7),
-- 2.25 Easement Issues
('00000000-0002-0025-0000-000000000001','Temporary construction easements required during build',1),
('00000000-0002-0025-0000-000000000001','Drainage easements — existing and needed',2),
('00000000-0002-0025-0000-000000000001','Vehicular and pedestrian access easements',3),
-- 2.26 Phase I Environmental
('00000000-0002-0026-0000-000000000001','Complete site assessment per ASTM E1527-21 standard',1),
('00000000-0002-0026-0000-000000000001','Track 180-day expiration from date of site visit (not report date)',2),
('00000000-0002-0026-0000-000000000001','Commission report update if approaching expiration before closing',3),
-- 2.27 Geotech
('00000000-0002-0027-0000-000000000001','Seismic zone classification review',1),
('00000000-0002-0027-0000-000000000001','Structural engineer and construction team review of geotech findings',2),
('00000000-0002-0027-0000-000000000001','Structural engineer conceptual foundation summary for early pricing',3),
-- 2.29 Environmental Additional Studies
('00000000-0002-0029-0000-000000000001','Phase II Environmental Site Assessment (if RECs identified)',1),
('00000000-0002-0029-0000-000000000001','Waters of US / karst features investigation',2),
('00000000-0002-0029-0000-000000000001','In-situ soil sampling and laboratory analysis',3),
('00000000-0002-0029-0000-000000000001','Phase III site remediation plan and cost estimate',4),
('00000000-0002-0029-0000-000000000001','Fuel oil tank investigation and removal cost estimate',5),
('00000000-0002-0029-0000-000000000001','Lead-based paint survey (existing structures)',6),
('00000000-0002-0029-0000-000000000001','Electromagnetic field study (if near substations or major power lines)',7),
('00000000-0002-0029-0000-000000000001','Methane testing (especially near former landfills or industrial sites)',8),
('00000000-0002-0029-0000-000000000001','Limited asbestos sampling (existing structures)',9),
('00000000-0002-0029-0000-000000000001','Radon testing — confirm with environmental attorney if recommended',10),
('00000000-0002-0029-0000-000000000001','Environmental insurance (PLL policy) evaluation',11),
('00000000-0002-0029-0000-000000000001','Ground water quality testing',12),
('00000000-0002-0029-0000-000000000001','Confirm all environmental results are communicated to construction team',13),
-- 2.30 Service Contracts
('00000000-0002-0030-0000-000000000001','Maintenance and landscape agreements',1),
('00000000-0002-0030-0000-000000000001','Parking agreements and licenses',2),
('00000000-0002-0030-0000-000000000001','Joint-use agreements with adjacent properties',3),
('00000000-0002-0030-0000-000000000001','Option agreements affecting the property',4),
('00000000-0002-0030-0000-000000000001','All other service contracts',5),
-- 2.31 Will Serve Letters
('00000000-0002-0031-0000-000000000001','Electric utility — capacity confirmation and service requirements',1),
('00000000-0002-0031-0000-000000000001','Gas utility — capacity and connection requirements (check for appliance rebates)',2),
('00000000-0002-0031-0000-000000000001','Water and sewer — capacity, connection fees, and infrastructure condition',3),
('00000000-0002-0031-0000-000000000001','Telephone / fiber service availability',4),
('00000000-0002-0031-0000-000000000001','Cable / broadband service availability',5),
('00000000-0002-0031-0000-000000000001','Verify no MUDs or contractual cost-sharing agreements',6),
('00000000-0002-0031-0000-000000000001','Flow study if required by utility provider',7),
-- 2.35 Contractor Pre-Construction Review
('00000000-0002-0035-0000-000000000001','Crane and staging plan / easement requirements',1),
('00000000-0002-0035-0000-000000000001','FAA notification (45 days prior for structures over 200 ft or near airports)',2),
('00000000-0002-0035-0000-000000000001','Contractor site visit and constructability review',3),
('00000000-0002-0035-0000-000000000001','Subcontractor market meetings for current pricing and availability',4),
('00000000-0002-0035-0000-000000000001','Power company coordination to confirm transformer and switchgear layouts',5),
('00000000-0002-0035-0000-000000000001','Phased unit turn strategy — confirm with city what building elements are required for phased TCO',6);

-- ============================================================
-- Phase 3: Project Team Assembly
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0003-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Project Team Assembly',
    'Formal engagement of all key project team consultants and contractors.',
    3, 'construction_start', '#8B5CF6');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0003-0001-0000-000000000001','00000000-0003-0000-0000-000000000001','Architect Engaged','Execute architect agreement. Confirm scope covers schematic design through construction administration.',1),
('00000000-0003-0002-0000-000000000001','00000000-0003-0000-0000-000000000001','General Contractor Engaged','Execute GC pre-construction or GMP agreement. Confirm insurance requirements, bonding capacity, and key personnel assignments.',2),
('00000000-0003-0003-0000-000000000001','00000000-0003-0000-0000-000000000001','Civil Engineer Engaged','Execute civil engineering agreement for full site design. Scope should cover DD report through construction-phase services.',3),
('00000000-0003-0004-0000-000000000001','00000000-0003-0000-0000-000000000001','Structural Engineer Engaged','Execute structural engineering agreement. Confirm seismic classification, foundation approach, and coordination with geotech findings.',4),
('00000000-0003-0005-0000-000000000001','00000000-0003-0000-0000-000000000001','MEP Engineer Engaged','Execute mechanical, electrical, and plumbing engineering agreement.',5),
('00000000-0003-0006-0000-000000000001','00000000-0003-0000-0000-000000000001','Landscape Architect Engaged','Execute landscape architecture agreement. Coordinate with civil engineer on grading, drainage, and site amenity design.',6),
('00000000-0003-0007-0000-000000000001','00000000-0003-0000-0000-000000000001','Interior Designer Engaged','Execute interior design agreement covering unit interiors, amenity spaces, corridors, and lobby.',7),
('00000000-0003-0008-0000-000000000001','00000000-0003-0000-0000-000000000001','Environmental Consultant Retained','Confirm ongoing environmental consultant engagement for any monitoring, remediation oversight, or Phase II/III work.',8),
('00000000-0003-0009-0000-000000000001','00000000-0003-0000-0000-000000000001','Tax Consultant Engaged','Engage property tax consultant for abatement applications, assessed value projections, and appeals strategy.',9),
('00000000-0003-0010-0000-000000000001','00000000-0003-0000-0000-000000000001','Traffic Engineer Engaged','If required by entitlements, engage traffic engineer for traffic impact analysis and any required mitigation measures.',10);

-- ============================================================
-- Phase 4: Entitlements
-- ============================================================
INSERT INTO checklist_template_phases (id, template_id, name, description, sort_order, default_milestone, color)
VALUES ('00000000-0004-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'Entitlements',
    'All governmental approvals, permits, and entitlements required to develop the site as designed. Timeline varies dramatically by jurisdiction.',
    4, 'construction_start', '#10B981');

INSERT INTO checklist_template_tasks (id, phase_id, name, description, sort_order) VALUES
('00000000-0004-0001-0000-000000000001','00000000-0004-0000-0000-000000000001','Zoning Pre-Application Meeting','Schedule pre-application meeting with planning staff to review proposed development concept.',1),
('00000000-0004-0002-0000-000000000001','00000000-0004-0000-0000-000000000001','Zoning Application Submitted','Submit formal zoning application with all required materials.',2),
('00000000-0004-0003-0000-000000000001','00000000-0004-0000-0000-000000000001','Neighborhood / Community Meetings','Attend or host required community engagement meetings. Document feedback and opposition.',3),
('00000000-0004-0004-0000-000000000001','00000000-0004-0000-0000-000000000001','Planning Commission Hearing','Prepare and present at planning commission hearing.',4),
('00000000-0004-0005-0000-000000000001','00000000-0004-0000-0000-000000000001','City Council Approval','If required, track city council hearing date and prepare for council presentation.',5),
('00000000-0004-0006-0000-000000000001','00000000-0004-0000-0000-000000000001','Zoning Approval / Ordinance Recorded','Confirm zoning approval is final and recorded. Document all conditions of approval.',6),
('00000000-0004-0007-0000-000000000001','00000000-0004-0000-0000-000000000001','Site Plan Approval','Submit and obtain approval of detailed site plan per local requirements.',7),
('00000000-0004-0008-0000-000000000001','00000000-0004-0000-0000-000000000001','Subdivision / Plat Approval','If the site requires subdivision or replatting, submit and obtain plat approval.',8),
('00000000-0004-0009-0000-000000000001','00000000-0004-0000-0000-000000000001','Stormwater Management Plan Approval','Submit and obtain approval of stormwater management plan.',9),
('00000000-0004-0010-0000-000000000001','00000000-0004-0000-0000-000000000001','Tree Survey & Removal Permits','Complete tree survey, obtain tree removal permits, and establish mitigation requirements.',10),
('00000000-0004-0011-0000-000000000001','00000000-0004-0000-0000-000000000001','Demolition Permit','If existing structures require demolition, obtain demolition permit.',11),
('00000000-0004-0012-0000-000000000001','00000000-0004-0000-0000-000000000001','Grading Permit','Obtain grading/earthwork permit to allow site preparation work to begin in advance of full building permit.',12),
('00000000-0004-0013-0000-000000000001','00000000-0004-0000-0000-000000000001','Building Permit Application','Submit building permit application with full construction document set.',13),
('00000000-0004-0014-0000-000000000001','00000000-0004-0000-0000-000000000001','Building Permit Issued','Obtain building permit. Confirm all conditions precedent are satisfied and permit is unconditional.',14),
('00000000-0004-0015-0000-000000000001','00000000-0004-0000-0000-000000000001','Tax Abatement / Incentive Applications','If applicable, submit applications for property tax abatements, TIF districts, PILOT agreements, or other local incentives.',15),
('00000000-0004-0016-0000-000000000001','00000000-0004-0000-0000-000000000001','Historic Preservation Review','If the site or adjacent properties are historically designated, complete required review with SHPO or local historic preservation commission.',16);
