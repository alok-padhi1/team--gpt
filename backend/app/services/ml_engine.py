"""
ML Engine – Anomaly Detection & Wallet Clustering
Uses Isolation Forest for anomaly detection and KMeans for behavioural clustering.
"""

import logging
import numpy as np
from typing import List, Dict, Any, Tuple
from collections import defaultdict
from datetime import datetime

from sklearn.ensemble import IsolationForest
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from app.config import ANOMALY_CONTAMINATION, N_CLUSTERS
from app.database import SessionLocal, Transaction, WalletProfile

logger = logging.getLogger("chainwatch.ml")


class MLEngine:
    """Machine learning engine for anomaly detection and clustering."""

    def __init__(self):
        self.scaler = StandardScaler()
        self.isolation_forest = IsolationForest(
            contamination=ANOMALY_CONTAMINATION,
            random_state=42,
            n_estimators=150,
            max_samples="auto",
        )
        self.kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
        self._is_trained = False

    def extract_features(self, db: Session) -> Tuple[List[str], np.ndarray, List[Dict]]:
        """
        Build feature vectors from stored transactions.
        Returns (wallet_addresses, feature_matrix, raw_profiles).

        Features per wallet:
        0 - tx_count
        1 - total_value_sent
        2 - total_value_received
        3 - avg_value
        4 - unique_counterparties
        5 - inflow_outflow_ratio
        6 - tx_frequency (txs per hour over active period)
        7 - burst_score (max txs in any single block)
        """
        transactions = db.query(Transaction).order_by(Transaction.timestamp.asc()).all()
        if not transactions:
            return [], np.array([]), []

        wallet_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "sent_values": [],
            "received_values": [],
            "counterparties": set(),
            "timestamps": [],
            "blocks": defaultdict(int),
        })

        for tx in transactions:
            sender = tx.from_address
            receiver = tx.to_address or ""

            # Sender stats
            wallet_data[sender]["sent_values"].append(tx.value_eth)
            if receiver:
                wallet_data[sender]["counterparties"].add(receiver)
            wallet_data[sender]["timestamps"].append(tx.timestamp)
            wallet_data[sender]["blocks"][tx.block_number] += 1

            # Receiver stats
            if receiver:
                wallet_data[receiver]["received_values"].append(tx.value_eth)
                wallet_data[receiver]["counterparties"].add(sender)
                wallet_data[receiver]["timestamps"].append(tx.timestamp)
                wallet_data[receiver]["blocks"][tx.block_number] += 1

        addresses = []
        features = []
        raw_profiles = []

        for addr, data in wallet_data.items():
            total_sent = sum(data["sent_values"]) if data["sent_values"] else 0.0
            total_received = sum(data["received_values"]) if data["received_values"] else 0.0
            tx_count = len(data["sent_values"]) + len(data["received_values"])
            avg_value = (total_sent + total_received) / max(tx_count, 1)
            unique_cp = len(data["counterparties"])

            inflow = total_received if total_received > 0 else 0.001
            outflow = total_sent if total_sent > 0 else 0.001
            io_ratio = inflow / outflow

            # Tx frequency: txs per hour over active window
            if len(data["timestamps"]) >= 2:
                sorted_ts = sorted(data["timestamps"])
                span_hours = max((sorted_ts[-1] - sorted_ts[0]).total_seconds() / 3600, 0.01)
                tx_freq = tx_count / span_hours
            else:
                tx_freq = 0.0

            # Burst score: max txs in a single block
            burst = max(data["blocks"].values()) if data["blocks"] else 0

            profile = {
                "address": addr,
                "tx_count": tx_count,
                "total_value_sent": total_sent,
                "total_value_received": total_received,
                "avg_value": avg_value,
                "unique_counterparties": unique_cp,
                "inflow_outflow_ratio": io_ratio,
                "tx_frequency": tx_freq,
                "burst_score": float(burst),
            }

            addresses.append(addr)
            features.append([
                tx_count, total_sent, total_received, avg_value,
                unique_cp, io_ratio, tx_freq, float(burst),
            ])
            raw_profiles.append(profile)

        return addresses, np.array(features), raw_profiles

    def train(self, db: Session) -> Dict[str, Any]:
        """
        Train Isolation Forest and KMeans on current transaction data.
        Returns training summary.
        """
        addresses, X, raw_profiles = self.extract_features(db)
        if len(addresses) < 5:
            logger.warning("Not enough wallets to train. Need at least 5.")
            return {"status": "insufficient_data", "wallets": len(addresses)}

        X_scaled = self.scaler.fit_transform(X)

        # Isolation Forest
        self.isolation_forest.fit(X_scaled)

        # KMeans – adjust n_clusters if needed
        effective_k = min(N_CLUSTERS, len(addresses))
        self.kmeans = KMeans(n_clusters=effective_k, random_state=42, n_init=10)
        self.kmeans.fit(X_scaled)

        self._is_trained = True
        logger.info(f"ML models trained on {len(addresses)} wallets")

        return {
            "status": "trained",
            "wallets": len(addresses),
            "clusters": effective_k,
        }

    def predict(self, db: Session) -> List[Dict[str, Any]]:
        """
        Run inference: anomaly detection + clustering.
        Returns list of wallet predictions with scores.
        """
        addresses, X, raw_profiles = self.extract_features(db)
        if len(addresses) < 5:
            return []

        if not self._is_trained:
            self.train(db)

        X_scaled = self.scaler.transform(X)

        # Anomaly scores: sklearn returns -1 for anomalies, 1 for normal
        anomaly_labels = self.isolation_forest.predict(X_scaled)
        anomaly_scores_raw = self.isolation_forest.decision_function(X_scaled)

        # Normalize anomaly scores to 0-100 (higher = more anomalous)
        min_score = anomaly_scores_raw.min()
        max_score = anomaly_scores_raw.max()
        score_range = max_score - min_score if max_score != min_score else 1.0
        anomaly_scores = ((max_score - anomaly_scores_raw) / score_range * 100).clip(0, 100)

        # Cluster labels
        cluster_labels = self.kmeans.predict(X_scaled)

        results = []
        for i, addr in enumerate(addresses):
            results.append({
                **raw_profiles[i],
                "is_anomaly": bool(anomaly_labels[i] == -1),
                "anomaly_score": round(float(anomaly_scores[i]), 2),
                "cluster_label": int(cluster_labels[i]),
            })

        return results

    def update_wallet_profiles(self, db: Session, predictions: List[Dict[str, Any]]) -> int:
        """
        Upsert wallet profiles into the database with ML results.
        Returns number of profiles updated.
        """
        updated = 0
        for pred in predictions:
            profile = db.query(WalletProfile).filter_by(address=pred["address"]).first()
            if not profile:
                profile = WalletProfile(address=pred["address"])
                db.add(profile)

            profile.tx_count = pred["tx_count"]
            profile.total_value_sent = pred["total_value_sent"]
            profile.total_value_received = pred["total_value_received"]
            profile.avg_value = pred["avg_value"]
            profile.unique_counterparties = pred["unique_counterparties"]
            profile.inflow_outflow_ratio = pred["inflow_outflow_ratio"]
            profile.tx_frequency = pred["tx_frequency"]
            profile.burst_score = pred["burst_score"]
            profile.cluster_label = pred["cluster_label"]
            profile.risk_score = pred["anomaly_score"]
            profile.updated_at = datetime.utcnow()
            updated += 1

        db.commit()
        return updated


# Singleton
ml_engine = MLEngine()
