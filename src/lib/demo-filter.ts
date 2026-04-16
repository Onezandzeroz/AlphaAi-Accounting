import { db } from '@/lib/db';

/**
 * Get the demo mode filter for queries based on user's demo mode status.
 * - In demo mode: only show isDemo: true records
 * - In live mode: only show isDemo: false records
 */
export async function getDemoFilter(userId: string): Promise<{ isDemo: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { demoModeEnabled: true },
  });

  return { isDemo: user?.demoModeEnabled ?? false };
}

/**
 * Apply demo filter to a Prisma where clause
 */
export function applyDemoFilter<T extends Record<string, any>>(
  baseWhere: T,
  demoFilter: { isDemo: boolean }
): T & { isDemo: boolean } {
  return { ...baseWhere, isDemo: demoFilter.isDemo };
}
