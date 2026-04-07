// src/app.js
require('dotenv').config();
const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql2     = require('mysql2');
const app        = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Session store (callback-based pool — required by express-mysql-session)
const sessionPool = mysql2.createPool({
  host:     process.env.DB_HOST     || 'db',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'hms_user',
  password: process.env.DB_PASSWORD || 'hms_pass',
  database: process.env.DB_NAME     || 'hms',
  connectionLimit: 5,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const sessionStore = new MySQLStore({ createDatabaseTable: true }, sessionPool);

app.use(session({
  key:               'hms_session',
  secret:            process.env.SESSION_SECRET || 'change_in_production',
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, secure: false },
}));

// Make currentUser available in all Pug templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;
  next();
});

// ── Profile-complete guard ─────────────────────────────────
// If logged in but profile not yet filled, redirect to setup page.
// Exempt: auth routes, profile setup itself, home, login, static.
const PROFILE_EXEMPT = ['/auth/', '/profile/setup', '/login', '/signup', '/'];
app.use((req, res, next) => {
  const user = req.session?.user;
  if (!user) return next();
  if (user.profileComplete) return next();
  const exempt = PROFILE_EXEMPT.some(p => req.path === p || req.path.startsWith(p));
  if (exempt) return next();
  return res.redirect('/profile/setup');
});

// ── Routes ────────────────────────────────────────────────
app.use('/auth',         require('./routes/auth'));
app.use('/profile',      require('./routes/profile'));
app.use('/dashboard',    require('./routes/dashboard'));
app.use('/booking',      require('./routes/booking'));
app.use('/appointments', require('./routes/appointments'));

app.get('/', (req, res) => {
  if (req.session?.user) {
    if (!req.session.user.profileComplete) return res.redirect('/profile/setup');
    return res.redirect(req.session.user.role === 'patient' ? '/dashboard/patient' : '/dashboard/doctor');
  }
  res.render('home');
});

app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.render('login', { error: req.query.error });
});

app.get('/signup', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.render('signup', { error: null, values: {} });
});

app.use((req, res) => res.status(404).render('error', { message: 'Page not found.' }));

app.use((err, req, res, _next) => {
  console.error('ERROR', req.method, req.originalUrl, err.message);
  res.status(500).render('error', { message: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🏥 HMS → http://localhost:${PORT}`));
module.exports = app;
