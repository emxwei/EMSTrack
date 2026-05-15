from sqlalchemy.orm import Session
from .models import Worker, Ambulance, Incident
from .auth import hash_password

def seed_data(db: Session):
    if db.query(Worker).first():
        return

    workers = [
        Worker(worker_id="1", name="Jose Ramirez", email="jose.ramirez@cruzroja.org", password_hash=hash_password("password123"), role="dispatcher"),
        Worker(worker_id="2", name="Ana Morales", email="ana.morales@cruzroja.org", password_hash=hash_password("password123"), role="dispatcher"),
    ]

    ambulances = [
        Ambulance(unit_code="BC-173", crew_name="Unit Torres", status="en_route", latitude=32.4967, longitude=-116.9567),
        Ambulance(unit_code="BC-143", crew_name="Unit Sanchez", status="on_scene", latitude=32.5084, longitude=-116.9801),
        Ambulance(unit_code="BC-221", crew_name="Unit Flores", status="available", latitude=32.5149, longitude=-117.0037),
        Ambulance(unit_code="BC-118", crew_name="Unit Vega", status="available", latitude=32.4821, longitude=-116.9302),
        Ambulance(unit_code="BC-205", crew_name="Unit Castro", status="transporting", latitude=32.5291, longitude=-116.9474),
    ]

    incidents = [
        Incident(patient_name="Patient A", priority="critical", description="Cardiac emergency", address="Zona Río, Tijuana", latitude=32.5231, longitude=-117.0172),
        Incident(patient_name="Patient B", priority="high", description="Vehicle collision", address="Blvd. Agua Caliente", latitude=32.5127, longitude=-116.9921),
        Incident(patient_name="Patient C", priority="medium", description="Fall injury", address="Col. Madero", latitude=32.5182, longitude=-117.0353),
        Incident(patient_name="Patient D", priority="critical", description="Respiratory distress", address="20 de Noviembre", latitude=32.5063, longitude=-116.9726),
        Incident(patient_name="Patient E", priority="high", description="Severe bleeding", address="La Mesa", latitude=32.4962, longitude=-116.9654),
        Incident(patient_name="Patient F", priority="medium", description="Abdominal pain", address="Otay", latitude=32.5328, longitude=-116.9394),
        Incident(patient_name="Patient G", priority="medium", description="Possible fracture", address="Colinas de California", latitude=32.4782, longitude=-116.9749),
        Incident(patient_name="Patient H", priority="high", description="Stroke symptoms", address="Sánchez Taboada", latitude=32.4769, longitude=-116.9418),
        Incident(patient_name="Patient I", priority="critical", description="Unconscious patient", address="Playas de Tijuana", latitude=32.5158, longitude=-117.1198),
    ]

    db.add_all(workers + ambulances + incidents)
    db.commit()
