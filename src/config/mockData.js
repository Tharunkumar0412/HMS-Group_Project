module.exports = {
  users: [
    { email: "ananya@hms.com", password: "password123", role: "staff" },
    { email: "ankith@hms.com", password: "password456", role: "patient" }
  ],
  session: {
    currentUser: null 
  },
  
  departments: [
    { id: "dept_cardio", name: "Cardiology", desc: "Heart and blood system care", icon: "❤️" },
    { id: "dept_ent", name: "ENT Specialist", desc: "Ear, Nose, and Throat health", icon: "" },
    { id: "dept_neuro", name: "Neurology", desc: "Brain and nervous system disorders", icon: "🧠" },
    { id: "dept_ophthalmo", name: "Ophthalmology", desc: "Comprehensive vision and eye care", icon: "👁️" },
    { id: "dept_general", name: "General Physician", desc: "Primary care and routine checkups", icon: "👨‍⚕️" },
    { id: "dept_ortho", name: "Orthopedics", desc: "Bone, joint, and muscle care", icon: "🦴" }
  ],
doctorsList: [
    { id: "doc_101", name: "Dr. Ananya Rao", dept: "dept_general" },
    { id: "doc_102", name: "Dr. Vikram Singh", dept: "dept_cardio" }
  ],

  patientsList: [
    { id: "882910", name: "Ankith Sharma", age: 32, gender: "Male", bloodGroup: "O+", lastVisit: "Oct 12, 2023", status: "Active" },
    { id: "882911", name: "Meera Kapoor", age: 45, gender: "Female", bloodGroup: "A-", lastVisit: "Nov 02, 2023", status: "Active" },
    { id: "882912", name: "Rahul Mehra", age: 29, gender: "Male", bloodGroup: "B+", lastVisit: "Sep 15, 2023", status: "Discharged" },
    { id: "882913", name: "Sita Venkat", age: 61, gender: "Female", bloodGroup: "O-", lastVisit: "Dec 01, 2023", status: "Active" }
  ],

  doctor: {
    name: "Dr. Ananya Rao",
    patientsRemaining: 4,
    urgent: { patient: "Mrs. Lakshmi Iyer", msg: "Potassium 6.2 mmol/L (Critical High)" },
    stats: { visits: 18, labs: 12, files: 5, emergencies: 0 },
    schedule: [
      { time: "09:00 AM", name: "Rahul Mehra", type: "Post-Op Follow-up", status: "Completed" },
      { time: "10:00 AM", name: "Ankith Sharma", type: "Routine Check-up", status: "In Progress" },
      { time: "11:15 AM", name: "Vikram Singh", type: "ECG Discussion", status: "Upcoming" }
    ]
  },
  
  patient: {
    id: "882910",
    name: "Ankith Sharma",
    age: 32,
    gender: "Male",
    bloodGroup: "O+",
    lastVisit: "Oct 12, 2023",
    vitals: { bp: "118/76", hr: 72, spo2: 98, temp: 98.4 },
    timeline: [
      { date: "OCT 12, 2023", title: "Consultation", desc: "Regular check-up. By Dr. Ananya Rao." },
      { date: "AUG 05, 2023", title: "Lab Result", desc: "HbA1c: 6.4%. Pre-diabetic range." }
    ],
    activeDiagnoses: [
      { name: "Type 2 Diabetes Mellitus", date: "Jan 2022", status: "Active" },
      { name: "Seasonal Allergic Rhinitis", date: "Mar 2021", status: "Chronic" },
      { name: "Acute Pharyngitis", date: "Oct 12, 2023", status: "Resolving" }
    ],
    medications: [
      { name: "Metformin 500mg", instructions: "Twice daily - After meals" },
      { name: "Lisinopril 10mg", instructions: "Once daily - Morning" },
      { name: "Cetirizine 10mg", instructions: "As needed - For allergies" }
    ],
    medicalFiles: [
      { name: "Chest_XRay_Oct23", ext: "pdf", size: "1.2 MB", date: "Oct 12, 2023" },
      { name: "HbA1c_Report_Aug", ext: "pdf", size: "11 MB", date: "Aug 05, 2023" },
      { name: "Lipid_Profile_Jan2", ext: "pdf", size: "450 KB", date: "Jan 15, 2023" }
    ],
    allergies: [
      { name: "Penicillin", type: "danger" },
      { name: "Peanuts", type: "danger" },
      { name: "Latex (Mild)", type: "warning" }
    ]
  }
};