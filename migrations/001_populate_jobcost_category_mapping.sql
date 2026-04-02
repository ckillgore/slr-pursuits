-- ============================================================
-- Migration: Populate jobcost_category_mapping
-- Target Database: slr-assetintel (Yardi Supabase)
-- 
-- Table has columns: category_code, category_name, cost_group
-- Adding is_group_header column for hierarchy support
-- ============================================================

-- Add is_group_header column if it doesn't exist
ALTER TABLE jobcost_category_mapping
  ADD COLUMN IF NOT EXISTS is_group_header boolean DEFAULT false;

-- Clear any existing data
TRUNCATE TABLE jobcost_category_mapping;

-- ============================================================
-- COST GROUP HEADERS (2-digit level)
-- ============================================================
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('01', 'General Conditions', 'Hard Costs', true),
  ('02', 'Site Work', 'Hard Costs', true),
  ('03', 'Apartments', 'Hard Costs', true),
  ('04', 'Leasing Office', 'Hard Costs', true),
  ('05', 'Fitness Center', 'Hard Costs', true),
  ('06', 'Garage', 'Hard Costs', true),
  ('07', 'Pool Amenity', 'Hard Costs', true),
  ('08', 'Auxiliary Amenity', 'Hard Costs', true),
  ('10', 'Misc. Site Work', 'Hard Costs', true),
  ('11', 'Permits & Bonds', 'Hard Costs', true),
  ('12', 'Contingency', 'Hard Costs', true),
  ('13', 'Project Specific', 'Hard Costs', true),
  ('14', 'Retail', 'Hard Costs', true),
  ('15', 'General Contractor Fee', 'Hard Costs', true),
  ('48', 'Deposits', 'Hard Costs', true),
  ('49', 'General Contractor Fee', 'Hard Costs', true),
  ('50', 'Land Acquisition Costs', 'Soft Costs', true),
  ('51', 'Acquisition Costs', 'Soft Costs', true),
  ('52', 'Loan Costs', 'Soft Costs', true),
  ('53', 'Joint Venture Costs', 'Soft Costs', true),
  ('54', 'Legal Costs', 'Soft Costs', true),
  ('60', 'Architectural & Engineering', 'Soft Costs', true),
  ('61', 'Impact Fees', 'Soft Costs', true),
  ('62', 'Architectural & Engineering', 'Soft Costs', true),
  ('63', 'Other Development Costs', 'Soft Costs', true),
  ('64', 'Other Dev Costs - Office', 'Soft Costs', true),
  ('70', 'Development Interest', 'Soft Costs', true),
  ('71', 'Taxes & Assessments', 'Soft Costs', true),
  ('73', 'Overhead Allocation', 'Soft Costs', true),
  ('74', 'Developer Fee', 'Soft Costs', true),
  ('78', 'Lease-Up Expenses', 'Soft Costs', true),
  ('80', 'Marketing / Lease-Up / FF&E', 'Soft Costs', true),
  ('86', 'Retail', 'Soft Costs', true),
  ('89', 'Deposits', 'Soft Costs', true),
  ('90', 'Contingency', 'Soft Costs', true),
  ('99', 'Total of All Accounts', 'Summary', true);

-- ============================================================
-- DETAIL COST CATEGORIES (Soft Costs — primary pre-dev focus)
-- ============================================================

-- 50 - Land Acquisition Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('50-00100', 'Land Acquisition Price', 'Soft Costs', false),
  ('50-00101', 'City Contribution', 'Soft Costs', false),
  ('50-00102', 'Land Sale', 'Soft Costs', false),
  ('50-00105', 'Earnest Money Deposit', 'Soft Costs', false),
  ('50-00110', 'Extension Fees', 'Soft Costs', false),
  ('50-00111', 'Assignment Fee', 'Soft Costs', false),
  ('50-00112', 'Land Broker', 'Soft Costs', false),
  ('50-99999', 'TOTAL LAND ACQUISITION', 'Soft Costs', false);

