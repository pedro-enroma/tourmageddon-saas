import { NextRequest, NextResponse } from 'next/server'
import { evaluateRules } from '@/lib/notification-rules-engine'

// POST - Evaluate rules for a given trigger event
// This endpoint can be called from external systems (e.g., booking-webhook-system)
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error('Invalid webhook secret for rule evaluation')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { trigger, data } = body

    if (!trigger) {
      return NextResponse.json({ error: 'trigger is required' }, { status: 400 })
    }

    console.log(`[Rules Evaluate API] Evaluating rules for trigger: ${trigger}`)
    console.log(`[Rules Evaluate API] Data:`, JSON.stringify(data, null, 2))

    await evaluateRules({
      trigger,
      data: data || {}
    })

    return NextResponse.json({
      success: true,
      message: `Rules evaluated for trigger: ${trigger}`
    })
  } catch (error) {
    console.error('[Rules Evaluate API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to evaluate rules', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
