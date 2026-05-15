const form = document.getElementById("loginForm");
const workerId = document.getElementById("workerId");
const password = document.getElementById("password");
const errorBox = document.getElementById("loginError");

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";

    const idValue = workerId.value.trim();
    const passwordValue = password.value;

    if (!idValue || !passwordValue) {
        errorBox.textContent = "Enter your worker ID and password.";
        return;
    }

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                worker_id: idValue,
                password: passwordValue
            })
        });

        if (!response.ok) {
            errorBox.textContent = "Invalid worker ID or password.";
            return;
        }

        const worker = await response.json();
        localStorage.setItem("emstrackWorker", JSON.stringify(worker));
        window.location.href = "/dashboard";
    } catch (error) {
        errorBox.textContent = "Could not connect to EMSTrack.";
    }
});
