const EasyBook = (() => {
    const tokenKey = "easybookToken";

    async function request(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        const token = localStorage.getItem(tokenKey);
        if (token) headers.Authorization = `Bearer ${token}`;
        if (options.body) headers["Content-Type"] = "application/json";

        const response = await fetch(`/api${path}`, { ...options, headers });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401 && path !== "/auth/login" && path !== "/auth/signup") {
                localStorage.removeItem(tokenKey);
            }
            throw new Error(payload.error || "The request could not be completed.");
        }
        return payload;
    }

    async function currentUser() {
        if (!localStorage.getItem(tokenKey)) return null;
        try {
            return (await request("/auth/me")).user;
        } catch {
            return null;
        }
    }

    function saveSession(session) {
        localStorage.setItem(tokenKey, session.token);
        localStorage.setItem("userEmail", session.user.email);
    }

    async function logout() {
        try {
            await request("/auth/logout", { method: "POST" });
        } finally {
            localStorage.removeItem(tokenKey);
            localStorage.removeItem("userEmail");
        }
    }

    function requireLogin() {
        if (localStorage.getItem(tokenKey)) return true;
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `signup.html?next=${next}`;
        return false;
    }

    return { request, currentUser, saveSession, logout, requireLogin };
})();