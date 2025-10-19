// dashboard.js
let currentUser = null;
let allTasks = [];

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(userData);
    initializeDashboard();
    loadTasks();
    setupEventListeners();
});

function initializeDashboard() {
    // Display user info
    document.getElementById('userName').textContent = `Welcome, ${currentUser.name}`;
    document.getElementById('userRole').textContent = `Role: ${currentUser.role}`;
    document.getElementById('teamCode').textContent = `Team: ${currentUser.team_code}`;

    // Show appropriate section based on role
    if (currentUser.role === 'leader') {
        document.getElementById('leaderSection').style.display = 'block';
    } else {
        document.getElementById('memberSection').style.display = 'block';
        loadUserSubtasks();
    }
}

function setupEventListeners() {
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Create task modal
    const createTaskModal = document.getElementById('createTaskModal');
    const createTaskBtn = document.getElementById('createTaskBtn');
    const closeBtns = document.querySelectorAll('.close');

    if (createTaskBtn) {
        createTaskBtn.addEventListener('click', () => {
            createTaskModal.style.display = 'block';
        });
    }

    closeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Add subtask button
    document.getElementById('addSubtaskBtn').addEventListener('click', addSubtaskField);

    // Create task form
    document.getElementById('createTaskForm').addEventListener('submit', createTask);

    // Window click to close modals
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
}

function addSubtaskField() {
    const container = document.getElementById('subtasksContainer');
    const subtaskDiv = document.createElement('div');
    subtaskDiv.className = 'subtask-input';
    subtaskDiv.innerHTML = `
        <input type="text" placeholder="Subtask title" class="subtask-title" required>
        <textarea placeholder="Subtask description" class="subtask-desc" rows="2"></textarea>
        <button type="button" class="remove-subtask">Remove</button>
    `;
    container.appendChild(subtaskDiv);

    // Add remove functionality
    subtaskDiv.querySelector('.remove-subtask').addEventListener('click', function() {
        container.removeChild(subtaskDiv);
    });
}

async function createTask(e) {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    
    // Collect subtasks
    const subtaskInputs = document.querySelectorAll('.subtask-input');
    const subtasks = Array.from(subtaskInputs).map(input => ({
        title: input.querySelector('.subtask-title').value,
        description: input.querySelector('.subtask-desc').value
    }));

    if (subtasks.length === 0) {
        showMessage('Please add at least one subtask', 'error');
        return;
    }

    const taskData = {
        title,
        description,
        teamCode: currentUser.team_code,
        createdBy: currentUser.id,
        subtasks
    };

    try {
        const response = await fetch(`${API_BASE}/tasks/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Task created successfully!');
            document.getElementById('createTaskModal').style.display = 'none';
            document.getElementById('createTaskForm').reset();
            document.getElementById('subtasksContainer').innerHTML = `
                <div class="subtask-input">
                    <input type="text" placeholder="Subtask title" class="subtask-title">
                    <textarea placeholder="Subtask description" class="subtask-desc" rows="2"></textarea>
                    <button type="button" class="remove-subtask">Remove</button>
                </div>
            `;
            loadTasks(); // Reload tasks
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Failed to create task', 'error');
    }
}

async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/tasks/team/${currentUser.team_code}`);
        const tasks = await response.json();

        if (response.ok) {
            allTasks = tasks;
            displayTasks(tasks);
            updateStats(tasks);
        } else {
            showMessage('Failed to load tasks', 'error');
        }
    } catch (error) {
        showMessage('Failed to load tasks', 'error');
    }
}

