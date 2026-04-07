CREATE DATABASE IF NOT EXISTS hms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hms;

CREATE TABLE IF NOT EXISTS users (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(150) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  role             ENUM('admin','staff','patient') DEFAULT 'patient',
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id          VARCHAR(30)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  icon        VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS doctors (
  id       VARCHAR(20)  PRIMARY KEY,
  user_id  INT UNIQUE,
  name     VARCHAR(120) NOT NULL,
  dept_id  VARCHAR(30),
  phone    VARCHAR(20),
  bio      TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)       ON DELETE SET NULL,
  FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Repeating daily availability windows for a doctor
CREATE TABLE IF NOT EXISTS doctor_availability (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id     VARCHAR(20) NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  slot_duration INT DEFAULT 20,
  is_active     BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

-- Per-date overrides: block an existing slot or add an extra one
CREATE TABLE IF NOT EXISTS slot_overrides (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id     VARCHAR(20) NOT NULL,
  override_date DATE NOT NULL,
  slot_time     TIME NOT NULL,
  override_type ENUM('blocked','added') NOT NULL,
  reason        VARCHAR(200),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patients (
  id                VARCHAR(20)  PRIMARY KEY,
  user_id           INT UNIQUE,
  name              VARCHAR(120) NOT NULL,
  age               INT,
  gender            ENUM('Male','Female','Other'),
  blood_group       VARCHAR(5),
  phone             VARCHAR(20),
  emergency_contact VARCHAR(150),
  last_visit        DATE,
  status            ENUM('Active','Discharged','Inactive') DEFAULT 'Active',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Patient self-reported pre-existing conditions (structured list)
CREATE TABLE IF NOT EXISTS patient_conditions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  patient_id     VARCHAR(20) NOT NULL,
  condition_name VARCHAR(200) NOT NULL,
  since_year     YEAR,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id           VARCHAR(20),
  patient_id          VARCHAR(20),
  appointment_time    TIME NOT NULL,
  appointment_date    DATE NOT NULL,
  problem_description TEXT,
  status              ENUM('Upcoming','In Progress','Completed','Cancelled','Rescheduled') DEFAULT 'Upcoming',
  doctor_notes        TEXT,
  rescheduled_to_id   INT DEFAULT NULL,
  cancellation_reason VARCHAR(300),
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slot (doctor_id, appointment_date, appointment_time),
  FOREIGN KEY (doctor_id)  REFERENCES doctors(id)  ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vitals (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  patient_id  VARCHAR(20) NOT NULL,
  bp          VARCHAR(10),
  hr          INT,
  spo2        INT,
  temp        DECIMAL(4,1),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  patient_id  VARCHAR(20) NOT NULL,
  event_date  DATE,
  title       VARCHAR(100),
  description TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diagnoses (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  patient_id     VARCHAR(20) NOT NULL,
  appointment_id INT,
  name           VARCHAR(200) NOT NULL,
  diagnosed_date DATE,
  status         ENUM('Active','Chronic','Resolved','Resolving') DEFAULT 'Active',
  FOREIGN KEY (patient_id)     REFERENCES patients(id)     ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS medications (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  patient_id     VARCHAR(20) NOT NULL,
  appointment_id INT,
  name           VARCHAR(200) NOT NULL,
  instructions   TEXT,
  prescribed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)     REFERENCES patients(id)     ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS allergies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  patient_id VARCHAR(20) NOT NULL,
  name       VARCHAR(100) NOT NULL,
  type       ENUM('danger','warning','info') DEFAULT 'warning',
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medical_files (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  patient_id VARCHAR(20) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  ext        VARCHAR(10),
  size       VARCHAR(20),
  file_date  DATE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doctor_stats (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id   VARCHAR(20) UNIQUE NOT NULL,
  visits      INT DEFAULT 0,
  labs        INT DEFAULT 0,
  files       INT DEFAULT 0,
  emergencies INT DEFAULT 0,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS urgent_alerts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id    VARCHAR(20),
  patient_name VARCHAR(120),
  message      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved     BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
);
