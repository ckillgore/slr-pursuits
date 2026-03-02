import type { HellodataProperty, HellodataUnit, HellodataConcession } from '@/types';

/** Pre-computed metrics for a single comp property, shared across section components */
export interface PropertyMetrics {
    /** Short display name */
    name: string;
    /** The full Hellodata property record */
    property: HellodataProperty;
    /** Units filtered to valid listings */
    units: HellodataUnit[];
    /** All concessions */
    concessions: HellodataConcession[];
    /** Count of currently available units */
    availableUnits: number;
    /** Avg asking rent */
    askingRent: number | null;
    /** Avg effective rent */
    effectiveRent: number | null;
    /** Avg rent per sqft */
    rentPSF: number | null;
}
