import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    Activity,
    Network,
    Clock,
    Shield,
    Zap,
    Wifi,
    WifiOff,
    Radio,
} from 'lucide-react';
import { api } from './api';

import Dashboard from './pages/Dashboard';
import WalletDetail from './pages/WalletDetail';
import GraphView from './pages/GraphView';
import TimelineView from './pages/TimelineView';

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/wallets', label: 'Wallets', icon: Activity },
    { path: '/graph', label: 'Network', icon: Network },
    { path: '/timeline', label: 'Timeline', icon: Clock },
];

export default function App() {
    const location = useLocation();
    const [status, setStatus] = useState(null);

    // Poll system status every 10s for sidebar
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const s = await api.status();
                setStatus(s);
            } catch {
                setStatus(null);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    const isLive = status?.rpc_connected;
    const isSimulation = status?.mode === 'simulation';

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-white/5 bg-surface-950/80 backdrop-blur-xl flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-cyber-blue flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold gradient-text">ChainWatch</h1>
                            <p className="text-[10px] text-white/40 uppercase tracking-widest">AI Monitor</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(({ path, label, icon: Icon }) => (
                        <NavLink
                            key={path}
                            to={path}
                            end={path === '/'}
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* Status bar */}
                <div className="p-4 border-t border-white/5">
                    <div className="glass-card p-3 text-xs space-y-2">
                        <div className="flex items-center gap-2">
                            {isLive ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
                                    <span className="text-green-400/80">Connected to Ethereum</span>
                                </>
                            ) : isSimulation ? (
                                <>
                                    <Radio className="w-3 h-3 text-amber-400 animate-pulse" />
                                    <span className="text-amber-400/80">Simulation Mode</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-red-400" />
                                    <span className="text-red-400/80">Connecting...</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-white/40">
                            <Zap className="w-3 h-3" />
                            <span>Ethereum Mainnet</span>
                        </div>
                        {status?.last_processed_block && (
                            <div className="flex items-center gap-2 text-white/30">
                                <span className="text-[10px]">Block #{status.last_processed_block.toLocaleString()}</span>
                            </div>
                        )}
                        {status?.total_transactions > 0 && (
                            <div className="flex items-center gap-2 text-white/30">
                                <span className="text-[10px]">{status.total_transactions.toLocaleString()} txns indexed</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="p-6 lg:p-8"
                    >
                        <Routes location={location}>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/wallets" element={<WalletDetail />} />
                            <Route path="/graph" element={<GraphView />} />
                            <Route path="/timeline" element={<TimelineView />} />
                        </Routes>
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}
