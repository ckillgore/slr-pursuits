-- AM-5: Job Cost Transaction Subledger
CREATE OR ALTER VIEW [dbo].[vw_AM_JobCost_Transactions] AS
SELECT 
    jc.HMY AS TransactionID,
    ISNULL(jc.HJOB, jp.hJob) AS JobID,
    c.SCODE AS CostCategoryCode,
    jc.UPOSTDATE AS PostDate,
    jc.SDATEOCCURRED AS InvoiceDate,
    ISNULL(jc.SAMOUNT, 0) AS Amount,
    jc.UREF AS VendorInvoiceNum,
    jc.SNOTES AS LineDescription
FROM dbo.JCDETAIL jc WITH (NOLOCK)
INNER JOIN dbo.CATEGORY c WITH (NOLOCK) ON jc.HCATEG = c.HMY
LEFT JOIN dbo.JOBPROPS jp WITH (NOLOCK) ON jc.HPROP = jp.hProp
WHERE jc.HCATEG IS NOT NULL 
AND jc.VOID = 0;
