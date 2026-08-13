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

// 2. 전체 레슨 일정 및 연습실 일정 조회 API
app.get('/api/schedules', async (req, res) => {
  try {
    const lessons = await pool.query('SELECT *, \'lesson\' as schedule_type FROM schedules ORDER BY start_time ASC');
    const practiceRooms = await pool.query('SELECT *, \'practice\' as schedule_type FROM practice_room_schedules ORDER BY start_time ASC');
    
    res.json([...lessons.rows, ...practiceRooms.rows]);
  } catch (err) {
    console.error('Fetch Schedules Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. 레슨 일정 추가 API
app.post('/api/schedules', async (req, res) => {
  const { student_name, coach_name, subject, room_name, lesson_type, start_time, end_time, memo } = req.body;
  const client = await pool.connect();
  const type = lesson_type || '정규';

  try {
    await client.query('BEGIN');

    // 레슨 방 중복 체크
    const roomOverlap = await client.query(
      `SELECT id FROM schedules WHERE room_name = $1 AND start_time < $2 AND end_time > $3`,
      [room_name, end_time, start_time]
    );

    if (roomOverlap.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${room_name}은 해당 시간대에 이미 다른 레슨이 존재합니다.` });
    }

    // 코치 중복 체크
    const coachOverlap = await client.query(
      `SELECT id FROM schedules WHERE coach_name = $1 AND start_time < $2 AND end_time > $3`,
      [coach_name, end_time, start_time]
    );
    if (coachOverlap.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${coach_name}은 해당 시간대에 이미 다른 레슨이 있습니다.` });
    }

    // 정규 레슨 횟수 차감
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

    const scheduleRes = await client.query(
      `INSERT INTO schedules (student_name, coach_name, subject, room_name, start_time, end_time, status, memo) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [student_name, coach_name, type === '보강' ? `[보강] ${subject}` : subject, room_name, start_time, end_time, '예약', memo || '']
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

// 4. 연습실 예약 추가 API
app.post('/api/practice-rooms', async (req, res) => {
  const { student_name, room_name, start_time, end_time } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 연습실 방 중복 체크
    const practiceOverlap = await client.query(
      `SELECT id FROM practice_room_schedules WHERE room_name = $1 AND start_time < $2 AND end_time > $3`,
      [room_name, end_time, start_time]
    );

    if (practiceOverlap.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${room_name}은 해당 시간대에 이미 예약이 존재합니다.` });
    }

    const result = await client.query(
      `INSERT INTO practice_room_schedules (student_name, room_name, start_time, end_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [student_name, room_name, start_time, end_time]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Practice Room Reservation Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 5. 레슨 일정 수정 API
app.put('/api/schedules/:id', async (req, res) => {
  const { id } = req.params;
  const { student_name, coach_name, subject, room_name, start_time, end_time, status, memo } = req.body;

  try {
    const roomOverlap = await pool.query(
      `SELECT id FROM schedules WHERE room_name = $1 AND start_time < $2 AND end_time > $3 AND id != $4`,
      [room_name, end_time, start_time, id]
    );
    if (roomOverlap.rows.length > 0) {
      return res.status(400).json({ error: `${room_name}은 해당 시간대에 이미 예약되어 있습니다.` });
    }

    const coachOverlap = await pool.query(
      `SELECT id FROM schedules WHERE coach_name = $1 AND start_time < $2 AND end_time > $3 AND id != $4`,
      [coach_name, end_time, start_time, id]
    );
    if (coachOverlap.rows.length > 0) {
      return res.status(400).json({ error: `${coach_name}은 해당 시간대에 이미 다른 레슨이 있습니다.` });
    }

    const result = await pool.query(
      `UPDATE schedules 
       SET student_name = $1, coach_name = $2, subject = $3, room_name = $4, start_time = $5, end_time = $6, status = $7, memo = $8 
       WHERE id = $9 RETURNING *`,
      [student_name, coach_name, subject, room_name, start_time, end_time, status || '예약', memo || '', id]
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

// 6. 레슨 일정 삭제 API
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

    await client.query('DELETE FROM schedules WHERE id = $1', [id]);

    if (!isMakeup) {
      await client.query(
        `UPDATE students SET remaining_lessons = remaining_lessons + 1 WHERE name = $1`,
        [student_name]
      );
    }

    await client.query('COMMIT');
    res.json({ message: '일정이 삭제되었습니다.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete Schedule Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 7. 연습실 일정 삭제 API
app.delete('/api/practice-rooms/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM practice_room_schedules WHERE id = $1', [id]);
    res.json({ message: '연습실 예약이 취소되었습니다.' });
  } catch (err) {
    console.error('Delete Practice Room Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. 수강생 목록 조회 API
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Students Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. 신규 수강생 등록 API
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

// 10. 수강생 횟수 충전 API
app.put('/api/students/:id/charge', async (req, res) => {
  const { id } = req.params;
  const { add_lessons } = req.body;
  try {
    const result = await pool.query(
      `UPDATE students 
       SET total_lessons = total_lessons + $1, remaining_lessons = remaining_lessons + $1 
       WHERE id = $2 RETURNING *`,
      [parseInt(add_lessons) || 0, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Charge Student Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 11. 특정 수강생 히스토리 조회 API
app.get('/api/students/:name/history', async (req, res) => {
  const { name } = req.params;
  try {
    const lessons = await pool.query('SELECT *, \'lesson\' as type FROM schedules WHERE student_name = $1', [name]);
    const practice = await pool.query('SELECT *, \'practice\' as type FROM practice_room_schedules WHERE student_name = $1', [name]);
    
    const combined = [...lessons.rows, ...practice.rows].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    res.json(combined);
  } catch (err) {
    console.error('Fetch Student History Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
