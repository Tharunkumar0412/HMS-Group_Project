require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'db',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'hms_user',
    password: process.env.DB_PASSWORD || 'hms_pass',
    database: process.env.DB_NAME     || 'hms',
  });

  console.log('Seeding HMS with realistic data...');

await conn.query('DELETE FROM urgent_alerts');
  await conn.query('DELETE FROM doctor_stats');
  await conn.query('DELETE FROM timeline_events');
  await conn.query('DELETE FROM medical_files');
  await conn.query('DELETE FROM medications');
  await conn.query('DELETE FROM diagnoses');
  await conn.query('DELETE FROM allergies');
  await conn.query('DELETE FROM patient_conditions');
  await conn.query('DELETE FROM vitals');
  await conn.query('DELETE FROM appointments');
  for (const t of ['appointments','diagnoses','medications','vitals','timeline_events','medical_files','allergies','patient_conditions','urgent_alerts','doctor_stats']) {
    await conn.query(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
  }
  console.log('Cleaned non-unique tables');

  // ── Departments ──
  await conn.query(`
    INSERT IGNORE INTO departments (id, name, description, icon) VALUES
    ('dept_cardio',    'Cardiology',        'Heart and cardiovascular system care',      '❤️'),
    ('dept_ent',       'ENT Specialist',    'Ear, Nose, and Throat health',              '👂'),
    ('dept_neuro',     'Neurology',         'Brain and nervous system disorders',        '🧠'),
    ('dept_ophthalmo', 'Ophthalmology',     'Comprehensive vision and eye care',         '👁️'),
    ('dept_general',   'General Physician', 'Primary care and routine checkups',         '🩺'),
    ('dept_ortho',     'Orthopedics',       'Bone, joint, and muscle care',              '🦴'),
    ('dept_diab',      'Diabetology',       'Diabetes management and endocrinology',     '💉'),
    ('dept_derm',      'Dermatology',       'Skin, hair, and nail conditions',           '🔬')
  `);
  console.log('  ✓ Departments');

  // ── Users ──
  const hp = await bcrypt.hash('password123', 10);
  const hu = await bcrypt.hash('password456', 10);

  await conn.query('INSERT IGNORE INTO users (id,email,password_hash,role,profile_complete) VALUES (?,?,?,?,?)',
    [1,'dr.sharma@hms.com',hp,'staff',true]);
  await conn.query('INSERT IGNORE INTO users (id,email,password_hash,role,profile_complete) VALUES (?,?,?,?,?)',
    [2,'dr.priya@hms.com',hp,'staff',true]);
  await conn.query('INSERT IGNORE INTO users (id,email,password_hash,role,profile_complete) VALUES (?,?,?,?,?)',
    [3,'arjun@hms.com',hu,'patient',true]);
  await conn.query('INSERT IGNORE INTO users (id,email,password_hash,role,profile_complete) VALUES (?,?,?,?,?)',
    [4,'meera@hms.com',hu,'patient',true]);
  console.log('  ✓ Users');

  // ── Doctors ───
  await conn.query(`INSERT IGNORE INTO doctors (id,user_id,name,dept_id,phone,bio) VALUES
    ('DOC000001',1,'Dr. Rajesh Sharma','dept_cardio','+91 98765 43210',
     'Senior Cardiologist with 18 years of experience. Specialist in interventional cardiology, heart failure management, and preventive cardiovascular care. Trained at AIIMS Delhi and Johns Hopkins.'),
    ('DOC000002',2,'Dr. Priya Nair','dept_general','+91 91234 56789',
     'General Physician and Family Medicine specialist with 12 years of practice. Expert in diabetes management, hypertension, and preventive healthcare. Passionate about patient education and holistic wellness.')`);
  console.log('  ✓ Doctors');

  // ── Doctor availability ──
  await conn.query(`INSERT IGNORE INTO doctor_availability (doctor_id,start_time,end_time,slot_duration) VALUES
    ('DOC000001','09:00:00','12:00:00',20),
    ('DOC000001','14:00:00','17:00:00',20),
    ('DOC000002','08:30:00','13:00:00',20),
    ('DOC000002','15:00:00','18:00:00',20)`);
  console.log('  ✓ Availability');

  // ── Doctor stats ──
  await conn.query(`INSERT IGNORE INTO doctor_stats (doctor_id,visits,labs,files,emergencies) VALUES
    ('DOC000001',247,18,12,3),
    ('DOC000002',312,22,8,1)`);

  // ── Patients ──
  await conn.query(`INSERT IGNORE INTO patients
    (id,user_id,name,age,gender,blood_group,phone,emergency_contact,last_visit,status) VALUES
    ('PAT000003',3,'Arjun Mehta',34,'Male','B+','+91 99887 76655',
     'Sunita Mehta (Wife) — +91 99887 76644','2024-11-18','Active'),
    ('PAT000004',4,'Meera Krishnamurthy',52,'Female','O-','+91 88776 65544',
     'Rajan Krishnamurthy (Husband) — +91 88776 65533','2024-12-03','Active')`);
  console.log('  ✓ Patients');

  // ── Vitals ──
  await conn.query(`INSERT IGNORE INTO vitals (patient_id,bp,hr,spo2,temp) VALUES
    ('PAT000003','122/80',74,98,98.2),
    ('PAT000004','148/94',82,97,98.8)`);
  console.log('  ✓ Vitals');

  // ── Pre-existing conditions ───
  await conn.query(`INSERT IGNORE INTO patient_conditions (patient_id,condition_name,since_year) VALUES
    ('PAT000003','Type 2 Diabetes Mellitus',2019),
    ('PAT000003','Mild Hypertension',2021),
    ('PAT000004','Hypertension (Stage 2)',2016),
    ('PAT000004','Hypothyroidism',2018),
    ('PAT000004','Osteoarthritis – both knees',2022)`);
  console.log('  ✓ Conditions');

  // ── Allergies ─────────────────
  await conn.query(`INSERT IGNORE INTO allergies (patient_id,name,type) VALUES
    ('PAT000003','Penicillin','danger'),
    ('PAT000003','Sulfonamides','danger'),
    ('PAT000003','Aspirin (Mild GI upset)','warning'),
    ('PAT000004','NSAIDs – Ibuprofen','danger'),
    ('PAT000004','Latex','warning'),
    ('PAT000004','Shellfish','info')`);
  console.log('  ✓ Allergies');

  // ── Appointments — completed historical ones ──────────────────
  // Arjun's appointments
  await conn.query(`INSERT IGNORE INTO appointments
    (id,doctor_id,patient_id,appointment_time,appointment_date,problem_description,status,doctor_notes) VALUES
    (1,'DOC000002','PAT000003','10:00:00','2024-09-05',
     'Routine diabetes follow-up and HbA1c review',
     'Completed',
     'HbA1c improved to 7.1% from 7.8% three months ago. Good dietary compliance reported. Continue current regimen. Advised to start 30 min brisk walk daily. Next HbA1c in 3 months.'),
    (2,'DOC000001','PAT000003','09:20:00','2024-10-14',
     'Chest tightness and mild shortness of breath during exercise',
     'Completed',
     'Stress ECG within normal limits. Echo shows no structural abnormality. Likely exertional dyspnea secondary to deconditioning. Advised gradual aerobic conditioning. BP slightly elevated – started low-dose Amlodipine.'),
    (3,'DOC000002','PAT000003','11:00:00','2024-11-18',
     'Diabetes annual review + BP follow-up',
     'Completed',
     'BP now 122/80 on Amlodipine 5mg – well controlled. HbA1c 6.9%, best in 2 years. Fasting glucose trend positive. Continue all meds. Foot exam normal. Urine microalbumin negative. Review in 6 months.')`);

  // Meera's appointments
  await conn.query(`INSERT IGNORE INTO appointments
    (id,doctor_id,patient_id,appointment_time,appointment_date,problem_description,status,doctor_notes) VALUES
    (4,'DOC000002','PAT000004','09:00:00','2024-08-22',
     'Persistent fatigue, weight gain, and feeling cold — thyroid check',
     'Completed',
     'TSH elevated at 8.2 mIU/L (was 4.1 in Jan). Levothyroxine dose increased from 50mcg to 75mcg. Repeat TFT in 6 weeks. B12 deficiency noted – starting cyanocobalamin supplementation.'),
    (5,'DOC000001','PAT000004','14:20:00','2024-10-08',
     'Hypertension review – home BP readings consistently above 150/95',
     'Completed',
     'Ambulatory BP confirms Stage 2 HTN. Added Telmisartan 40mg to existing Amlodipine. Diet counselling – low sodium, DASH approach. Advised home BP log. Target <135/85. Review in 4 weeks.'),
    (6,'DOC000002','PAT000004','10:40:00','2024-12-03',
     'BP follow-up + thyroid levels + knee pain worsening',
     'Completed',
     'BP 148/94 – improved but still above target. Titrated Telmisartan to 80mg. TSH now 3.2 – good response to dose increase, continue 75mcg. Knee XR confirms medial compartment narrowing. Referred to physiotherapy. Added low-dose Tramadol for pain relief on flare days.')`);

  // Upcoming appointments for today
  const today = new Date().toISOString().split('T')[0];
  await conn.query('DELETE FROM appointments WHERE appointment_date = ?', [today]);
  await conn.query(`INSERT INTO appointments
    (doctor_id,patient_id,appointment_time,appointment_date,problem_description,status) VALUES
    ('DOC000001','PAT000003','09:00:00',?,'Follow-up for exertional dyspnea — post cardiology clearance check','Upcoming'),
    ('DOC000002','PAT000004','09:20:00',?,'3-month hypertension review + thyroid recheck','In Progress'),
    ('DOC000001',NULL,'10:00:00',?,NULL,'Upcoming'),
    ('DOC000002','PAT000003','10:40:00',?,'Diabetes quarterly review – HbA1c result discussion','Upcoming')`,
    [today,today,today,today]);
  console.log('  ✓ Appointments');

  // ── Diagnoses ─────────────────
  await conn.query(`INSERT IGNORE INTO diagnoses
    (patient_id,appointment_id,name,diagnosed_date,status) VALUES
    ('PAT000003',1,'Type 2 Diabetes Mellitus – improving glycaemic control','2024-09-05','Active'),
    ('PAT000003',2,'Exertional Dyspnea – deconditioning related','2024-10-14','Resolving'),
    ('PAT000003',2,'Hypertension Stage 1','2024-10-14','Active'),
    ('PAT000003',3,'Diabetic Nephropathy – microalbuminuria screen negative','2024-11-18','Resolved'),
    ('PAT000004',4,'Hypothyroidism – undertreated','2024-08-22','Active'),
    ('PAT000004',4,'Vitamin B12 Deficiency','2024-08-22','Resolving'),
    ('PAT000004',5,'Hypertension Stage 2','2024-10-08','Active'),
    ('PAT000004',6,'Osteoarthritis – bilateral knee, medial compartment','2024-12-03','Chronic')`);
  console.log('  ✓ Diagnoses');

  // ── Medications ───────────────
  await conn.query(`INSERT IGNORE INTO medications
    (patient_id,appointment_id,name,instructions) VALUES
    ('PAT000003',1,'Metformin 1000mg','Twice daily — after breakfast and dinner'),
    ('PAT000003',1,'Glimepiride 2mg','Once daily — 30 min before breakfast'),
    ('PAT000003',2,'Amlodipine 5mg','Once daily — morning, with or without food'),
    ('PAT000003',3,'Rosuvastatin 10mg','Once daily — at bedtime'),
    ('PAT000003',3,'Aspirin 75mg (enteric-coated)','Once daily — after breakfast'),
    ('PAT000004',4,'Levothyroxine 75mcg','Once daily — 30 min before breakfast, no other meds within 4 hrs'),
    ('PAT000004',4,'Cyanocobalamin 1500mcg','Once daily — with meals, for 3 months'),
    ('PAT000004',5,'Telmisartan 40mg','Once daily — morning'),
    ('PAT000004',5,'Amlodipine 5mg','Once daily — evening'),
    ('PAT000004',6,'Telmisartan 80mg (dose increase)','Once daily — morning, replacing previous 40mg'),
    ('PAT000004',6,'Tramadol 50mg','As needed for severe knee pain — max twice daily, not for routine use')`);
  console.log('  ✓ Medications');

  // ── Medical files ─────────────
  await conn.query(`INSERT IGNORE INTO medical_files (patient_id,name,ext,size,file_date) VALUES
    ('PAT000003','HbA1c_Report_Sep2024','pdf','420 KB','2024-09-05'),
    ('PAT000003','Stress_ECG_Oct2024','pdf','1.8 MB','2024-10-14'),
    ('PAT000003','Echo_Report_Oct2024','pdf','3.2 MB','2024-10-14'),
    ('PAT000003','HbA1c_Lipid_Nov2024','pdf','510 KB','2024-11-18'),
    ('PAT000004','TFT_Report_Aug2024','pdf','380 KB','2024-08-22'),
    ('PAT000004','B12_Folate_Aug2024','pdf','290 KB','2024-08-22'),
    ('PAT000004','Ambulatory_BP_Oct2024','pdf','1.1 MB','2024-10-08'),
    ('PAT000004','Knee_XRay_Dec2024','pdf','4.5 MB','2024-12-03')`);
  console.log('  ✓ Medical Files');

  // ── Timeline events ───────────
  await conn.query(`INSERT IGNORE INTO timeline_events
    (patient_id,event_date,title,description) VALUES
    ('PAT000003','2024-09-05','Diabetes Follow-up — Dr. Priya Nair',
     'HbA1c improved to 7.1%. Medication continued. Lifestyle advice reinforced.'),
    ('PAT000003','2024-10-14','Cardiology Consult — Dr. Rajesh Sharma',
     'Cardiac clearance given. Exertional dyspnea attributed to deconditioning. Amlodipine started for BP.'),
    ('PAT000003','2024-11-18','Annual Review — Dr. Priya Nair',
     'HbA1c 6.9% — best result in 2 years. BP controlled. Rosuvastatin and Aspirin added to regimen.'),
    ('PAT000004','2024-08-22','Thyroid & Fatigue Consult — Dr. Priya Nair',
     'TSH elevated. Levothyroxine increased to 75mcg. B12 deficiency detected and treated.'),
    ('PAT000004','2024-10-08','Hypertension Review — Dr. Rajesh Sharma',
     'BP consistently elevated. Telmisartan 40mg added. DASH diet counselling given.'),
    ('PAT000004','2024-12-03','Comprehensive Review — Dr. Priya Nair',
     'BP improving. TSH normalised. Knee OA confirmed by XRay. Referred to physiotherapy. Telmisartan titrated to 80mg.')`);
  console.log('  ✓ Timeline Events');

  // ── Urgent alerts ─────────────
  await conn.query(`INSERT IGNORE INTO urgent_alerts (doctor_id,patient_name,message) VALUES
    ('DOC000001','Meera Krishnamurthy','BP reading 178/102 logged at home — needs urgent review today'),
    ('DOC000002','Lab: PAT000003','HbA1c result arrived: 6.9% — ready for discussion at today appointment')`);
  console.log('  ✓ Urgent Alerts');

  await conn.end();
  console.log('');
  console.log('✅ Seed complete. Login credentials:');
  console.log('   👨‍⚕️  dr.sharma@hms.com   / password123  (Cardiologist)');
  console.log('   👩‍⚕️  dr.priya@hms.com    / password123  (General Physician)');
  console.log('   🧑  arjun@hms.com       / password456  (Patient — Diabetic)');
  console.log('   👩  meera@hms.com       / password456  (Patient — Hypertension)');
}

seed().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
