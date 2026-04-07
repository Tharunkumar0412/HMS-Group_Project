// src/routes/appointments.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  next();
}
function requireStaff(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (!["staff", "admin"].includes(req.session.user.role))
    return res.status(403).render("error", { message: "Access denied." });
  next();
}

const doctorId = (uid) => `DOC${String(uid).padStart(6, "0")}`;

// ── GET /appointments/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*,
              p.name AS patient_name, p.id AS patient_id,
              p.age, p.gender, p.blood_group AS bloodGroup,
              d.name AS doctor_name,
              dept.name AS dept_name,
              TIME_FORMAT(a.appointment_time,'%h:%i %p') AS appt_time,
              DATE_FORMAT(a.appointment_date,'%b %d, %Y') AS appt_date
       FROM appointments a
       LEFT JOIN patients    p    ON p.id    = a.patient_id
       LEFT JOIN doctors     d    ON d.id    = a.doctor_id
       LEFT JOIN departments dept ON dept.id = d.dept_id
       WHERE a.id = ?`,
      [req.params.id],
    );
    if (!rows.length)
      return res
        .status(404)
        .render("error", { message: "Appointment not found." });

    const appt = rows[0];

    // Medications and diagnoses linked to this appointment
    const [meds] = await pool.query(
      "SELECT * FROM medications WHERE appointment_id = ?",
      [req.params.id],
    );
    const [diags] = await pool.query(
      "SELECT * FROM diagnoses WHERE appointment_id = ?",
      [req.params.id],
    );

    // Doctor sees notes; patient does not
    const isDoctor = ["staff", "admin"].includes(req.session.user.role);

    res.render("appointment-detail", { appt, meds, diags, isDoctor });
  } catch (err) {
    console.error("GET /appointments/:id:", err.message);
    res
      .status(500)
      .render("error", { message: "Appointment error: " + err.message });
  }
});

// ── POST /appointments/:id/complete
// Doctor marks appointment complete + adds notes, meds, diagnoses in one submit
router.post("/:id/complete", requireStaff, async (req, res) => {
  const { doctorNotes, medNames, medInstructions, diagNames, diagStatuses } =
    req.body;
  const apptId = req.params.id;

  try {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [
      apptId,
    ]);
    if (!rows.length)
      return res
        .status(404)
        .render("error", { message: "Appointment not found." });
    const appt = rows[0];

    // Mark complete + save doctor-only notes
    await pool.query(
      `UPDATE appointments SET status='Completed', doctor_notes=? WHERE id=?`,
      [doctorNotes || "", apptId],
    );

    // Insert medications linked to this appointment
    const mNames = [].concat(medNames || []).filter(Boolean);
    const mInstr = [].concat(medInstructions || []);
    for (let i = 0; i < mNames.length; i++) {
      await pool.query(
        "INSERT INTO medications (patient_id, appointment_id, name, instructions) VALUES (?,?,?,?)",
        [appt.patient_id, apptId, mNames[i], mInstr[i] || ""],
      );
    }

    // Insert diagnoses linked to this appointment
    const dNames = [].concat(diagNames || []).filter(Boolean);
    const dStatuses = [].concat(diagStatuses || []);
    for (let i = 0; i < dNames.length; i++) {
      await pool.query(
        `INSERT INTO diagnoses (patient_id, appointment_id, name, diagnosed_date, status)
         VALUES (?,?,?,CURDATE(),?)`,
        [appt.patient_id, apptId, dNames[i], dStatuses[i] || "Active"],
      );
    }

    // Update patient last_visit
    await pool.query("UPDATE patients SET last_visit = ? WHERE id = ?", [
      appt.appointment_date,
      appt.patient_id,
    ]);

    // Update doctor visit count
    const did = doctorId(req.session.user.id);
    await pool.query(
      "UPDATE doctor_stats SET visits = visits + 1 WHERE doctor_id = ?",
      [did],
    );

    // Timeline event for patient (visible to patient)
    const [drRow] = await pool.query("SELECT name FROM doctors WHERE id = ?", [
      appt.doctor_id,
    ]);
    const drName = drRow[0]?.name || "Doctor";
    let tlDesc = `Appointment with ${drName} completed.`;
    if (mNames.length) tlDesc += ` Prescribed: ${mNames.join(", ")}.`;
    if (dNames.length) tlDesc += ` Diagnosed: ${dNames.join(", ")}.`;

    await pool.query(
      `INSERT INTO timeline_events (patient_id, event_date, title, description)
       VALUES (?,?,'Appointment Completed',?)`,
      [appt.patient_id, appt.appointment_date, tlDesc],
    );

    res.redirect(`/dashboard/doctor/schedule`);
  } catch (err) {
    console.error("POST /appointments/:id/complete:", err.message);
    res
      .status(500)
      .render("error", { message: "Complete failed: " + err.message });
  }
});

// ── POST /appointments/:id/cancel ──
router.post("/:id/cancel", requireStaff, async (req, res) => {
  const { cancellationReason } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length)
      return res
        .status(404)
        .render("error", { message: "Appointment not found." });
    const appt = rows[0];

    await pool.query(
      `UPDATE appointments SET status='Cancelled', cancellation_reason=? WHERE id=?`,
      [cancellationReason || "", req.params.id],
    );

    // Notify patient via timeline
    const [drRow] = await pool.query("SELECT name FROM doctors WHERE id=?", [
      appt.doctor_id,
    ]);
    await pool.query(
      `INSERT INTO timeline_events (patient_id, event_date, title, description)
       VALUES (?,CURDATE(),'Appointment Cancelled',?)`,
      [
        appt.patient_id,
        `Your appointment on ${appt.appointment_date} was cancelled. Reason: ${cancellationReason || "Not specified"}.`,
      ],
    );

    res.redirect("/dashboard/doctor/schedule");
  } catch (err) {
    console.error("POST /appointments/:id/cancel:", err.message);
    res
      .status(500)
      .render("error", { message: "Cancel failed: " + err.message });
  }
});

// ── GET /appointments/:id/reschedule  reschedule form ──────
router.get("/:id/reschedule", requireStaff, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, p.name AS patient_name, d.id AS did
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = ?`,
      [req.params.id],
    );
    if (!rows.length)
      return res
        .status(404)
        .render("error", { message: "Appointment not found." });

    res.render("appointment-reschedule", { appt: rows[0] });
  } catch (err) {
    res.status(500).render("error", { message: err.message });
  }
});

