const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hash(password) {
  return crypto.createHash('sha256').update(password + 'cityofshadows_salt').digest('hex');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' });
    res.end(); return;
  }

  if (req.method === 'POST' && req.url === '/signup') {
    try {
      const { username, email, password } = await parseBody(req);
      if (!username || !email || !password) return json(res, 400, { error: 'All fields required.' });
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters.' });
      const exists = await pool.query('SELECT id FROM players WHERE username=$1 OR email=$2', [username, email]);
      if (exists.rows.length > 0) return json(res, 409, { error: 'Username or email already taken.' });
      const password_hash = hash(password);
      await pool.query('INSERT INTO players (username, email, password_hash) VALUES ($1, $2, $3)', [username, email, password_hash]);
      return json(res, 200, { success: true, message: `Welcome to City of Shadows, ${username}!` });
    } catch (e) {
      console.error(e);
      return json(res, 500, { error: 'Server error. Try again.' });
    }
  }

  if (req.method === 'POST' && req.url === '/login') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) return json(res, 400, { error: 'All fields required.' });
      const password_hash = hash(password);
      const result = await pool.query(
        'SELECT id, username FROM players WHERE (username=$1 OR email=$1) AND password_hash=$2',
        [username, password_hash]
      );
      if (result.rows.length === 0) return json(res, 401, { error: 'Wrong username or password.' });
      await pool.query('UPDATE players SET last_login=NOW() WHERE id=$1', [result.rows[0].id]);
      return json(res, 200, { success: true, message: `Welcome back, ${result.rows[0].username}! Entering the shadows...` });
    } catch (e) {
      console.error(e);
      return json(res, 500, { error: 'Server error. Try again.' });
    }
  }

  let file = 'index.html';
  if (req.url === '/map' || req.url === '/map.html') file = 'map.html';
  const filePath = path.join(__dirname, file);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`City of Shadows running on port ${PORT}`);
});
