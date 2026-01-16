import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

export interface ActivityPartnerMapping {
  id: string
  activity_id: string
  partner_id: string
  ticket_category_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  partners?: {
    partner_id: string
    name: string
    email: string
  }
  ticket_categories?: {
    id: string
    name: string
  }
}

// GET - List all mappings
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('activity_partner_mappings')
      .select(`
        *,
        partners (
          partner_id,
          name,
          email
        ),
        ticket_categories (
          id,
          name
        )
      `)
      .order('activity_id', { ascending: true })

    if (error) {
      console.error('Error fetching mappings:', error)
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new mapping
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_id, partner_id, ticket_category_id, notes } = body

    if (!activity_id) {
      return NextResponse.json({ error: 'activity_id is required' }, { status: 400 })
    }

    if (!partner_id) {
      return NextResponse.json({ error: 'partner_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('activity_partner_mappings')
      .insert([{
        activity_id,
        partner_id,
        ticket_category_id: ticket_category_id || null,
        notes: notes || null
      }])
      .select(`
        *,
        partners (
          partner_id,
          name,
          email
        ),
        ticket_categories (
          id,
          name
        )
      `)
      .single()

    if (error) {
      console.error('Error creating mapping:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This activity is already mapped to this partner' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update mapping
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, activity_id, partner_id, ticket_category_id, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('activity_partner_mappings')
      .update({
        activity_id,
        partner_id,
        ticket_category_id: ticket_category_id || null,
        notes: notes || null
      })
      .eq('id', id)
      .select(`
        *,
        partners (
          partner_id,
          name,
          email
        ),
        ticket_categories (
          id,
          name
        )
      `)
      .single()

    if (error) {
      console.error('Error updating mapping:', error)
      return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete mapping
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { error } = await supabase
      .from('activity_partner_mappings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting mapping:', error)
      return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
