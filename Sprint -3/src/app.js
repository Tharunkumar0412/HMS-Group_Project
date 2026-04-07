require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const bookingRoutes = require('./routes/booking');

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/booking', bookingRoutes);

app.get('/', (req, res) => {
  res.render('home'); 
});

app.get('/login', (req, res) => {
  res.render('login', { error: req.query.error }); 
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));