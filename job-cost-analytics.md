# Construction & Job Costing Analytics Module

**Database Context:** `dgdcyxadp_live`  
**Domain:** Yardi Construction Module (Job Cost)

---

## 1. Performance Layer (Indexes)

These indexes must be present to ensure sub-second response times for dashboard queries.

| Object Name | Table | Columns Indexed | Purpose |
|-------------|-------|-----------------|---------|
| IX_TRANS_WebLookup | TRANS | HMY | The Header Link. Optimizes joining Transaction Headers (Date, Description, Total) to Line Item Details. |
| IX_JOBDETL_BudgetLookup | JOBDETL | HJOB, HCATEG | The Budget Link. Enables instant lookup of Original & Revised Budgets per Cost Code. |
| IX_DRAWCHG_BudgetLookup | DRAWCHG | HJOB, HCATEG | The Change Order Link. Optimizes summing up authorized Change Order amounts per line item. |

---

## 2. Core View: Transaction Details

**View Name:** `[dbo].[vw_Web_ConstructionDraws_Consolidated]`  
**Role:** The "Source of Truth" for individual invoice line items. Use this for **Drill-Down grids**.

### Key Logic & Transformations

- **Property Linking:** Joins via `HPROPERTY` (not HPROP) to correctly link Multi-Entity jobs (Dev vs. Construction) to a single Property.
- **Job Naming:** Implements fallback logic (`SDESC -> SBRIEFDESC -> SCODE`) to ensure no "NULL" Job Names appear.
- **Change Order Flag:** Flags specific line items as Change Orders if `CCHG` is not 0.
- **Description Logic:** Replaces generic "Charge From Costs" strings with the actual Cost Code Description.

### Schema Output (TypeScript)

```typescript
interface ConstructionDrawDetail {
    // Identifiers
    Draw_ID: number;                // Primary Key (TRANS.HMY)
    Detail_ID: number;              // Line Item Key (DRAWDET.HMY)
    Job_ID: number;                 // Yardi Job ID
    Category_ID: number;            // Cost Code ID
    Contract_ID: number;

    // Context
    Job_Code: string;               // e.g., "402175"
    Job_Name: string;               // e.g., "The Central - Construction"
    Property_Code: string;          // e.g., "402175" (Searchable by User)
    Draw_Number: string;            // e.g., "14" or "Pending"
    Draw_Date: Date;
    Draw_Status: string;            // "Open" or "Closed/Paid"

    // Line Item Data
    Cost_Code: string;              // e.g., "03-3000"
    Line_Item_Desc: string;         // e.g., "Concrete Formwork"
    Vendor_Invoice_Num: string;     // Vendor's Ref #

    // Financials
    Line_Item_Amount: number;       // The Billed Amount for this line
    Retainage_Held: number;         // Amount held back
    Billing_Is_Change_Order: number;// Amount of this line that is CO
    Total_Authorized_CO_Budget: number; // Total approved COs for this code
}
```

---

## 3. Analytics View: Master Job Cost Matrix

**View Name:** `[dbo].[vw_Web_JobCost_Master_Matrix]`  
**Role:** The "Aggregation Engine" for **Dashboards and Pivot Grids**.  
**Capabilities:** Budget vs. Actuals, Hard/Soft Cost Grouping, Draw Phasing.

### Key Logic & Transformations

- **FULL OUTER JOIN:** Merges JOBDETL (Budget) and DRAWDET (Actuals). This ensures you see:
  - Items Budgeted but not spent.
  - Items Spent but not budgeted (Overages).
  - Items matched perfectly.
- **Cost Grouping:** Implements business logic based on Cost Code prefixes:
  - `01-49`: Hard Costs
  - `50`: Land / Acquisition
  - `51-90`: Soft Costs
- **Budget Math:** Calculates `Revised_Budget` as `Original_Budget + SREVISION` (ignoring the legacy char column).

### Schema Output (TypeScript)

```typescript
interface JobCostMatrixRow {
    // Dimensions (Group By these)
    Job_ID: number;
    Job_Name: string;
    Cost_Group: string;             // "Hard Costs", "Soft Costs", etc.
    Cost_Code: string;              // "03-3000"
    Category_Name: string;          // "Concrete"
    
    // Matrix Pivot Column
    Draw_Number: string;            // Pivot this to create columns
    Draw_Date: Date;

    // Metrics (The Cell Values)
    Original_Budget: number;        // Baseline
    Revised_Budget: number;         // Current Limit
    
    Base_Contract_Billed: number;   // Spent (Original Scope)
    CO_Billed: number;              // Spent (Change Orders)
    Total_Billed_This_Draw: number; // Total Spent (The number to show in grid)
    
    Total_Authorized_CO_Budget: number; // Use to calc Variance
}
```

---

## 4. UI Query Patterns

Copy these patterns into your API Service layer.

### Pattern A: The Executive Dashboard

**Use Case:** High-level "Percent Complete" pie charts and summaries.

```sql
-- Input: Array of Job IDs belonging to the Property (e.g., 183, 184)
SELECT 
    Cost_Group,
    SUM(Revised_Budget) AS Total_Budget,
    SUM(Total_Billed_This_Draw) AS Total_Spent,
    (SUM(Total_Billed_This_Draw) / NULLIF(SUM(Revised_Budget),0)) AS Pct_Complete
FROM dbo.vw_Web_JobCost_Master_Matrix
WHERE Job_ID IN (@JobIDs)
GROUP BY Cost_Group;
```

### Pattern B: The Draw Grid (The "Spreadsheet" View)

**Use Case:** The main data grid where users see Cost Codes vs. Draws.

```sql
-- Frontend Logic: Fetch this list, then Pivot 'Draw_Number' to columns
SELECT 
    Cost_Group, Category_Name, Cost_Code,
    Original_Budget, Revised_Budget, -- Fixed Columns (Left)
    Draw_Number, Total_Billed_This_Draw -- Dynamic Columns (Right)
FROM dbo.vw_Web_JobCost_Master_Matrix
WHERE Job_ID IN (@JobIDs)
ORDER BY Cost_Code, Draw_Date;
```

### Pattern C: The "Red Flag" Variance Report

**Use Case:** "Show me where we are bleeding money."

```sql
SELECT Cost_Code, Category_Name, 
       (MAX(Revised_Budget) - SUM(Total_Billed_This_Draw)) AS Remaining_Balance
FROM dbo.vw_Web_JobCost_Master_Matrix
WHERE Job_ID IN (@JobIDs)
GROUP BY Cost_Code, Category_Name
HAVING (MAX(Revised_Budget) - SUM(Total_Billed_This_Draw)) < 0 -- Over Budget!
ORDER BY Remaining_Balance ASC;
```

---

## Implementation Notes

When building the Job Cost module for the dashboard, use:
- `vw_Web_ConstructionDraws_Consolidated` for drill-down detail views
- `vw_Web_JobCost_Master_Matrix` for aggregated dashboards and pivot grids
- Filter by `Job_ID` or `Property_Code` based on the user context
