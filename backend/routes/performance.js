// backend/routes/performance.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Get performance data for all members of a team
router.get('/team/:teamCode', async (req, res) => {
    try {
        const { teamCode } = req.params;

        // Query to get all approved members of the team first
        const membersResult = await pool.query(
            `SELECT id, name, email FROM users WHERE team_code = $1 AND role = 'member' AND status = 'approved'`,
            [teamCode]
        );

        // If there are no members, return an empty array
        if (membersResult.rows.length === 0) {
            return res.json([]);
        }

        const memberIds = membersResult.rows.map(m => m.id);

        // Query to get aggregated subtask stats for all members in one go
        const statsResult = await pool.query(
            `SELECT 
                assigned_to,
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN progress = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN progress = 'in_progress' OR progress = 'testing' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN progress = 'not_started' OR progress = 'assigned' THEN 1 END) as pending_tasks
             FROM subtasks
             WHERE assigned_to = ANY($1::int[])
             GROUP BY assigned_to`,
            [memberIds]
        );

        // Map the stats back to each member
        const performanceData = membersResult.rows.map(member => {
            const stats = statsResult.rows.find(s => s.assigned_to === member.id);
            
            const total_tasks = stats ? parseInt(stats.total_tasks, 10) : 0;
            const completed_tasks = stats ? parseInt(stats.completed_tasks, 10) : 0;

            // Combine member info with their calculated stats
            return {
                ...member,
                total_tasks: total_tasks,
                completed_tasks: completed_tasks,
                in_progress_tasks: stats ? parseInt(stats.in_progress_tasks, 10) : 0,
                pending_tasks: stats ? parseInt(stats.pending_tasks, 10) : 0,
                completion_rate: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0,
            };
        });
        
        // Sort the data by completion rate in descending order
        performanceData.sort((a, b) => {
            if (b.completion_rate !== a.completion_rate) {
                return b.completion_rate - a.completion_rate;
            }
            return b.completed_tasks - a.completed_tasks; // Tie-breaker
        });

        res.json(performanceData);

    } catch (error) {
        console.error('Error fetching performance data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;