'use client'

export default function TrainMonitoringPage() {
  return (
    <div className="h-[calc(100vh-100px)] w-full p-4">
      <iframe
        src="https://train-tracker-web.vercel.app"
        width="100%"
        height="100%"
        style={{ border: 'none', borderRadius: '12px' }}
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
        loading="lazy"
        title="Train Price Tracker"
      />
    </div>
  )
}
