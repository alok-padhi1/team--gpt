"""
ChainWatch Database Layer
SQLAlchemy engine, session management, and ORM models.
Supports SQLite (dev) and PostgreSQL (prod) via DATABASE_URL.
"""

from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime,
    Text, Boolean, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

# Handle SQLite-specific connect args
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Transaction(Base):
    """Stores raw Ethereum transactions."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tx_hash = Column(String(66), unique=True, nullable=False, index=True)
    block_number = Column(Integer, nullable=False, index=True)
    from_address = Column(String(42), nullable=False, index=True)
    to_address = Column(String(42), nullable=True, index=True)
    value_eth = Column(Float, default=0.0)
    gas_price_gwei = Column(Float, default=0.0)
    gas_used = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)
    input_data_length = Column(Integer, default=0)
    is_contract_call = Column(Boolean, default=False)

    __table_args__ = (
        Index("ix_tx_block_from", "block_number", "from_address"),
    )


class WalletProfile(Base):
    """Aggregated behavioural profile per wallet."""
    __tablename__ = "wallet_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    address = Column(String(42), unique=True, nullable=False, index=True)
    tx_count = Column(Integer, default=0)
    total_value_sent = Column(Float, default=0.0)
    total_value_received = Column(Float, default=0.0)
    avg_value = Column(Float, default=0.0)
    unique_counterparties = Column(Integer, default=0)
    inflow_outflow_ratio = Column(Float, default=0.0)
    tx_frequency = Column(Float, default=0.0)
    burst_score = Column(Float, default=0.0)
    cluster_label = Column(Integer, default=-1)
    risk_score = Column(Float, default=0.0)
    last_active = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Alert(Base):
    """Generated alerts for suspicious behaviour."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    alert_type = Column(String(50), nullable=False)  # anomaly, flash_loan, wash_trade, high_centrality
    severity = Column(String(20), default="medium")   # low, medium, high, critical
    risk_score = Column(Float, default=0.0)
    explanation = Column(Text, default="")
    tx_hash = Column(String(66), nullable=True)
    block_number = Column(Integer, nullable=True)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class RiskScore(Base):
    """Composite risk scores with component breakdown."""
    __tablename__ = "risk_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    composite_score = Column(Float, default=0.0)
    ml_anomaly_score = Column(Float, default=0.0)
    graph_score = Column(Float, default=0.0)
    flash_loan_score = Column(Float, default=0.0)
    wash_trade_score = Column(Float, default=0.0)
    explanation = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for FastAPI route injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
