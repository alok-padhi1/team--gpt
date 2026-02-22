import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import {
    Activity, AlertTriangle, TrendingUp, Users, Zap,
    RefreshCw, ArrowUpRight, ArrowDownRight, ShieldAlert,
    Radio, Wifi, WifiOff, Clock
} from 'lucide-react';
import { api } from '../api';

const RISK_COLORS = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
};

const PIE_COLORS = ['#6366f1', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'];

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary-400', delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="stat-card glass-card-hover"
        >
            <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                {sub && (
                    <span className={`text-xs font-medium flex items-center gap-1 ${sub.startsWith('+') ? 'text-green-400' : 'text-red-400'
                        }`}>
                        {sub.startsWith('+') ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {sub}
                    </span>
                )}
            </div>
            <div className="mt-3">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-white/50 mt-1">{label}</p>
            </div>
        </motion.div>
    );
}

function RiskBadge({ severity }) {
    const cls = `risk-${severity || 'low'}`;
    return <span className={cls}>{severity || 'low'}</span>;
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="glass-card p-3 text-xs border border-white/10">
            <p className="font-medium text-white/80 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
                    <span>{p.name}:</span>
                    <span className="font-mono">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
                </p>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const [status, setStatus] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detecting, setDetecting] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [st, tx, al, wp, tl] = await Promise.allSettled([
                api.status(),
                api.liveTransactions(30),
                api.alerts(20),
                api.walletProfiles(50),
                api.timelineData(24),
            ]);
            if (st.status === 'fulfilled') setStatus(st.value);
            if (tx.status === 'fulfilled') setTransactions(tx.value.transactions || []);
            if (al.status === 'fulfilled') setAlerts(al.value.alerts || []);
            if (wp.status === 'fulfilled') setProfiles(wp.value.profiles || []);
            if (tl.status === 'fulfilled') setTimeline(tl.value.timeline || []);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('Dashboard fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRunDetection = async () => {
        setDetecting(true);
        try {
            await api.runDetection();
            await fetchData();
        } catch (e) {
            console.error('Detection error:', e);
        } finally {
            setDetecting(false);
        }
    };

    // Cluster distribution for pie chart
    const clusterData = (() => {
        const counts = {};
        profiles.forEach(p => {
            const label = `Cluster ${p.cluster_label}`;
            counts[label] = (counts[label] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    })();

    const alertCounts = {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
    };

    const isLive = status?.rpc_connected;
    const isSimulation = status?.mode === 'simulation';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <div className="flex items-center gap-3 mt-1">
                        {/* Connection status indicator */}
                        <div className="flex items-center gap-1.5">
                            {isLive ? (
                                <>
                                    <Wifi className="w-3.5 h-3.5 text-green-400" />
                                    <span className="text-xs text-green-400 font-medium">Connected to Ethereum</span>
                                </>
                            ) : isSimulation ? (
                                <>
                                    <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                    <span className="text-xs text-amber-400 font-medium">Simulation Mode</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                                    <span className="text-xs text-red-400 font-medium">Disconnected</span>
                                </>
                            )}
                        </div>
                        {status?.last_processed_block && (
                            <span className="text-xs text-white/40">
                                Block #{status.last_processed_block.toLocaleString()}
                            </span>
                        )}
                        {lastRefresh && (
                            <span className="text-xs text-white/30 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {lastRefresh.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={handleRunDetection}
                        disabled={detecting}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-sm font-medium hover:bg-primary-500 transition-colors disabled:opacity-50"
                    >
                        <ShieldAlert className="w-4 h-4" />
                        {detecting ? 'Running...' : 'Run Detection'}
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={Activity}
                    label="Total Transactions"
                    value={status?.total_transactions?.toLocaleString() || transactions.length}
                    color="text-cyber-blue"
                    delay={0}
                />
                <StatCard
                    icon={Users}
                    label="Wallets Profiled"
                    value={status?.total_wallets_profiled?.toLocaleString() || profiles.length}
                    color="text-cyber-purple"
                    delay={0.1}
                />
                <StatCard
                    icon={AlertTriangle}
                    label="Active Alerts"
                    value={status?.total_alerts?.toLocaleString() || alertCounts.total}
                    sub={alertCounts.critical > 0 ? `${alertCounts.critical} critical` : undefined}
                    color="text-amber-400"
                    delay={0.2}
                />
                <StatCard
                    icon={TrendingUp}
                    label="High Risk Wallets"
                    value={profiles.filter(p => p.risk_score >= 50).length}
                    color="text-red-400"
                    delay={0.3}
                />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Timeline chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="lg:col-span-2 glass-card p-5"
                >
                    <h3 className="text-sm font-semibold text-white/70 mb-4">Transaction Volume (24h)</h3>
                    {timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={timeline}>
                                <defs>
                                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="hour" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="tx_count" name="Transactions" stroke="#6366f1" fill="url(#colorTx)" strokeWidth={2} />
                                <Area type="monotone" dataKey="alert_count" name="Alerts" stroke="#ef4444" fill="url(#colorAlerts)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-60 flex items-center justify-center text-white/30 text-sm">
                            Collecting data... Auto-refreshes every 10s
                        </div>
                    )}
                </motion.div>

                {/* Cluster pie */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass-card p-5"
                >
                    <h3 className="text-sm font-semibold text-white/70 mb-4">Wallet Clusters</h3>
                    {clusterData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={clusterData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                        {clusterData.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {clusterData.map((c, i) => (
                                    <span key={c.name} className="flex items-center gap-1.5 text-[10px] text-white/50">
                                        <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                        {c.name} ({c.value})
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-60 flex items-center justify-center text-white/30 text-sm">
                            Awaiting cluster analysis...
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Bottom row: Alerts + Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Alerts */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass-card p-5"
                >
                    <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Recent Alerts
                    </h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {alerts.length === 0 ? (
                            <p className="text-white/30 text-sm py-8 text-center">
                                {status?.total_transactions > 0
                                    ? 'No alerts yet. Click "Run Detection" or wait for auto-analysis.'
                                    : 'Waiting for transactions to analyze...'
                                }
                            </p>
                        ) : (
                            alerts.slice(0, 10).map((alert) => (
                                <div key={alert.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/5 transition-colors">
                                    <div className="mt-0.5">
                                        <RiskBadge severity={alert.severity} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-mono text-white/70 truncate">{alert.wallet_address}</p>
                                        <p className="text-xs text-white/40 mt-1">{alert.explanation || alert.alert_type}</p>
                                    </div>
                                    <span className="text-xs text-white/30 whitespace-nowrap">
                                        {alert.risk_score?.toFixed(0)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>

                {/* Live Transaction Feed */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="glass-card p-5"
                >
                    <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyber-blue" />
                        Live Transaction Feed
                        {transactions.length > 0 && (
                            <span className="ml-auto text-[10px] text-white/30 font-normal">
                                {status?.total_transactions?.toLocaleString() || transactions.length} total
                            </span>
                        )}
                    </h3>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                        {transactions.length === 0 ? (
                            <div className="text-white/30 text-sm py-8 text-center">
                                <Zap className="w-6 h-6 mx-auto mb-2 animate-pulse text-white/20" />
                                <p>Waiting for transactions...</p>
                                <p className="text-xs text-white/20 mt-1">Auto-refreshes every 10s</p>
                            </div>
                        ) : (
                            transactions.slice(0, 15).map((tx) => (
                                <div key={tx.tx_hash} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors text-xs">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyber-blue flex-shrink-0 animate-pulse" />
                                    <span className="font-mono text-white/50 w-24 truncate">{tx.from_address}</span>
                                    <span className="text-white/20">→</span>
                                    <span className="font-mono text-white/50 w-24 truncate">{tx.to_address || 'Contract'}</span>
                                    <span className="ml-auto font-mono text-primary-400 whitespace-nowrap">
                                        {tx.value_eth?.toFixed(4)} ETH
                                    </span>
                                    <span className="text-white/20 w-16 text-right">#{tx.block_number}</span>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Risk Distribution bar chart */}
            {profiles.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="glass-card p-5"
                >
                    <h3 className="text-sm font-semibold text-white/70 mb-4">Risk Score Distribution (Top 20 Wallets)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={profiles.slice(0, 20)}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="address" tick={false} />
                            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="risk_score" name="Risk Score" radius={[4, 4, 0, 0]}>
                                {profiles.slice(0, 20).map((p, i) => (
                                    <Cell key={i} fill={p.risk_score >= 75 ? '#dc2626' : p.risk_score >= 50 ? '#ef4444' : p.risk_score >= 25 ? '#f59e0b' : '#22c55e'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>
            )}
        </div>
    );
}
