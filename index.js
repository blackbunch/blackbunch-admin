const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

// 3. 레슨 일정 추가 API (보강 구분 기능 반영)
app.post('/api/schedules', async (req, res) => {
  const { student_name, coach_name, subject, room_name, lesson_type, start_time, end_time } = req.body;
  const client = await pool.connect();
  const type = lesson_type || '정규';

  try {
    await client.query('BEGIN');

    // 정규 레슨일 경우에만 수강생 잔여 횟수 체크 및 차감
    if (type === '정규') {
      const studentRes = await client.query('SELECT remaining_lessons FROM students WHERE name = $1', [student_name]);
      if (studentRes.rows.length > 0 && studentRes.rows[0].remaining_lessons <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '수강생의 잔여 횟수가 부족합니다.' });
      }

      await client.query(
        `UPDATE students SET remaining_lessons = remaining_lessons - 1 WHERE name = $1`,
        [student_name]
      );
    }

    // 일정 추가 (lesson_type 저장/ subject에 표기 처리)
    const scheduleRes = await client.query(
      `INSERT INTO schedules (student_name, coach_name, subject, room_name, start_time, end_time) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [student_name, coach_name, type === '보강' ? `[보강] ${subject}` : subject, room_name, start_time, end_time]
    );

    await client.query('COMMIT');
    res.status(201).json(scheduleRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add Schedule Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 4. 레슨 일정 수정 API
app.put('/api/schedules/:id', async (req, res) => {
  const { id } = req.params;
  const { student_name, coach_name, subject, room_name, start_time, end_time } = req.body;
  try {
    const result = await pool.query(
      `UPDATE schedules 
       SET student_name = $1, coach_name = $2, subject = $3, room_name = $4, start_time = $5, end_time = $6 
       WHERE id = $7 RETURNING *`,
      [student_name, coach_name, subject, room_name, start_time, end_time, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 일정을 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update Schedule Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. 레슨 일정 삭제 API (정규 레슨만 횟수 복구)
app.delete('/api/schedules/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const scheduleRes = await client.query('SELECT student_name, subject FROM schedules WHERE id = $1', [id]);
    
    if (scheduleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 일정을 찾을 수 없습니다.' });
    }

    const { student_name, subject } = scheduleRes.rows[0];
    const isMakeup = subject && subject.includes('[보강]');

    // 일정 삭제
    await client.query('DELETE FROM schedules WHERE id = $1', [id]);

    // 보강이 아니고 정규 레슨 삭제일 때만 +1회 복구
    if (!isMakeup) {
      await client.query(
        `UPDATE students SET remaining_lessons = remaining_lessons + 1 WHERE name = $1`,
        [student_name]
      );
    }

    await client.query('COMMIT');
    res.json({ message: isMakeup ? '보강 일정이 삭제되었습니다.' : '일정이 삭제되고 정규 수강 횟수가 복구되었습니다.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete Schedule Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 6. 수강생 목록 조회 API
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Students Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. 신규 수강생 등록 API
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
