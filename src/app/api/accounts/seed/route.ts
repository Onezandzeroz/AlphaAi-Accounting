import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/session'
import { getDemoFilter } from '@/lib/demo-filter'
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts'

export async function POST(request: Request) {
  try {
    // Authenticate the user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current demo mode to seed the correct accounts
    const demoFilter = await getDemoFilter(user.id)

    // Seed the standard Danish chart of accounts
    const count = await seedChartOfAccounts(user.id, demoFilter.isDemo)

    return NextResponse.json({ seeded: true, count })
  } catch (error) {
    console.error('[Seed Chart of Accounts] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
