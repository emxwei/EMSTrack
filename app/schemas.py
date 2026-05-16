from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    worker_id: str
    password: str

class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str
    password: str

class AssignRequest(BaseModel):
    incident_id: int
    ambulance_id: int

class StatusRequest(BaseModel):
    ambulance_id: int
    status: str

class PatientUpdateRequest(BaseModel):
    incident_id: int
    patient_name: str
    priority: str
    description: str
    address: str
    vitals: str

class MessageRequest(BaseModel):
    sender: str
    body: str

class LocationRequest(BaseModel):
    ambulance_id: int
    latitude: float
    longitude: float
