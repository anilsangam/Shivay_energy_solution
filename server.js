require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
const helmet = require('helmet');
const connectDB = require('./config/database');
const webRoutes = require('./routes/webRoutes');
const companyData = require('./config/company');
const { setupCsrf } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB once and share its connected MongoClient with the session store
const dbConnectPromise = connectDB();

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

// Configure Session Store (Reuses Mongoose's MongoClient with safe dev fallback)
const isProduction = process.env.NODE_ENV === 'production';
const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;

class ResilientSessionStore extends session.Store {
    constructor(initPromise) {
        super();
        this.fallback = new session.MemoryStore();
        this.readyStorePromise = initPromise.catch(() => this.fallback);
    }

    _delegate(method, args) {
        const cb = args[args.length - 1];
        this.readyStorePromise
            .then((activeStore) => {
                if (!activeStore || typeof activeStore[method] !== 'function') {
                    return this.fallback[method](...args);
                }
                if (activeStore !== this.fallback && !isProduction && typeof cb === 'function') {
                    const safeArgs = [...args.slice(0, -1), (err, ...rest) => {
                        if (err && /MongoServerSelectionError|MongoNetworkError|Topology is closed/i.test(`${err.name} ${err.message}`)) {
                            return this.fallback[method](...args);
                        }
                        cb(err, ...rest);
                    }];
                    return activeStore[method](...safeArgs);
                }
                return activeStore[method](...args);
            })
            .catch(() => {
                if (typeof cb === 'function') this.fallback[method](...args);
            });
    }

    get(sid, cb) { this._delegate('get', [sid, cb]); }
    set(sid, sess, cb) { this._delegate('set', [sid, sess, cb]); }
    destroy(sid, cb) { this._delegate('destroy', [sid, cb]); }
    touch(sid, sess, cb) { this._delegate('touch', [sid, sess, cb]); }
}

let sessionStore;
if (mongoURI) {
    const storeInitPromise = dbConnectPromise.then((client) => {
        if (!client) {
            if (isProduction) {
                console.error('FATAL CONFIGURATION ERROR: Production environment cannot operate with an insecure MemoryStore. Terminating.');
                process.exit(1);
            }
            console.warn('⚠️ Session store note: Using in-memory session store fallback while MongoDB Atlas is unreachable.');
            return null;
        }
        try {
            const mongoStore = MongoStore.create({
                client,
                collectionName: 'sessions',
                ttl: 14 * 24 * 60 * 60, // 14 days
                touchAfter: 3600, // 1 hour: throttles session touch writes on GET requests while keeping 24h session alive
                autoRemove: 'native'
            });
            if (mongoStore && typeof mongoStore.on === 'function') {
                mongoStore.on('error', (storeErr) => {
                    console.error('[SESSION STORE ERROR]:', storeErr.message);
                });
            }
            return mongoStore;
        } catch (err) {
            console.error('❌ Failed to initialize MongoDB Session Store:', err.message);
            if (isProduction) {
                console.error('FATAL CONFIGURATION ERROR: Production environment cannot operate with an insecure MemoryStore. Terminating.');
                process.exit(1);
            }
            return null;
        }
    });
    sessionStore = new ResilientSessionStore(storeInitPromise);
} else {
    if (isProduction) {
        console.error('FATAL CONFIGURATION ERROR: Neither MONGODB_URI nor MONGO_URI is configured for production session persistence.');
        process.exit(1);
    } else {
        console.warn('⚠️ Note: Using in-memory session store (MONGO_URI / MONGODB_URI not provided).');
    }
}

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
const WebsiteService = require('./services/websiteService');
const AuthorizationService = require('./services/authorizationService');
app.use(setupCsrf);
app.use((req, res, next) => {
    res.locals.company = WebsiteService.getLiveCompanyData();
    res.locals.currentYear = new Date().getFullYear();
    res.locals.currentUser = req.session ? req.session.user : null;
    res.locals.hasPermission = (perm) => AuthorizationService.hasPermission(req.session ? req.session.user : null, perm);
    res.locals.hasModuleAccess = (mod) => AuthorizationService.hasModuleAccess(req.session ? req.session.user : null, mod);
    res.locals.hasFieldAccess = (field) => AuthorizationService.hasFieldAccess(req.session ? req.session.user : null, field);
    res.locals.isPrimarySuperAdmin = (u) => AuthorizationService.isPrimarySuperAdmin(u || (req.session ? req.session.user : null));
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

    const statusCode = err.status || 500;
    const viewName = statusCode === 403 ? 'private/errors/403' : 'private/errors/500';
    res.status(statusCode).render(viewName, {
        title: statusCode === 403 ? 'Access Denied | Shivay Energy Solutions' : 'Server Error | Shivay Energy Solutions',
        message: isProduction ? (statusCode === 403 ? 'Access Denied: You do not possess the required permissions.' : 'An unexpected server error occurred.') : err.message,
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
