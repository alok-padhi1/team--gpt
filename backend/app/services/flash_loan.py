"""
Flash Loan Detection Service
Identifies flash-loan-like activity: large inflow + outflow in the same block
with near-equal values.
"""

import logging
from typing import List, Dict, Any
from collections import defaultdict

from sqlalchemy.orm import Session
from app.database import Transaction

logger = logging.getLogger("chainwatch.flash_loan")


class FlashLoanDetector:
    """Detects flash-loan-like patterns in transaction data."""

    def __init__(self, value_tolerance: float = 0.05, min_value_eth: float = 1.0):
        """
        Args:
            value_tolerance: max relative difference between inflow/outflow (5% default)
            min_value_eth: minimum ETH value to consider (ignore dust)
        """
        self.value_tolerance = value_tolerance
        self.min_value_eth = min_value_eth

    def detect(self, db: Session) -> List[Dict[str, Any]]:
        """
        Scan transactions for flash-loan-like patterns.
        A flash loan signal: wallet receives AND sends significant ETH
        within the same block, with near-equal amounts.

        Returns list of suspicious events.
        """
        transactions = db.query(Transaction).order_by(Transaction.block_number).all()

        # Group by (block_number, wallet)
        block_wallet: Dict[int, Dict[str, Dict[str, float]]] = defaultdict(
            lambda: defaultdict(lambda: {"inflow": 0.0, "outflow": 0.0, "tx_hashes": []})
        )

        for tx in transactions:
            block = tx.block_number
            sender = tx.from_address
            receiver = tx.to_address

            block_wallet[block][sender]["outflow"] += tx.value_eth
            block_wallet[block][sender]["tx_hashes"].append(tx.tx_hash)

            if receiver:
                block_wallet[block][receiver]["inflow"] += tx.value_eth
                block_wallet[block][receiver]["tx_hashes"].append(tx.tx_hash)

        suspects: List[Dict[str, Any]] = []

        for block_num, wallets in block_wallet.items():
            for wallet, flows in wallets.items():
                inflow = flows["inflow"]
                outflow = flows["outflow"]

                # Must have both significant inflow AND outflow in same block
                if inflow < self.min_value_eth or outflow < self.min_value_eth:
                    continue

                max_val = max(inflow, outflow)
                min_val = min(inflow, outflow)
                diff_ratio = (max_val - min_val) / max_val if max_val > 0 else 1.0

                if diff_ratio <= self.value_tolerance:
                    score = (1 - diff_ratio) * 100
                    suspects.append({
                        "wallet": wallet,
                        "block_number": block_num,
                        "inflow_eth": round(inflow, 6),
                        "outflow_eth": round(outflow, 6),
                        "value_difference_pct": round(diff_ratio * 100, 2),
                        "flash_loan_score": round(score, 2),
                        "tx_hashes": list(set(flows["tx_hashes"]))[:10],
                        "explanation": (
                            f"Wallet received {inflow:.4f} ETH and sent {outflow:.4f} ETH "
                            f"in block {block_num} (diff {diff_ratio*100:.1f}%). "
                            f"Pattern consistent with flash-loan activity."
                        ),
                    })

        suspects.sort(key=lambda x: x["flash_loan_score"], reverse=True)
        logger.info(f"Detected {len(suspects)} flash-loan-like events")
        return suspects

    def get_wallet_flash_score(self, db: Session, address: str) -> float:
        """Get the highest flash-loan score for a specific wallet."""
        detections = self.detect(db)
        wallet_detections = [d for d in detections if d["wallet"] == address]
        if not wallet_detections:
            return 0.0
        return max(d["flash_loan_score"] for d in wallet_detections)


# Singleton
flash_loan_detector = FlashLoanDetector()
