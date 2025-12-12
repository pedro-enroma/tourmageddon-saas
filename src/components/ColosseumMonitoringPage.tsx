'use client'

export default function ColosseumMonitoringPage() {
  return (
    <div className="h-[calc(100vh-100px)] w-full p-4">
      <iframe
        src="https://coliseo-ticket-tracker.vercel.app/"
        width="100%"
        height="100%"
        style={{ border: 'none', borderRadius: '12px' }}
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
        loading="lazy"
      />
    </div>
  )
}
