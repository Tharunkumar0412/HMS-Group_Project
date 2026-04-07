// src/routes/auth.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');

// ── POST /auth/login ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.redirect('/login?error=invalid_credentials');

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND role = ? LIMIT 1',
      [email, role]
    );
    if (!rows.length) return res.redirect('/login?error=invalid_credentials');

    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.redirect('/login?error=invalid_credentials');

    req.session.user = {
      id:              user.id,
      email:           user.email,
      role:            user.role,
      profileComplete: user.profile_complete === 1,
    };

    if (!user.profile_complete) return res.redirect('/profile/setup');
    return res.redirect(user.role === 'patient' ? '/dashboard/patient' : '/dashboard/doctor');

  } catch (err) {
    console.error('Login error:', err.message);
    return res.redirect('/login?error=invalid_credentials');
  }
});

// ── GET /signup ───────────────────────────────────────────────
router.get('/signup', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.render('signup', { error: null, values: {} });
});

// ── POST /auth/signup ─────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password, confirmPassword, role } = req.body;

  // Basic validation
  if (!email || !password || !confirmPassword || !role) {
    return res.render('signup', {
      error:  'All fields are required.',
      values: { email, role },
    });
  }
  if (password.length < 8) {
    return res.render('signup', {
      error:  'Password must be at least 8 characters.',
      values: { email, role },
    });
  }
  if (password !== confirmPassword) {
    return res.render('signup', {
      error:  'Passwords do not match.',
      values: { email, role },
    });
  }
  if (!['staff', 'patient'].includes(role)) {
    return res.render('signup', {
      error:  'Invalid role selected.',
      values: { email, role },
    });
  }

  try {
    // Check if email already registered
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1', [email]
    );
    if (existing.length) {
      return res.render('signup', {
        error:  'An account with this email already exists. Please log in.',
        values: { email, role },
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role, profile_complete) VALUES (?,?,?,FALSE)',
      [email, hash, role]
    );

    // Log them in immediately
    req.session.user = {
      id:              result.insertId,
      email,
      role,
      profileComplete: false,
    };

    // Send to profile setup to fill in their details
    return res.redirect('/profile/setup');

  } catch (err) {
    console.error('Signup error:', err.message);
    return res.render('signup', {
      error:  'Something went wrong. Please try again.',
      values: { email, role },
    });
  }
});

// ── GET /auth/logout ──────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