function displayTasks(tasks) {
    const tasksList = document.getElementById('tasksList');
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<p class="no-tasks">No tasks created yet.</p>';
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <div class="task-card" onclick="showTaskDetails(${task.id})">
            <div class="task-header">
                <h3>${task.title}</h3>
                <span class="task-status ${task.status}">${task.status}</span>
            </div>
            <p class="task-description">${task.description || 'No description'}</p>
            <div class="task-progress">
                <div class="progress-bar">
                    <div class="progress" style="width: ${calculateProgress(task)}%"></div>
                </div>
                <span>${calculateProgress(task)}% Complete</span>
            </div>
            <div class="task-meta">
                <span>Created by: ${task.created_by_name}</span>
                <span>Subtasks: ${task.subtasks.length}</span>
            </div>
        </div>
    `).join('');
}

function calculateProgress(task) {
    if (task.subtasks.length === 0) return 0;
    const completed = task.subtasks.filter(st => st.status === 'completed').length;
    return Math.round((completed / task.subtasks.length) * 100);
}

function updateStats(tasks) {
    if (currentUser.role !== 'leader') return;

    const totalTasks = tasks.length;
    const inProgressTasks = tasks.filter(task => 
        task.subtasks.some(st => st.progress === 'in_progress')
    ).length;
    const completedTasks = tasks.filter(task => 
        task.subtasks.every(st => st.status === 'completed')
    ).length;

    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('inProgressTasks').textContent = inProgressTasks;
    document.getElementById('completedTasks').textContent = completedTasks;
}

async function loadUserSubtasks() {
    if (currentUser.role !== 'member') return;

    try {
        const response = await fetch(`${API_BASE}/tasks/user/${currentUser.id}/subtasks`);
        const subtasks = await response.json();

        if (response.ok) {
            displayUserSubtasks(subtasks);
        }
    } catch (error) {
        console.error('Failed to load user subtasks:', error);
    }
}

function displayUserSubtasks(subtasks) {
    const myTasksList = document.getElementById('myTasksList');
    
    if (subtasks.length === 0) {
        myTasksList.innerHTML = '<p class="no-tasks">No tasks assigned to you yet.</p>';
        return;
    }

    myTasksList.innerHTML = subtasks.map(subtask => `
        <div class="subtask-card ${subtask.status}">
            <div class="subtask-header">
                <h4>${subtask.title}</h4>
                <span class="subtask-status">${subtask.progress}</span>
            </div>
            <p>${subtask.description || 'No description'}</p>
            <p><strong>Main Task:</strong> ${subtask.task_title}</p>
            <div class="subtask-actions">
                <select onchange="updateSubtaskProgress(${subtask.id}, this.value)" class="progress-select">
                    <option value="not_started" ${subtask.progress === 'not_started' ? 'selected' : ''}>Not Started</option>
                    <option value="in_progress" ${subtask.progress === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="testing" ${subtask.progress === 'testing' ? 'selected' : ''}>Testing</option>
                    <option value="completed" ${subtask.progress === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        </div>
    `).join('');
}

async function updateSubtaskProgress(subtaskId, progress) {
    try {
        const response = await fetch(`${API_BASE}/tasks/subtask/${subtaskId}/progress`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                progress: progress,
                userId: currentUser.id
            })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Progress updated successfully!');
            loadTasks();
            loadUserSubtasks();
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Failed to update progress', 'error');
    }
}

function showTaskDetails(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('taskDetailTitle').textContent = task.title;
    document.getElementById('taskDetailDescription').textContent = task.description || 'No description';
    
    const progress = calculateProgress(task);
    document.getElementById('overallProgress').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `${progress}% Complete`;

    const subtasksList = document.getElementById('subtasksDetailsList');
    subtasksList.innerHTML = task.subtasks.map(subtask => `
        <div class="subtask-detail ${subtask.status}">
            <div class="subtask-info">
                <h4>${subtask.title}</h4>
                <p>${subtask.description || 'No description'}</p>
                <div class="subtask-meta">
                    <span class="status">Status: ${subtask.status}</span>
                    <span class="progress">Progress: ${subtask.progress}</span>
                    <span class="assigned-to">Assigned to: ${subtask.assigned_to_name || 'Not assigned'}</span>
                </div>
            </div>
            ${currentUser.role === 'member' && !subtask.assigned_to ? 
                `<button onclick="takeSubtask(${subtask.id})" class="btn-primary">Take Task</button>` : 
                ''
            }
        </div>
    `).join('');

    document.getElementById('taskDetailsModal').style.display = 'block';
}

async function takeSubtask(subtaskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/subtask/${subtaskId}/assign`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Task assigned to you successfully!');
            document.getElementById('taskDetailsModal').style.display = 'none';
            loadTasks();
            loadUserSubtasks();
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Failed to assign task', 'error');
    }
}

// Task management functions
// Add these functions to your existing dashboard.js

// Task Management Functions
async function loadAllTasksForManagement() {
    try {
        const response = await fetch(`${API_BASE}/tasks/team/${currentUser.team_code}`);
        const tasks = await response.json();
        displayTasksForManagement(tasks);
    } catch (error) {
        console.error('Error loading tasks for management:', error);
        showMessage('Failed to load tasks', 'error');
    }
}

function displayTasksForManagement(tasks) {
    const container = document.getElementById('allTasksManagement');
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📝</div>
                <h3>No Tasks Created</h3>
                <p>Create your first task to get started</p>
                <button class="btn btn-primary" onclick="showCreateTaskModal()">
                    Create First Task
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card">
            <div class="task-header">
                <div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-description">${task.description || 'No description'}</div>
                </div>
                <span class="task-status">${task.status}</span>
            </div>
            
            <div class="progress-section">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>${calculateProgress(task)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${calculateProgress(task)}%"></div>
                </div>
            </div>

            <div class="task-meta">
                <div>
                    <span style="color: #666; font-size: 0.9rem;">
                        ${task.subtasks.length} subtasks • Created by ${task.created_by_name}
                    </span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-sm btn-primary" onclick="editTask(${task.id})">
                        Edit
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="manageTask(${task.id})">
                        Manage
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Edit Task Functionality
async function editTask(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`);
        const task = await response.json();
        
        // Populate edit form
        document.getElementById('editTaskId').value = task.id;
        document.getElementById('editTaskTitle').value = task.title;
        document.getElementById('editTaskDescription').value = task.description || '';
        
        // Populate subtasks for editing
        const subtasksContainer = document.getElementById('editSubtasksContainer');
        subtasksContainer.innerHTML = task.subtasks.map(subtask => `
            <div class="subtask-item" data-subtask-id="${subtask.id}">
                <input type="text" class="subtask-input" value="${subtask.title}" placeholder="Subtask title" required>
                <textarea class="subtask-desc" placeholder="Subtask description">${subtask.description || ''}</textarea>
                <select class="form-select assignee-select">
                    <option value="">Not assigned</option>
                    ${teamMembers.map(member => 
                        `<option value="${member.id}" ${subtask.assigned_to === member.id ? 'selected' : ''}>
                            ${member.name} - ${member.email}
                        </option>`
                    ).join('')}
                </select>
                <button type="button" class="remove-subtask" onclick="removeEditSubtask(this)">Remove</button>
            </div>
        `).join('');
        
        showModal('editTaskModal');
    } catch (error) {
        console.error('Error loading task for editing:', error);
        showMessage('Failed to load task details', 'error');
    }
}

async function updateTask() {
    const taskId = document.getElementById('editTaskId').value;
    const title = document.getElementById('editTaskTitle').value;
    const description = document.getElementById('editTaskDescription').value;
    
    // Collect subtask updates
    const subtaskItems = document.querySelectorAll('#editSubtasksContainer .subtask-item');
    const subtaskUpdates = Array.from(subtaskItems).map(item => {
        const subtaskId = item.getAttribute('data-subtask-id');
        const title = item.querySelector('.subtask-input').value;
        const description = item.querySelector('.subtask-desc').value;
        const assignedTo = item.querySelector('.assignee-select').value;
        
        return {
            id: subtaskId,
            title,
            description,
            assigned_to: assignedTo || null
        };
    });

    try {
        // Update main task
        const taskResponse = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description,
                userId: currentUser.id
            })
        });

        if (!taskResponse.ok) {
            throw new Error('Failed to update task');
        }

        // Update subtasks
        for (const subtask of subtaskUpdates) {
            const subtaskResponse = await fetch(`${API_BASE}/tasks/subtask/${subtask.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: subtask.title,
                    description: subtask.description,
                    assigned_to: subtask.assigned_to,
                    userId: currentUser.id
                })
            });

            if (!subtaskResponse.ok) {
                throw new Error('Failed to update subtask');
            }
        }

        showMessage('Task updated successfully!', 'success');
        closeModal('editTaskModal');
        loadTeamData(); // Refresh data
    } catch (error) {
        console.error('Error updating task:', error);
        showMessage('Failed to update task', 'error');
    }
}

