const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase 클라이언트 설정 (환경변수 또는 직주입)
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// 1. HTML 등 정적 파일 제공 설정 (index.html 연동 핵심)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. 로그인 API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // 관리자 계정 정보 (필요시 수정을 권장합니다)
  if (username === 'blackbunch' && password === '1234') {
    return res.json({
      success: true,
      user: { name: '블랙번치 관리자', role: 'admin' }
    });
  }
  return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
});

// 3. 수강생 관리 API
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
    const { name, phone, subject, total_lessons } = req.body;
    const count = parseInt(total_lessons) || 4;

    const { data, error } = await supabase
      .from('students')
      .insert([{
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

// 4. 레슨 & 연습실 일정 조회 API
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

// 5. 레슨 일정 등록 (방 & 코치 시간 중복 검사)
app.post('/api/schedules', async (req, res) => {
  try {
    const { student_name, coach_name, subject, room_name, lesson_type, start_time, end_time } = req.body;

    // 방/코치 시간 중복 확인
    const { data: overlap, error: checkErr } = await supabase
      .from('schedules')
      .select('*')
      .or(`room_name.eq.${room_name},coach_name.eq.${coach_name}`)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (checkErr) throw checkErr;
    if (overlap && overlap.length > 0) {
      return res.status(400).json({ error: '해당 시간대에 지정된 방 또는 코치님의 다른 일정이 이미 존재합니다.' });
    }

    // 일정 추가
    const { data, error } = await supabase
      .from('schedules')
      .insert([{
        schedule_type: 'lesson',
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

    // 정규 레슨일 경우 차감
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

// 6. 연습실 대여 등록 (연습실 중복 검사)
app.post('/api/practice-rooms', async (req, res) => {
  try {
    const { student_name, room_name, start_time, end_time } = req.body;

    // 연습실 방 중복 확인
    const { data: overlap, error: checkErr } = await supabase
      .from('schedules')
      .select('*')
      .eq('room_name', room_name)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (checkErr) throw checkErr;
    if (overlap && overlap.length > 0) {
      return res.status(400).json({ error: '해당 시간에 이미 대여된 연습실입니다.' });
    }

    const { data, error } = await supabase
      .from('schedules')
      .insert([{
        schedule_type: 'practice',
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

// 7. 일정 수정 API (출석 상태 / 메모 / 시간 등)
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { coach_name, subject, room_name, start_time, end_time, status, memo } = req.body;

    const { data, error } = await supabase
      .from('schedules')
      .update({
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

// 8. 일정 삭제/취소 API
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
  console.log(`🚀 블랙번치 어드민 서버 실행 중: port ${PORT}`);
});
