// src/routes/dashboard.js
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}
function requireStaff(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  if (!['staff','admin'].includes(req.session.user.role)) return res.redirect('/dashboard/patient');
  next();
}

const doctorId  = uid => `DOC${String(uid).padStart(6,'0')}`;
const patientId = uid => `PAT${String(uid).padStart(6,'0')}`;
const EMPTY_VITALS = { bp:'—', hr:'—', spo2:'—', temp:'—' };

async function fetchPatientProfile(pid, viewingDoctorId = null) {
  const [pr] = await pool.query(
    `SELECT id, name, age, gender, blood_group AS bloodGroup,
            DATE_FORMAT(last_visit,'%b %d, %Y') AS lastVisit, status
     FROM patients WHERE id = ?`, [pid]
  );
  if (!pr.length) return null;
  const patient = pr[0];

  const [vr] = await pool.query(
    'SELECT bp,hr,spo2,temp FROM vitals WHERE patient_id=? ORDER BY recorded_at DESC LIMIT 1', [pid]
  );

  // Timeline: always show all events (booking notifications, completions)
  const [timeline] = await pool.query(
    `SELECT DATE_FORMAT(event_date,'%b %d, %Y') AS event_date, title,
            description AS visit_desc
     FROM timeline_events WHERE patient_id=? ORDER BY id DESC`, [pid]
  );

  // Diagnoses: scoped to this doctor's appointments when viewing as doctor
  let diagnoses, medications, apptHistory;
  if (viewingDoctorId) {
    // Only diagnoses added via this doctor's appointments
    [diagnoses] = await pool.query(
      `SELECT d.id, d.name, DATE_FORMAT(d.diagnosed_date,'%b %Y') AS diagnosed_date,
              d.status, d.appointment_id
       FROM diagnoses d
       INNER JOIN appointments a ON a.id = d.appointment_id
       WHERE d.patient_id = ? AND a.doctor_id = ?
       ORDER BY d.diagnosed_date DESC`, [pid, viewingDoctorId]
    );
    // Only medications prescribed via this doctor's appointments
    [medications] = await pool.query(
      `SELECT m.id, m.name, m.instructions, m.appointment_id,
              DATE_FORMAT(m.prescribed_at,'%b %d, %Y') AS prescribed_date
       FROM medications m
       INNER JOIN appointments a ON a.id = m.appointment_id
       WHERE m.patient_id = ? AND a.doctor_id = ?
       ORDER BY m.prescribed_at DESC`, [pid, viewingDoctorId]
    );
    // Only appointments with this doctor
    [apptHistory] = await pool.query(
      `SELECT a.id,
              DATE_FORMAT(a.appointment_date, '%b %d, %Y') AS appointment_date,
              TIME_FORMAT(a.appointment_time, '%h:%i %p')  AS appointment_time,
              a.problem_description, a.status,
              d.name AS doctor_name,
              dept.name AS dept_name
       FROM appointments a
       LEFT JOIN doctors d    ON d.id = a.doctor_id
       LEFT JOIN departments dept ON dept.id = d.dept_id
       WHERE a.patient_id = ? AND a.doctor_id = ?
         AND a.status NOT IN ('Cancelled','Rescheduled')
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [pid, viewingDoctorId]
    );
  } else {
    // Patient viewing own dashboard — show everything
    [diagnoses] = await pool.query(
      `SELECT d.id, d.name, DATE_FORMAT(d.diagnosed_date,'%b %Y') AS diagnosed_date,
              d.status, d.appointment_id
       FROM diagnoses d WHERE d.patient_id=? ORDER BY d.diagnosed_date DESC`, [pid]
    );
    [medications] = await pool.query(
      `SELECT m.id, m.name, m.instructions, m.appointment_id,
              DATE_FORMAT(m.prescribed_at,'%b %d, %Y') AS prescribed_date
       FROM medications m WHERE m.patient_id=? ORDER BY m.prescribed_at DESC`, [pid]
    );
    [apptHistory] = await pool.query(
      `SELECT a.id,
              DATE_FORMAT(a.appointment_date, '%b %d, %Y') AS appointment_date,
              TIME_FORMAT(a.appointment_time, '%h:%i %p')  AS appointment_time,
              a.problem_description, a.status,
              d.name AS doctor_name,
              dept.name AS dept_name
       FROM appointments a
       LEFT JOIN doctors d    ON d.id = a.doctor_id
       LEFT JOIN departments dept ON dept.id = d.dept_id
       WHERE a.patient_id = ? AND a.status NOT IN ('Cancelled','Rescheduled')
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [pid]
    );
  }

  const [medFiles] = await pool.query(
    `SELECT name, ext, size, DATE_FORMAT(file_date,'%b %d, %Y') AS file_date
     FROM medical_files WHERE patient_id=? ORDER BY file_date DESC`, [pid]
  );
  const [allergies] = await pool.query(
    'SELECT name, type FROM allergies WHERE patient_id=?', [pid]
  );
  const [conditions] = await pool.query(
    'SELECT condition_name, since_year FROM patient_conditions WHERE patient_id=?', [pid]
  );

  return {
    ...patient,
    vitals:          vr[0] || EMPTY_VITALS,
    timeline,
    diagnoses,
    medications,
    medFiles,
    allergies,
    conditions,
    apptHistory,
    scopedToDoctor:  !!viewingDoctorId,
  };
}
router.get('/patient', requireAuth, async (req, res) => {
  try {
    const pid = patientId(req.session.user.id);
    const profile = await fetchPatientProfile(pid);
    if (!profile) return res.status(404).render('error', { message: 'Patient profile not found.' });

    // Upcoming appointments
    const [upcoming] = await pool.query(
      `SELECT a.id,
              DATE_FORMAT(a.appointment_date, '%Y-%m-%d')  AS appointment_date_raw,
              DATE_FORMAT(a.appointment_date, '%b %d, %Y') AS appointment_date,
              TIME_FORMAT(a.appointment_time, '%h:%i %p')  AS appointment_time,
              a.problem_description, a.status, d.name AS doctor_name,
              dept.name AS dept_name
       FROM appointments a
       LEFT JOIN doctors d     ON d.id = a.doctor_id
       LEFT JOIN departments dept ON dept.id = d.dept_id
       WHERE a.patient_id = ? AND a.status IN ('Upcoming','In Progress')
       ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT 5`,
      [pid]
    );

    res.render('patient', { user: profile, upcoming });
  } catch (err) {
    console.error('GET /dashboard/patient:', err.message);
    res.status(500).render('error', { message: 'Patient dashboard error: ' + err.message });
  }
});

