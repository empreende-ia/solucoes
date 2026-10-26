'use client'

import { useState, useEffect } from 'react'

export default function DebugAuthPage() {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(json => setData(json))
            .catch(err => setData({ error: err.message }))
            .finally(() => setLoading(false))
    }, [])

    return (
        <div className="min-h-screen bg-black text-white p-8 font-mono">
            <h1 className="text-xl font-bold mb-4">Debug Auth Status</h1>
            {loading ? (
                <p>Loading...</p>
            ) : (
                <pre className="bg-slate-900 p-4 rounded overflow-auto border border-slate-800">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
            <div className="mt-4">
                <p className="text-slate-500">
                    If isConfigured is false, MASTER_PASSWORD is missing in the API environment.
                </p>
            </div>
        </div>
    )
}
