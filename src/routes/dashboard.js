const express = require('express');
const router = express.Router();
const mock = require('../config/mockData');

// --- PATIENT ROUTES ---
router.get('/patient', (req, res) => {
  res.render('patient', { user: mock.patient });
});

router.get('/patient/records', (req, res) => {
  res.render('records', { user: mock.patient });
});

// --- DOCTOR ROUTES ---
router.get('/doctor', (req, res) => {
  res.render('doctor', { user: mock.doctor });
});

router.get('/doctor/patient-view', (req, res) => {
  res.render('doctor-ehr', { doctor: mock.doctor, patient: mock.patient });
});

// GET route to display the prescription form
router.get('/doctor/prescribe', (req, res) => {
  res.render('prescribe', { doctor: mock.doctor, patient: mock.patient });
});

// POST route to handle the submitted prescription
router.post('/doctor/prescribe', (req, res) => {
  const { medName, instructions } = req.body;

  if (medName && instructions) {
    // 1. Add the new medication to the top of the patient's active prescriptions
    mock.patient.medications.unshift({
      name: medName,
      instructions: instructions
    });

    // 2. Add an entry to the patient's timeline so they know it was prescribed today
    const today = new Date().toLocaleDateString('en-US', { 
      month: 'short', day: '2-digit', year: 'numeric' 
    }).toUpperCase();

    mock.patient.timeline.unshift({
      date: today,
      title: "Prescription Added",
      desc: `Prescribed ${medName} by ${mock.doctor.name}.`
    });
  }

  // Redirect the doctor back to the EHR view to see the updated data!
  res.redirect('/dashboard/doctor/patient-view');
});

// Route for the full schedule view
router.get('/doctor/schedule', (req, res) => {
  res.render('doctor-schedule', { user: mock.doctor });
});

// Route for the patient directory
router.get('/doctor/directory', (req, res) => {
  res.render('doctor-directory', { user: mock.doctor, patients: mock.patientsList });
});

module.exports = router;