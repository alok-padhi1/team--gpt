"""
Graph Analysis Service
Uses NetworkX for wallet interaction graph analysis, cycle detection,
wash-trade identification, and centrality scoring.
"""

import logging
from typing import List, Dict, Any, Tuple, Set
from collections import defaultdict

import networkx as nx
from sqlalchemy.orm import Session

from app.database import Transaction

logger = logging.getLogger("chainwatch.graph")


class GraphAnalyzer:
    """Builds and analyses directed wallet interaction graphs."""

    def __init__(self):
        self.graph: nx.DiGraph = nx.DiGraph()

    def build_graph(self, db: Session) -> Dict[str, Any]:
        """
        Build a directed graph from stored transactions.
        Edge weight = total ETH transferred between two wallets.
        Edge count = number of transactions.
        """
        self.graph = nx.DiGraph()
        transactions = db.query(Transaction).all()

        edge_data: Dict[Tuple[str, str], Dict] = defaultdict(
            lambda: {"weight": 0.0, "count": 0, "blocks": set()}
        )

        for tx in transactions:
            if not tx.to_address:
                continue
            key = (tx.from_address, tx.to_address)
            edge_data[key]["weight"] += tx.value_eth
            edge_data[key]["count"] += 1
            edge_data[key]["blocks"].add(tx.block_number)

        for (src, dst), data in edge_data.items():
            self.graph.add_edge(
                src, dst,
                weight=data["weight"],
                count=data["count"],
                blocks=len(data["blocks"]),
            )

        logger.info(
            f"Graph built: {self.graph.number_of_nodes()} nodes, "
            f"{self.graph.number_of_edges()} edges"
        )

        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
        }

    def detect_cycles(self, max_length: int = 4) -> List[List[str]]:
        """
        Detect short cycles (length <= max_length) indicating circular trading.
        Returns list of cycles (lists of wallet addresses).
        """
        cycles: List[List[str]] = []
        try:
            all_cycles = list(nx.simple_cycles(self.graph))
            for cycle in all_cycles:
                if 2 <= len(cycle) <= max_length:
                    cycles.append(cycle)
                if len(cycles) >= 200:  # cap to avoid explosion
                    break
        except Exception as e:
            logger.error(f"Cycle detection error: {e}")

        logger.info(f"Detected {len(cycles)} cycles (max length {max_length})")
        return cycles

    def detect_wash_trading(self, db: Session) -> List[Dict[str, Any]]:
        """
        Detect wash-trading patterns:
        - Bidirectional transfers between wallets
        - Similar values in both directions
        - Short time intervals

        Returns list of suspicious wallet pairs with details.
        """
        suspicious_pairs: List[Dict[str, Any]] = []

        for u, v, data_uv in self.graph.edges(data=True):
            if self.graph.has_edge(v, u):
                data_vu = self.graph[v][u]

                # Check value similarity (within 20%)
                val_uv = data_uv.get("weight", 0)
                val_vu = data_vu.get("weight", 0)

                if val_uv == 0 and val_vu == 0:
                    continue

                max_val = max(val_uv, val_vu)
                min_val = min(val_uv, val_vu)
                similarity = min_val / max_val if max_val > 0 else 0

                if similarity > 0.8:
                    suspicious_pairs.append({
                        "wallet_a": u,
                        "wallet_b": v,
                        "value_a_to_b": round(val_uv, 6),
                        "value_b_to_a": round(val_vu, 6),
                        "value_similarity": round(similarity, 4),
                        "tx_count_a_to_b": data_uv.get("count", 0),
                        "tx_count_b_to_a": data_vu.get("count", 0),
                        "suspicion_score": round(
                            similarity * 50 + min(data_uv["count"] + data_vu["count"], 10) * 5, 2
                        ),
                    })

        # Deduplicate (A,B) and (B,A)
        seen: Set[Tuple[str, str]] = set()
        unique_pairs = []
        for pair in suspicious_pairs:
            key = tuple(sorted([pair["wallet_a"], pair["wallet_b"]]))
            if key not in seen:
                seen.add(key)
                unique_pairs.append(pair)

        unique_pairs.sort(key=lambda x: x["suspicion_score"], reverse=True)
        logger.info(f"Detected {len(unique_pairs)} potential wash-trading pairs")
        return unique_pairs

    def compute_centrality(self, top_n: int = 20) -> List[Dict[str, Any]]:
        """
        Compute degree centrality and betweenness centrality.
        Returns top-N wallets by combined centrality score.
        """
        if self.graph.number_of_nodes() == 0:
            return []

        degree_cent = nx.degree_centrality(self.graph)
        try:
            between_cent = nx.betweenness_centrality(self.graph, k=min(50, self.graph.number_of_nodes()))
        except Exception:
            between_cent = {n: 0.0 for n in self.graph.nodes()}

        combined = []
        for node in self.graph.nodes():
            score = (degree_cent.get(node, 0) * 0.6 + between_cent.get(node, 0) * 0.4) * 100
            combined.append({
                "address": node,
                "degree_centrality": round(degree_cent.get(node, 0), 4),
                "betweenness_centrality": round(between_cent.get(node, 0), 4),
                "centrality_score": round(score, 2),
            })

        combined.sort(key=lambda x: x["centrality_score"], reverse=True)
        return combined[:top_n]

    def get_graph_data(self) -> Dict[str, Any]:
        """
        Return graph data formatted for frontend visualization.
        Nodes have id + centrality; edges have source, target, weight.
        """
        if self.graph.number_of_nodes() == 0:
            return {"nodes": [], "links": []}

        degree_cent = nx.degree_centrality(self.graph)

        nodes = []
        for node in self.graph.nodes():
            nodes.append({
                "id": node,
                "centrality": round(degree_cent.get(node, 0) * 100, 2),
                "degree": self.graph.degree(node),
            })

        links = []
        for u, v, data in self.graph.edges(data=True):
            links.append({
                "source": u,
                "target": v,
                "value": round(data.get("weight", 0), 6),
                "count": data.get("count", 1),
            })

        return {"nodes": nodes, "links": links}

    def get_wallet_graph_score(self, address: str) -> float:
        """
        Compute a graph-based suspicion score (0-100) for a single wallet.
        Based on cycle involvement + centrality + bidirectional transfer ratio.
        """
        if address not in self.graph:
            return 0.0

        score = 0.0

        # Centrality component
        degree_cent = nx.degree_centrality(self.graph).get(address, 0)
        score += degree_cent * 30

        # Bidirectional relationships
        neighbors = set(self.graph.successors(address)) | set(self.graph.predecessors(address))
        bidirectional = 0
        for nbr in neighbors:
            if self.graph.has_edge(address, nbr) and self.graph.has_edge(nbr, address):
                bidirectional += 1
        if neighbors:
            score += (bidirectional / len(neighbors)) * 40

        # High connection count
        score += min(self.graph.degree(address), 20) * 1.5

        return min(round(score, 2), 100.0)


# Singleton
graph_analyzer = GraphAnalyzer()
