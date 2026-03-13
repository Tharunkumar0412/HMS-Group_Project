const express = require('express');
const router = express.Router();
const mock = require('../config/mockData');

router.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  
  const authenticatedUser = mock.users.find(u => 
    u.email === email && 
    u.password === password && 
    u.role === role
  );

  if (authenticatedUser) {
    // Set the mock session
    mock.session.currentUser = authenticatedUser;
    
    if (authenticatedUser.role === 'staff') {
      return res.redirect('/dashboard/doctor');
    } else {
      return res.redirect('/dashboard/patient');
    }
  } else {
    return res.redirect('/?error=invalid_credentials');
  }
});

// Logout Route
router.get('/logout', (req, res) => {
  // Clear the mock session
  mock.session.currentUser = null;
  res.redirect('/');
});

module.exports = router;