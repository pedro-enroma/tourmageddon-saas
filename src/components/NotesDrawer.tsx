'use client'

import { useState, useEffect } from 'react'
import { X, MessageSquare, Send, Trash2, AlertTriangle, Info, AlertCircle, User, Calendar, Users, Ticket, Clock, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NoteReply {
  id: string
  content: string
  created_by: string
  created_by_email: string | null
  created_at: string
}

interface OperationNote {
  id: string
  local_date: string | null
  activity_availability_id: number | null
  guide_id: string | null
  escort_id: string | null
  voucher_id: string | null
  content: string
  note_type: 'general' | 'urgent' | 'warning' | 'info'
  created_by: string
  created_by_email: string | null
  created_at: string
  replies: NoteReply[]
}

interface NoteContext {
  type: 'date' | 'slot' | 'guide' | 'escort' | 'voucher'
  id?: string | number
  label: string
  local_date?: string
  activity_availability_id?: number
  guide_id?: string
  escort_id?: string
  voucher_id?: string
}

interface LinkableEntity {
  id: string
  name: string
}

interface LinkableGuide {
  id: string
  name: string
  time?: string  // Slot time the guide is assigned to
}

interface LinkableVoucher {
  id: string
  name: string
  totalTickets?: number
  entryTime?: string
}

interface LinkableSlot {
  id: number
  time: string
}

interface NotesDrawerProps {
  isOpen: boolean
  onClose: () => void
  context: NoteContext
  notes: OperationNote[]
  onAddNote: (content: string, noteType: string, linkTo?: { type: string; id?: string | number }) => Promise<void>
  onAddReply: (noteId: string, content: string) => Promise<void>
  onDeleteNote: (noteId: string) => Promise<void>
  onDeleteReply: (replyId: string) => Promise<void>
  loading?: boolean
  // Available entities to link to
  availableGuides?: LinkableGuide[]
  availableEscorts?: LinkableEntity[]
  availableVouchers?: LinkableVoucher[]
  availableSlots?: LinkableSlot[]
}

const noteTypeConfig = {
  general: { icon: MessageSquare, color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-300' },
  urgent: { icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-300' },
  warning: { icon: AlertCircle, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
  info: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-300' },
}

const linkTypeConfig = {
  date: { icon: Calendar, label: 'Date only', color: 'text-blue-600' },
  slot: { icon: Clock, label: 'Slot', color: 'text-purple-600' },
  guide: { icon: User, label: 'Guide', color: 'text-green-600' },
  escort: { icon: Users, label: 'Escort', color: 'text-purple-600' },
  voucher: { icon: Ticket, label: 'Voucher/Ticket', color: 'text-orange-600' },
}

export default function NotesDrawer({
  isOpen,
  onClose,
  context,
  notes,
  onAddNote,
  onAddReply,
  onDeleteNote,
  onDeleteReply,
  loading = false,
  availableGuides = [],
  availableEscorts = [],
  availableVouchers = [],
  availableSlots = [],
}: NotesDrawerProps) {
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteType, setNewNoteType] = useState<'general' | 'urgent' | 'warning' | 'info'>('general')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Link to state
  const [linkType, setLinkType] = useState<'date' | 'slot' | 'guide' | 'escort' | 'voucher'>(context.type)
  const [selectedEntityId, setSelectedEntityId] = useState<string | number | undefined>(context.id)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)

  // Reset form when drawer closes or context changes
  useEffect(() => {
    if (!isOpen) {
      setNewNoteContent('')
      setNewNoteType('general')
      setReplyingTo(null)
      setReplyContent('')
      setShowLinkDropdown(false)
    }
  }, [isOpen])

  // Reset link type when context changes
  useEffect(() => {
    setLinkType(context.type)
    setSelectedEntityId(context.id)
  }, [context])

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return
    setSubmitting(true)
    try {
      await onAddNote(newNoteContent, newNoteType, {
        type: linkType,
        id: linkType === 'date' ? undefined : selectedEntityId
      })
      setNewNoteContent('')
      setNewNoteType('general')
      // Reset to context default
      setLinkType(context.type)
      setSelectedEntityId(context.id)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddReply = async (noteId: string) => {
    if (!replyContent.trim()) return
    setSubmitting(true)
    try {
      await onAddReply(noteId, replyContent)
      setReplyContent('')
      setReplyingTo(null)
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatEmail = (email: string | null) => {
    if (!email) return 'Unknown'
    return email.split('@')[0]
  }

  const getSelectedEntityLabel = () => {
    if (linkType === 'date') return 'Date only'
    if (linkType === 'guide') {
      const guide = availableGuides.find(g => g.id === selectedEntityId)
      return guide ? guide.name : 'Select guide...'
    }
    if (linkType === 'escort') {
      const escort = availableEscorts.find(e => e.id === selectedEntityId)
      return escort ? escort.name : 'Select escort...'
    }
    if (linkType === 'voucher') {
      const voucher = availableVouchers.find(v => v.id === selectedEntityId)
      return voucher ? voucher.name : 'Select voucher...'
    }
    if (linkType === 'slot') {
      const slot = availableSlots.find(s => s.id === selectedEntityId)
      return slot ? slot.time : 'Select slot...'
    }
    return 'Select...'
  }

  const getLinkTypeIcon = () => {
    const config = linkTypeConfig[linkType]
    const Icon = config.icon
    return <Icon className={`w-4 h-4 ${config.color}`} />
  }

  const ContextIcon = linkTypeConfig[context.type]?.icon || Calendar

  if (!isOpen) return null

  // Check if we have any linkable entities
  const hasLinkableEntities = availableGuides.length > 0 || availableEscorts.length > 0 || availableVouchers.length > 0 || availableSlots.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <ContextIcon className="w-5 h-5 text-gray-600" />
            <div>
              <h2 className="font-semibold text-lg">Notes</h2>
              <p className="text-sm text-gray-500">{context.label}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Add Note Form */}
        <div className="p-4 border-b bg-white space-y-3">
          {/* Link To Selector */}
          {hasLinkableEntities && (
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">Link note to:</label>
              <button
                onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {getLinkTypeIcon()}
                  <span className="text-sm">{getSelectedEntityLabel()}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showLinkDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showLinkDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                  {/* Date only option */}
                  <button
                    onClick={() => {
                      setLinkType('date')
                      setSelectedEntityId(undefined)
                      setShowLinkDropdown(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${linkType === 'date' ? 'bg-blue-50' : ''}`}
                  >
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Date only</span>
                  </button>

                  {/* Slots */}
                  {availableSlots.length > 0 && (
                    <>
                      <div className="px-3 py-1 bg-gray-100 text-xs font-medium text-gray-500">Slots</div>
                      {availableSlots.map(slot => (
                        <button
                          key={slot.id}
                          onClick={() => {
                            setLinkType('slot')
                            setSelectedEntityId(slot.id)
                            setShowLinkDropdown(false)
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${linkType === 'slot' && selectedEntityId === slot.id ? 'bg-purple-50' : ''}`}
                        >
                          <Clock className="w-4 h-4 text-purple-600" />
                          <span className="text-sm">{slot.time}</span>
                        </button>
                      ))}
                    </>
                  )}

                  {/* Guides */}
                  {availableGuides.length > 0 && (
                    <>
                      <div className="px-3 py-1 bg-gray-100 text-xs font-medium text-gray-500">Guides</div>
                      {availableGuides.map(guide => (
                        <button
                          key={guide.id}
                          onClick={() => {
                            setLinkType('guide')
                            setSelectedEntityId(guide.id)
                            setShowLinkDropdown(false)
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left ${linkType === 'guide' && selectedEntityId === guide.id ? 'bg-green-50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-green-600" />
                            <span className="text-sm">{guide.name}</span>
                          </div>
                          {guide.time && (
                            <span className="text-xs text-gray-400">{guide.time}</span>
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Escorts */}
                  {availableEscorts.length > 0 && (
                    <>
                      <div className="px-3 py-1 bg-gray-100 text-xs font-medium text-gray-500">Escorts</div>
                      {availableEscorts.map(escort => (
                        <button
                          key={escort.id}
                          onClick={() => {
                            setLinkType('escort')
                            setSelectedEntityId(escort.id)
                            setShowLinkDropdown(false)
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${linkType === 'escort' && selectedEntityId === escort.id ? 'bg-purple-50' : ''}`}
                        >
                          <Users className="w-4 h-4 text-purple-600" />
                          <span className="text-sm">{escort.name}</span>
                        </button>
                      ))}
                    </>
                  )}

                  {/* Vouchers */}
                  {availableVouchers.length > 0 && (
                    <>
                      <div className="px-3 py-1 bg-gray-100 text-xs font-medium text-gray-500">Vouchers/Tickets</div>
                      {availableVouchers.map(voucher => (
                        <button
                          key={voucher.id}
                          onClick={() => {
                            setLinkType('voucher')
                            setSelectedEntityId(voucher.id)
                            setShowLinkDropdown(false)
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left ${linkType === 'voucher' && selectedEntityId === voucher.id ? 'bg-orange-50' : ''}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Ticket className="w-4 h-4 text-orange-600 flex-shrink-0" />
                            <span className="text-sm truncate">{voucher.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {voucher.totalTickets && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{voucher.totalTickets} tkt</span>
                            )}
                            {voucher.entryTime && (
                              <span className="text-xs text-gray-400">{voucher.entryTime.substring(0, 5)}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Note Type Selector */}
          <div className="flex gap-2">
            {(Object.keys(noteTypeConfig) as Array<keyof typeof noteTypeConfig>).map(type => {
              const config = noteTypeConfig[type]
              const Icon = config.icon
              return (
                <button
                  key={type}
                  onClick={() => setNewNoteType(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    newNoteType === type
                      ? `${config.bgColor} ${config.borderColor} ${config.color}`
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            })}
          </div>

          {/* Note Content */}
          <div className="flex gap-2">
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={2}
            />
            <Button
              onClick={handleAddNote}
              disabled={!newNoteContent.trim() || submitting}
              className="self-end"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No notes yet</p>
              <p className="text-sm">Add a note above to get started</p>
            </div>
          ) : (
            notes.map(note => {
              const config = noteTypeConfig[note.note_type] || noteTypeConfig.general
              const Icon = config.icon

              // Determine what the note is linked to
              let linkedTo = null
              if (note.guide_id) {
                const guide = availableGuides.find(g => g.id === note.guide_id)
                linkedTo = { type: 'guide', label: guide?.name || 'Guide', icon: User, color: 'text-green-600' }
              } else if (note.escort_id) {
                const escort = availableEscorts.find(e => e.id === note.escort_id)
                linkedTo = { type: 'escort', label: escort?.name || 'Escort', icon: Users, color: 'text-purple-600' }
              } else if (note.voucher_id) {
                const voucher = availableVouchers.find(v => v.id === note.voucher_id)
                linkedTo = { type: 'voucher', label: voucher?.name || 'Voucher', icon: Ticket, color: 'text-orange-600' }
              } else if (note.activity_availability_id) {
                const slot = availableSlots.find(s => s.id === note.activity_availability_id)
                linkedTo = { type: 'slot', label: slot?.time || 'Slot', icon: Clock, color: 'text-purple-600' }
              }

              return (
                <div
                  key={note.id}
                  className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-3`}
                >
                  {/* Note Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className={`w-4 h-4 ${config.color}`} />
                      <span className="text-sm font-medium text-gray-700">
                        {formatEmail(note.created_by_email)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(note.created_at)}
                      </span>
                      {linkedTo && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/50 ${linkedTo.color}`}>
                          <linkedTo.icon className="w-3 h-3" />
                          {linkedTo.label}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Note Content */}
                  <p className="text-gray-800 whitespace-pre-wrap mb-3">{note.content}</p>

                  {/* Replies */}
                  {note.replies.length > 0 && (
                    <div className="ml-4 space-y-2 mb-3">
                      {note.replies.map(reply => (
                        <div key={reply.id} className="bg-white/70 rounded p-2 border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-600">
                                {formatEmail(reply.created_by_email)}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatDate(reply.created_at)}
                              </span>
                            </div>
                            <button
                              onClick={() => onDeleteReply(reply.id)}
                              className="text-gray-400 hover:text-red-500 p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-sm text-gray-700">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Form */}
                  {replyingTo === note.id ? (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply..."
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleAddReply(note.id)
                          }
                          if (e.key === 'Escape') {
                            setReplyingTo(null)
                            setReplyContent('')
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAddReply(note.id)}
                        disabled={!replyContent.trim() || submitting}
                      >
                        <Send className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyingTo(null)
                          setReplyContent('')
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyingTo(note.id)}
                      className="text-xs text-gray-500 hover:text-orange-600 flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Reply
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
