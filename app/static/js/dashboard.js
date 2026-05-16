const worker = JSON.parse(localStorage.getItem("emstrackWorker") || "null");

if (!worker) {
    window.location.href = "/";
}

document.getElementById("dispatcherName").textContent = `${worker.name} · ID ${worker.worker_id}`;

const map = L.map("map", {zoomControl: false}).setView([32.5063, -116.9726], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: ""
}).addTo(map);

const unitList = document.getElementById("unitList");
const incidentList = document.getElementById("incidentList");
const patientList = document.getElementById("patientList");
const pendingBadge = document.getElementById("pendingBadge");
const hideClaimed = document.getElementById("hideClaimed");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

let appState = {ambulances: [], incidents: [], messages: []};
let ambulanceMarkers = {};
let incidentMarkers = {};
let editingPatientId = null;

const statusOptions = ["available", "en_route", "on_scene", "transporting", "out_of_service"];

function statusLabel(value) {
    return value.replaceAll("_", " ").replace(/\w/g, c => c.toUpperCase());
}

function priorityColor(priority) {
    if (priority === "critical") return "#ef4444";
    if (priority === "high") return "#f59e0b";
    return "#3b82f6";
}

function ambulanceIcon(unit) {
    return L.divIcon({
        className: "",
        html: `<div class="marker-ambulance">${unit.unit_code.split("-")[1]?.[0] || "A"}</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
    });
}

function incidentIcon(incident) {
    return L.divIcon({
        className: "",
        html: `<div class="marker-incident" style="background:${priorityColor(incident.priority)}"></div>`,
        iconSize: [19, 19],
        iconAnchor: [9, 9]
    });
}

function findAssignedUnit(incident) {
    if (!incident.assigned_ambulance_id) return null;
    return appState.ambulances.find(unit => unit.id === incident.assigned_ambulance_id) || null;
}

function setTab(name) {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === name);
    });

    document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
    });

    document.getElementById(`${name}Tab`).classList.add("active");
}

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("emstrackWorker");
    window.location.href = "/";
});

hideClaimed.addEventListener("change", render);

function renderUnits() {
    unitList.innerHTML = "";

    const visibleUnits = appState.ambulances.filter(unit => {
        if (!hideClaimed.checked) return true;
        return unit.status === "available";
    });

    visibleUnits.forEach(unit => {
        const card = document.getElementById("unitTemplate").content.cloneNode(true);
        const article = card.querySelector(".unit-card");

        if (unit.status === "available") article.classList.add("available-unit");

        card.querySelector("h4").textContent = unit.unit_code;
        card.querySelector(".unit-status").textContent = statusLabel(unit.status);
        card.querySelector(".unit-meta").textContent = `${unit.crew_name} · GPS active`;

        const select = card.querySelector("select");

        statusOptions.forEach(status => {
            const option = document.createElement("option");
            option.value = status;
            option.textContent = statusLabel(status);
            option.selected = unit.status === status;
            select.appendChild(option);
        });

        select.addEventListener("change", async () => {
            await fetch("/api/status", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ambulance_id: unit.id, status: select.value})
            });
        });

        unitList.appendChild(card);
    });
}

function renderIncidents() {
    incidentList.innerHTML = "";

    const pending = appState.incidents.filter(i => i.status === "pending").length;
    pendingBadge.textContent = `${pending} Pending Incidents`;

    appState.incidents.forEach(incident => {
        const card = document.getElementById("incidentTemplate").content.cloneNode(true);
        const pill = card.querySelector(".priority-pill");

        pill.textContent = incident.priority;
        pill.style.background = priorityColor(incident.priority);

        card.querySelector(".incident-status").textContent = incident.status;
        card.querySelector("h4").textContent = `${incident.description} · ${incident.address}`;
        card.querySelector("p").textContent = `Patient: ${incident.patient_name}`;

        const select = card.querySelector(".assign-select");
        const base = document.createElement("option");

        base.value = "";
        base.textContent = "Assign ambulance";
        select.appendChild(base);

        appState.ambulances.forEach(unit => {
            const option = document.createElement("option");
            option.value = unit.id;
            option.textContent = `${unit.unit_code} · ${statusLabel(unit.status)}`;
            option.selected = incident.assigned_ambulance_id === unit.id;
            select.appendChild(option);
        });

        select.addEventListener("change", async () => {
            if (!select.value) return;

            await fetch("/api/assign", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({incident_id: incident.id, ambulance_id: Number(select.value)})
            });
        });

        incidentList.appendChild(card);
    });
}

function renderPatients() {
    patientList.innerHTML = "";

    appState.incidents.forEach(incident => {
        const card = document.getElementById("patientTemplate").content.cloneNode(true);
        const article = card.querySelector(".patient-card");
        const assignedUnit = findAssignedUnit(incident);
        const pill = card.querySelector(".priority-pill");
        const isEditing = editingPatientId === incident.id;

        pill.textContent = incident.priority;
        pill.style.background = priorityColor(incident.priority);
        card.querySelector(".incident-status").textContent = incident.status;

        const readView = card.querySelector(".patient-read-view");
        const editForm = card.querySelector(".patient-edit-form");

        card.querySelector(".patient-read-name").textContent = incident.patient_name;
        card.querySelector(".patient-read-complaint").textContent = incident.description;
        card.querySelector(".patient-read-location").textContent = incident.address;
        card.querySelector(".patient-read-vitals").textContent = incident.vitals || "Pending";
        card.querySelector(".patient-read-unit").textContent = assignedUnit ? assignedUnit.unit_code : "Unassigned";

        card.querySelector(".patient-name-input").value = incident.patient_name;
        card.querySelector(".patient-priority-input").value = incident.priority;
        card.querySelector(".patient-description-input").value = incident.description;
        card.querySelector(".patient-address-input").value = incident.address;
        card.querySelector(".patient-vitals-input").value = incident.vitals || "";

        if (isEditing) {
            readView.classList.add("hidden");
            editForm.classList.remove("hidden");
            article.classList.add("editing");
        } else {
            readView.classList.remove("hidden");
            editForm.classList.add("hidden");
            article.classList.remove("editing");
        }

        const editButton = card.querySelector(".edit-patient-button");
        const saveButton = card.querySelector(".save-patient-button");
        const cancelButton = card.querySelector(".cancel-patient-button");
        const saveStatus = card.querySelector(".save-patient-status");

        editButton.addEventListener("click", () => {
            editingPatientId = incident.id;
            renderPatients();
        });

        cancelButton.addEventListener("click", () => {
            editingPatientId = null;
            renderPatients();
        });

        saveButton.addEventListener("click", async () => {
            saveStatus.textContent = "";

            const payload = {
                incident_id: incident.id,
                patient_name: article.querySelector(".patient-name-input").value.trim(),
                priority: article.querySelector(".patient-priority-input").value,
                description: article.querySelector(".patient-description-input").value.trim(),
                address: article.querySelector(".patient-address-input").value.trim(),
                vitals: article.querySelector(".patient-vitals-input").value.trim()
            };

            if (!payload.patient_name || !payload.description || !payload.address) {
                saveStatus.textContent = "Patient name, complaint, and location are required.";
                saveStatus.className = "save-patient-status error";
                return;
            }

            const response = await fetch("/api/patient", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                saveStatus.textContent = "Could not save patient details.";
                saveStatus.className = "save-patient-status error";
                return;
            }

            editingPatientId = null;
        });

        patientList.appendChild(card);
    });
}

function renderMessages() {
    chatMessages.innerHTML = "";

    appState.messages.forEach(message => {
        const div = document.createElement("div");
        div.className = "chat-message";
        div.innerHTML = `<strong>${message.sender}</strong><span>${message.body}</span>`;
        chatMessages.appendChild(div);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMap() {
    appState.ambulances.forEach(unit => {
        const latLng = [unit.latitude, unit.longitude];

        if (!ambulanceMarkers[unit.id]) {
            ambulanceMarkers[unit.id] = L.marker(latLng, {icon: ambulanceIcon(unit)}).addTo(map);
        } else {
            ambulanceMarkers[unit.id].setLatLng(latLng);
            ambulanceMarkers[unit.id].setIcon(ambulanceIcon(unit));
        }

        ambulanceMarkers[unit.id].bindPopup(`<strong>${unit.unit_code}</strong><br>${statusLabel(unit.status)}<br>${unit.crew_name}`);
    });

    appState.incidents.forEach(incident => {
        const latLng = [incident.latitude, incident.longitude];

        if (!incidentMarkers[incident.id]) {
            incidentMarkers[incident.id] = L.marker(latLng, {icon: incidentIcon(incident)}).addTo(map);
        } else {
            incidentMarkers[incident.id].setLatLng(latLng);
            incidentMarkers[incident.id].setIcon(incidentIcon(incident));
        }

        incidentMarkers[incident.id].bindPopup(`<strong>${incident.priority.toUpperCase()}</strong><br>${incident.description}<br>${incident.address}`);
    });
}

function render() {
    renderUnits();
    renderIncidents();

    if (editingPatientId === null) {
        renderPatients();
    }

    renderMessages();
    renderMap();
}

async function loadState() {
    const response = await fetch("/api/state");
    appState = await response.json();
    render();
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const body = chatInput.value.trim();
    if (!body) return;

    chatInput.value = "";

    await fetch("/api/message", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sender: worker.name, body})
    });
});

function connectSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "state") {
            appState = msg.data;
            render();
        }
    };

    socket.onclose = () => {
        setTimeout(connectSocket, 1000);
    };
}

loadState();
connectSocket();
