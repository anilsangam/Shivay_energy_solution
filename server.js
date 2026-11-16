require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const connectDB = require('./config/database');
const webRoutes = require('./routes/webRoutes');
const companyData = require('./config/company');
const { setupCsrf } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
            mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com", "https://media.istockphoto.com"],
            connectSrc: ["'self'", "https://res.cloudinary.com", "https://api.cloudinary.com"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Set EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body Parser for forms & JSON APIs
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Serve browser assets from public while keeping stable URL prefixes.
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Session Store (MongoDB backed)
let sessionStore;
const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (mongoURI) {
    try {
        sessionStore = MongoStore.create({
            mongoUrl: mongoURI,
            collectionName: 'sessions',
            ttl: 14 * 24 * 60 * 60, // 14 days
            autoRemove: 'native'
        });
    } catch (err) {
        console.warn('⚠️ Warning: Using in-memory session store (Development mode only).');
    }
} else {
    console.warn('⚠️ Note: Using in-memory session store (MONGO_URI / MONGODB_URI not provided).');
}

const isProduction = process.env.NODE_ENV === 'production';
let activeSessionSecret = process.env.SESSION_SECRET;

if (!activeSessionSecret) {
    if (isProduction) {
        console.error('FATAL CONFIGURATION ERROR: Required SESSION_SECRET environment variable is missing in production environment.');
        process.exit(1);
    }
    console.warn('⚠️ Warning: SESSION_SECRET is not set in environment. Generating an ephemeral random session secret for development.');
    activeSessionSecret = require('crypto').randomBytes(32).toString('hex');
}

app.use(session({
    secret: activeSessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Setup CSRF and attach session user to all views
app.use(setupCsrf);
app.use((req, res, next) => {
    res.locals.company = companyData.company;
    res.locals.currentYear = new Date().getFullYear();
    res.locals.currentUser = req.session ? req.session.user : null;
    next();
});

// Mount Routes
app.use('/', webRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).render('public-site/404', {
        title: `Page Not Found | ${companyData.company.name}`,
        data: companyData,
        activePage: ''
    });
});

// Centralized Secure Error Handler (No stack trace exposure in production)
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]:', err);
    if (res.headersSent) return next(err);

    const isProduction = process.env.NODE_ENV === 'production';
    if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({
            success: false,
            message: isProduction ? 'Internal Server Error' : (err.message || 'Server Error')
        });
    }

    res.status(err.status || 500).render('private/errors/403', {
        title: 'Server Error | Shivay Energy Solutions',
        message: isProduction ? 'An unexpected server error occurred.' : err.message,
        currentUser: req.session ? req.session.user : null
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`⚡ ${companyData.company.name} Secure Server Running!`);
        console.log(`📍 Location: ${companyData.company.address.city}, ${companyData.company.address.state}`);
        console.log(`🌐 Website: http://localhost:${PORT}`);
        console.log(`🛡️ Role-Based Access Control (RBAC): ENABLED`);
        console.log(`====================================================`);
    });
}

module.exports = app;