-- 51 - Acquisition Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('51-00115', 'Legal Fees-Acquisition', 'Soft Costs', false),
  ('51-00120', 'Closing Costs', 'Soft Costs', false),
  ('51-00124', 'Lender Fees', 'Soft Costs', false),
  ('51-00135', 'Recording Fees', 'Soft Costs', false),
  ('51-00145', 'Settlement Fees', 'Soft Costs', false),
  ('51-00155', 'Survey', 'Soft Costs', false),
  ('51-00156', 'Market Studies', 'Soft Costs', false),
  ('51-00165', 'Broker Fee', 'Soft Costs', false),
  ('51-00170', 'Sales Commission', 'Soft Costs', false),
  ('51-00175', 'Other Costs Land Acq', 'Soft Costs', false),
  ('51-00190', 'Founders Park Buy In', 'Soft Costs', false),
  ('51-00200', 'Townhome Soft Costs', 'Soft Costs', false),
  ('51-99999', 'TOTAL ACQUISITION COSTS', 'Soft Costs', false);

-- 52 - Loan Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('52-00115', 'Legal Fees-Loan', 'Soft Costs', false),
  ('52-00120', 'Closing Costs', 'Soft Costs', false),
  ('52-00125', 'Loan Commitment Fee', 'Soft Costs', false),
  ('52-00130', 'Title Policy', 'Soft Costs', false),
  ('52-00135', 'Recording Fees', 'Soft Costs', false),
  ('52-00140', 'Search Fees', 'Soft Costs', false),
  ('52-00150', 'Title Exam Fees', 'Soft Costs', false),
  ('52-00155', 'Survey', 'Soft Costs', false),
  ('52-00160', 'Appraisal', 'Soft Costs', false),
  ('52-00181', 'Other Costs Loan', 'Soft Costs', false),
  ('52-00185', 'Other Costs Interest Rate Consultant', 'Soft Costs', false),
  ('52-00186', 'Other Costs Interest Rate Hedges', 'Soft Costs', false),
  ('52-99999', 'TOTAL LOAN COSTS', 'Soft Costs', false);

-- 53 - Joint Venture Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('53-00115', 'Legal Fees-JV', 'Soft Costs', false),
  ('53-00130', 'Title Policy', 'Soft Costs', false),
  ('53-00165', 'Broker Fee', 'Soft Costs', false),
  ('53-00190', 'Other Costs JV', 'Soft Costs', false),
  ('53-99999', 'TOTAL JOINT VENTURE COSTS', 'Soft Costs', false);

-- 54 - Legal Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('54-00115', 'Legal Fees-Legal', 'Soft Costs', false),
  ('54-00121', 'Master Association', 'Soft Costs', false),
  ('54-00126', 'Environmental', 'Soft Costs', false),
  ('54-00131', 'Title Update', 'Soft Costs', false),
  ('54-00196', 'Other Legal Fees', 'Soft Costs', false),
  ('54-99999', 'TOTAL LEGAL COSTS', 'Soft Costs', false);

-- 60 - Land Planning / A&E
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('60-00240', 'Zoning', 'Soft Costs', false),
  ('60-00250', 'Traffic Consultant', 'Soft Costs', false),
  ('60-00265', 'Environmental Studies', 'Soft Costs', false),
  ('60-00275', 'Feasibility Studies', 'Soft Costs', false),
  ('60-00280', 'Geotechnical Testing', 'Soft Costs', false),
  ('60-00292', 'Aerial Photography', 'Soft Costs', false),
  ('60-00295', 'Other Land Planning', 'Soft Costs', false),
  ('60-00296', 'Onsite Infrastructure', 'Soft Costs', false),
  ('60-00297', 'Offsite Infrastructure', 'Soft Costs', false),
  ('60-00322', 'Archaeology Investigation', 'Soft Costs', false),
  ('60-99999', 'TOTAL LAND PLANNING', 'Soft Costs', false);

-- 61 - Impact Fees
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('61-00297', 'Offsite Infrastructure Costs', 'Soft Costs', false),
  ('61-00300', 'Water Sewer Connection', 'Soft Costs', false),
  ('61-00310', 'Water Meters', 'Soft Costs', false),
  ('61-00311', 'Offsite Gas', 'Soft Costs', false),
  ('61-00312', 'Offsite Electricity', 'Soft Costs', false),
  ('61-00313', 'Natural Gas Design', 'Soft Costs', false),
  ('61-00315', 'Sewer Surcharge Fees', 'Soft Costs', false),
  ('61-00320', 'Plan Review', 'Soft Costs', false),
  ('61-00324', 'DOT Improvements', 'Soft Costs', false),
  ('61-00325', 'Transportation Impact', 'Soft Costs', false),
  ('61-00327', 'Development Occupational Fee (DOF)', 'Soft Costs', false),
  ('61-00335', 'Parks and Recreation Fee', 'Soft Costs', false),
  ('61-00342', 'Building Permits', 'Soft Costs', false),
  ('61-00345', 'Police Fire Dept. Fees', 'Soft Costs', false),
  ('61-00350', 'County Fees', 'Soft Costs', false),
  ('61-00355', 'City Fees', 'Soft Costs', false),
  ('61-00362', 'Fees Inspections', 'Soft Costs', false),
  ('61-00365', 'Other Fees', 'Soft Costs', false),
  ('61-00370', 'Construction Bonds', 'Soft Costs', false),
  ('61-00375', 'Landscape Bonds', 'Soft Costs', false),
  ('61-00395', 'Green Bldg Fees', 'Soft Costs', false),
  ('61-99999', 'TOTAL IMPACT FEES', 'Soft Costs', false);

