'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar, ChevronLeft, ChevronRight, User, Clock, Users, UserCheck, Paperclip, Upload, X, Mail, FileText, Send, Loader2 } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'
import { Button } from '@/components/ui/button'

interface Person {
  id: string
  first_name: string
  last_name: string
  email?: string
}

interface Attachment {
  id: string
  file_name: string
  file_path: string
  file_size?: number
}

interface ServiceSlot {
  id: number
  activity_id: string
  activity_title: string
  local_date: string
  local_time: string
  vacancy_sold: number
  vacancy_opening: number
  guides: Person[]
  escorts: Person[]
  attachments: Attachment[]
}

export default function UpcomingServicesPage() {
  const [services, setServices] = useState<ServiceSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [excludedActivityIds, setExcludedActivityIds] = useState<string[]>([])

  // Attachment upload states
  const [uploadingFor, setUploadingFor] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Email modal states
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailService, setEmailService] = useState<ServiceSlot | null>(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchExcludedActivities()
  }, [])

  useEffect(() => {
    if (excludedActivityIds !== null) {
      fetchServices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, excludedActivityIds])

  const fetchExcludedActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('guide_calendar_settings')
        .select('setting_value')
        .eq('setting_key', 'excluded_activity_ids')
        .single()

      if (error) {
        setExcludedActivityIds([])
        return
      }

      if (data?.setting_value) {
        setExcludedActivityIds(data.setting_value as string[])
      }
    } catch {
      setExcludedActivityIds([])
    }
  }

  const fetchServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')

      // Fetch activity availabilities for the selected date
      const { data: availabilities, error: availError } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_date, local_time, vacancy_sold, vacancy_opening')
        .eq('local_date', dateStr)
        .gt('vacancy_sold', 0)
        .neq('local_time', '00:00:00')
        .order('local_time', { ascending: true })

      if (availError) throw availError

      if (!availabilities || availabilities.length === 0) {
        setServices([])
        return
      }

      // Filter out excluded activities
      const filteredAvailabilities = excludedActivityIds.length > 0
        ? availabilities.filter(a => !excludedActivityIds.includes(a.activity_id))
        : availabilities

      if (filteredAvailabilities.length === 0) {
        setServices([])
        return
      }

      const availabilityIds = filteredAvailabilities.map(a => a.id)
      const activityIds = [...new Set(filteredAvailabilities.map(a => a.activity_id))]

      // Fetch activity titles
      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
        acc[a.activity_id] = a.title
        return acc
      }, {})

      // Fetch guide assignments with email
      const { data: guideAssignments, error: guideError } = await supabase
        .from('guide_assignments')
        .select(`
          activity_availability_id,
          guide:guides (
            guide_id,
            first_name,
            last_name,
            email
          )
        `)
        .in('activity_availability_id', availabilityIds)

      if (guideError) throw guideError

      // Fetch escort assignments with email
      const { data: escortAssignments, error: escortError } = await supabase
        .from('escort_assignments')
        .select(`
          activity_availability_id,
          escort:escorts (
            escort_id,
            first_name,
            last_name,
            email
          )
        `)
        .in('activity_availability_id', availabilityIds)

      if (escortError) throw escortError

      // Fetch attachments for these availabilities
      const { data: attachmentsData } = await supabase
        .from('service_attachments')
        .select('id, activity_availability_id, file_name, file_path, file_size')
        .in('activity_availability_id', availabilityIds)

      // Group attachments by availability id
      const attachmentsByAvailability = new Map<number, Attachment[]>()
      attachmentsData?.forEach(att => {
        const existing = attachmentsByAvailability.get(att.activity_availability_id) || []
        existing.push({
          id: att.id,
          file_name: att.file_name,
          file_path: att.file_path,
          file_size: att.file_size
        })
        attachmentsByAvailability.set(att.activity_availability_id, existing)
      })

      // Group assignments by availability id
      const guidesByAvailability = new Map<number, Person[]>()
      guideAssignments?.forEach(ga => {
        const guide = Array.isArray(ga.guide) ? ga.guide[0] : ga.guide
        if (!guide) return
        const existing = guidesByAvailability.get(ga.activity_availability_id) || []
        existing.push({
          id: guide.guide_id,
          first_name: guide.first_name,
          last_name: guide.last_name,
          email: guide.email
        })
        guidesByAvailability.set(ga.activity_availability_id, existing)
      })

      const escortsByAvailability = new Map<number, Person[]>()
      escortAssignments?.forEach(ea => {
        const escort = Array.isArray(ea.escort) ? ea.escort[0] : ea.escort
        if (!escort) return
        const existing = escortsByAvailability.get(ea.activity_availability_id) || []
        existing.push({
          id: escort.escort_id,
          first_name: escort.first_name,
          last_name: escort.last_name,
          email: escort.email
        })
        escortsByAvailability.set(ea.activity_availability_id, existing)
      })

      // Build service slots - only include slots with at least one guide or escort
      const serviceSlots: ServiceSlot[] = filteredAvailabilities
        .map(avail => {
          const guides = guidesByAvailability.get(avail.id) || []
          const escorts = escortsByAvailability.get(avail.id) || []
          const attachments = attachmentsByAvailability.get(avail.id) || []

          // Only include if there's at least one assignment
          if (guides.length === 0 && escorts.length === 0) return null

          return {
            id: avail.id,
            activity_id: avail.activity_id,
            activity_title: activitiesMap[avail.activity_id] || 'Unknown Activity',
            local_date: avail.local_date,
            local_time: avail.local_time,
            vacancy_sold: avail.vacancy_sold || 0,
            vacancy_opening: avail.vacancy_opening || 0,
            guides,
            escorts,
            attachments
          }
        })
        .filter((s): s is ServiceSlot => s !== null)

      setServices(serviceSlots)
    } catch (err) {
      console.error('Error fetching services:', err)
      setError('Failed to load services')
    } finally {
      setLoading(false)
    }
  }

  const goToPreviousDay = () => {
    setSelectedDate(prev => addDays(prev, -1))
  }

  const goToNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1))
  }

  const goToToday = () => {
    setSelectedDate(startOfDay(new Date()))
  }

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, serviceId: number) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploadingFor(serviceId)

    try {
      for (const file of Array.from(files)) {
        // Only allow PDFs
        if (file.type !== 'application/pdf') {
          setError('Only PDF files are allowed')
          continue
        }

        // Upload to Supabase Storage
        const fileName = `${serviceId}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('service-attachments')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload error:', uploadError)
          setError('Failed to upload file')
          continue
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('service-attachments')
          .getPublicUrl(fileName)

        // Save attachment record
        const { error: dbError } = await supabase
          .from('service_attachments')
          .insert({
            activity_availability_id: serviceId,
            file_name: file.name,
            file_path: urlData.publicUrl,
            file_size: file.size
          })

        if (dbError) {
          console.error('DB error:', dbError)
          setError('Failed to save attachment record')
        }
      }

      // Refresh services to show new attachments
      await fetchServices()
    } catch (err) {
      console.error('Error uploading:', err)
      setError('Failed to upload file')
    } finally {
      setUploadingFor(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Delete attachment
  const handleDeleteAttachment = async (attachment: Attachment) => {
    if (!confirm(`Delete ${attachment.file_name}?`)) return

    try {
      // Extract storage path from URL
      const urlParts = attachment.file_path.split('/service-attachments/')
      const storagePath = urlParts[1]

      if (storagePath) {
        await supabase.storage
          .from('service-attachments')
          .remove([storagePath])
      }

      // Delete from database
      await supabase
        .from('service_attachments')
        .delete()
        .eq('id', attachment.id)

      // Refresh services
      await fetchServices()
    } catch (err) {
      console.error('Error deleting attachment:', err)
      setError('Failed to delete attachment')
    }
  }

  // Open email modal
  const openEmailModal = (service: ServiceSlot) => {
    setEmailService(service)
    setEmailSubject(`Service Assignment: ${service.activity_title} - ${format(new Date(service.local_date), 'MMM d, yyyy')} at ${service.local_time.substring(0, 5)}`)
    setEmailBody(`Hello {{name}},

You have been assigned to the following service:

Activity: ${service.activity_title}
Date: ${format(new Date(service.local_date), 'EEEE, MMMM d, yyyy')}
Time: ${service.local_time.substring(0, 5)}
Participants: ${service.vacancy_sold} pax

${service.attachments.length > 0 ? 'Please find the attached documents for this service.\n' : ''}
Best regards,
Tourmageddon Team`)

    // Pre-select all recipients with emails
    const allRecipients: string[] = []
    service.guides.forEach(g => {
      if (g.email) allRecipients.push(`guide:${g.id}`)
    })
    service.escorts.forEach(e => {
      if (e.email) allRecipients.push(`escort:${e.id}`)
    })
    setSelectedRecipients(allRecipients)
    setIncludeAttachments(true)
    setEmailSuccess(null)
    setShowEmailModal(true)
  }

  // Toggle recipient selection
  const toggleRecipient = (recipientKey: string) => {
    setSelectedRecipients(prev =>
      prev.includes(recipientKey)
        ? prev.filter(r => r !== recipientKey)
        : [...prev, recipientKey]
    )
  }

  // Send email
  const handleSendEmail = async () => {
    if (!emailService || selectedRecipients.length === 0) return

    setSendingEmail(true)
    setError(null)

    try {
      // Build recipients list
      const recipients: { email: string; name: string; type: 'guide' | 'escort'; id: string }[] = []

      selectedRecipients.forEach(key => {
        const [type, id] = key.split(':')
        if (type === 'guide') {
          const guide = emailService.guides.find(g => g.id === id)
          if (guide?.email) {
            recipients.push({
              email: guide.email,
              name: `${guide.first_name} ${guide.last_name}`,
              type: 'guide',
              id: guide.id
            })
          }
        } else if (type === 'escort') {
          const escort = emailService.escorts.find(e => e.id === id)
          if (escort?.email) {
            recipients.push({
              email: escort.email,
              name: `${escort.first_name} ${escort.last_name}`,
              type: 'escort',
              id: escort.id
            })
          }
        }
      })

      if (recipients.length === 0) {
        setError('No valid recipients with email addresses')
        return
      }

      // Get attachment URLs if including attachments
      const attachmentUrls = includeAttachments
        ? emailService.attachments.map(a => a.file_path)
        : []

      // Send email via API
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          subject: emailSubject,
          body: emailBody,
          activityAvailabilityId: emailService.id,
          attachmentUrls
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send emails')
      }

      setEmailSuccess(`Successfully sent ${result.sent} email(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`)

      // Close modal after 2 seconds on success
      setTimeout(() => {
        setShowEmailModal(false)
        setEmailService(null)
      }, 2000)
    } catch (err) {
      console.error('Error sending email:', err)
      setError(err instanceof Error ? err.message : 'Failed to send emails')
    } finally {
      setSendingEmail(false)
    }
  }

  // Group services by time
  const groupedByTime = services.reduce((acc, service) => {
    const time = service.local_time
    if (!acc[time]) {
      acc[time] = []
    }
    acc[time].push(service)
    return acc
  }, {} as Record<string, ServiceSlot[]>)

  const timeSlots = Object.keys(groupedByTime).sort()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Upcoming Services</h1>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf"
        multiple
        onChange={(e) => {
          if (uploadingFor) {
            handleFileUpload(e, uploadingFor)
          }
        }}
      />

      {/* Date Navigation */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                <span className="text-xl font-semibold">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
            </div>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Today
            </button>
          </div>

          <button
            onClick={goToNextDay}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">Dismiss</button>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading services...</div>
        </div>
      ) : timeSlots.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Services Scheduled</h3>
          <p className="text-gray-500">
            There are no assigned services for {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {timeSlots.map(time => (
            <div key={time}>
              {/* Time Header */}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-600">
                  {time.substring(0, 5)}
                </span>
              </div>

              {/* Services for this time */}
              <div className="space-y-2 ml-6">
                {groupedByTime[time].map(service => (
                  <div key={service.id} className="bg-white rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Activity Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {service.activity_title}
                        </h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                          <Users className="w-4 h-4" />
                          <span>{service.vacancy_sold} pax</span>
                        </div>
                      </div>

                      {/* Staff */}
                      <div className="flex gap-4 text-sm">
                        {service.guides.length > 0 && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-purple-600" />
                            <span className="text-gray-700">
                              {service.guides.map(g => g.first_name).join(', ')}
                            </span>
                          </div>
                        )}
                        {service.escorts.length > 0 && (
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-green-600" />
                            <span className="text-gray-700">
                              {service.escorts.map(e => e.first_name).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Paperclip className="w-4 h-4 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {service.attachments.length} attachment{service.attachments.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUploadingFor(service.id)
                              fileInputRef.current?.click()
                            }}
                            disabled={uploadingFor === service.id}
                            className="h-7 text-xs"
                          >
                            {uploadingFor === service.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3 mr-1" />
                            )}
                            Add PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEmailModal(service)}
                            className="h-7 text-xs"
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            Send Email
                          </Button>
                        </div>
                      </div>

                      {/* Attachment List */}
                      {service.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {service.attachments.map(att => (
                            <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                              <a
                                href={att.file_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-blue-600 hover:underline truncate"
                              >
                                <FileText className="w-3 h-3" />
                                {att.file_name}
                              </a>
                              <button
                                onClick={() => handleDeleteAttachment(att)}
                                className="text-gray-400 hover:text-red-600 p-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && emailService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">Send Email</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {emailService.activity_title} - {emailService.local_time.substring(0, 5)}
                </p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Success Message */}
              {emailSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-700">{emailSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Recipients */}
              <div>
                <label className="block text-sm font-medium mb-2">Recipients</label>
                <div className="border rounded-lg p-3 space-y-2">
                  {emailService.guides.length > 0 && (
                    <div>
                      <span className="text-xs text-purple-600 font-medium">Guides</span>
                      <div className="mt-1 space-y-1">
                        {emailService.guides.map(guide => (
                          <label key={guide.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(`guide:${guide.id}`)}
                              onChange={() => toggleRecipient(`guide:${guide.id}`)}
                              disabled={!guide.email}
                              className="rounded"
                            />
                            <span className={!guide.email ? 'text-gray-400' : ''}>
                              {guide.first_name} {guide.last_name}
                              {guide.email ? ` (${guide.email})` : ' (no email)'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {emailService.escorts.length > 0 && (
                    <div className={emailService.guides.length > 0 ? 'pt-2 border-t' : ''}>
                      <span className="text-xs text-green-600 font-medium">Escorts</span>
                      <div className="mt-1 space-y-1">
                        {emailService.escorts.map(escort => (
                          <label key={escort.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(`escort:${escort.id}`)}
                              onChange={() => toggleRecipient(`escort:${escort.id}`)}
                              disabled={!escort.email}
                              className="rounded"
                            />
                            <span className={!escort.email ? 'text-gray-400' : ''}>
                              {escort.first_name} {escort.last_name}
                              {escort.email ? ` (${escort.email})` : ' (no email)'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {"{{name}}"} to insert recipient&apos;s name
                </p>
              </div>

              {/* Attachments option */}
              {emailService.attachments.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeAttachments}
                      onChange={(e) => setIncludeAttachments(e.target.checked)}
                      className="rounded"
                    />
                    Include {emailService.attachments.length} PDF attachment{emailService.attachments.length !== 1 ? 's' : ''}
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowEmailModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || selectedRecipients.length === 0}
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
