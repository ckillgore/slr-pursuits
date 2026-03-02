import type { HellodataProperty, HellodataUnit, HellodataConcession } from '@/types';

/** Pre-computed metrics for a single comp property, shared across section components */
export interface PropertyMetrics {
    /** Short display name */
    name: string;
    /** Full address */
    address: string;
    /** The full Hellodata property record */
    property: HellodataProperty;
    /** Units filtered to valid listings */
    units: HellodataUnit[];
    /** All concessions */
    concessions: HellodataConcession[];
    /** Count of currently available units (vacancies) */
    availableUnits: number;
    /** Avg asking rent */
    askingRent: number | null;
    /** Avg effective rent */
    effectiveRent: number | null;
    /** Avg rent per sqft */
    rentPSF: number | null;
    /** Avg sqft */
    avgSqft: number | null;
    /** Bed types present */
    bedTypes: number[];
    /** Primary or secondary comp */
    compType: 'primary' | 'secondary';
    /** Supabase property UUID */
    propertyId: string;
    // New Hellodata-style metrics
    leasedPct: number | null;
    concessionText: string;
    avgDaysOnMarket: number | null;
    avgDaysVacant: number | null;
    vacancies: number;
    concessionPct: number | null;
}