-- 62 - Architectural & Engineering
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('62-00400', 'Design Architect', 'Soft Costs', false),
  ('62-00405', 'Structural Engineer', 'Soft Costs', false),
  ('62-00410', 'MEP Engineer', 'Soft Costs', false),
  ('62-00411', 'Environmental Engineer', 'Soft Costs', false),
  ('62-00415', 'Interior Design Design Associate', 'Soft Costs', false),
  ('62-00420', 'Civil Engineer', 'Soft Costs', false),
  ('62-00425', 'Landscape Architect', 'Soft Costs', false),
  ('62-00430', 'Arborist', 'Soft Costs', false),
  ('62-00433', 'Lighting Consultant', 'Soft Costs', false),
  ('62-00434', 'Waste Mgt Consultant', 'Soft Costs', false),
  ('62-00435', 'Miscellaneous Consultant', 'Soft Costs', false),
  ('62-00436', 'ADA Consultant (Accessibility)', 'Soft Costs', false),
  ('62-00437', 'Green Bldg Consultant', 'Soft Costs', false),
  ('62-00438', 'Permits Consultant', 'Soft Costs', false),
  ('62-00439', 'Waterproofing Consultant', 'Soft Costs', false),
  ('62-00440', 'Inspections Consultant', 'Soft Costs', false),
  ('62-00441', 'Bank Inspections', 'Soft Costs', false),
  ('62-00442', 'Internal Quality Control', 'Soft Costs', false),
  ('62-00445', 'Blueprints Reproduction', 'Soft Costs', false),
  ('62-00448', 'Reimbursables Architecture', 'Soft Costs', false),
  ('62-00449', 'Reimbursables Int Design', 'Soft Costs', false),
  ('62-00452', 'Bar Consultant and Licensing', 'Soft Costs', false),
  ('62-00475', 'Other A and E', 'Soft Costs', false),
  ('62-00480', 'Acoustical Consultant', 'Soft Costs', false),
  ('62-00485', 'Elevator Consultant', 'Soft Costs', false),
  ('62-00486', 'Bulk Wifi', 'Soft Costs', false),
  ('62-00487', 'Dry Utilities Consultant CA AZ', 'Soft Costs', false),
  ('62-00488', 'Fire and Safety Consultant CA AZ', 'Soft Costs', false),
  ('62-00489', 'SLR Creative Fee', 'Soft Costs', false),
  ('62-99999', 'TOTAL ARCHITECTURAL and ENGINEER', 'Soft Costs', false);

-- 63 - Other Development Costs
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('63-00400', 'Builders Risk and Liability SL Only', 'Soft Costs', false),
  ('63-00485', 'AsBuilt Survey', 'Soft Costs', false),
  ('63-00490', 'Travel Costs', 'Soft Costs', false),
  ('63-00492', 'Corp Office', 'Soft Costs', false),
  ('63-00495', 'Other Development Cost', 'Soft Costs', false),
  ('63-00496', 'Accounting Fees', 'Soft Costs', false),
  ('63-00499', 'Insurance Claim Reimbursables', 'Soft Costs', false),
  ('63-00500', 'Equity Oversight Fee', 'Soft Costs', false),
  ('63-00940', 'Builders Risk and Liability', 'Soft Costs', false),
  ('63-99999', 'TOTAL OTHER DEVELOPMENT COSTS', 'Soft Costs', false);

-- 64 - Other Dev Costs Office
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('64-00120', 'Contingency', 'Soft Costs', false),
  ('64-00205', 'PGIM RE DD', 'Soft Costs', false),
  ('64-99999', 'TOTAL Other Dev Costs - Office', 'Soft Costs', false);