// Delete Task Functionality
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task? This will also delete all subtasks.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Task deleted successfully!', 'success');
            loadTeamData(); // Refresh data
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        showMessage('Failed to delete task', 'error');
    }
}

// Member Management Functions
async function loadAllTeamMembers() {
    try {
        const response = await fetch(`${API_BASE}/auth/team/${currentUser.team_code}/all-members`);
        const members = await response.json();
        displayAllTeamMembers(members);
    } catch (error) {
        console.error('Error loading team members:', error);
        showMessage('Failed to load team members', 'error');
    }
}

function displayAllTeamMembers(members) {
    const container = document.getElementById('membersList');
    
    if (members.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">👥</div>
                <h3>No Team Members</h3>
                <p>Team members will appear here when they join</p>
            </div>
        `;
        return;
    }

    container.innerHTML = members.map(member => `
        <div class="member-card">
            <div class="member-avatar">
                ${member.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-name">${member.name}</div>
            <div class="member-email">${member.email}</div>
            <div class="member-role ${member.role}">${member.role.toUpperCase()}</div>
            <div class="member-stats">
                <div class="stat">
                    <div class="stat-value">${member.assigned_tasks || 0}</div>
                    <div class="stat-label">Tasks</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${member.completed_tasks || 0}</div>
                    <div class="stat-label">Completed</div>
                </div>
            </div>
            ${member.role === 'member' ? `
                <div class="member-actions">
                    <button class="btn btn-sm btn-danger" onclick="deleteMember(${member.id}, '${member.name}')">
                        Remove
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function deleteMember(memberId, memberName) {
    if (!confirm(`Are you sure you want to remove ${memberName} from the team?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/team/${currentUser.team_code}/member/${memberId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaderId: currentUser.id })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Member removed successfully!', 'success');
            loadAllTeamMembers(); // Refresh members list
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting member:', error);
        showMessage('Failed to remove member', 'error');
    }
}

// Task Filtering Functions
async function loadTasksByStatus(status) {
    try {
        const response = await fetch(`${API_BASE}/tasks/team/${currentUser.team_code}/status/${status}`);
        const tasks = await response.json();
        
        if (status === 'active') {
            displayActiveTasks(tasks);
        } else if (status === 'completed') {
            displayCompletedTasks(tasks);
        }
    } catch (error) {
        console.error('Error loading tasks by status:', error);
        showMessage('Failed to load tasks', 'error');
    }
}

function displayActiveTasks(tasks) {
    const container = document.getElementById('activeTasksList');
    const activeTasks = tasks.filter(task => 
        task.subtasks.some(subtask => subtask.status !== 'completed')
    );
    
    displayFilteredTasks(container, activeTasks, 'active');
}

function displayCompletedTasks(tasks) {
    const container = document.getElementById('completedTasksList');
    const completedTasks = tasks.filter(task => 
        task.subtasks.length > 0 && task.subtasks.every(subtask => subtask.status === 'completed')
    );
    
    displayFilteredTasks(container, completedTasks, 'completed');
}

function displayFilteredTasks(container, tasks, type) {
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">${type === 'active' ? '📝' : '✅'}</div>
                <h3>No ${type} Tasks</h3>
                <p>${type === 'active' ? 'All tasks are completed!' : 'Complete some tasks to see them here.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card">
            <div class="task-header">
                <div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-description">${task.description || 'No description'}</div>
                </div>
                <span class="task-status">${task.status}</span>
            </div>
            
            <div class="progress-section">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>${calculateProgress(task)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${calculateProgress(task)}%"></div>
                </div>
            </div>

            <div class="task-meta">
                <div>
                    <span style="color: #666; font-size: 0.9rem;">
                        ${task.subtasks.length} subtasks • Created by ${task.created_by_name}
                    </span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-sm btn-primary" onclick="manageTask(${task.id})">
                        View Details
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Update tab switching to handle new tabs
function showTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabId).style.display = 'block';
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Load specific data for tabs
    switch(tabId) {
        case 'tasks':
            loadAllTasksForManagement();
            break;
        case 'members':
            loadAllTeamMembers();
            break;
        case 'active-tasks':
            loadTasksByStatus('active');
            break;
        case 'completed-tasks':
            loadTasksByStatus('completed');
            break;
    }
}
async function loadAllTasksForManagement() {
    try {
        const response = await fetch(`${API_BASE}/tasks/team/${currentUser.team_code}`);
        const tasks = await response.json();
        displayTasksForManagement(tasks);
    } catch (error) {
        console.error('Error loading tasks for management:', error);
        showMessage('Failed to load tasks', 'error');
    }
}

function displayTasksForManagement(tasks) {
    const container = document.getElementById('allTasksManagement');
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📝</div>
                <h3>No Tasks Created</h3>
                <p>Create your first task to get started</p>
                <button class="btn btn-primary" onclick="showCreateTaskModal()">
                    Create First Task
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card">
            <div class="task-header">
                <div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-description">${task.description || 'No description'}</div>
                </div>
                <span class="task-status">${task.status}</span>
            </div>
            
            <div class="progress-section">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>${calculateProgress(task)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${calculateProgress(task)}%"></div>
                </div>
            </div>

            <div class="task-meta">
                <div>
                    <span style="color: #666; font-size: 0.9rem;">
                        ${task.subtasks.length} subtasks • Created by ${task.created_by_name}
                    </span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-sm btn-primary" onclick="manageTask(${task.id})">
                        Manage
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function manageTask(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`);
        const task = await response.json();
        
        const modalContent = document.getElementById('manageTaskContent');
        modalContent.innerHTML = `
            <h3>${task.title}</h3>
            <p>${task.description || 'No description'}</p>
            
            <div class="subtasks-section" style="margin-top: 20px;">
                <h4>Subtasks</h4>
                ${task.subtasks.map(subtask => `
                    <div class="subtask-item" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 10px;">
                        <div>
                            <strong>${subtask.title}</strong>
                            <div style="font-size: 0.9rem; color: #666;">
                                Status: ${subtask.status} | 
                                Assigned to: ${subtask.assigned_to_name || 'Not assigned'}
                            </div>
                        </div>
                        <div class="task-actions">
                            <button class="btn btn-sm btn-danger" onclick="deleteSubtask(${subtask.id})">
                                Remove
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn btn-danger" onclick="deleteTask(${task.id})" style="flex: 1;">
                    Delete Entire Task
                </button>
                <button class="btn btn-outline" onclick="closeModal('manageTaskModal')" style="flex: 1;">
                    Close
                </button>
            </div>
        `;
        
        showModal('manageTaskModal');
    } catch (error) {
        console.error('Error loading task details:', error);
        showMessage('Failed to load task details', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task? This will also delete all subtasks.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Task deleted successfully!', 'success');
            closeModal('manageTaskModal');
            loadTeamData(); // Refresh data
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        showMessage('Failed to delete task', 'error');
    }
}

async function deleteSubtask(subtaskId) {
    if (!confirm('Are you sure you want to delete this subtask?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/tasks/subtask/${subtaskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Subtask deleted successfully!', 'success');
            closeModal('manageTaskModal');
            loadTeamData(); // Refresh data
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting subtask:', error);
        showMessage('Failed to delete subtask', 'error');
    }
}

// Update the tab switching to load management data
function showTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Load specific data for tabs
    if (tabId === 'tasks') {
        loadAllTasksForManagement();
    }
}