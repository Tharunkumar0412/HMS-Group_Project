const express = require('express');
const router = express.Router();
const mock = require('../config/mockData');

// GET: Display the booking form
router.get('/new', (req, res) => {
  res.render('booking', { 
    user: mock.patient,
    departments: mock.departments,
    doctors: mock.doctorsList 
  });
});

// POST: Catch the form submission and process it
router.post('/confirm', (req, res) => {
  // Extract data from the submitted form
  const { department, date, doctor, timeSlot } = req.body;

  // Ensure a date was provided to avoid errors
  if (!date || !doctor || !timeSlot) {
    return res.redirect('/booking/new'); // Fallback if form is incomplete
  }

  // Format the date to match the timeline style (e.g., "MAR 15, 2026")
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('en-US', { 
    month: 'short', day: '2-digit', year: 'numeric' 
  }).toUpperCase();

  // Create the new appointment object
  const newAppointment = {
    date: formattedDate,
    title: `Consultation Scheduled`,
    desc: `Appointment at ${timeSlot} with ${doctor}. Status: Confirmed.`
  };

  // Add the new appointment to the top of the patient's timeline
  mock.patient.timeline.unshift(newAppointment);

  // Redirect back to the patient dashboard to see the updated timeline
  res.redirect('/dashboard/patient');
});

module.exports = router;