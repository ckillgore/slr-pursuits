-- AM-5: Job Cost Transaction Subledger
CREATE OR ALTER VIEW [dbo].[vw_AM_JobCost_Transactions] AS
SELECT 
    t.HMY AS TransactionID,
    ISNULL(d.HJOB, jp.hJob) AS JobID,
    c.SCODE AS CostCategoryCode,
    t.UPOSTDATE AS PostDate,
    t.SDATEOCCURRED AS InvoiceDate,
    ISNULL(d.CEXP, 0) AS Amount,
    t.UREF AS VendorInvoiceNum,
    t.SNOTES AS LineDescription
FROM dbo.DRAWDET d WITH (NOLOCK)
INNER JOIN dbo.TRANS t WITH (NOLOCK) ON d.HTRAN = t.HMY
INNER JOIN dbo.CATEGORY c WITH (NOLOCK) ON d.HCATEG = c.HMY
LEFT JOIN dbo.JOBPROPS jp WITH (NOLOCK) ON t.HPROP = jp.hProp

UNION ALL

SELECT 
    t.HMY AS TransactionID,
    ISNULL(g.HJOB, jp.hJob) AS JobID,
    c.SCODE AS CostCategoryCode,
    t.UPOSTDATE AS PostDate,
    t.SDATEOCCURRED AS InvoiceDate,
    ISNULL(g.DAMOUNT, 0) AS Amount,
    t.UREF AS VendorInvoiceNum,
    g.sDesc AS LineDescription
FROM dbo.GLDETAIL g WITH (NOLOCK)
INNER JOIN dbo.TRANS t WITH (NOLOCK) ON g.HTRAN = t.HMY
INNER JOIN dbo.CATEGORY c WITH (NOLOCK) ON g.HCATEG = c.HMY
LEFT JOIN dbo.JOBPROPS jp WITH (NOLOCK) ON t.HPROP = jp.hProp
LEFT JOIN dbo.DRAWDET d WITH (NOLOCK) ON d.HTRAN = t.HMY AND d.HCATEG = g.HCATEG
WHERE g.HCATEG IS NOT NULL 
AND t.ITYPE IN (1, 2, 3, 5, 6, 7, 9)
AND d.HMY IS NULL; -- Ensures we don't accidentally duplicate expenses that already flowed through Drawdet
