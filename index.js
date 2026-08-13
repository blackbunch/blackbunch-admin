const express = require('express');
const cors = require('cors'); // [추가됨] 보안 정책 해결을 위한 부품 가져오기
const { Pool } = require('pg');

const app = express();
// [추가됨] 모든 도메인(내 컴퓨터 포함)에서 우리 서버에 접속 허용
app.use(cors()); 

const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', async (req, res) => {
  try {
    const client = await pool.connect();
    // 한국 시간(Asia/Seoul)으로 조회하도록 변경
    const result = await client.query("SELECT NOW() AT TIME ZONE 'Asia/Seoul' AS now");
    client.release();
    res.send(`Black Bunch Studio Server Running! DB Time: ${result.rows[0].now}`);
  } catch (err) {
    res.status(500).send(`Server Running, but DB Connection Error: ${err.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
