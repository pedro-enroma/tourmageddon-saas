import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Fetch all assignments (guide, escort, headphone, printing) for given availability IDs
export async function GET(request: NextRequest) {
  const { error: authError } = await verifySession()
  if (authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('availability_ids')

    if (!idsParam) {
      return NextResponse.json({ error: 'availability_ids is required' }, { status: 400 })
    }

    const availabilityIds = idsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))

    if (availabilityIds.length === 0) {
      return NextResponse.json({ data: { guides: [], escorts: [], headphones: [], printing: [] } })
    }

    const supabase = getServiceRoleClient()

    // Fetch all assignment types in parallel for better performance
    const [guideResult, escortResult, headphoneResult, printingResult] = await Promise.all([
      supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          guide:guides (
            guide_id,
            first_name,
            last_name,
            email,
            phone_number
          )
        `)
        .in('activity_availability_id', availabilityIds),
      supabase
        .from('escort_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          escort:escorts (
            escort_id,
            first_name,
            last_name,
            email,
            phone_number
          )
        `)
        .in('activity_availability_id', availabilityIds),
      supabase
        .from('headphone_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          headphone:headphones (
            headphone_id,
            name,
            email,
            phone_number
          )
        `)
        .in('activity_availability_id', availabilityIds),
      supabase
        .from('printing_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          printing:printing (
            printing_id,
            name,
            email,
            phone_number
          )
        `)
        .in('activity_availability_id', availabilityIds)
    ])

    if (guideResult.error) {
      console.error('Error fetching guide assignments:', guideResult.error)
    }
    if (escortResult.error) {
      console.error('Error fetching escort assignments:', escortResult.error)
    }
    if (headphoneResult.error) {
      console.error('Error fetching headphone assignments:', headphoneResult.error)
    }
    if (printingResult.error) {
      console.error('Error fetching printing assignments:', printingResult.error)
    }

    return NextResponse.json({
      data: {
        guides: guideResult.data || [],
        escorts: escortResult.data || [],
        headphones: headphoneResult.data || [],
        printing: printingResult.data || []
      }
    })
  } catch (err) {
    console.error('Assignments fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