// ── POST /appointments/:id/reschedule  doctor picks new slot
router.post("/:id/reschedule", requireStaff, async (req, res) => {
  const { newDate, newSlot } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM appointments WHERE id=?", [
      req.params.id,
    ]);
    if (!rows.length)
      return res
        .status(404)
        .render("error", { message: "Appointment not found." });
    const old = rows[0];

    // Create new appointment
    let newId;
    try {
      const [result] = await pool.query(
        `INSERT INTO appointments
           (doctor_id, patient_id, appointment_time, appointment_date, problem_description, status)
         VALUES (?,?,?,?,?,'Upcoming')`,
        [
          old.doctor_id,
          old.patient_id,
          newSlot,
          newDate,
          old.problem_description,
        ],
      );
      newId = result.insertId;
    } catch (dupErr) {
      if (dupErr.code === "ER_DUP_ENTRY") {
        return res.redirect(
          `/appointments/${req.params.id}/reschedule?error=slot_taken`,
        );
      }
      throw dupErr;
    }

    // Mark old appointment as rescheduled, link to new
    await pool.query(
      `UPDATE appointments SET status='Rescheduled', rescheduled_to_id=? WHERE id=?`,
      [newId, req.params.id],
    );

    // Notify patient
    await pool.query(
      `INSERT INTO timeline_events (patient_id, event_date, title, description)
       VALUES (?,CURDATE(),'Appointment Rescheduled',?)`,
      [
        old.patient_id,
        `Your appointment was rescheduled to ${newDate} at ${newSlot}.`,
      ],
    );

    res.redirect("/dashboard/doctor/schedule");
  } catch (err) {
    console.error("POST /appointments/:id/reschedule:", err.message);
    res
      .status(500)
      .render("error", { message: "Reschedule failed: " + err.message });
  }
});

// ── POST /appointments/slots/block  block a slot ──────────
router.post("/slots/block", requireStaff, async (req, res) => {
  const { slotTime, date, reason } = req.body;
  const did = doctorId(req.session.user.id);
  try {
    await pool.query(
      `INSERT INTO slot_overrides (doctor_id, override_date, slot_time, override_type, reason)
       VALUES (?,?,?,'blocked',?)
       ON DUPLICATE KEY UPDATE reason=?`,
      [did, date, slotTime, reason || "", reason || ""],
    );
    res.redirect(`/dashboard/doctor/schedule?date=${date}`);
  } catch (err) {
    res
      .status(500)
      .render("error", { message: "Block slot failed: " + err.message });
  }
});

// ── POST /appointments/slots/add  add an extra slot ───────
router.post("/slots/add", requireStaff, async (req, res) => {
  const { slotTime, date } = req.body;
  const did = doctorId(req.session.user.id);
  try {
    await pool.query(
      `INSERT IGNORE INTO slot_overrides (doctor_id, override_date, slot_time, override_type)
       VALUES (?,?,?,'added')`,
      [did, date, slotTime],
    );
    res.redirect(`/dashboard/doctor/schedule?date=${date}`);
  } catch (err) {
    res
      .status(500)
      .render("error", { message: "Add slot failed: " + err.message });
  }
});

// ── POST /appointments/slots/unblock  remove a block ──────
router.post("/slots/unblock", requireStaff, async (req, res) => {
  const { slotTime, date } = req.body;
  const did = doctorId(req.session.user.id);
  try {
    await pool.query(
      `DELETE FROM slot_overrides WHERE doctor_id=? AND override_date=? AND slot_time=? AND override_type='blocked'`,
      [did, date, slotTime],
    );
    res.redirect(`/dashboard/doctor/schedule?date=${date}`);
  } catch (err) {
    res.status(500).render("error", { message: err.message });
  }
});

module.exports = router;
