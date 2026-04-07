// src/routes/profile.js
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}

const doctorId  = uid => `DOC${String(uid).padStart(6,'0')}`;
const patientId = uid => `PAT${String(uid).padStart(6,'0')}`;

// GET /profile/setup
router.get('/setup', requireAuth, async (req, res) => {
  try {
    const [depts] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    res.render('profile-setup', { user: req.session.user, departments: depts });
  } catch (err) {
    res.status(500).render('error', { message: 'Profile setup error: ' + err.message });
  }
});

// POST /profile/setup
router.post('/setup', requireAuth, async (req, res) => {
  const u = req.session.user;

  try {
    if (u.role === 'staff') {
      await setupDoctor(req, res, u);
    } else {
      await setupPatient(req, res, u);
    }
  } catch (err) {
    console.error('Profile setup POST:', err.message);
    res.status(500).render('error', { message: 'Profile setup failed: ' + err.message });
  }
});

async function setupDoctor(req, res, u) {
  const { name, dept_id, phone, bio, start_times, end_times } = req.body;

  if (!name || !dept_id || !phone) {
    const [depts] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    return res.render('profile-setup', {
      user: u, departments: depts, error: 'Name, department, and phone are required.'
    });
  }

  // Validate at least one availability window
  const starts = [].concat(start_times || []).filter(Boolean);
  const ends   = [].concat(end_times   || []).filter(Boolean);
  if (!starts.length) {
    const [depts] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    return res.render('profile-setup', {
      user: u, departments: depts, error: 'At least one availability window is required.'
    });
  }

  const did = doctorId(u.id);

  await pool.query(
    'INSERT INTO doctors (id, user_id, name, dept_id, phone, bio) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=?, dept_id=?, phone=?, bio=?',
    [did, u.id, name, dept_id, phone, bio || '', name, dept_id, phone, bio || '']
  );

  // Replace availability windows
  await pool.query('DELETE FROM doctor_availability WHERE doctor_id = ?', [did]);
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] && ends[i]) {
      await pool.query(
        'INSERT INTO doctor_availability (doctor_id, start_time, end_time) VALUES (?,?,?)',
        [did, starts[i], ends[i]]
      );
    }
  }

  // Init stats row
  await pool.query(
    'INSERT IGNORE INTO doctor_stats (doctor_id) VALUES (?)', [did]
  );

  // Mark complete
  await pool.query('UPDATE users SET profile_complete = TRUE WHERE id = ?', [u.id]);
  req.session.user.profileComplete = true;
  res.redirect('/dashboard/doctor');
}

async function setupPatient(req, res, u) {
  const { name, age, gender, blood_group, phone, emergency_contact,
          condition_names, condition_years, allergy_names, allergy_types } = req.body;

  if (!name || !age || !gender || !blood_group || !phone) {
    const [depts] = await pool.query('SELECT id, name FROM departments ORDER BY name');
    return res.render('profile-setup', {
      user: u, departments: depts, error: 'All personal fields are required.'
    });
  }

  const pid = patientId(u.id);

  await pool.query(
    `INSERT INTO patients (id, user_id, name, age, gender, blood_group, phone, emergency_contact)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=?, age=?, gender=?, blood_group=?, phone=?, emergency_contact=?`,
    [pid, u.id, name, age, gender, blood_group, phone, emergency_contact || '',
     name, age, gender, blood_group, phone, emergency_contact || '']
  );

  // Replace conditions
  await pool.query('DELETE FROM patient_conditions WHERE patient_id = ?', [pid]);
  const cnames = [].concat(condition_names || []).filter(Boolean);
  const cyears = [].concat(condition_years || []);
  for (let i = 0; i < cnames.length; i++) {
    await pool.query(
      'INSERT INTO patient_conditions (patient_id, condition_name, since_year) VALUES (?,?,?)',
      [pid, cnames[i], cyears[i] || null]
    );
  }

  // Replace allergies
  await pool.query('DELETE FROM allergies WHERE patient_id = ?', [pid]);
  const anames = [].concat(allergy_names || []).filter(Boolean);
  const atypes = [].concat(allergy_types || []);
  for (let i = 0; i < anames.length; i++) {
    await pool.query(
      'INSERT INTO allergies (patient_id, name, type) VALUES (?,?,?)',
      [pid, anames[i], atypes[i] || 'warning']
    );
  }

  await pool.query('UPDATE users SET profile_complete = TRUE WHERE id = ?', [u.id]);
  req.session.user.profileComplete = true;
  res.redirect('/dashboard/patient');
}

// GET /profile/edit
router.get('/edit', requireAuth, async (req, res) => {
  const u = req.session.user;
  try {
    const [depts] = await pool.query('SELECT id, name FROM departments ORDER BY name');

    if (u.role === 'staff') {
      const did = doctorId(u.id);
      const [[doctor]] = await pool.query('SELECT * FROM doctors WHERE id = ?', [did]);
      const [availability] = await pool.query(
        'SELECT * FROM doctor_availability WHERE doctor_id = ? AND is_active = TRUE', [did]
      );
      return res.render('profile-edit-doctor', { user: u, doctor, availability, departments: depts });
    } else {
      const pid = patientId(u.id);
      const [[patient]] = await pool.query('SELECT * FROM patients WHERE id = ?', [pid]);
      const [conditions] = await pool.query('SELECT * FROM patient_conditions WHERE patient_id = ?', [pid]);
      const [allergies]  = await pool.query('SELECT * FROM allergies WHERE patient_id = ?', [pid]);
      return res.render('profile-edit-patient', { user: u, patient, conditions, allergies, departments: depts });
    }
  } catch (err) {
    res.status(500).render('error', { message: 'Profile edit error: ' + err.message });
  }
});

// POST /profile/edit  (same logic as setup but always updates)
router.post('/edit', requireAuth, async (req, res) => {
  const u = req.session.user;
  try {
    if (u.role === 'staff') {
      await setupDoctor(req, res, u);
    } else {
      await setupPatient(req, res, u);
    }
  } catch (err) {
    res.status(500).render('error', { message: 'Profile update failed: ' + err.message });
  }
});

module.exports = router;
