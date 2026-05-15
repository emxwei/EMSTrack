const signupForm = document.getElementById("signupForm");
const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const role = document.getElementById("role");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const result = document.getElementById("signupResult");

function showError(message) {
    result.className = "signup-result error";
    result.textContent = message;
}

function showSuccess(message) {
    result.className = "signup-result success";
    result.innerHTML = message;
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.className = "signup-result";
    result.textContent = "";

    const payload = {
        full_name: fullName.value.trim(),
        email: email.value.trim(),
        role: role.value,
        password: password.value
    };

    if (!payload.full_name || !payload.email || !payload.role || !payload.password || !confirmPassword.value) {
        showError("Please fill out all fields.");
        return;
    }

    if (!validEmail(payload.email)) {
        showError("Email must be a proper email address.");
        return;
    }

    if (payload.password.length < 6) {
        showError("Password must be at least 6 characters.");
        return;
    }

    if (payload.password !== confirmPassword.value) {
        showError("Passwords do not match.");
        return;
    }

    try {
        const response = await fetch("/api/signup", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        let data = {};
        try {
            data = await response.json();
        } catch (error) {}

        if (!response.ok) {
            if (Array.isArray(data.detail)) {
                const emailError = data.detail.some(item => item.loc && item.loc.includes("email"));
                if (emailError) {
                    showError("Email must be a proper email address.");
                    return;
                }
            }

            if (typeof data.detail === "string") {
                showError(data.detail);
                return;
            }

            showError("Could not create account.");
            return;
        }

        showSuccess(`
            Account created successfully.<br>
            Your worker ID is <strong>${data.worker_id}</strong>.<br>
            Use this ID and your password to log in.
        `);

        signupForm.reset();
    } catch (error) {
        showError("Could not connect to EMSTrack.");
    }
});
