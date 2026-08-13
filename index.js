const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json()); // 웹에서 보낸 데이터를 읽기 위한 설정

const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. 서버 상태 확인
app.get('/', async (req, res) => {
  res.send('Black Bunch Studio Server Running!');
});

// 2. DB에서 수강생 목록 가져오기 API
app.get('/api/students', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM students ORDER BY id DESC');
    client.release();
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. DB에 신규 수강생 저장하기 API
app.post('/api/students', async (req, res) => {
  const { name, phone, course, coach } = req.body;
  try {
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO students (name, phone, course, coach) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone, course, coach]
    );
    client.release();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
