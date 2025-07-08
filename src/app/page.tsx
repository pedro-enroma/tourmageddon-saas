import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Tourmageddon</h1>
      <p className="mt-4">Sistema di gestione tour</p>
      <Link 
        href="/login"
        className="mt-8 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
      >
        Accedi
      </Link>
    </main>
  )
}