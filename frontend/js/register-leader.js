// register-leader.js
document.addEventListener('DOMContentLoaded', () => {
    const leaderRegisterForm = document.getElementById('leaderRegisterForm');
    const successMessage = document.getElementById('successMessage');

    if (leaderRegisterForm) {
        leaderRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                name: document.getElementById('leaderName').value,
                email: document.getElementById('leaderEmail').value,
                password: document.getElementById('leaderPassword').value,
                teamName: document.getElementById('teamName').value
            };

            try {
                const response = await fetch(`${API_BASE}/auth/register-leader`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    // Show success message with team code
                    document.getElementById('generatedTeamCode').textContent = result.teamCode;
                    leaderRegisterForm.style.display = 'none';
                    successMessage.style.display = 'block';
                } else {
                    showMessage(result.error, 'error');
                }
            } catch (error) {
                showMessage('Registration failed. Please try again.', 'error');
            }
        });
    }
});