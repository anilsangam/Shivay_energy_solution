# SHIVAY ENERGY SOLUTIONS
> **Tagline:** Save Green Energy To Build A Better Future  
> **Headquarters:** Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India  
> **Key Contacts:** Deepak Kushwaha (+91 70005 75496) | Rahul Saini (+91 93997 61750)  
> **Email:** shivayenergysolutions@gmail.com  

---

## ⚡ Project Overview
A complete, localized, production-ready Solar Energy Management Platform built for **SHIVAY ENERGY SOLUTIONS** (Raisen, Madhya Pradesh).

The platform comprises:
1. **Public Solar Website**: High-converting, mobile-responsive portal with preserved Solaria UI design tokens (`#c6ff7d` / `#163563`), Indian localization, PM Surya Ghar Muft Bijli Yojana subsidy guide, product catalogs, solar rooftop project showcase, and dynamic lead capture.
2. **Interactive Solar Savings Calculator**: Real-time calculations of recommended kW capacity, monthly units, annual savings in ₹, PM Surya Ghar subsidy deductions (up to ₹78,000), and net payback period.
3. **Customer Support & Grievance Portal**: Online registration for inverter/generation complaints with instant tracking ticket ID generation (`SHIVAY-XXXXX`).
4. **Dealership & Franchise Portal**: MP district-wise solar dealership application with automated WhatsApp routing.
5. **Admin CMS & CRM Dashboard**: Lead pipeline, enquiry tracking, conversion metrics, and system statistics.
6. **GST Quotation & Invoice Generators**: Instant printable proposal letterhead and tax invoices with CGST/SGST calculations.
7. **Employee Field Attendance System**: GPS geo-tagged mobile check-in/out with timestamping and accuracy tracking.

---

## 📁 Architecture & Directory Structure
```
solar_panial/
├── config/
│   ├── company.js          # Master data source (Branding, Pricing, PM Surya Ghar, Products, Contacts)
│   └── database.js         # Mongoose connection with graceful offline/in-memory fallback
├── controllers/
│   ├── pageController.js       # Renders Home, About, Services, Products, Calculator, Contact
│   ├── complaintController.js  # Grievance registration & live ticket tracking
│   ├── franchiseController.js  # Dealership partnership applications
│   ├── adminController.js      # Dashboard, Quotation generator, GST Tax Invoices
│   └── employeeController.js   # Field technician GPS check-in/out
├── models/
│   ├── User.js             # Authentication & RBAC (Admin, Manager, Technician)
│   ├── Branch.js           # Raisen HQ, Bhopal, Vidisha branch management
│   ├── Enquiry.js          # Customer solar rooftop inquiries & status pipeline
│   ├── Attendance.js       # Field staff GPS coordinates & check-in/out logs
│   ├── Quotation.js        # Dynamic customer solar proposals with subsidy
│   ├── Invoice.js          # GSTIN-compliant tax invoices
│   └── Complaint.js        # Service tickets & repair logs
├── routes/
│   └── webRoutes.js        # Modular Express routing (Web pages & REST APIs)
├── views/
│   ├── partials/           # header, navbar, footer, enquiryForm, themeSwitcher
│   ├── admin/              # dashboard.ejs, quotations.ejs, invoices.ejs
│   ├── employee/           # attendance.ejs (GPS geo-tracking)
│   ├── index.ejs           # Localized homepage
│   ├── about.ejs           # Deepak Kushwaha & Rahul Saini leadership
│   ├── services.ejs        # Residential, Commercial, PM-KUSUM, AMC
│   ├── products.ejs        # On-grid, Off-grid, Hybrid, Panels, Batteries
│   ├── projects.ejs        # Raisen, Mandideep, Bhopal, Vidisha installations
│   ├── calculator.ejs      # Indian Solar Savings & Payback Calculator
│   ├── schemes.ejs         # PM Surya Ghar: Muft Bijli Yojana Subsidy Guide
│   ├── complaints.ejs      # Customer complaint filing & ticket tracking
│   ├── franchise.ejs       # Dealership application
│   ├── contact.ejs         # Raisen contact details & Google Maps
│   └── 404.ejs             # Branded error page
├── css/
│   ├── main.css            # Clean, unified stylesheet with design tokens
│   ├── about.css, services.css, projects.css  # Modular section styles
│   └── scheme-*.css        # Color scheme switchers (Scheme 2 default)
├── js/
│   ├── main.js             # Minified, clean UI animations & interactions
│   └── about.js, services.js, projects.js
├── public/                 # Static compiled fallback HTML files (index.html, etc.)
├── server.js               # Express application entry point
├── package.json            # Node.js dependencies & scripts
└── .env                    # Environment variables
```

---

## 🚀 How to Run the Project

### Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB (Optional: app falls back gracefully to in-memory mode if MongoDB is offline)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Application
```bash
# Production start
npm start

# Or development watch mode
npm run dev
```

### 3. Open in Browser
- Website: `http://localhost:3000`
- Solar Calculator: `http://localhost:3000/calculator`
- PM Surya Ghar Subsidy: `http://localhost:3000/#govt-scheme-section`
- Admin Dashboard: `http://localhost:3000/admin`
- Quotation Generator: `http://localhost:3000/admin/quotations`
- Tax Invoices: `http://localhost:3000/admin/invoices`
- Employee Attendance: `http://localhost:3000/employee/attendance`
- Complaints & Support: `http://localhost:3000/complaints`
- Dealership / Franchise: `http://localhost:3000/franchise`

---

## 🎨 Design Tokens & UI Guidelines
- **Primary Color:** `#c6ff7d` (Eco-Green)
- **Primary Gradient Dark:** `#163563` (Deep Navy)
- **Dark Accent 1:** `#0f2647`
- **Dark Accent 2:** `#0a1b33`
- **Active Scheme:** Scheme 2 (`scheme-2.css`) active by default with dynamic color switcher retained.
- **Typography:** Modern clean sans-serif typography hierarchy with Inter Tight & Manrope support.
- **Preloader Safety:** Solaria preloader overlay (`#de-loader`) disabled to guarantee immediate, instant page rendering.