router.get('/patient/records', requireAuth, async (req, res) => {
  try {
    const pid  = patientId(req.session.user.id);
    const user = await fetchPatientProfile(pid);
    if (!user) return res.status(404).render('error', { message: 'Patient profile not found.' });
    res.render('records', { user });
  } catch (err) {
    res.status(500).render('error', { message: 'Records error: ' + err.message });
  }
});

router.get('/doctor', requireStaff, async (req, res) => {
  try {
    const did = doctorId(req.session.user.id);
    const [dr] = await pool.query(
      `SELECT d.id, d.name, dept.name AS department
       FROM doctors d LEFT JOIN departments dept ON dept.id = d.dept_id
       WHERE d.id = ?`, [did]
    );
    if (!dr.length) return res.status(404).render('error', { message: 'Doctor profile not found.' });

    const today = new Date().toISOString().split('T')[0];
    const [schedule] = await pool.query(
      `SELECT a.id,
              TIME_FORMAT(a.appointment_time,'%h:%i %p') AS appt_time,
              p.name AS patient_name, p.id AS patient_id,
              a.problem_description, a.status
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = ? AND a.appointment_date = ?
         AND a.status NOT IN ('Cancelled','Rescheduled')
       ORDER BY a.appointment_time`, [did, today]
    );

    const [statsR] = await pool.query(
      'SELECT visits, labs, files, emergencies FROM doctor_stats WHERE doctor_id=?', [did]
    );
    const [alertR] = await pool.query(
      `SELECT patient_name, message FROM urgent_alerts
       WHERE doctor_id=? AND resolved=FALSE ORDER BY created_at DESC LIMIT 1`, [did]
    );

    res.render('doctor', {
      user: {
        ...dr[0],
        schedule: schedule || [],
        stats:    statsR[0] || { visits:0, labs:0, files:0, emergencies:0 },
        urgent:   alertR[0] || null,
      }
    });
  } catch (err) {
    console.error('GET /dashboard/doctor:', err.message);
    res.status(500).render('error', { message: 'Doctor dashboard error: ' + err.message });
  }
});

