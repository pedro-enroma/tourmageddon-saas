import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Fetch all assignments (guide, escort, headphone) for given availability IDs
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
      return NextResponse.json({ data: { guides: [], escorts: [], headphones: [] } })
    }

    const supabase = getServiceRoleClient()

    // Fetch guide assignments
    const { data: guideAssignments, error: guideError } = await supabase
      .from('guide_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        guide:guides (
          guide_id,
          first_name,
          last_name
        )
      `)
      .in('activity_availability_id', availabilityIds)

    if (guideError) {
      console.error('Error fetching guide assignments:', guideError)
    }

    // Fetch escort assignments
    const { data: escortAssignments, error: escortError } = await supabase
      .from('escort_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        escort:escorts (
          escort_id,
          first_name,
          last_name
        )
      `)
      .in('activity_availability_id', availabilityIds)

    if (escortError) {
      console.error('Error fetching escort assignments:', escortError)
    }

    // Fetch headphone assignments
    const { data: headphoneAssignments, error: headphoneError } = await supabase
      .from('headphone_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        headphone:headphones (
          headphone_id,
          name
        )
      `)
      .in('activity_availability_id', availabilityIds)

    if (headphoneError) {
      console.error('Error fetching headphone assignments:', headphoneError)
    }

    return NextResponse.json({
      data: {
        guides: guideAssignments || [],
        escorts: escortAssignments || [],
        headphones: headphoneAssignments || []
      }
    })
  } catch (err) {
    console.error('Assignments fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
