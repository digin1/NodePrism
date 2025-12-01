export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">NodePrism</h1>
        <p className="text-xl text-gray-600 mb-8">
          Advanced server monitoring system
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/dashboard"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </a>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
          >
            API Health Check
          </a>
        </div>
      </div>
    </main>
  );
}
