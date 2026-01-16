'use client'

import { useState } from 'react'
import { X, Send, Save, Clock, Users, Calendar, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { voucherRequestsApi, VoucherRequestCustomer, Partner, TicketCategory } from '@/lib/api-client'

interface SlotData {
  activityAvailabilityId: number
  activityId: string
  activityTitle: string
  visitDate: string
  startTime: string
  diff: number
  bookings: {
    firstName: string
    lastName: string
    paxCount: number
  }[]
}

interface VoucherRequestDialogProps {
  slot: SlotData
  ticketCategory: TicketCategory & { partners?: Partner }
  onClose: () => void
  onSuccess: () => void
}

export default function VoucherRequestDialog({
  slot,
  ticketCategory,
  onClose,
  onSuccess
}: VoucherRequestDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    requestedQuantity: Math.abs(slot.diff),
    entryTime: slot.startTime || '',
    notes: ''
  })

  // Customer names from bookings
  const customerNames: VoucherRequestCustomer[] = slot.bookings.map(b => ({
    first_name: b.firstName,
    last_name: b.lastName,
    pax_count: b.paxCount
  }))

  const totalPax = customerNames.reduce((sum, c) => sum + c.pax_count, 0)

  // Format date for display
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  const handleSaveDraft = async () => {
    if (!ticketCategory.partner_id) {
      setError('No partner linked to this category')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await voucherRequestsApi.create({
        activity_availability_id: slot.activityAvailabilityId,
        ticket_category_id: ticketCategory.id,
        partner_id: ticketCategory.partner_id,
        requested_quantity: formData.requestedQuantity,
        visit_date: slot.visitDate,
        entry_time: formData.entryTime || undefined,
        activity_name: slot.activityTitle,
        customer_names: customerNames,
        total_pax: totalPax,
        notes: formData.notes || undefined
      })

      if (result.error) throw new Error(result.error)

      setSuccess('Draft saved successfully')
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err) {
      console.error('Error saving draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  const handleSendRequest = async () => {
    if (!ticketCategory.partner_id) {
      setError('No partner linked to this category')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // First create the request
      const createResult = await voucherRequestsApi.create({
        activity_availability_id: slot.activityAvailabilityId,
        ticket_category_id: ticketCategory.id,
        partner_id: ticketCategory.partner_id,
        requested_quantity: formData.requestedQuantity,
        visit_date: slot.visitDate,
        entry_time: formData.entryTime || undefined,
        activity_name: slot.activityTitle,
        customer_names: customerNames,
        total_pax: totalPax,
        notes: formData.notes || undefined
      })

      if (createResult.error) throw new Error(createResult.error)

      // Then send it
      const requestId = createResult.data?.id
      if (!requestId) throw new Error('Failed to get request ID')

      const sendResult = await voucherRequestsApi.send(requestId)
      if (sendResult.error) throw new Error(sendResult.error)

      setSuccess('Request sent to partner successfully!')
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err) {
      console.error('Error sending request:', err)
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setLoading(false)
    }
  }

  const partner = ticketCategory.partners

  // Get available times from partner, with fallback to defaults
  const availableTimes = partner?.available_times?.length
    ? partner.available_times
    : ['09:00', '10:00', '11:00', '12:00']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-teal-500 rounded-t-lg">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-white">Richiesta Voucher</h2>
              <p className="text-white/80 text-sm mt-1">Richiedi biglietti al partner</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* Service Info Card */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Dettagli Servizio</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Data</p>
                  <p className="font-medium">{formatDate(slot.visitDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Orario</p>
                  <p className="font-medium">{slot.startTime || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Attivita</p>
                  <p className="font-medium">{slot.activityTitle}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Partner Info */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-teal-700 mb-2">Partner</h3>
            {partner ? (
              <div>
                <p className="font-medium text-teal-900">{partner.name}</p>
                <p className="text-sm text-teal-700">{partner.email}</p>
              </div>
            ) : (
              <p className="text-sm text-red-600">
                Nessun partner collegato a questa categoria. Configura un partner nelle impostazioni della categoria.
              </p>
            )}
          </div>

          {/* Quantity Input */}
          <div className="mb-6">
            <Label className="text-sm font-medium mb-2 block">
              Quantita Richiesta <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={formData.requestedQuantity}
                onChange={(e) => setFormData({...formData, requestedQuantity: parseInt(e.target.value) || 1})}
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg font-semibold"
              />
              <span className="text-sm text-gray-500">
                (Differenza attuale: <span className="text-red-600 font-medium">{slot.diff}</span>)
              </span>
            </div>
          </div>

          {/* Entry Time Selection */}
          <div className="mb-6">
            <Label className="text-sm font-medium mb-2 block">Orario di Ingresso</Label>
            <div className="flex flex-wrap gap-2">
              {availableTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setFormData({...formData, entryTime: time})}
                  className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                    formData.entryTime === time
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          {/* Customer List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Elenco Partecipanti</Label>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Users className="w-4 h-4" />
                <span>{totalPax} persone</span>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nome</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cognome</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Pax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customerNames.map((customer, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-2 text-sm">{customer.first_name || '-'}</td>
                      <td className="px-4 py-2 text-sm">{customer.last_name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-teal-600">{customer.pax_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-orange-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-sm font-medium">Totale</td>
                    <td className="px-4 py-2 text-sm text-right font-bold text-orange-600">{totalPax}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <Label className="text-sm font-medium mb-2 block">Note</Label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Note aggiuntive per il partner..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-lg flex justify-between items-center">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Annulla
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={loading || !partner}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salva Bozza'}
            </Button>
            <Button
              type="button"
              onClick={handleSendRequest}
              disabled={loading || !partner}
              className="bg-teal-600 hover:bg-teal-700 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Invio...' : 'Invia Richiesta'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
