// backend/routes/tasks.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Helper function to get subtasks for multiple tasks efficiently
async function getSubtasksForTasks(taskIds) {
  if (taskIds.length === 0) return [];
  
  const subtasksResult = await pool.query(
    `SELECT s.*, u.name as assigned_to_name, u.email as assigned_to_email, s.task_id
     FROM subtasks s 
     LEFT JOIN users u ON s.assigned_to = u.id 
     WHERE s.task_id = ANY($1) 
     ORDER BY s.task_id, s.created_at`,
    [taskIds]
  );
  
  // Group subtasks by task_id
  const subtasksByTask = {};
  subtasksResult.rows.forEach(subtask => {
    if (!subtasksByTask[subtask.task_id]) {
      subtasksByTask[subtask.task_id] = [];
    }
    subtasksByTask[subtask.task_id].push(subtask);
  });
  
  return subtasksByTask;
}

// Helper function to get subtasks for a single task
async function getSubtasksForTask(taskId) {
  const client = await pool.connect();
  try {
    const subtasksResult = await client.query(
      `SELECT s.*, u.name as assigned_to_name, u.email as assigned_to_email
       FROM subtasks s 
       LEFT JOIN users u ON s.assigned_to = u.id 
       WHERE s.task_id = $1 
       ORDER BY s.created_at`,
      [taskId]
    );
    return subtasksResult.rows;
  } finally {
    client.release();
  }
}

