// src/routes/booking.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  next();
}

const patientId = (uid) => `PAT${String(uid).padStart(6, "0")}`;

// GET /booking/new
router.get("/new", requireAuth, async (req, res) => {
  try {
    // Fetch all departments for step 1
    const [departments] = await pool.query(
      `SELECT id, name, description AS deptDesc, icon FROM departments ORDER BY name`,
    );
    // Fetch all doctors with their dept for step 2 initial load
    const [doctors] = await pool.query(
      `SELECT d.id, d.name, d.dept_id, dept.name AS department, d.bio
       FROM doctors d LEFT JOIN departments dept ON dept.id = d.dept_id
       ORDER BY d.name`,
    );
    const pid = patientId(req.session.user.id);
    const [pr] = await pool.query("SELECT id, name FROM patients WHERE id=?", [
      pid,
    ]);

    res.render("booking", {
      user: pr[0] || { name: req.session.user.email, id: "" },
      departments: departments || [],
      doctors: doctors || [],
      error: req.query.error || null,
    });
  } catch (err) {
    res
      .status(500)
      .render("error", { message: "Booking page error: " + err.message });
  }
});

// GET /booking/doctors?deptId=dept_cardio  JSON list of doctors in that department
router.get("/doctors", requireAuth, async (req, res) => {
  const { deptId } = req.query;
  try {
    let doctors;
    if (deptId) {
      [doctors] = await pool.query(
        `SELECT d.id, d.name, dept.name AS department, d.bio
         FROM doctors d LEFT JOIN departments dept ON dept.id = d.dept_id
         WHERE d.dept_id = ?
         ORDER BY d.name`,
        [deptId],
      );
    } else {
      [doctors] = await pool.query(
        `SELECT d.id, d.name, dept.name AS department, d.bio
         FROM doctors d LEFT JOIN departments dept ON dept.id = d.dept_id
         ORDER BY d.name`,
      );
    }
    res.json({ doctors: doctors || [] });
  } catch (err) {
    console.error("GET /booking/doctors:", err.message);
    res.json({ doctors: [] });
  }
});

// GET /booking/slots?doctorId=XXX&date=YYYY-MM-DD JSON array of available times
router.get("/slots", requireAuth, async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) return res.json({ slots: [] });

  try {
    // TIME columns returned as strings via TIME_FORMAT — avoids JS Date object issues
    const [windows] = await pool.query(
      `SELECT TIME_FORMAT(start_time,'%H:%i:%s') AS start_time,
              TIME_FORMAT(end_time,  '%H:%i:%s') AS end_time
       FROM doctor_availability WHERE doctor_id=? AND is_active=TRUE`,
      [doctorId],
    );

    // Generate all 20-min slots from availability windows
    const allSlots = new Set();
    for (const w of windows) {
      const [sh, sm] = w.start_time.split(":").map(Number);
      const [eh, em] = w.end_time.split(":").map(Number);
      let cur = sh * 60 + sm;
      const end = eh * 60 + em;
      while (cur + 20 <= end) {
        const h = Math.floor(cur / 60),
          m = cur % 60;
        allSlots.add(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        );
        cur += 20;
      }
    }

    // Apply per-date overrides (block or add slots)
    const [overrides] = await pool.query(
      `SELECT TIME_FORMAT(slot_time,'%H:%i:%s') AS slot_time, override_type
       FROM slot_overrides WHERE doctor_id=? AND override_date=?`,
      [doctorId, date],
    );
    for (const ov of overrides) {
      if (ov.override_type === "blocked") allSlots.delete(ov.slot_time);
      else allSlots.add(ov.slot_time);
    }

    // Remove already-booked slots — TIME_FORMAT ensures string comparison works
    const [booked] = await pool.query(
      `SELECT TIME_FORMAT(appointment_time,'%H:%i:%s') AS appointment_time
       FROM appointments
       WHERE doctor_id=? AND appointment_date=? AND status NOT IN ('Cancelled','Rescheduled')`,
      [doctorId, date],
    );
    for (const b of booked) allSlots.delete(b.appointment_time);

    // Format for display
    const slots = [...allSlots].sort().map((t) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return {
        value: t,
        display: `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`,
      };
    });

    res.json({ slots });
  } catch (err) {
    console.error("GET /booking/slots:", err.message);
    res.json({ slots: [] });
  }
});

// POST /booking/confirm
router.post("/confirm", requireAuth, async (req, res) => {
  const { doctorId, date, slotTime, problemDescription } = req.body;

  if (!doctorId || !date || !slotTime || !problemDescription) {
    return res.redirect("/booking/new?error=missing_fields");
  }

  const pid = patientId(req.session.user.id);

  try {
    const [pr] = await pool.query("SELECT id FROM patients WHERE id=?", [pid]);
    if (!pr.length) return res.redirect("/booking/new?error=patient_not_found");

    try {
      await pool.query(
        `INSERT INTO appointments
           (doctor_id, patient_id, appointment_time, appointment_date, problem_description, status)
         VALUES (?,?,?,?,?,'Upcoming')`,
        [doctorId, pid, slotTime, date, problemDescription],
      );
    } catch (dupErr) {
      // UNIQUE constraint violation = slot just got taken by someone else
      if (dupErr.code === "ER_DUP_ENTRY") {
        return res.redirect("/booking/new?error=slot_taken");
      }
      throw dupErr;
    }

    // Timeline event for the patient
    await pool.query(
      `INSERT INTO timeline_events (patient_id, event_date, title, description)
       VALUES (?, ?, 'Appointment Booked', ?)`,
      [
        pid,
        date,
        `Appointment booked for ${formatDate(date)} at ${formatTime(slotTime)}.`,
      ],
    );

    res.redirect("/dashboard/patient");
  } catch (err) {
    console.error("POST /booking/confirm:", err.message);
    res
      .status(500)
      .render("error", { message: "Booking failed: " + err.message });
  }
});

function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

module.exports = router;
