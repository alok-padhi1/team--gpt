import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import ForceGraph2D from 'react-force-graph-2d';
import { Network, ZoomIn, ZoomOut, Maximize, RefreshCw } from 'lucide-react';
import { api } from '../api';

export default function GraphView() {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);
    const [washTrades, setWashTrades] = useState([]);
    const graphRef = useRef();

    const fetchGraph = useCallback(async () => {
        setLoading(true);
        try {
            const [gd, wt] = await Promise.allSettled([
                api.graphData(),
                api.washTrades(),
            ]);
            if (gd.status === 'fulfilled') {
                setGraphData(gd.value);
            }
            if (wt.status === 'fulfilled') {
                setWashTrades(wt.value.pairs || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGraph();
    }, [fetchGraph]);

    const handleNodeClick = (node) => {
        setSelectedNode(node);
        if (graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 500);
            graphRef.current.zoom(3, 500);
        }
    };

    const nodeCanvasObject = (node, ctx, globalScale) => {
        const size = Math.max(3, Math.min(node.centrality / 5 + 3, 15));
        const color = node.centrality > 50 ? '#ef4444' : node.centrality > 25 ? '#f59e0b' : '#6366f1';

        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
        ctx.fillStyle = color + '30';
        ctx.fill();

        // Node
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Label on hover/select
        if (globalScale > 2 || node === selectedNode) {
            const label = node.id.slice(0, 8) + '...';
            ctx.font = `${10 / globalScale}px Inter, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'center';
            ctx.fillText(label, node.x, node.y + size + 8 / globalScale);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Network Graph</h1>
                    <p className="text-sm text-white/50 mt-1">
                        {graphData.nodes.length} wallets • {graphData.links.length} interactions
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => graphRef.current?.zoomToFit(400)}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        title="Fit to view"
                    >
                        <Maximize className="w-4 h-4" />
                    </button>
                    <button
                        onClick={fetchGraph}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Graph Canvas */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="lg:col-span-3 glass-card overflow-hidden"
                    style={{ height: '600px' }}
                >
                    {graphData.nodes.length > 0 ? (
                        <ForceGraph2D
                            ref={graphRef}
                            graphData={graphData}
                            nodeCanvasObject={nodeCanvasObject}
                            linkColor={() => 'rgba(99,102,241,0.15)'}
                            linkWidth={(link) => Math.max(0.5, Math.min(link.count, 5))}
                            linkDirectionalArrowLength={4}
                            linkDirectionalArrowRelPos={0.8}
                            linkDirectionalParticles={1}
                            linkDirectionalParticleWidth={2}
                            linkDirectionalParticleColor={() => '#6366f1'}
                            onNodeClick={handleNodeClick}
                            backgroundColor="transparent"
                            cooldownTicks={50}
                            width={undefined}
                            height={600}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <Network className="w-16 h-16 text-white/10 mx-auto mb-4" />
                                <p className="text-white/30 text-sm">{loading ? 'Loading graph...' : 'No graph data. Ingest transactions first.'}</p>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Side panel */}
                <div className="space-y-4">
                    {/* Selected node info */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-4"
                    >
                        <h3 className="text-sm font-semibold text-white/70 mb-3">
                            {selectedNode ? 'Selected Node' : 'Click a node'}
                        </h3>
                        {selectedNode ? (
                            <div className="space-y-2 text-xs">
                                <div>
                                    <span className="text-white/40">Address</span>
                                    <p className="font-mono text-white/80 break-all mt-0.5">{selectedNode.id}</p>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/40">Centrality</span>
                                    <span className="font-mono text-primary-400">{selectedNode.centrality}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/40">Connections</span>
                                    <span className="font-mono">{selectedNode.degree}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-white/30 text-xs">Select a node to see details</p>
                        )}
                    </motion.div>

                    {/* Wash trade pairs */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card p-4"
                    >
                        <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
                            ⚠️ Wash Trade Suspects
                        </h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {washTrades.length === 0 ? (
                                <p className="text-white/30 text-xs">No wash-trading detected</p>
                            ) : (
                                washTrades.slice(0, 10).map((wt, i) => (
                                    <div key={i} className="p-2 rounded-lg bg-white/[0.03] text-xs space-y-1">
                                        <div className="flex items-center gap-1">
                                            <span className="font-mono text-white/50 truncate max-w-[80px]">{wt.wallet_a}</span>
                                            <span className="text-white/20">⇄</span>
                                            <span className="font-mono text-white/50 truncate max-w-[80px]">{wt.wallet_b}</span>
                                        </div>
                                        <div className="flex justify-between text-white/30">
                                            <span>Similarity: {(wt.value_similarity * 100).toFixed(0)}%</span>
                                            <span className="text-amber-400">{wt.suspicion_score.toFixed(0)} pts</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>

                    {/* Legend */}
                    <div className="glass-card p-4">
                        <h3 className="text-sm font-semibold text-white/70 mb-3">Legend</h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-[#6366f1]" />
                                <span className="text-white/50">Normal centrality</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                                <span className="text-white/50">Medium centrality</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
                                <span className="text-white/50">High centrality (hub)</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-white/20">→</span>
                                <span className="text-white/50">ETH flow direction</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