router.get('/doctor/schedule', requireStaff, async (req, res) => {
  try {
    const did  = doctorId(req.session.user.id);
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [dr] = await pool.query('SELECT id, name FROM doctors WHERE id=?', [did]);
    if (!dr.length) return res.status(404).render('error', { message: 'Doctor profile not found.' });

    const [schedule] = await pool.query(
      `SELECT a.id,
              TIME_FORMAT(a.appointment_time,'%h:%i %p') AS appt_time,
              a.appointment_time AS raw_time,
              p.name AS patient_name, p.id AS patient_id,
              a.problem_description, a.status
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id=? AND a.appointment_date=?
       ORDER BY a.appointment_time`, [did, date]
    );

    // All generated slots for that day (so doctor can block/add)
    const [availability] = await pool.query(
      `SELECT TIME_FORMAT(start_time,'%H:%i:%s') AS start_time, TIME_FORMAT(end_time,'%H:%i:%s') AS end_time FROM doctor_availability WHERE doctor_id=? AND is_active=TRUE`, [did]
    );
    const [overrides] = await pool.query(
      `SELECT TIME_FORMAT(slot_time,'%H:%i:%s') AS slot_time, override_type, reason FROM slot_overrides WHERE doctor_id=? AND override_date=?`,
      [did, date]
    );

    const allSlots = generateAllSlots(availability, overrides);

    res.render('doctor-schedule', { user: dr[0], schedule, date, allSlots, overrides });
  } catch (err) {
    console.error('GET /dashboard/doctor/schedule:', err.message);
    res.status(500).render('error', { message: 'Schedule error: ' + err.message });
  }
});

router.get('/doctor/directory', requireStaff, async (req, res) => {
  try {
    const did = doctorId(req.session.user.id);
    const [dr] = await pool.query('SELECT id, name FROM doctors WHERE id=?', [did]);
    const [patients] = await pool.query(
      `SELECT id, name, age, gender, blood_group AS bloodGroup,
              DATE_FORMAT(last_visit,'%b %d, %Y') AS lastVisit, status
       FROM patients ORDER BY name`
    );
    res.render('doctor-directory', { user: dr[0] || {}, patients });
  } catch (err) {
    res.status(500).render('error', { message: 'Directory error: ' + err.message });
  }
});

router.get('/doctor/patient-view', requireStaff, async (req, res) => {
  try {
    const did = doctorId(req.session.user.id);
    const [dr] = await pool.query('SELECT id, name FROM doctors WHERE id=?', [did]);
    if (!dr.length) return res.status(404).render('error', { message: 'Doctor profile not found.' });

    let pid = req.query.patientId || null;
    if (!pid) {
      const [first] = await pool.query('SELECT id FROM patients ORDER BY id LIMIT 1');
      pid = first[0]?.id || null;
    }
    if (!pid) return res.status(404).render('error', { message: 'No patients found.' });

    // Scope profile to this doctor — only their appointments/meds/diagnoses shown
    const patient = await fetchPatientProfile(pid, dr[0].id);
    if (!patient) return res.status(404).render('error', { message: `Patient ${pid} not found.` });

    res.render('doctor-ehr', { doctor: dr[0], patient });
  } catch (err) {
    console.error('GET /dashboard/doctor/patient-view:', err.message);
    res.status(500).render('error', { message: 'EHR error: ' + err.message });
  }
});

// ── Slot generation helper 
function generateAllSlots(availability, overrides) {
  const base = new Set();
  for (const w of availability) {
    const [sh, sm] = w.start_time.split(':').map(Number);
    const [eh, em] = w.end_time.split(':').map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    while (cur + 20 <= end) {
      const h = Math.floor(cur / 60), m = cur % 60;
      base.add(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
      cur += 20;
    }
  }
  const blocked = new Set(overrides.filter(o => o.override_type === 'blocked').map(o => o.slot_time));
  const added   = new Set(overrides.filter(o => o.override_type === 'added').map(o => o.slot_time));
  const slots = [...base].filter(s => !blocked.has(s));
  added.forEach(s => slots.push(s));
  return slots.sort();
}

module.exports = router;
