import asyncio
import random
from datetime import datetime
from fastapi import FastAPI, Depends, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.orm import Session
from .database import Base, engine, get_db, SessionLocal
from .models import Worker, Ambulance, Incident, Message
from .schemas import LoginRequest, SignupRequest, AssignRequest, StatusRequest, MessageRequest, LocationRequest
from .seed import seed_data
from .auth import hash_password, verify_password

app = FastAPI(title="EMSTrack")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

Base.metadata.create_all(bind=engine)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    for error in exc.errors():
        location = error.get("loc", [])
        if "email" in location:
            return JSONResponse(status_code=422, content={"detail": "Email must be a proper email address."})
    return JSONResponse(status_code=422, content={"detail": "Please check your input and try again."})

def migrate_database():
    with engine.begin() as conn:
        dialect = engine.dialect.name

        if dialect == "sqlite":
            columns = conn.execute(text("PRAGMA table_info(workers)")).fetchall()
            column_names = [column[1] for column in columns]

            if "email" not in column_names:
                conn.execute(text("ALTER TABLE workers ADD COLUMN email VARCHAR(180)"))

            if "password_hash" not in column_names:
                conn.execute(text("ALTER TABLE workers ADD COLUMN password_hash VARCHAR(255)"))

        elif dialect == "mysql":
            rows = conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workers'")).fetchall()
            column_names = [row[0] for row in rows]

            if "email" not in column_names:
                conn.execute(text("ALTER TABLE workers ADD COLUMN email VARCHAR(180) UNIQUE"))

            if "password_hash" not in column_names:
                conn.execute(text("ALTER TABLE workers ADD COLUMN password_hash VARCHAR(255)"))

def set_default_passwords():
    db = SessionLocal()
    try:
        workers = db.query(Worker).filter((Worker.password_hash == None) | (Worker.password_hash == "")).all()
        for worker in workers:
            worker.password_hash = hash_password("password123")
        db.commit()
    finally:
        db.close()

migrate_database()

with SessionLocal() as db:
    seed_data(db)

set_default_passwords()

class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)

manager = ConnectionManager()

def next_worker_id(db: Session):
    workers = db.query(Worker).all()
    used_ids = []

    for worker in workers:
        try:
            used_ids.append(int(worker.worker_id))
        except ValueError:
            pass

    if not used_ids:
        return "1"

    return str(max(used_ids) + 1)

def dashboard_payload(db: Session):
    ambulances = db.query(Ambulance).order_by(Ambulance.unit_code).all()
    incidents = db.query(Incident).order_by(Incident.created_at.desc()).all()
    messages = db.query(Message).order_by(Message.created_at.desc()).limit(30).all()

    return {
        "ambulances": [
            {
                "id": a.id,
                "unit_code": a.unit_code,
                "crew_name": a.crew_name,
                "status": a.status,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "last_updated": a.last_updated.isoformat() if a.last_updated else None,
            }
            for a in ambulances
        ],
        "incidents": [
            {
                "id": i.id,
                "patient_name": i.patient_name,
                "priority": i.priority,
                "description": i.description,
                "address": i.address,
                "latitude": i.latitude,
                "longitude": i.longitude,
                "status": i.status,
                "assigned_ambulance_id": i.assigned_ambulance_id,
            }
            for i in incidents
        ],
        "messages": [
            {
                "id": m.id,
                "sender": m.sender,
                "body": m.body,
                "created_at": m.created_at.isoformat(),
            }
            for m in reversed(messages)
        ],
    }

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request):
    return templates.TemplateResponse("signup.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.post("/api/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    worker = db.query(Worker).filter(Worker.worker_id == payload.worker_id.strip()).first()

    if not worker or not verify_password(payload.password, worker.password_hash):
        raise HTTPException(status_code=401, detail="Invalid worker ID or password")

    return {
        "id": worker.id,
        "worker_id": worker.worker_id,
        "name": worker.name,
        "email": worker.email,
        "role": worker.role,
    }

@app.post("/api/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    full_name = payload.full_name.strip()
    email = payload.email.strip().lower()
    role = payload.role.strip().lower()
    password = payload.password

    allowed_roles = {"dispatcher", "admin", "ambulance_crew"}

    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required")

    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing_email = db.query(Worker).filter(Worker.email == email).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="This email is already registered")

    worker_id = next_worker_id(db)

    worker = Worker(
        worker_id=worker_id,
        name=full_name,
        email=email,
        password_hash=hash_password(password),
        role=role,
    )

    db.add(worker)
    db.commit()
    db.refresh(worker)

    return {
        "id": worker.id,
        "worker_id": worker.worker_id,
        "name": worker.name,
        "email": worker.email,
        "role": worker.role,
    }

@app.get("/api/state")
def get_state(db: Session = Depends(get_db)):
    return dashboard_payload(db)

@app.post("/api/assign")
async def assign(payload: AssignRequest, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == payload.incident_id).first()
    ambulance = db.query(Ambulance).filter(Ambulance.id == payload.ambulance_id).first()

    if not incident or not ambulance:
        raise HTTPException(status_code=404, detail="Incident or ambulance not found")

    incident.assigned_ambulance_id = ambulance.id
    incident.status = "assigned"
    ambulance.status = "en_route"
    ambulance.last_updated = datetime.utcnow()
    db.commit()

    await manager.broadcast({"type": "state", "data": dashboard_payload(db)})
    return {"ok": True}

@app.post("/api/status")
async def update_status(payload: StatusRequest, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.id == payload.ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    ambulance.status = payload.status
    ambulance.last_updated = datetime.utcnow()
    db.commit()

    await manager.broadcast({"type": "state", "data": dashboard_payload(db)})
    return {"ok": True}

@app.post("/api/location")
async def update_location(payload: LocationRequest, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.id == payload.ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    ambulance.latitude = payload.latitude
    ambulance.longitude = payload.longitude
    ambulance.last_updated = datetime.utcnow()
    db.commit()

    await manager.broadcast({"type": "state", "data": dashboard_payload(db)})
    return {"ok": True}

@app.post("/api/message")
async def send_message(payload: MessageRequest, db: Session = Depends(get_db)):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg = Message(sender=payload.sender.strip() or "Dispatcher", body=payload.body.strip())
    db.add(msg)
    db.commit()

    await manager.broadcast({"type": "state", "data": dashboard_payload(db)})
    return {"ok": True}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.on_event("startup")
async def simulator():
    async def move_units():
        while True:
            await asyncio.sleep(3)
            db = SessionLocal()
            try:
                moving = db.query(Ambulance).filter(Ambulance.status.in_(["en_route", "transporting"])).all()
                for ambulance in moving:
                    ambulance.latitude += random.uniform(-0.0012, 0.0012)
                    ambulance.longitude += random.uniform(-0.0012, 0.0012)
                    ambulance.last_updated = datetime.utcnow()
                db.commit()
                await manager.broadcast({"type": "state", "data": dashboard_payload(db)})
            finally:
                db.close()
    asyncio.create_task(move_units())
