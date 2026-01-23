'use client'

import { useState, useEffect } from 'react'
import { voucherRequestsApi, VoucherRequest, VoucherRequestStatus } from '@/lib/api-client'
import {
  FileText, Send, CheckCircle, XCircle, Clock, Eye, Trash2,
  Calendar, Filter, RefreshCw, Building2, Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const STATUS_CONFIG: Record<VoucherRequestStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Bozza', color: 'bg-gray-100 text-gray-800', icon: Clock },
  sent: { label: 'Inviata', color: 'bg-blue-100 text-blue-800', icon: Send },
  fulfilled: { label: 'Completata', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { label: 'Annullata', color: 'bg-red-100 text-red-800', icon: XCircle }
}

export default function VoucherRequestsListPage() {
  const [requests, setRequests] = useState<VoucherRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<VoucherRequestStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modal state
  const [selectedRequest, setSelectedRequest] = useState<VoucherRequest | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    fetchRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo])

  const fetchRequests = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof voucherRequestsApi.list>[0] = {}
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo

      const result = await voucherRequestsApi.list(params)
      if (result.error) throw new Error(result.error)
      setRequests(result.data || [])
    } catch (err) {
      console.error('Error fetching voucher requests:', err)
      setError('Failed to load voucher requests')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (request: VoucherRequest) => {
    if (!confirm('Inviare questa richiesta al partner?')) return

    setActionLoading(request.id)
    try {
      const result = await voucherRequestsApi.send(request.id)
      if (result.error) throw new Error(result.error)
      fetchRequests()
    } catch (err) {
      console.error('Error sending request:', err)
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setActionLoading(null)
    }
  }

  const handleFulfill = async (request: VoucherRequest) => {
    if (!confirm('Contrassegnare questa richiesta come completata?')) return

    setActionLoading(request.id)
    try {
      const result = await voucherRequestsApi.fulfill(request.id)
      if (result.error) throw new Error(result.error)
      fetchRequests()
    } catch (err) {
      console.error('Error fulfilling request:', err)
      setError(err instanceof Error ? err.message : 'Failed to fulfill request')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async () => {
    if (!selectedRequest) return

    setActionLoading(selectedRequest.id)
    try {
      const result = await voucherRequestsApi.cancel(selectedRequest.id, cancelReason)
      if (result.error) throw new Error(result.error)
      setShowCancelModal(false)
      setCancelReason('')
      setSelectedRequest(null)
      fetchRequests()
    } catch (err) {
      console.error('Error cancelling request:', err)
      setError(err instanceof Error ? err.message : 'Failed to cancel request')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (request: VoucherRequest) => {
    if (!confirm('Eliminare questa bozza?')) return

    setActionLoading(request.id)
    try {
      const result = await voucherRequestsApi.delete(request.id)
      if (result.error) throw new Error(result.error)
      fetchRequests()
    } catch (err) {
      console.error('Error deleting request:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete request')
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-teal-600" />
          <h1 className="text-2xl font-bold">Richieste Voucher</h1>
        </div>
        <Button
          onClick={fetchRequests}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          <span>Filtri</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stato</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VoucherRequestStatus | '')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Tutti</option>
              <option value="draft">Bozza</option>
              <option value="sent">Inviata</option>
              <option value="fulfilled">Completata</option>
              <option value="cancelled">Annullata</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Dal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Al</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Requests Table */}
      {loading ? (
        <div className="text-center py-8">Caricamento...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attivita</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pax</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stato</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Nessuna richiesta trovata
                  </td>
                </tr>
              ) : (
                requests.map((request) => {
                  const statusConfig = STATUS_CONFIG[request.status]
                  const StatusIcon = statusConfig.icon
                  const isLoading = actionLoading === request.id

                  return (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium">{formatDate(request.visit_date)}</span>
                        </div>
                        {request.entry_time && (
                          <span className="text-xs text-gray-500 ml-6">{request.entry_time}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{request.activity_name}</span>
                        </div>
                        {request.ticket_categories && (
                          <span className="text-xs text-gray-500 ml-6">{request.ticket_categories.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{request.partners?.name || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-teal-600">{request.requested_quantity}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span className="text-sm">{request.total_pax}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {/* View details */}
                          <button
                            onClick={() => { setSelectedRequest(request); setShowDetailModal(true) }}
                            className="text-gray-600 hover:text-gray-800"
                            title="Visualizza"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Status-specific actions */}
                          {request.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleSend(request)}
                                disabled={isLoading}
                                className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                title="Invia"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(request)}
                                disabled={isLoading}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                title="Elimina"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {request.status === 'sent' && (
                            <>
                              <button
                                onClick={() => handleFulfill(request)}
                                disabled={isLoading}
                                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                                title="Completata"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => { setSelectedRequest(request); setShowCancelModal(true) }}
                                disabled={isLoading}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                title="Annulla"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <h2 className="text-xl font-semibold">Dettagli Richiesta</h2>
                <button onClick={() => { setShowDetailModal(false); setSelectedRequest(null) }} className="text-gray-500 hover:text-gray-700">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Attivita</p>
                  <p className="font-medium">{selectedRequest.activity_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Partner</p>
                  <p className="font-medium">{selectedRequest.partners?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Data Visita</p>
                  <p className="font-medium">{formatDate(selectedRequest.visit_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Orario</p>
                  <p className="font-medium">{selectedRequest.entry_time || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Quantita Richiesta</p>
                  <p className="font-medium text-teal-600">{selectedRequest.requested_quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Totale Pax</p>
                  <p className="font-medium">{selectedRequest.total_pax}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Stato</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${STATUS_CONFIG[selectedRequest.status].color}`}>
                    {STATUS_CONFIG[selectedRequest.status].label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Creata il</p>
                  <p className="font-medium">{selectedRequest.created_at ? formatDateTime(selectedRequest.created_at) : '-'}</p>
                </div>
              </div>

              {selectedRequest.sent_at && (
                <div>
                  <p className="text-xs text-gray-500">Inviata il</p>
                  <p className="font-medium">{formatDateTime(selectedRequest.sent_at)}</p>
                </div>
              )}

              {selectedRequest.fulfilled_at && (
                <div>
                  <p className="text-xs text-gray-500">Completata il</p>
                  <p className="font-medium">{formatDateTime(selectedRequest.fulfilled_at)}</p>
                </div>
              )}

              {selectedRequest.cancelled_at && (
                <div>
                  <p className="text-xs text-gray-500">Annullata il</p>
                  <p className="font-medium">{formatDateTime(selectedRequest.cancelled_at)}</p>
                  {selectedRequest.cancellation_reason && (
                    <p className="text-sm text-red-600 mt-1">Motivo: {selectedRequest.cancellation_reason}</p>
                  )}
                </div>
              )}

              {selectedRequest.notes && (
                <div>
                  <p className="text-xs text-gray-500">Note</p>
                  <p className="text-sm">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Customer list */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Partecipanti</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nome</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Cognome</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Pax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedRequest.customer_names.map((customer, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-sm">{idx + 1}</td>
                          <td className="px-3 py-2 text-sm">{customer.first_name || '-'}</td>
                          <td className="px-3 py-2 text-sm">{customer.last_name || '-'}</td>
                          <td className="px-3 py-2 text-sm text-right">{customer.pax_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50">
              <Button
                variant="outline"
                onClick={() => { setShowDetailModal(false); setSelectedRequest(null) }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Annulla Richiesta</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Stai per annullare la richiesta per <strong>{selectedRequest.activity_name}</strong> del {formatDate(selectedRequest.visit_date)}.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Motivo (opzionale)</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Es: Prenotazione annullata dal cliente"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowCancelModal(false); setCancelReason(''); setSelectedRequest(null) }}
              >
                Annulla
              </Button>
              <Button
                onClick={handleCancel}
                disabled={actionLoading === selectedRequest.id}
                className="bg-red-600 hover:bg-red-700"
              >
                {actionLoading === selectedRequest.id ? 'Annullamento...' : 'Conferma Annullamento'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
