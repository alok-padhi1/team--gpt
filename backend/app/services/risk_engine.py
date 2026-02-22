"""
Risk Engine
Combines ML anomaly score, graph suspicion score, flash-loan score,
and wash-trade score into a composite risk rating with explainability.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import RISK_WEIGHTS
from app.database import RiskScore, Alert, WalletProfile
from app.services.ml_engine import ml_engine
from app.services.graph_analysis import graph_analyzer
from app.services.flash_loan import flash_loan_detector

logger = logging.getLogger("chainwatch.risk")


class RiskEngine:
    """Computes composite risk scores with explainable alerts."""

    def compute_risk(self, db: Session, address: str) -> Dict[str, Any]:
        """
        Compute a composite risk score for a single wallet.
        Returns breakdown and explanation.
        """
        # ML anomaly score
        profile = db.query(WalletProfile).filter_by(address=address).first()
        ml_score = profile.risk_score if profile else 0.0

        # Graph suspicion score
        graph_score = graph_analyzer.get_wallet_graph_score(address)

        # Flash-loan score
        flash_score = flash_loan_detector.get_wallet_flash_score(db, address)

        # Wash-trade score
        wash_pairs = graph_analyzer.detect_wash_trading(db)
        wash_score = 0.0
        for pair in wash_pairs:
            if pair["wallet_a"] == address or pair["wallet_b"] == address:
                wash_score = max(wash_score, pair["suspicion_score"])

        # Composite weighted score
        composite = (
            RISK_WEIGHTS["ml_anomaly"] * ml_score +
            RISK_WEIGHTS["graph_suspicion"] * graph_score +
            RISK_WEIGHTS["flash_loan"] * flash_score +
            RISK_WEIGHTS["wash_trade"] * wash_score
        )
        composite = min(round(composite, 2), 100.0)

        # Build explanation
        explanations = []
        if ml_score > 50:
            explanations.append(f"ML anomaly score is high ({ml_score:.0f}/100)")
        if graph_score > 30:
            explanations.append(f"Graph analysis shows suspicious connectivity ({graph_score:.0f}/100)")
        if flash_score > 50:
            explanations.append(f"Flash-loan-like activity detected ({flash_score:.0f}/100)")
        if wash_score > 40:
            explanations.append(f"Possible wash-trading behaviour ({wash_score:.0f}/100)")

        explanation = "; ".join(explanations) if explanations else "No significant risk factors detected."

        # Severity
        if composite >= 75:
            severity = "critical"
        elif composite >= 50:
            severity = "high"
        elif composite >= 25:
            severity = "medium"
        else:
            severity = "low"

        result = {
            "wallet_address": address,
            "composite_score": composite,
            "ml_anomaly_score": round(ml_score, 2),
            "graph_score": round(graph_score, 2),
            "flash_loan_score": round(flash_score, 2),
            "wash_trade_score": round(wash_score, 2),
            "severity": severity,
            "explanation": explanation,
        }

        # Upsert risk score in DB
        risk_record = db.query(RiskScore).filter_by(wallet_address=address).first()
        if not risk_record:
            risk_record = RiskScore(wallet_address=address)
            db.add(risk_record)
        risk_record.composite_score = composite
        risk_record.ml_anomaly_score = ml_score
        risk_record.graph_score = graph_score
        risk_record.flash_loan_score = flash_score
        risk_record.wash_trade_score = wash_score
        risk_record.explanation = explanation
        risk_record.updated_at = datetime.utcnow()
        db.commit()

        return result

    def run_full_detection(self, db: Session) -> Dict[str, Any]:
        """
        Run the complete detection pipeline:
        1. Train/update ML models
        2. Build graph
        3. Detect flash loans
        4. Detect wash trading
        5. Compute risk for all wallets
        6. Generate alerts

        Returns summary.
        """
        # Step 1: ML
        train_result = ml_engine.train(db)
        predictions = ml_engine.predict(db)
        ml_engine.update_wallet_profiles(db, predictions)

        # Step 2: Graph
        graph_analyzer.build_graph(db)
        cycles = graph_analyzer.detect_cycles()
        wash_pairs = graph_analyzer.detect_wash_trading(db)
        central_wallets = graph_analyzer.compute_centrality()

        # Step 3: Flash loans
        flash_events = flash_loan_detector.detect(db)

        # Step 4: Compute composite risk for all profiled wallets
        profiles = db.query(WalletProfile).all()
        alerts_generated = 0

        for profile in profiles:
            risk = self.compute_risk(db, profile.address)

            # Generate alert if risk is significant
            if risk["composite_score"] >= 40:
                alert_type = "anomaly"
                if risk["flash_loan_score"] > 50:
                    alert_type = "flash_loan"
                elif risk["wash_trade_score"] > 40:
                    alert_type = "wash_trade"
                elif risk["graph_score"] > 30:
                    alert_type = "high_centrality"

                alert = Alert(
                    wallet_address=profile.address,
                    alert_type=alert_type,
                    severity=risk["severity"],
                    risk_score=risk["composite_score"],
                    explanation=risk["explanation"],
                )
                db.add(alert)
                alerts_generated += 1

        db.commit()

        return {
            "ml_training": train_result,
            "wallets_profiled": len(predictions),
            "graph_nodes": graph_analyzer.graph.number_of_nodes(),
            "graph_edges": graph_analyzer.graph.number_of_edges(),
            "cycles_detected": len(cycles),
            "wash_trade_pairs": len(wash_pairs),
            "flash_loan_events": len(flash_events),
            "high_centrality_wallets": len(central_wallets),
            "alerts_generated": alerts_generated,
        }


# Singleton
risk_engine = RiskEngine()
