const worker=JSON.parse(localStorage.getItem("emstrackWorker")||"null");

if(!worker){
    window.location.href="/";
}

document.getElementById("dispatcherName").textContent=`${worker.name} · ID ${worker.worker_id}`;

const map=L.map("map",{zoomControl:false}).setView([32.5063,-116.9726],13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:""}).addTo(map);

const unitList=document.getElementById("unitList");
const incidentList=document.getElementById("incidentList");
const patientList=document.getElementById("patientList");
const pendingBadge=document.getElementById("pendingBadge");
const hideClaimed=document.getElementById("hideClaimed");
const chatMessages=document.getElementById("chatMessages");
const chatForm=document.getElementById("chatForm");
const chatInput=document.getElementById("chatInput");

let appState={ambulances:[],incidents:[],messages:[]};
let ambulanceMarkers={};
let incidentMarkers={};

const statusOptions=["available","en_route","on_scene","transporting","out_of_service"];

function statusLabel(value){
    return value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
}

function priorityColor(priority){
    if(priority==="critical")return"#ef4444";
    if(priority==="high")return"#f59e0b";
    return"#3b82f6";
}

function ambulanceIcon(unit){
    return L.divIcon({
        className:"",
        html:`<div class="marker-ambulance">${unit.unit_code.split("-")[1]?.[0]||"A"}</div>`,
        iconSize:[38,38],
        iconAnchor:[19,19]
    });
}

function incidentIcon(incident){
    return L.divIcon({
        className:"",
        html:`<div class="marker-incident" style="background:${priorityColor(incident.priority)}"></div>`,
        iconSize:[19,19],
        iconAnchor:[9,9]
    });
}

function setTab(name){
    document.querySelectorAll(".tab").forEach(tab=>{
        tab.classList.toggle("active",tab.dataset.tab===name);
    });

    document.querySelectorAll(".tab-content").forEach(content=>{
        content.classList.remove("active");
    });

    document.getElementById(`${name}Tab`).classList.add("active");
}

document.querySelectorAll(".tab").forEach(tab=>{
    tab.addEventListener("click",()=>setTab(tab.dataset.tab));
});

document.getElementById("logoutBtn").addEventListener("click",()=>{
    localStorage.removeItem("emstrackWorker");
    window.location.href="/";
});

hideClaimed.addEventListener("change",render);

function renderUnits(){
    unitList.innerHTML="";

    const visibleUnits=appState.ambulances.filter(unit=>{
        if(!hideClaimed.checked)return true;
        return unit.status==="available";
    });

    visibleUnits.forEach(unit=>{
        const card=document.getElementById("unitTemplate").content.cloneNode(true);
        const article=card.querySelector(".unit-card");

        if(unit.status==="available"){
            article.classList.add("available-unit");
        }

        card.querySelector("h4").textContent=unit.unit_code;
        card.querySelector(".unit-status").textContent=statusLabel(unit.status);
        card.querySelector(".unit-meta").textContent=`${unit.crew_name} · GPS active`;

        const select=card.querySelector("select");
        statusOptions.forEach(status=>{
            const option=document.createElement("option");
            option.value=status;
            option.textContent=statusLabel(status);
            option.selected=unit.status===status;
            select.appendChild(option);
        });

        select.addEventListener("change",async()=>{
            await fetch("/api/status",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ambulance_id:unit.id,status:select.value})
            });
        });

        unitList.appendChild(card);
    });
}

function renderIncidents(){
    incidentList.innerHTML="";
    patientList.innerHTML="";

    const pending=appState.incidents.filter(i=>i.status==="pending").length;
    pendingBadge.textContent=`${pending} Pending Incidents`;

    appState.incidents.forEach(incident=>{
        const card=document.getElementById("incidentTemplate").content.cloneNode(true);
        const pill=card.querySelector(".priority-pill");
        pill.textContent=incident.priority;
        pill.style.background=priorityColor(incident.priority);

        card.querySelector(".incident-status").textContent=incident.status;
        card.querySelector("h4").textContent=`${incident.patient_name} · ${incident.address}`;
        card.querySelector("p").textContent=incident.description;

        const select=card.querySelector(".assign-select");
        const base=document.createElement("option");
        base.value="";
        base.textContent="Assign ambulance";
        select.appendChild(base);

        appState.ambulances.forEach(unit=>{
            const option=document.createElement("option");
            option.value=unit.id;
            option.textContent=`${unit.unit_code} · ${statusLabel(unit.status)}`;
            option.selected=incident.assigned_ambulance_id===unit.id;
            select.appendChild(option);
        });

        select.addEventListener("change",async()=>{
            if(!select.value)return;
            await fetch("/api/assign",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({incident_id:incident.id,ambulance_id:Number(select.value)})
            });
        });

        const patientCard=card.cloneNode(true);
        incidentList.appendChild(card);
        patientList.appendChild(patientCard);
    });
}

function renderMessages(){
    chatMessages.innerHTML="";
    appState.messages.forEach(message=>{
        const div=document.createElement("div");
        div.className="chat-message";
        div.innerHTML=`<strong>${message.sender}</strong><span>${message.body}</span>`;
        chatMessages.appendChild(div);
    });
    chatMessages.scrollTop=chatMessages.scrollHeight;
}

function renderMap(){
    appState.ambulances.forEach(unit=>{
        const latLng=[unit.latitude,unit.longitude];

        if(!ambulanceMarkers[unit.id]){
            ambulanceMarkers[unit.id]=L.marker(latLng,{icon:ambulanceIcon(unit)}).addTo(map);
        }else{
            ambulanceMarkers[unit.id].setLatLng(latLng);
            ambulanceMarkers[unit.id].setIcon(ambulanceIcon(unit));
        }

        ambulanceMarkers[unit.id].bindPopup(`<strong>${unit.unit_code}</strong><br>${statusLabel(unit.status)}<br>${unit.crew_name}`);
    });

    appState.incidents.forEach(incident=>{
        const latLng=[incident.latitude,incident.longitude];

        if(!incidentMarkers[incident.id]){
            incidentMarkers[incident.id]=L.marker(latLng,{icon:incidentIcon(incident)}).addTo(map);
        }else{
            incidentMarkers[incident.id].setLatLng(latLng);
            incidentMarkers[incident.id].setIcon(incidentIcon(incident));
        }

        incidentMarkers[incident.id].bindPopup(`<strong>${incident.priority.toUpperCase()}</strong><br>${incident.description}<br>${incident.address}`);
    });
}

function render(){
    renderUnits();
    renderIncidents();
    renderMessages();
    renderMap();
}

async function loadState(){
    const response=await fetch("/api/state");
    appState=await response.json();
    render();
}

chatForm.addEventListener("submit",async event=>{
    event.preventDefault();

    const body=chatInput.value.trim();
    if(!body)return;

    chatInput.value="";

    await fetch("/api/message",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sender:worker.name,body})
    });
});

function connectSocket(){
    const protocol=window.location.protocol==="https:"?"wss":"ws";
    const socket=new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.onmessage=event=>{
        const msg=JSON.parse(event.data);
        if(msg.type==="state"){
            appState=msg.data;
            render();
        }
    };

    socket.onclose=()=>{
        setTimeout(connectSocket,1000);
    };
}

loadState();
connectSocket();
