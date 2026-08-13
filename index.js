const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// CORS 및 JSON 파싱 설정 (외부 요청 허용)
app.use(cors());
app.use(express.json());

// Supabase DB 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 기본 경로 확인용 API
app.get('/', (req, res) => {
  res.send('Server running');
});

// 1. 로그인 API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, name, color, role FROM coaches WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
  }
});

// 2. 전체 레슨 일정 조회 API
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM schedules ORDER BY start_time ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Schedules Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. 레슨 일정 추가 API
app.post('/api/schedules', async (req, res) => {
  const { student_name, coach_name, subject, room_name, start_time, end_time } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO schedules (student_name, coach_name, subject, room_name, start_time, end_time) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [student_name, coach_name, subject, room_name, start_time, end_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add Schedule Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. 수강생 목록 조회 API
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Students Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. 신규 수강생 등록 API
app.post('/api/students', async (req, res) => {
  const { name, phone, subject, total_lessons } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO students (name, phone, subject, total_lessons, remaining_lessons) 
       VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [name, phone, subject, total_lessons || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add Student Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
