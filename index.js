const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 로그인 API (Supabase users 테이블 조회)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        allowed_branch: user.allowed_branch
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 코치 계정 관리 API (어드민용)
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, name, role, allowed_branch, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, name, allowed_branch, role } = req.body;

    const { data, error } = await supabase
      .from('users')
      .insert([{
        username,
        password,
        name,
        allowed_branch: allowed_branch || 'ALL',
        role: role || 'coach'
      }])
      .select();

    if (error) throw error;
    res.json({ success: true, user: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 수강생 API
app.get('/api/students', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { branch_name, name, phone, subject, total_lessons } = req.body;
    const count = parseInt(total_lessons) || 4;

    const { data, error } = await supabase
      .from('students')
      .insert([{
        branch_name: branch_name || '위례점',
        name,
        phone,
        subject: subject || '보컬',
        total_lessons: count,
        remaining_lessons: count
      }])
      .select();

    if (error) throw error;
    res.json({ success: true, student: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/students/:id/charge', async (req, res) => {
  try {
    const { id } = req.params;
    const { add_lessons } = req.body;
    const addCount = parseInt(add_lessons) || 0;

    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('students')
      .update({
        total_lessons: student.total_lessons + addCount,
        remaining_lessons: student.remaining_lessons + addCount
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, student: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/students/:name/history', async (req, res) => {
  try {
    const { name } = req.params;
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('student_name', name)
      .order('start_time', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 일정 조회
app.get('/api/schedules', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .order('start_time', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 레슨 일정 등록
app.post('/api/schedules', async (req, res) => {
  try {
    const { branch_name, student_name, coach_name, subject, room_name, lesson_type, start_time, end_time } = req.body;
    const targetBranch = branch_name || '위례점';

    const { data: overlap, error: checkErr } = await supabase
      .from('schedules')
      .select('*')
      .eq('branch_name', targetBranch)
      .or(`room_name.eq.${room_name},coach_name.eq.${coach_name}`)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (checkErr) throw checkErr;
    if (overlap && overlap.length > 0) {
      return res.status(400).json({ error: `[${targetBranch}] 해당 시간대에 지정된 방 또는 코치님의 일정이 이미 존재합니다.` });
    }

    const { data, error } = await supabase
      .from('schedules')
      .insert([{
        schedule_type: 'lesson',
        branch_name: targetBranch,
        student_name,
        coach_name,
        subject,
        room_name,
        lesson_type,
        start_time,
        end_time,
        status: '예약'
      }])
      .select();

    if (error) throw error;

    if (lesson_type === '정규') {
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('name', student_name)
        .single();

      if (student && student.remaining_lessons > 0) {
        await supabase
          .from('students')
          .update({ remaining_lessons: student.remaining_lessons - 1 })
          .eq('id', student.id);
      }
    }

    res.json({ success: true, schedule: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 연습실 예약 등록
app.post('/api/practice-rooms', async (req, res) => {
  try {
    const { branch_name, student_name, room_name, start_time, end_time } = req.body;
    const targetBranch = branch_name || '위례점';

    const { data: overlap, error: checkErr } = await supabase
      .from('schedules')
      .select('*')
      .eq('branch_name', targetBranch)
      .eq('room_name', room_name)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (checkErr) throw checkErr;
    if (overlap && overlap.length > 0) {
      return res.status(400).json({ error: `[${targetBranch}] 해당 시간에 이미 대여된 연습실입니다.` });
    }

    const { data, error } = await supabase
      .from('schedules')
      .insert([{
        schedule_type: 'practice',
        branch_name: targetBranch,
        student_name,
        room_name,
        start_time,
        end_time,
        status: '예약'
      }])
      .select();

    if (error) throw error;
    res.json({ success: true, schedule: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 일정 수정 API
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { branch_name, coach_name, subject, room_name, start_time, end_time, status, memo } = req.body;

    const { data, error } = await supabase
      .from('schedules')
      .update({
        branch_name,
        coach_name,
        subject,
        room_name,
        start_time,
        end_time,
        status,
        memo
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, schedule: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 일정 삭제 API
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: sched } = await supabase
      .from('schedules')
      .select('*')
      .eq('id', id)
      .single();

    if (sched && sched.schedule_type === 'lesson' && sched.lesson_type === '정규') {
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('name', sched.student_name)
        .single();

      if (student) {
        await supabase
          .from('students')
          .update({ remaining_lessons: student.remaining_lessons + 1 })
          .eq('id', student.id);
      }
    }

    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/practice-rooms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 블랙번치 어드민 통합 서버 실행 중: port ${PORT}`);
});
