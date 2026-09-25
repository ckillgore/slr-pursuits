import { fetchJobsForProperty } from '@/app/actions/accounting';

/**
 * Yardi job ids for a pursuit's accounting entities — the one rule shared by the
 * Pursuit Costs tab and the Pre-Dev Budget's Yardi actuals, so the two can't drift:
 * an entity with an explicit job_id contributes only that job (a GP entity can carry
 * many unrelated jobs); an entity without one contributes every job on its property.
 */
export async function resolvePursuitJobIds(
    entities: { property_code: string | null | undefined; job_id?: number | string | null }[],
): Promise<string[]> {
    const ids = new Set<string>();
    const propertiesNeedingJobs = new Set<string>();
    for (const e of entities) {
        if (e.job_id !== null && e.job_id !== undefined && e.job_id !== '') ids.add(String(e.job_id));
        else if (e.property_code) propertiesNeedingJobs.add(e.property_code);
    }
    // Discover jobs for all job-less properties in parallel rather than one round trip each
    const discovered = await Promise.all(Array.from(propertiesNeedingJobs, (code) => fetchJobsForProperty(code)));
    for (const list of discovered) for (const id of list) ids.add(String(id));
    return Array.from(ids);
}