-- 70 - Development Interest
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('70-00550', 'Capd Interest Resi', 'Soft Costs', false),
  ('70-00555', 'Construction Loan Interest', 'Soft Costs', false),
  ('70-00560', 'Note Payable Interest', 'Soft Costs', false),
  ('70-00570', 'Const. Int. Funded by', 'Soft Costs', false),
  ('70-00575', 'Interest Income', 'Soft Costs', false),
  ('70-99999', 'TOTAL DEVELOPMENT INTEREST', 'Soft Costs', false);

-- 71 - Taxes & Assessments
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('71-00575', 'Property Taxes', 'Soft Costs', false),
  ('71-00585', 'Association Fees', 'Soft Costs', false),
  ('71-99999', 'TOTAL TAXES and ASSESSMENTS', 'Soft Costs', false);

-- 73 - Overhead Allocation
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('73-99999', 'TOTAL OVERHEAD ALLOCATION', 'Soft Costs', false);

-- 74 - Developer Fee
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('74-00610', 'Developer Fee', 'Soft Costs', false),
  ('74-00611', 'Asset Mgmt Fee', 'Soft Costs', false),
  ('74-00622', 'Partner CM Fee', 'Soft Costs', false),
  ('74-99999', 'TOTAL DEVELOPER FEE', 'Soft Costs', false);

-- 78 - Lease-Up Expenses
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('78-00655', 'Capd Op Exp Residential', 'Soft Costs', false),
  ('78-99999', 'TOTAL LEASEUP EXPENSES', 'Soft Costs', false);

-- 80 - Marketing / Lease-Up / FF&E
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('80-00700', 'FF&E', 'Soft Costs', false),
  ('80-00715', 'Fitness Equipment', 'Soft Costs', false),
  ('80-00725', 'Business Center Furnishings', 'Soft Costs', false),
  ('80-00735', 'Corridor Furnishings', 'Soft Costs', false),
  ('80-00739', 'Trash Containers', 'Soft Costs', false),
  ('80-00740', 'Other Furnishings', 'Soft Costs', false),
  ('80-00741', 'Reimbursables FF&E', 'Soft Costs', false),
  ('80-00746', 'EV Charging Stations', 'Soft Costs', false),
  ('80-00747', 'Audio Visual Equipment', 'Soft Costs', false),
  ('80-00750', 'Start Up Equipment', 'Soft Costs', false),
  ('80-00755', 'Collaterals', 'Soft Costs', false),
  ('80-00760', 'Signage and Graphic Design', 'Soft Costs', false),
  ('80-00770', 'Renderings Design', 'Soft Costs', false),
  ('80-00775', 'Marketing Signage', 'Soft Costs', false),
  ('80-00780', 'Leaseup Advertising', 'Soft Costs', false),
  ('80-00781', 'Leaseup Marketing', 'Soft Costs', false),
  ('80-00786', 'Preview Center', 'Soft Costs', false),
  ('80-00790', 'Website Design Devel', 'Soft Costs', false),
  ('80-00791', 'Branding', 'Soft Costs', false),
  ('80-99999', 'TOTAL MARKETING LEASE UP FFandE', 'Soft Costs', false);

-- 86 - Retail (Soft)
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('86-00115', 'Legal Fees-Retail', 'Soft Costs', false),
  ('86-00116', 'Lease Negotiations', 'Soft Costs', false),
  ('86-00342', 'Building Permits', 'Soft Costs', false),
  ('86-00365', 'Other Fees', 'Soft Costs', false),
  ('86-00441', 'Tenant Coord Consultant', 'Soft Costs', false),
  ('86-00490', 'Travel Costs', 'Soft Costs', false),
  ('86-00757', 'Website Development', 'Soft Costs', false),
  ('86-00760', 'Graphics Wayfinding', 'Soft Costs', false),
  ('86-00761', 'Advertising', 'Soft Costs', false),
  ('86-00767', 'Mrktg and Leasing Center', 'Soft Costs', false),
  ('86-00783', '3rd Party Leasing Commission', 'Soft Costs', false),
  ('86-00805', 'Mgt Office FF and E', 'Soft Costs', false),
  ('86-00900', 'Contingency', 'Soft Costs', false),
  ('86-19599', 'TI Allowance', 'Soft Costs', false),
  ('86-99999', 'TOTAL RETAIL', 'Soft Costs', false);

-- 89 - Deposits (Soft)
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('89-49999', 'Escrow deposit', 'Soft Costs', false),
  ('89-99990', 'TOTAL DEPOSITS', 'Soft Costs', false);

