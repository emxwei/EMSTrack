from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Worker(Base):
    __tablename__ = "workers"
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="dispatcher")

class Ambulance(Base):
    __tablename__ = "ambulances"
    id = Column(Integer, primary_key=True, index=True)
    unit_code = Column(String(50), unique=True, index=True, nullable=False)
    crew_name = Column(String(120), nullable=False)
    status = Column(String(50), nullable=False, default="available")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    last_updated = Column(DateTime, default=datetime.utcnow)

class Incident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String(120), nullable=False)
    priority = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    address = Column(String(255), nullable=False)
    vitals = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    assigned_ambulance_id = Column(Integer, ForeignKey("ambulances.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ambulance = relationship("Ambulance")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    sender = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
