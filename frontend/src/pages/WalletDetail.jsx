import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Search, User, TrendingUp, Activity, ChevronDown, ExternalLink } from 'lucide-react';
import { api } from '../api';

function RiskBadge({ severity }) {
    const cls = `risk-${severity || 'low'}`;
    return <span className={cls}>{severity || 'low'}</span>;
}

function RiskMeter({ score }) {
    const color = score >= 75 ? '#dc2626' : score >= 50 ? '#ef4444' : score >= 25 ? '#f59e0b' : '#22c55e';
    return (
        <div className="relative w-28 h-28">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${score * 2.51} 251`}
                    style={{ transition: 'stroke-dasharray 1s ease' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={{ color }}>{score}</span>
                <span className="text-[9px] text-white/40 uppercase">Risk</span>
            </div>
        </div>
    );
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

export default function WalletDetail() {
    const [profiles, setProfiles] = useState([]);
    const [selected, setSelected] = useState(null);
    const [riskDetail, setRiskDetail] = useState(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('risk_score');

    const fetchProfiles = useCallback(async () => {
        try {
            const data = await api.walletProfiles(200, sortBy);
            setProfiles(data.profiles || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [sortBy]);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const handleSelect = async (addr) => {
        setSelected(addr);
        try {
            const risk = await api.riskScore(addr);
            setRiskDetail(risk);
        } catch (e) {
            setRiskDetail(null);
        }
    };

    const filtered = profiles.filter(
        (p) => p.address.toLowerCase().includes(search.toLowerCase())
    );

    const radarData = riskDetail
        ? [
            { metric: 'ML Anomaly', value: riskDetail.ml_anomaly_score || 0 },
            { metric: 'Graph', value: riskDetail.graph_score || 0 },
            { metric: 'Flash Loan', value: riskDetail.flash_loan_score || 0 },
            { metric: 'Wash Trade', value: riskDetail.wash_trade_score || 0 },
        ]
        : [];

    const severity = riskDetail?.severity || (riskDetail?.composite_score >= 75 ? 'critical' : riskDetail?.composite_score >= 50 ? 'high' : riskDetail?.composite_score >= 25 ? 'medium' : 'low');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Wallet Profiles</h1>
                <p className="text-sm text-white/50 mt-1">AI-powered behavioural analysis of Ethereum wallets</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Wallet List */}
                <div className="lg:col-span-1 glass-card p-4 flex flex-col max-h-[75vh]">
                    <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input
                                type="text"
                                placeholder="Search address..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary-500/50 text-white placeholder-white/30"
                            />
                        </div>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 focus:outline-none"
                        >
                            <option value="risk_score">Risk</option>
                            <option value="tx_count">Txns</option>
                            <option value="total_value_sent">Value</option>
                        </select>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1">
                        {filtered.map((p) => (
                            <button
                                key={p.address}
                                onClick={() => handleSelect(p.address)}
                                className={`w-full text-left p-3 rounded-xl transition-all ${selected === p.address
                                        ? 'bg-primary-600/20 border border-primary-500/30'
                                        : 'hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-xs text-white/70 truncate max-w-[160px]">{p.address}</span>
                                    <span className={`text-xs font-bold ${p.risk_score >= 75 ? 'text-red-400' : p.risk_score >= 50 ? 'text-amber-400' : p.risk_score >= 25 ? 'text-yellow-400' : 'text-green-400'
                                        }`}>
                                        {p.risk_score.toFixed(0)}
                                    </span>
                                </div>
                                <div className="flex gap-3 mt-1 text-[10px] text-white/40">
                                    <span>{p.tx_count} txns</span>
                                    <span>Cluster {p.cluster_label}</span>
                                </div>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="text-center text-white/30 text-sm py-8">No wallets found</p>
                        )}
                    </div>
                </div>

                {/* Detail panel */}
                <div className="lg:col-span-2 space-y-4">
                    {!selected ? (
                        <div className="glass-card p-12 text-center">
                            <User className="w-12 h-12 text-white/10 mx-auto mb-4" />
                            <p className="text-white/30">Select a wallet to view its profile</p>
                        </div>
                    ) : (
                        <>
                            {/* Risk overview */}
                            <motion.div
                                key={selected}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card p-6"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <p className="text-xs text-white/40 mb-1">Wallet Address</p>
                                        <p className="font-mono text-sm text-white/80 break-all">{selected}</p>
                                        <div className="mt-2">
                                            <RiskBadge severity={severity} />
                                        </div>
                                    </div>
                                    <RiskMeter score={Math.round(riskDetail?.composite_score || 0)} />
                                </div>

                                {riskDetail?.explanation && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                        <p className="text-xs text-amber-400/80">{riskDetail.explanation}</p>
                                    </div>
                                )}
                            </motion.div>

                            {/* Risk Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="glass-card p-5"
                                >
                                    <h3 className="text-sm font-semibold text-white/70 mb-4">Risk Breakdown</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <RadarChart data={radarData}>
                                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                            <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                                            <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="glass-card p-5"
                                >
                                    <h3 className="text-sm font-semibold text-white/70 mb-4">Wallet Stats</h3>
                                    {(() => {
                                        const wp = profiles.find(p => p.address === selected);
                                        if (!wp) return null;
                                        const stats = [
                                            ['Transactions', wp.tx_count],
                                            ['Value Sent', `${wp.total_value_sent.toFixed(4)} ETH`],
                                            ['Value Received', `${wp.total_value_received.toFixed(4)} ETH`],
                                            ['Avg Value', `${wp.avg_value.toFixed(4)} ETH`],
                                            ['Counterparties', wp.unique_counterparties],
                                            ['IO Ratio', wp.inflow_outflow_ratio.toFixed(3)],
                                            ['Tx Frequency', `${wp.tx_frequency.toFixed(2)} /hr`],
                                            ['Burst Score', wp.burst_score],
                                        ];
                                        return (
                                            <div className="space-y-2.5">
                                                {stats.map(([label, value]) => (
                                                    <div key={label} className="flex justify-between text-xs">
                                                        <span className="text-white/40">{label}</span>
                                                        <span className="font-mono text-white/80">{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </motion.div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
