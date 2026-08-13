const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.send(`Black Bunch Studio Server Running! DB Time: ${result.rows[0].now}`);
  } catch (err) {
    res.status(500).send(`Server Running, but DB Connection Error: ${err.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
