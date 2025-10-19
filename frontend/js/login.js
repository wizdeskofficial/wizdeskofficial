// login.js
document.addEventListener('DOMContentLoaded', () => {
    const leaderLoginForm = document.getElementById('leaderLoginForm');
    const memberLoginForm = document.getElementById('memberLoginForm');
    const memberRegisterForm = document.getElementById('memberRegisterForm');

    // Leader Login
    if (leaderLoginForm) {
        leaderLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputs = leaderLoginForm.querySelectorAll('input');
            const data = {
                email: inputs[0].value,
                password: inputs[1].value,
                teamCode: inputs[2].value
            };

            try {
                const response = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Login successful! Redirecting...');
                    localStorage.setItem('user', JSON.stringify(result.user));
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                } else {
                    showMessage(result.error, 'error');
                }
            } catch (error) {
                showMessage('Login failed. Please try again.', 'error');
            }
        });
    }

    // Member Login
    if (memberLoginForm) {
        memberLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputs = memberLoginForm.querySelectorAll('input');
            const data = {
                email: inputs[0].value,
                password: inputs[1].value,
                teamCode: inputs[2].value
            };

            try {
                const response = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Login successful! Redirecting...');
                    localStorage.setItem('user', JSON.stringify(result.user));
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                } else {
                    showMessage(result.error, 'error');
                }
            } catch (error) {
                showMessage('Login failed. Please try again.', 'error');
            }
        });
    }

    // Member Registration
    if (memberRegisterForm) {
        memberRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputs = memberRegisterForm.querySelectorAll('input');
            const data = {
                name: inputs[0].value,
                email: inputs[1].value,
                password: inputs[2].value,
                teamCode: inputs[3].value
            };

            try {
                const response = await fetch(`${API_BASE}/auth/register-member`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Registration successful! Please login.');
                    document.getElementById('memberRegisterModal').style.display = 'none';
                    memberRegisterForm.reset();
                } else {
                    showMessage(result.error, 'error');
                }
            } catch (error) {
                showMessage('Registration failed. Please try again.', 'error');
            }
        });
    }
});