import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// Security limits
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

// POST - Upload attachment to storage and create record
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const activity_availability_id = formData.get('activity_availability_id') as string

    if (!file || !activity_availability_id) {
      return NextResponse.json({ error: 'File and activity_availability_id are required' }, { status: 400 })
    }

    // Security: Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 413 })
    }

    // Security: Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Allowed types: PDF, images, Word, Excel.'
      }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Upload to storage
    const fileName = `${activity_availability_id}/${Date.now()}_${file.name}`
    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('service-attachments')
      .upload(fileName, fileBuffer, {
        contentType: file.type
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('service-attachments')
      .getPublicUrl(fileName)

    // Create attachment record
    const { data, error } = await supabase
      .from('service_attachments')
      .insert({
        activity_availability_id: parseInt(activity_availability_id),
        file_name: file.name,
        file_path: urlData.publicUrl,
        file_size: file.size
      })
      .select()
      .single()

    if (error) {
      // Clean up uploaded file
      await supabase.storage.from('service-attachments').remove([fileName])
      console.error('Attachment record error:', error)
      return NextResponse.json({ error: 'Failed to create attachment record' }, { status: 500 })
    }

    await auditCreate(user.id, user.email, 'service_attachment', data.id, data, ip, userAgent)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Attachment upload error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete attachment from storage and database
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const file_path = searchParams.get('file_path')

    if (!id) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get attachment data for audit
    const { data: attachment } = await supabase
      .from('service_attachments')
      .select('*')
      .eq('id', id)
      .single()

    // Extract storage path from file_path URL
    let storagePath = file_path
    if (storagePath && storagePath.includes('/service-attachments/')) {
      const urlParts = storagePath.split('/service-attachments/')
      storagePath = urlParts[1]
    }

    // Delete from storage
    if (storagePath) {
      await supabase.storage.from('service-attachments').remove([storagePath])
    }

    // Delete database record
    const { error } = await supabase
      .from('service_attachments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting attachment:', error)
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }

    await auditDelete(user.id, user.email, 'service_attachment', id, attachment, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Attachment deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
