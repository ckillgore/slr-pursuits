ogc_fid
Object ID	✓	✓	serial primary key
geoid
FIPS Code
FIPS code (state + county FIPS codes)

✓	✓	text
parcelnumb
Parcel ID
The assessor's primary parcel identification number or code.

Examples: 02004940, 001-020-4624-001

✓	✓	text
parcelnumb_no_formatting
Parcel ID without Formatting
The primary parcel identification number with spaces and formatting characters removed.

Examples: 02004940, 0010204624001

✓	✓	text
state_parcelnumb
State Provided Parcel ID Number
Statewide parcel identification number. Collected where available from states that provide a statewide parcel ID.

Examples: 02004940, 001-020-4624-001

✓	✓	text
account_number
Parcel Account Number
The assessor or tax collector's account identification number for a property.

Examples: 02004940

✓	✓	text
tax_id
Parcel Tax Identification Number
The assessor or tax collector's tax identification number for a property.

Examples: 02004940

✓	✓	text
alt_parcelnumb1
First Alternative Parcel ID
An assessor-provided additional or alternative parcel identification number.

Examples: 02004940, 001-020-4624-001

✓	✓	text
alt_parcelnumb2
Second Alternative Parcel ID
An assessor-provided additional or alternative parcel identification number.

Examples: 02004940, 001-020-4624-001

✓	✓	text
alt_parcelnumb3
Third Alternative Parcel ID
An assessor-provided additional or alternative parcel identification number.

Examples: 02004940, 001-020-4624-001

✓	✓	text
usecode
Parcel Use Code
Varies by governing municipality

Examples: 104

✓	✓	text
usedesc
Parcel Use Description
Varies by governing municipality

Examples: Residential

✓	✓	text
zoning
Zoning Code
Code used by the governing municipality

Examples: R-1

✓	✓	text
zoning_description
Zoning Description
Human-readable name for the zoning code defined by the governing municipality

Examples: Residential

✓	✓	text
zoning_type
premium	Zoning Type
Standardized zoning type

Examples: Residential

✓		text
zoning_subtype
premium	Zoning Subtype
Standardized zoning subtype

Examples: Single-family

✓		text
zoning_code_link
premium	Zoning Code Link
Link to the municipality's zoning code

Examples: https://www.zoneomics.com/code/anchorage-AK/chapter_10

✓		text
zoning_id
premium	Zoning Area ID
ID for the zoning area for matching to the Regrid zoning product

Examples: 5555

✓		integer
struct
Structure on Parcel	✓	✓	boolean
structno
Number of Structures on Parcel	✓	✓	integer
yearbuilt
Structure Year Built	✓	✓	integer
year_built_effective_date
Year Built Effective Date
Year built adjusted by the assessor to account for building condition and major structural schanges. May be the year of the most recent major addition or renovation.

Examples: 1989-07-01

✓	✓	integer
numstories
Number of Stories	✓	✓	double precision
numunits
Number of Living Units
The number of individual living units, apartments or condominiums on a parcel.

✓	✓	integer
numrooms
Number of Rooms
The number of rooms in the parcel's primary structure as recorded in county records.

✓	✓	double precision
num_bath
Number of Baths
The total number of rooms that are utilized as bathrooms. Includes partial bathrooms.

Examples: 3

✓	✓	double precision
num_bath_partial
Number of Partial Baths
The total number of rooms that are utilized as bathrooms and are partial bathrooms by common real estate definition.

Examples: 2

✓	✓	double precision
num_bedrooms
Number of Bedrooms
The total number of rooms that can be qualified as bedrooms.

Examples: 3

✓	✓	integer
structstyle
Structure Style	✓	✓	text
parvaltype
Parcel Value Type
The type of value reported in the parcel value fields

Examples: Appraised, Assessed, Taxable, Market, Market Value

✓	✓	text
improvval
Improvement Value	✓	✓	double precision
landval
Land Value	✓	✓	double precision
parval
Total Parcel Value	✓	✓	double precision
agval
Agricultural Value	✓	✓	double precision
homestead_exemption
premium	Homestead Exemption
An assessor-provided attribute indicating if the parcel has any tax exemption due to homestead status.

