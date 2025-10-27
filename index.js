require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const { auth } = require('express-oauth2-jwt-bearer');

const jwtCheck = auth({
  audience: process.env.API_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256',
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

app.locals.db = pool;

app.use(express.json());
app.use(express.static('public'));

app.get('/ticket/:id', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'ticket.html'));
});

app.use((req, res, next) => {
  // Skip API routes and static files
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const roundRes = await db.query('SELECT * FROM round WHERE is_active = true ORDER BY id DESC LIMIT 1');
    const ticketRes = roundRes.rows.length ? await db.query('SELECT COUNT(*) FROM ticket WHERE round_id = $1', [roundRes.rows[0].id]) : { rows: [{ count: 0 }] };
    const drawnRes = roundRes.rows.length ? await db.query('SELECT numbers FROM drawn_numbers WHERE round_id = $1', [roundRes.rows[0].id]) : { rows: [] };

    res.json({
      activeRound: roundRes.rows[0] || null,
      ticketCount: ticketRes.rows[0].count,
      drawnNumbers: drawnRes.rows[0] ? drawnRes.rows[0].numbers : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/pay-slip',
  body('person_id').isLength({ min: 1, max: 20 }),
  body('numbers').isArray({ min: 6, max: 10 }),
  async (req, res) => {
    const db = req.app.locals.db;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { person_id, numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length < 6 || numbers.length > 10) {
      return res.status(400).json({ error: 'Broj brojeva mora biti od 6 do 10.' });
    }
    const set = new Set(numbers);
    if (set.size !== numbers.length) {
      return res.status(400).json({ error: 'Svi brojevi moraju biti jedinstveni.' });
    }
    const invalidNum = numbers.find(n => typeof n !== 'number' || n < 1 || n > 45);
    if (invalidNum) {
      return res.status(400).json({ error: 'Brojevi moraju biti u rasponu 1-45.' });
    }
    try {
      const { rows } = await db.query('SELECT * FROM round WHERE is_active = true ORDER BY id DESC LIMIT 1');
      if (!rows.length) {
        return res.status(400).json({ error: 'Nema aktivnog kola.' });
      }
      const round_id = rows[0].id;
      const insertRes = await db.query(
        'INSERT INTO ticket (round_id, person_id, numbers) VALUES ($1, $2, $3) RETURNING id',
        [round_id, person_id, numbers]
      );
      const ticketId = insertRes.rows[0].id;
      const url = `${req.protocol}://${req.get('host')}/ticket/${ticketId}`;
      const qr = await QRCode.toDataURL(url);
      res.json({ id: ticketId, qrCode: qr });
    } catch (err) {
      res.status(500).json({ error: 'Database error', details: err.message });
    }
  }
);

app.get('/api/ticket/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { id } = req.params;
    const ticketRes = await db.query('SELECT * FROM ticket WHERE id = $1', [id]);
    if (!ticketRes.rows.length) {
      return res.status(404).json({ error: 'Listić nije pronađen.' });
    }
    const ticket = ticketRes.rows[0];
    const roundRes = await db.query('SELECT * FROM round WHERE id = $1', [ticket.round_id]);
    const drawnRes = await db.query('SELECT numbers FROM drawn_numbers WHERE round_id = $1', [ticket.round_id]);
    res.json({
      ticket,
      round: roundRes.rows[0] || null,
      drawnNumbers: drawnRes.rows[0] ? drawnRes.rows[0].numbers : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/new-round', jwtCheck, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('UPDATE round SET is_active = false, closed_at = CURRENT_TIMESTAMP WHERE is_active = true');
    await db.query('INSERT INTO round (is_active) VALUES (true)');
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/close', jwtCheck, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('UPDATE round SET is_active = false, closed_at = CURRENT_TIMESTAMP WHERE is_active = true');
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/api/store-results', jwtCheck, async (req, res) => {
  const db = req.app.locals.db;
  const { numbers } = req.body;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Polje numbers je obavezno i mora biti niz.' });
  }
  try {
    const closedRoundRes = await db.query('SELECT * FROM round WHERE is_active = false AND id NOT IN (SELECT round_id FROM drawn_numbers) ORDER BY id DESC LIMIT 1');
    if (!closedRoundRes.rows.length) {
      return res.status(400).json({ error: 'Nema zatvorenog kola bez izvučenih brojeva.' });
    }
    const round_id = closedRoundRes.rows[0].id;
    const alreadyDrawn = await db.query('SELECT * FROM drawn_numbers WHERE round_id = $1', [round_id]);
    if (alreadyDrawn.rows.length) {
      return res.status(400).json({ error: 'Za to kolo su već evidentirani izvučeni brojevi.' });
    }
    if (closedRoundRes.rows[0].is_active) {
      return res.status(400).json({ error: 'Kolo nije zatvoreno.' });
    }
    await db.query('INSERT INTO drawn_numbers (round_id, numbers) VALUES ($1, $2)', [round_id, numbers]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
