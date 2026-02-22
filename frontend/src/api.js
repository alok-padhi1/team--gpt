/**
 * ChainWatch API Client
 * Centralized API calls to the FastAPI backend.
 */

const API_BASE = '/api';

async function fetchJSON(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`API ${res.status}: ${error}`);
    }
    return res.json();
}

export const api = {
    // Health
    health: () => fetchJSON('/health'),

    // Status (detailed system info)
    status: () => fetchJSON('/status'),

    // Transactions
    liveTransactions: (limit = 50) => fetchJSON(`/live-transactions?limit=${limit}`),

    // Detection pipeline
    runDetection: () => fetchJSON('/run-detection', { method: 'POST' }),

    // Wallet profiles
    walletProfiles: (limit = 100, sortBy = 'risk_score') =>
        fetchJSON(`/wallet-profiles?limit=${limit}&sort_by=${sortBy}`),

    // Alerts
    alerts: (limit = 50, alertType = null, severity = null) => {
        let url = `/alerts?limit=${limit}`;
        if (alertType) url += `&alert_type=${alertType}`;
        if (severity) url += `&severity=${severity}`;
        return fetchJSON(url);
    },

    // Graph data
    graphData: () => fetchJSON('/graph-data'),

    // Timeline data
    timelineData: (hours = 24) => fetchJSON(`/timeline-data?hours=${hours}`),

    // Risk score
    riskScore: (address) => fetchJSON(`/risk-score/${address}`),

    // Ingest blocks
    ingest: (nBlocks = 3) => fetchJSON(`/ingest?n_blocks=${nBlocks}`, { method: 'POST' }),

    // Flash loans
    flashLoans: () => fetchJSON('/flash-loans'),

    // Wash trades
    washTrades: () => fetchJSON('/wash-trades'),
};
