const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. 로그인 API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT id, username, name, color, role FROM coaches WHERE username = $1 AND password = $2',
      [username, password]
    );
    client.release();
    
    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 수강생 목록 조회 API
app.get('/api/students', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM students ORDER BY name ASC');
    client.release();
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 수강생 등록 API
app.post('/api/students', async (req, res) => {
  const { name, phone, subject, total_lessons } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO students (name, phone, subject, total_lessons, remaining_lessons) VALUES ($1, $2, $3, $4, $4) RETURNING *',
      [name, phone, subject, total_lessons]
    );
    client.release();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 레슨 일정 목록 조회 API (권한별 구분)
app.get('/api/schedules', async (req, res) => {
  const { coach_name, role } = req.query;
  try {
    const client = await pool.connect();
    let query = 'SELECT * FROM schedules';
    let params = [];

    // 코치 계정은 본인 수업만 조회
    if (role === 'coach' && coach_name) {
      query += ' WHERE coach_name = $1';
      params.push(coach_name);
    }

    query += ' ORDER BY start_time ASC';
    const result = await client.query(query, params);
    client.release();
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 레슨 일정 등록 API
app.post('/api/schedules', async (req, res) => {
  const { student_name, coach_name, subject, room_name, start_time, end_time } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO schedules (student_name, coach_name, subject, room_name, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [student_name, coach_name, subject, room_name, start_time, end_time]
    );
    client.release();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