✓		text
saleprice
Last Sale Price	✓	✓	double precision
saledate
Last Sale Date	✓	✓	date
taxamt
Annual Tax Bill	✓	✓	double precision
taxyear
Tax Year
An assessor-provided attribute indicating the tax year the assessor data applies to.

✓	✓	text
last_ownership_transfer_date
Last Ownership Transfer Date
Last Sale date for the most recent ownership transfer. Can convey that there has been a non-arms-length transfer after the most recent sale.

Examples: 2021-11-01

✓	✓	date
owntype
Owner Type	✓	✓	text
owner
Owner Name	✓	✓	text
unmodified_owner
Unmodified Owner Name
Owner name before any standardization of punctuation and common government owners, or other details, are modified in any manner.

✓	✓	text
ownfrst
Owner First Name	✓	✓	text
ownlast
Owner Last Name	✓	✓	text
owner2
Second Owner Name	✓	✓	text
owner3
Third Owner Name	✓	✓	text
owner4
Fourth Owner Name	✓	✓	text
previous_owner
Previous Owner Name
The previous owner or grantor of a parcel.

✓	✓	text
mailadd
Mailing Address
This is the address where the tax and other assessor's communications are sent. It is often thought of as the owner's mailing address. It is often the same address as the parcel physical street address, but very commonly it is a different address than the parcel address itself.

✓	✓	text
mail_address2
Mailing Address Second Line	✓	✓	text
careof
Mailing Address Care Of	✓	✓	text
mail_addno
Mailing Address Street Number
Examples: 402

✓	✓	text
mail_addpref
Mailing Address Street Prefix
Examples: S

✓	✓	text
mail_addstr
Mailing Address Street Name
Examples: FOURTH

✓	✓	text
mail_addsttyp
Mailing Address Street Type
Examples: AVE

✓	✓	text
mail_addstsuf
Mailing Address Street Suffix
Examples: NW

✓	✓	text
mail_unit
Mailing Address Unit Number
Examples: APT # 2

✓	✓	text
mail_city
Mailing Address City
Examples: Ann Arbor

✓	✓	text
mail_state2
Mailing Address State
Mailing Address State 2-Letter abbreviation

Examples: MI

✓	✓	text
mail_zip
Mailing Address ZIP Code	✓	✓	text
mail_country
Mailing Address Country
Examples: US, Bolivia, Canada

✓	✓	text
mail_urbanization
Mailing Address Urbanizacion (Puerto Rico)	✓	✓	text
original_mailing_address
Original Mailing Address
Mailing address fields as originally provided by the county, encoded as a JSON object. This field was originally separated by a semicolon and a space and data will exist in that format as a migration happens over time.

Examples: {"address"=>"12109 Katz Rd", "saddno"=>"12109", "saddstr"=>"Katz Rd", "scity"=>"Ann Arbor", "szip"=>"48105"}, 12109 Katz Rd; NW; Ann Arbor; MI; 48105

✓	✓	text
address
Parcel Address
This is the address of the parcel itself. Also called the "situs address" or "site address". Not every parcel has a street address, especially in agricultural areas and other large parcels.

Examples: 12109 KATZ RD

✓	✓	text
address2
Parcel Address Second Line	✓	✓	text
saddno
Parcel Address Number
Examples: 12109

✓	✓	text
saddpref
Parcel Address Prefix
Examples: N

✓	✓	text
saddstr
Parcel Address Street Name
Examples: GLENN

✓	✓	text
saddsttyp
Parcel Address Street Type
Examples: RD

✓	✓	text
saddstsuf
Parcel Address Street Suffix
Examples: NW

✓	✓	text
sunit
Parcel Address Unit
Examples: Apt 2, Unit B, 6th floor

✓	✓	text
scity
Parcel Address City
Examples: GRASS LAKE

✓	✓	text
original_address
Original Parcel Address
Parcel Address fields as originally provided by the county, encoded as a JSON object. This field was originally separated by a semicolon and a space and data will exist in that format as a migration happens over time.