-- 48 - Deposits (Hard)
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('48-50100', 'Refundable deposit', 'Hard Costs', false),
  ('48-99990', 'TOTAL DEPOSITS', 'Hard Costs', false);

-- 49 - General Contractor Fee
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('49-02800', 'Construction Management Fee', 'Hard Costs', false),
  ('49-49999', 'General Contractors Fee', 'Hard Costs', false),
  ('49-50100', 'Mobilization', 'Hard Costs', false),
  ('49-99990', 'Total General Contractors Fee', 'Hard Costs', false),
  ('49-99999', 'Total Hard Costs', 'Hard Costs', false);

-- 11 - Permits and Bonds
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('11-01917', 'Accounting Fees', 'Hard Costs', false),
  ('11-01980', 'Preconstruction Services', 'Hard Costs', false),
  ('11-19000', 'Building Permits', 'Hard Costs', false),
  ('11-19030', 'Other Permits', 'Hard Costs', false),
  ('11-20085', 'Subcontractor Default Ins (SDI)', 'Hard Costs', false),
  ('11-20800', 'CCIP Credits', 'Hard Costs', false),
  ('11-21000', 'Subcontractor P&P Bonds', 'Hard Costs', false),
  ('11-21500', 'On Site G/L & Excess Liability', 'Hard Costs', false),
  ('11-22000', 'Builders Risk', 'Hard Costs', false),
  ('11-23000', 'General Project Insurance', 'Hard Costs', false),
  ('11-24000', 'Misc. Insurance Costs & Fees', 'Hard Costs', false),
  ('11-99999', 'Total Permits and Bonds', 'Hard Costs', false);

-- 12 - Contingency (Hard)
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('12-19999', 'Construction Contingency', 'Hard Costs', false),
  ('12-29999', 'Owner Contingency', 'Hard Costs', false),
  ('12-99999', 'Total Contingency', 'Hard Costs', false);

-- 13 - Project Specific
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('13-01917', 'Project Coordination Fee', 'Hard Costs', false),
  ('13-01980', 'Preconstruction Services', 'Hard Costs', false),
  ('13-19500', 'Unallocated Future Costs', 'Hard Costs', false),
  ('13-20100', 'GC Reconciliation', 'Hard Costs', false),
  ('13-20150', 'Buyout Savings', 'Hard Costs', false),
  ('13-20200', 'SDI Loss Fund Reimbursements', 'Hard Costs', false),
  ('13-20300', 'Utility Reimbursements', 'Hard Costs', false),
  ('13-20400', 'Insurance Claim Reimbursables', 'Hard Costs', false),
  ('13-20500', 'Insurance Claim Reimbursements', 'Hard Costs', false),
  ('13-20600', 'Consultant Claims', 'Hard Costs', false),
  ('13-20700', 'State Taxes', 'Hard Costs', false),
  ('13-20800', 'CCIP Credits', 'Hard Costs', false),
  ('13-20900', 'Owner Reimbursements', 'Hard Costs', false),
  ('13-25000', '$0 PCO/OCO Markup', 'Hard Costs', false),
  ('13-99999', 'Total Project Specific', 'Hard Costs', false);

-- 15 - Third Party GC
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('15-02850', 'GC Contract MF', 'Hard Costs', false),
  ('15-02860', 'GC Contract Joint Improvements', 'Hard Costs', false),
  ('15-02861', 'Joint Improvement Site', 'Hard Costs', false),
  ('15-02862', 'Joint Improvements Parking', 'Hard Costs', false),
  ('15-02870', 'Other Joint Improvements', 'Hard Costs', false),
  ('15-99999', 'Total Third Party General Contractor', 'Hard Costs', false);

-- 90 - Contingency (Soft)
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('90-00900', 'Contingency', 'Soft Costs', false),
  ('90-00910', 'Bank Owned Contingency', 'Soft Costs', false),
  ('90-29999', 'Owner Contingency', 'Soft Costs', false),
  ('90-99990', 'TOTAL CONTINGENCY', 'Soft Costs', false),
  ('90-99999', 'TOTAL SOFT COSTS', 'Soft Costs', false);

-- 99 - Summary Totals
INSERT INTO jobcost_category_mapping (category_code, category_name, cost_group, is_group_header) VALUES
  ('99-99990', 'TOTAL PROJECT COSTS', 'Summary', false),
  ('99-99999', 'TOTAL OF ALL ACCOUNTS', 'Summary', false);