// Helper function to get task with subtasks
async function getTaskWithSubtasks(taskId) {
  const client = await pool.connect();
  try {
    const taskResult = await client.query(
      `SELECT t.*, u.name as created_by_name
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return null;
    }

    const task = taskResult.rows[0];
    task.subtasks = await getSubtasksForTask(taskId);
    return task;
  } finally {
    client.release();
  }
}

// Helper function to get subtask with details
async function getSubtaskWithDetails(subtaskId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT s.*, u.name as assigned_to_name, u.email as assigned_to_email,
              t.title as task_title, t.description as task_description,
              t.team_code, t.created_by
       FROM subtasks s
       LEFT JOIN users u ON s.assigned_to = u.id
       JOIN tasks t ON s.task_id = t.id
       WHERE s.id = $1`,
      [subtaskId]
    );
    
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ===== CREATE TASK WITH SUBTASKS =====
router.post('/create', async (req, res) => {
  let client;
  try {
    const { title, description, teamCode, createdBy, subtasks, assignSpecific } = req.body;

    if (!title || !teamCode || !createdBy || !subtasks || subtasks.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create main task
      const taskResult = await client.query(
        'INSERT INTO tasks (title, description, team_code, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [title, description, teamCode, createdBy]
      );

      const taskId = taskResult.rows[0].id;

      // Create subtasks
      for (const subtask of subtasks) {
        let status = 'available';
        let assignedTo = null;
        let progress = 'not_started';
        
        // If assignment is specified, mark as assigned
        if (assignSpecific && subtask.assigned_to) {
          status = 'assigned';
          assignedTo = subtask.assigned_to;
          progress = 'assigned';
        }

        await client.query(
          'INSERT INTO subtasks (task_id, title, description, assigned_to, status, progress) VALUES ($1, $2, $3, $4, $5, $6)',
          [taskId, subtask.title, subtask.description || null, assignedTo, status, progress]
        );
      }

      await client.query('COMMIT');
      
      const completeTask = await getTaskWithSubtasks(taskId);
      
      res.json({ 
        message: 'Task created successfully', 
        task: completeTask 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== GET ALL TASKS FOR A TEAM =====
router.get('/team/:teamCode', async (req, res) => {
  let client;
  try {
    const { teamCode } = req.params;
    client = await pool.connect();

    // Get all tasks for the team
    const tasksResult = await client.query(
      `SELECT t.*, u.name as created_by_name,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as total_subtasks,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'completed') as completed_subtasks
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.team_code = $1
       ORDER BY t.created_at DESC`,
      [teamCode]
    );

    if (tasksResult.rows.length === 0) {
      return res.json([]);
    }

    // Get all task IDs
    const taskIds = tasksResult.rows.map(task => task.id);
    
    // Get all subtasks for these tasks in one query
    const subtasksResult = await client.query(
      `SELECT s.*, u.name as assigned_to_name, u.email as assigned_to_email, s.task_id
       FROM subtasks s 
       LEFT JOIN users u ON s.assigned_to = u.id 
       WHERE s.task_id = ANY($1) 
       ORDER BY s.task_id, s.created_at`,
      [taskIds]
    );

    // Group subtasks by task_id
    const subtasksByTask = {};
    subtasksResult.rows.forEach(subtask => {
      if (!subtasksByTask[subtask.task_id]) {
        subtasksByTask[subtask.task_id] = [];
      }
      subtasksByTask[subtask.task_id].push(subtask);
    });

    // Combine tasks with their subtasks
    const tasksWithSubtasks = tasksResult.rows.map(task => ({
      ...task,
      subtasks: subtasksByTask[task.id] || []
    }));

    res.json(tasksWithSubtasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== GET SINGLE TASK BY ID =====
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await getTaskWithSubtasks(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== GET AVAILABLE SUBTASKS FOR A TEAM =====
router.get('/team/:teamCode/available', async (req, res) => {
  let client;
  try {
    const { teamCode } = req.params;
    client = await pool.connect();

    const result = await client.query(
      `SELECT s.*, t.title as task_title, t.description as task_description,
              u.name as created_by_name
       FROM subtasks s
       JOIN tasks t ON s.task_id = t.id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.team_code = $1 AND s.status = 'available'
       ORDER BY s.created_at DESC`,
      [teamCode]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get available tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== GET USER'S ASSIGNED SUBTASKS =====
router.get('/user/:userId/subtasks', async (req, res) => {
  let client;
  try {
    const { userId } = req.params;
    client = await pool.connect();

    const result = await client.query(
      `SELECT s.*, t.title as task_title, t.description as task_description,
              t.team_code, u.name as assigned_to_name, uc.name as created_by_name
       FROM subtasks s
       JOIN tasks t ON s.task_id = t.id
       LEFT JOIN users u ON s.assigned_to = u.id
       LEFT JOIN users uc ON t.created_by = uc.id
       WHERE s.assigned_to = $1
       ORDER BY 
         CASE s.progress 
           WHEN 'not_started' THEN 1 WHEN 'assigned' THEN 2 WHEN 'in_progress' THEN 3
           WHEN 'testing' THEN 4 WHEN 'completed' THEN 5 ELSE 6
         END,
         s.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get user subtasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== MEMBER TAKES A SUBTASK =====
router.put('/subtask/:subtaskId/take', async (req, res) => {
  let client;
  try {
    const { subtaskId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    client = await pool.connect();
    
    await client.query('BEGIN');

    const subtaskCheck = await client.query(
      'SELECT * FROM subtasks WHERE id = $1 FOR UPDATE',
      [subtaskId]
    );

    if (subtaskCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const subtask = subtaskCheck.rows[0];

    if (subtask.status !== 'available') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This subtask is no longer available' });
    }

    await client.query(
      `UPDATE subtasks 
       SET assigned_to = $1, status = $2, progress = $3, updated_at = NOW()
       WHERE id = $4`,
      [userId, 'taken', 'in_progress', subtaskId]
    );

    await client.query('COMMIT');
    
    const updatedSubtask = await getSubtaskWithDetails(subtaskId);

    res.json({ 
      message: 'Subtask assigned to you successfully!', 
      subtask: updatedSubtask 
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Take subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== LEADER ASSIGNS SPECIFIC SUBTASK TO MEMBER =====
router.put('/subtask/:subtaskId/assign-to', async (req, res) => {
  let client;
  try {
    const { subtaskId } = req.params;
    const { userId, assignedBy } = req.body;

    if (!userId || !assignedBy) {
      return res.status(400).json({ error: 'User ID and assignedBy are required' });
    }

    client = await pool.connect();

    const result = await client.query(
      `UPDATE subtasks 
       SET assigned_to = $1, status = $2, progress = $3, updated_at = NOW()
       WHERE id = $4 
       RETURNING *`,
      [userId, 'assigned', 'assigned', subtaskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const updatedSubtask = await getSubtaskWithDetails(subtaskId);

    res.json({ 
      message: 'Subtask assigned to member successfully', 
      subtask: updatedSubtask 
    });
  } catch (error) {
    console.error('Leader assign subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== UPDATE SUBTASK PROGRESS =====
router.put('/subtask/:subtaskId/progress', async (req, res) => {
  let client;
  try {
    const { subtaskId } = req.params;
    const { progress, userId } = req.body;

    if (!progress || !userId) {
      return res.status(400).json({ error: 'Progress and user ID are required' });
    }

    client = await pool.connect();

    const subtaskResult = await client.query(
      `SELECT s.*, t.team_code, t.created_by 
       FROM subtasks s 
       JOIN tasks t ON s.task_id = t.id 
       WHERE s.id = $1`,
      [subtaskId]
    );

    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }
    const subtask = subtaskResult.rows[0];

    const userCheck = await client.query(
      'SELECT role, team_code FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }
    const user = userCheck.rows[0];

    const isOwner = subtask.assigned_to === parseInt(userId);
    const isLeader = user.role === 'leader' && user.team_code === subtask.team_code;

    if (!isOwner && !isLeader) {
      return res.status(403).json({ error: 'Not authorized to update this subtask' });
    }

    let status = subtask.status;
    if (progress === 'completed') {
      status = 'completed';
    } else if (progress === 'in_progress' && status === 'assigned') {
      status = 'taken';
    }

    await client.query(
      'UPDATE subtasks SET progress = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [progress, status, subtaskId]
    );

    const updatedSubtask = await getSubtaskWithDetails(subtaskId);

    res.json({ 
      message: 'Progress updated successfully', 
      subtask: updatedSubtask
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== DELETE TASK =====
router.delete('/:taskId', async (req, res) => {
  let client;
  try {
    const { taskId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    client = await pool.connect();

    // Verify user is task creator or team leader
    const taskCheck = await client.query(
      'SELECT created_by, team_code FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskCheck.rows[0];
    const userCheck = await client.query(
      'SELECT role, team_code FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const user = userCheck.rows[0];
    const isCreator = task.created_by === parseInt(userId);
    const isLeader = user.role === 'leader' && user.team_code === task.team_code;

    if (!isCreator && !isLeader) {
      return res.status(403).json({ error: 'Not authorized to delete this task' });
    }

    await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== EDIT TASK =====
router.put('/:taskId', async (req, res) => {
  let client;
  try {
    const { taskId } = req.params;
    const { title, description, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    client = await pool.connect();

    // Authorization logic
    const taskCheck = await client.query(
      'SELECT created_by, team_code FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskCheck.rows[0];
    const userCheck = await client.query(
      'SELECT role, team_code FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const user = userCheck.rows[0];
    const isCreator = task.created_by === parseInt(userId);
    const isLeader = user.role === 'leader' && user.team_code === task.team_code;

    if (!isCreator && !isLeader) {
      return res.status(403).json({ error: 'Not authorized to edit this task' });
    }

    const result = await client.query(
      'UPDATE tasks SET title = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [title, description, taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = await getTaskWithSubtasks(taskId);
    
    res.json({ 
      message: 'Task updated successfully', 
      task: updatedTask 
    });
  } catch (error) {
    console.error('Edit task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== EDIT SUBTASK =====
router.put('/subtask/:subtaskId', async (req, res) => {
  let client;
  try {
    const { subtaskId } = req.params;
    const { title, description, assigned_to, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    client = await pool.connect();

    // Authorization logic
    const subtaskCheck = await client.query(
      `SELECT s.*, t.team_code, t.created_by 
       FROM subtasks s 
       JOIN tasks t ON s.task_id = t.id 
       WHERE s.id = $1`,
      [subtaskId]
    );

    if (subtaskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const subtask = subtaskCheck.rows[0];
    const userCheck = await client.query(
      'SELECT role, team_code FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const user = userCheck.rows[0];
    const isLeader = user.role === 'leader' && user.team_code === subtask.team_code;

    if (!isLeader) {
      return res.status(403).json({ error: 'Not authorized to edit this subtask' });
    }

    let status = 'available';
    let progress = 'not_started';
    if (assigned_to) {
      status = 'assigned';
      progress = 'assigned';
    }

    const result = await client.query(
      `UPDATE subtasks 
       SET title = $1, description = $2, assigned_to = $3, status = $4, progress = $5, updated_at = NOW()
       WHERE id = $6 
       RETURNING *`,
      [title, description, assigned_to, status, progress, subtaskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const updatedSubtask = await getSubtaskWithDetails(subtaskId);
    
    res.json({ 
      message: 'Subtask updated successfully', 
      subtask: updatedSubtask 
    });
  } catch (error) {
    console.error('Edit subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// ===== GET TASKS BY STATUS =====
router.get('/team/:teamCode/status/:status', async (req, res) => {
  let client;
  try {
    const { teamCode, status } = req.params;
    client = await pool.connect();

    let query = `
      SELECT DISTINCT t.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as total_subtasks,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'completed') as completed_subtasks
      FROM tasks t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.team_code = $1
    `;
    
    if (status === 'active') {
      query += ` AND EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = t.id AND s.status != 'completed')`;
    } else if (status === 'completed') {
      query += ` AND NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = t.id AND s.status != 'completed') AND (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) > 0`;
    }

    query += ` ORDER BY t.created_at DESC`;

    const tasksResult = await client.query(query, [teamCode]);

    if (tasksResult.rows.length === 0) {
      return res.json([]);
    }

    const taskIds = tasksResult.rows.map(task => task.id);
    const subtasksByTask = await getSubtasksForTasks(taskIds);

    const tasksWithSubtasks = tasksResult.rows.map(task => ({
      ...task,
      subtasks: subtasksByTask[task.id] || []
    }));

    res.json(tasksWithSubtasks);
  } catch (error) {
    console.error('Get tasks by status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;