Examples: {"address"=>"12109 Katz Rd", "saddno"=>"12109", "saddstr"=>"Katz Rd", "scity"=>"Ann Arbor", "szip"=>"48105"}, 12109 Katz Rd; NW; Ann Arbor; MI; 48105

✓	✓	text
city
US Census County Subdivision
Used for organizational purposes. Refer to scity for the city associated with the site address.

✓	✓	text
county
Parcel Address County	✓	✓	text
state2
Parcel Address State
Examples: MI

✓	✓	text
szip
Parcel Address Zip Code
Examples: 48103, 48104-3423

✓	✓	text
szip5
5 Digit Parcel Zip Code
Examples: 48103

✓	✓	text
urbanization
Parcel Urbanizacion
A postal address field commonly used in Puerto Rico

Examples: Caguas

✓	✓	text
ll_address_count
premium	Regrid Calculated Total Address Count
Total number of primary and secondary addresses on the parcel as calculated by Regrid

✓		integer
location_name
Location Name
A name commonly associated with this parcel

✓	✓	text
address_source
Primary Address Source
Default source if none is listed is the county.

Examples: openaddresses, county

✓	✓	text
legaldesc
Legal Description	✓	✓	text
plat
Plat
Plat number the parcel is recorded on

Examples: A

✓	✓	text
book
Book
Book/Liber the parcel is recorded in

Examples: 231

✓	✓	text
page
Page
Page/Folio the parcel is recorded on

Examples: 2

✓	✓	text
block
Block	✓	✓	text
lot
Lot	✓	✓	text
neighborhood
Neighborhood	✓	✓	text
neighborhood_code
Neighborhood Code	✓	✓	text
subdivision
Subdivision	✓	✓	text
lat
Latitude
On parcel centroid latitude decimal coordinate

✓	✓	text
lon
Longitude
On parcel centroid longitude decimal coordinate

✓	✓	text
fema_flood_zone
premium	FEMA Flood Zone	✓		text
fema_flood_zone_subtype
premium	FEMA Flood Zone Subtype	✓		text
fema_flood_zone_raw
premium	FEMA Flood Zone Raw Data	✓		text
fema_flood_zone_data_date
premium	FEMA Flood Zone Data Date	✓		date
fema_nri_risk_rating
premium	FEMA NRI Risk Rating
Sourced from FEMA's National Risk Index; the Risk Rating leverages available source data for natural hazard and community risk factors to develop a baseline relative risk measurement for each U.S. Census tract for all 50 states, the District of Columbia (DC), American Samoa (AS), Commonwealth of the Northern Mariana Islands (MP), Guam (GU), Puerto Rico (PR), and the U.S. Virgin Islands (VI). The National Risk Rating is intended to help users better understand the natural hazard risk of their communities by providing a category range from “Very Low” to “Very High.”

✓		text
qoz
Federal Qualified Opportunity Zone
Is this parcel in a US Federal Qualified Opportunity Zone

Examples: Yes, No

✓	✓	text
qoz_tract
Qualified Opportunity Zone Tract Number
Census tract number as it was defined in Dec 2018 when QOZs were designated.

Examples: 30059000100, 30107000100

✓	✓	text
census_tract
Census 2020 Tract	✓	✓	text
census_block
Census 2020 Block	✓	✓	text
census_blockgroup
Census 2020 Blockgroup	✓	✓	text
census_zcta
Census Zip Code Tabulation Area
The Census Zip Code Tabulation Area (ZCTA) in which the center of the parcel is located.

✓	✓	text
census_elementary_school_district
premium	Census Provided Elementary School District	✓		text
census_secondary_school_district
premium	Census Provided Secondary School District	✓		text
census_unified_school_district
premium	Census Provided Unified School District	✓		text
ll_last_refresh
Last County Refresh Date
The last date Regrid refreshed the data from the County.

✓	✓	date
sourceurl
Source URL
A county-provided URL to the county parcel record online

