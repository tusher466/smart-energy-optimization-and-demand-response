from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func
from app.core.db import Base


class DecisionLog(Base):
    __tablename__ = "decision_log"
    id = Column(Integer, primary_key=True, index=True)
    module = Column(String(64), index=True)
    region_id = Column(String(64), default="")
    action = Column(String(256), default="")
    saved_money = Column(Float, default=0.0)
    currency = Column(String(16), default="")
    co2_avoided_kg = Column(Float, default=0.0)
    peak_shaved_kw = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    explanation = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(256))
    module = Column(String(64), default="")
    detail = Column(Text, default="")
    status = Column(String(32), default="pending")  # pending|approved|rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