✓	✓	text
recrdareatx
Recorded Area (text)	✓	✓	text
recrdareano
Total Square Footage of Structures
An assessor-provided number in square feet that indicates the total habitable / taxable area of buildings on the parcel.

✓	✓	integer
area_building
Building Area
Total area square feet of all structures on the property, which can include; Hallways, Common Areas (Gym, Laundry, Mail, Pool, etc) and any other area determined by the specific county assessor.

Examples: 1359

✓	✓	integer
area_building_definition
Area Building Definition
Details the area described by the area_building value.

Examples: Unknown, Living Area, Total Area

✓	✓	text
deeded_acres
Deeded Acres	✓	✓	double precision
gisacre
County-Provided Acres	✓	✓	double precision
sqft
County-Provided Parcel Square Feet	✓	✓	double precision
ll_gisacre
Regrid Calculated Parcel Acres
Parcel acres as calculated by Regrid from the parcel geometry

✓	✓	double precision
ll_gissqft
Regrid Calculated Parcel Square Feet
Parcel square feet as calculated by Regrid from the parcel geometry

✓	✓	bigint
ll_bldg_footprint_sqft
premium	Regrid Calculated Building Footprint Square Feet
Total building footprint in square feet as calculated by Regrid

✓		integer
ll_bldg_count
premium	Regrid Calculated Building Count
Total number of buildings on the parcel as calculated by Regrid

✓		integer
cdl_raw
premium	Cropland Data Layer Raw Values
This is an array of [value,percentage] pairs that represent the pixel classes present in the parcel and their percentage of the total pixels.

Examples: 36, 60.0, 75, 20.0, 87, 10.0, 190, 10.0

✓		text
cdl_majority_category
premium	Cropland Data Layer Majority Category
This is the human readable Category name for the land cover type that is most common on the parcel.

Examples: Alfalfa

✓		text
cdl_majority_percent
premium	Cropland Data Layer Majority Percent
This is the actual percentage of pixels for the majority category.

Examples: 60.0

✓		double precision
cdl_date
premium	Cropland Data Layer Date
The year of the Cropland Data Layer data set the current attributes are derived from.

Examples: 2021

✓		text
insite_score
premium	InSite Score
NatureServe InSite Score, an integrated biodiversity value score

Examples: Very High, High, Moderate, Low

✓		text
plss_township
PLSS Township
Public Land Survey System Township reference.

✓	✓	text
plss_section
PLSS Section
Public Land Survey System Section reference.

✓	✓	text
plss_range
PLSS Range
Public Land Survey System Range reference.

✓	✓	text
reviseddate
Date of Last Revision
The last date of last revision as provided by the county assessor's office if available.

✓	✓	date
path
Parcel Path
Regrid's human-readable identifier for this parcel. Not guaranteed to be stable between updates.

Examples: /us/mi/wayne/detroit/123, /us/ny/new-york/manhattan/375553

✓	✓	text
ll_stable_id
Stable ID Status
Indicates if the 'll_uuid' value has changed or was newly assigned during the last refresh from the county. A 'null' indicates a new ll_uuid was generated because the new data was not matched to any existing data during the county data refresh process. If there is any value in this field besides a NULL or empty string, it means we were able to match the refreshed parcel with a parcel in our previous data. The available non-null values are 'parcelnumb', 'address', 'geometry' or 'preserved' and they indicate what attribute we used to match the refreshed parcel to the previous parcel. 'preserved' is a legacy value and just indicates that the ll_uuid was carried forward from the previous data.

Examples: preserved (ll_uuid unchanged), parcelnum (ll_uuid unchanged, matched on parcel number), address (ll_uuid unchanged, matched on address), geometry (ll_uuid unchanged, matched on geometry),

✓	✓	text
ll_uuid
Regrid UUID
Uniquely identifies a single parcel with a v4 uuid. A stable parcel id across county data refreshes. This field should be used for tracking individual parcels.

Examples: 4cc9eda6-883c-4f38-9a07-b44900a64b16

✓	✓	uuid
ll_stack_uuid
Parcel Stack UUID
Uniquely identifies a group of parcels with exact duplicate geometries using one stack member parcel's ll_uuid assigned to all the parcels in the stack. This field should be used for identifying and working with groups of stacked parcels (parcels with exactly duplicated parcel geometry). The parcel ll_uuid chosen for the ll_stack_uuid is arbitrary and does not indicate a primary parcel.

Examples: 4cc9eda6-883c-4f38-9a07-b44900a64b16

✓	✓	text
ll_row_parcel
premium	Regrid Right-of-Way Parcel Flag
Identifies a parcel as being a likely right-of-way parcel. These are usually roads, streetsets, railways, utilities, rivers, etc. Values are text strings identifying the trait of the parcel that led to it being flagged.

Examples: parcel_number, land_use, perimeter_ratio, hull_ratio

✓		text
ll_updated_at
Last Modified
Timestamp of the last modification of any kind to this row.

Examples: 2019-06-06 12:45:21.285102-04

✓	✓	timestamp with time zone
precisely_id
premium	Precisely ID
The PreciselyID represents a point addressable location. If a location has multiple alias addresses (alias street names, vanity city names, etc), it will receive the same PreciselyID.

✓		text
placekey
premium	Placekey
Examples: 227-223@5vg-82n-pgk

✓		text
dpv_status
premium	USPS Delivery Point Validation
Examples: V, N

✓		text
dpv_codes
premium	Delivery Point Validation Codes	✓		text
dpv_notes
premium	Delivery Point Validation Notes	✓		text
dpv_type
premium	Delivery Point Match Type
Examples: H (High Rise), S (Street)

✓		text
cass_errorno
premium	CASS Error Codes	✓		text
rdi
premium	Residential Delivery Indicator
Examples: Y, N

✓		text
usps_vacancy
premium	USPS Vacancy Indicator
Examples: Y

✓		text
usps_vacancy_date
premium	USPS Vacancy Indicator Date
Date the vacancy indicator was collected

✓		date
padus_public_access
premium	PAD-US Public Access Designation
United States Geological Survey Protected Areas Database of the United States Public Access designation.

Examples: Open Access, Restricted Access, Unknown (Closed), Closed

✓		text
lbcs_activity
premium	Land Use Code: Activity
Actual activity on land, eg farming, shopping, manufacturing.

✓		numeric
lbcs_activity_desc
premium	Land Use Code Description: Activity
Description of the LBCS numeric code

✓		text
lbcs_function
premium	Land Use Code: Function
Economic function or type of establishment, eg agricultural, commercial, industrial

✓		numeric
lbcs_function_desc
premium	Land Use Code Description: Function
Economic function or type of establishment, eg agricultural, commercial, industrial

✓		text
lbcs_structure
premium	Land Use Code: Structure
Type of structure or building, eg single-family house, office building, warehouse

✓		numeric
lbcs_structure_desc
premium	Land Use Code Description: Structure
Type of structure or building, eg single-family house, office building, warehouse

✓		text
lbcs_site
premium	Land Use Code: Site
What is on the land

✓		numeric
lbcs_site_desc
premium	Land Use Code Description: Site
What is on the land

✓		text
lbcs_ownership
premium	Land Use Code: Ownership
Ownership structure, eg public, private

✓		numeric
lbcs_ownership_desc
premium	Land Use Code Description: Ownership
Ownership structure, eg public, private

✓		text
housing_affordability_index
premium	Housing Affordability Index
Housing Affordability Index (HAI) measures the ability of a typical resident to purchase a home in the geographic area. The HAI has a base of 100, representing where the median income is sufficient to qualify for a loan on a median-valued home and not be cost-burdened (cost-burdened=greater than 30% of income spent on housing). HAI values > 100 indicate increasing affordability; HAI values < 100 indicate areas where homes are less affordable and median income might be insufficient to purchase a median-valued home. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
population_density
premium	Population Density
Estimate of the Population Density (population per Square Mile) in the geographic area. Population density is computed by dividing the total population within the geographic area by the total land area, measured in square miles. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
population_growth_past_5_years
premium	Population Growth (CAGR) past 5 years
Population Compound Annual Growth Rate (CAGR) for the previous 5 year period, is an annualized measure describing the direction (either positive or negative) and magnitude of change in the total number of persons between the previous 5 years. Annualized means that the resultant value reflects a rate of change over a twelve-month time period. This permits analysis of multiple growth rates between values measured at differing points in time using a common time period of twelve months; the annualized growth rate is repeated, or compounded, each year. The CAGR is sometimes referred to as growth rate, annual rate, annualized growth rate, or compound growth rate. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
population_growth_next_5_years
premium	Population Growth (CAGR) next 5 years
Five-year forecast for Population Growth, Compound Annual Growth Rate (CAGR). The Population Growth CAGR is an annualized measure that describes the direction (either positive or negative) and magnitude of change in population between the current year and that year plus 5. The CAGR is sometimes referred to as growth rate, annual rate, annualized growth rate, or compound growth rate. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
housing_growth_past_5_years
premium	Housing Units Growth (CAGR) past 5 years
Housing Units Compound Annual Growth Rate (CAGR) for the previous five year period, is an annualized measure describing the direction (either positive or negative) and magnitude of change in the total number of housing units between the previous 5 years. Annualized means that the resultant value reflects a rate of change over a twelve-month time period. This permits analysis of multiple growth rates between values measured at differing points in time using a common time period of twelve months; the annualized growth rate is repeated, or compounded, each year. The CAGR is sometimes referred to as growth rate, annual rate, annualized growth rate, or compound growth rate. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
housing_growth_next_5_years
premium	Housing Units Growth (CAGR) next 5 years
Five-year forecast for Housing Units Compound Annual Growth Rate (CAGR). The Housing Unit CAGR is an annualized measure that describes the direction (either positive or negative) and magnitude of change in total housing units between the current year and that year plus 5. The CAGR is sometimes referred to as growth rate, annual rate, annualized growth rate, or compound growth rate. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
household_income_growth_next_5_years
premium	Median Household Income Growth (CAGR) next 5 years
Five-year forecast for Median Household Income Compound Annual Growth Rate (CAGR). The Median Household Income CAGR is an annualized measure that describes the direction (either positive or negative) and magnitude of change in the total Median Household Income between the current year and that year plus 5. The CAGR is sometimes referred to as growth rate, annual rate, annualized growth rate, or compound growth rate. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
median_household_income
premium	Median Household Income (current year)
Estimate of Median Household Income in the geographic area for the previous year. Median Household Income is the amount that divides household income (annual income for all household earners age 15+) into two equal groups in a geographic area; half of the population will have income higher than the median and half will have lower income. If the median falls in the upper income interval of $200,000+, it is represented by the value of $200,001. Esri uses the U.S. Census definition of income. This attribute is calculated at the Census Block Group in which the parcel is located. Source US Census Bureau via Esri. Updated each July representing previous year.

✓		numeric
transmission_line_distance
premium	Distance to Transmission line
Sourced from HIFLD; provides the distance from the parcel boundary to the nearest relatively high voltage (69kv - 765kv) electric transmission line as available within the Homeland Infrastructure Foundation-Level Data (HIFLD) Transmission Line dataset

✓		numeric
roughness_rating
premium	Roughness Rating
The amount of elevation variability within a parcel. Calculated per parcel from Digital Elevation Model (DEM). 0-80m is considered to represent a level terrain surface; 81-116m represents a nearly level surface; 117-161m represents a slightly rugged surface; 162-239m represents an intermediately rugged surface; 240-497m represents a moderately rugged surface; 498-958m represents a highly rugged surface; 959-4367m represents an extremely rugged surface.

✓		numeric
highest_parcel_elevation
premium	Highest Parcel Elevation
Highest elevation value (meters) intersecting the parcel calculated using best available terrain data. Calculated for each parcel.

✓		numeric
lowest_parcel_elevation
premium	Lowest Parcel Elevation
Lowest elevation value (meters) intersecting the parcel calculated using best available terrain data. Calculated for each parcel.

✓		numeric