import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './database.js';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import AppError from './utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Log Capturing ---
const serverLogs = [];
const MAX_LOGS = 200;
const originalLog = console.log;
const originalError = console.error;

function captureLog(type, args) {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    const logEntry = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;
    serverLogs.push(logEntry);
    if (serverLogs.length > MAX_LOGS) serverLogs.shift();

    if (type === 'INFO') originalLog(...args);
    else originalError(...args);
}

console.log = (...args) => captureLog('INFO', args);
console.error = (...args) => captureLog('ERROR', args);

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'arya-secret-key-172010';
let server;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser(SESSION_SECRET));

// --- Security: Block Sensitive Files ---
app.use((req, res, next) => {
    const sensitive = ['.env', 'server.js', 'database.sqlite', 'database.js', 'content.json'];
    if (sensitive.some(file => req.url.includes(file))) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// --- Security: Protect Admin Routes ---
app.use('/admin', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (req.signedCookies.admin_auth === 'true') {
        next();
    } else {
        res.redirect('/login.html?tab=admin');
    }
});

// Serve frontend: if 'dist' exists, we are in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    app.use(express.static('.'));
}
// --- Email Configuration (API-based; no SMTP) ---
const isEmailEnabled =
  process.env.EMAIL_ENABLED === "true" &&
  !!process.env.RESEND_API_KEY;


async function sendLoginEmail(toEmail, userName) {
    if (!isEmailEnabled) {
        console.log(`[MAIL] Skipping email for ${toEmail}: Email is disabled or not configured.`);
        return;
    }

    const mailOptions = {
        from: `"Arya Security" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: '🚀 New Login Detected!',
        html: `
            <div style="font-family: sans-serif; background-color: #050505; color: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #00f3ff;">
                <h1 style="color: #00f3ff; margin-bottom: 1rem;">Security Alert</h1>
                <p>Hi <strong>${userName}</strong>,</p>
                <p>We detected a new login to your Arya account on <strong>${new Date().toLocaleString()}</strong>.</p>
                <p>If this was you, you can safely ignore this email.</p>
                <p style="margin-top: 2rem; font-size: 0.8rem; color: #666;">
                    If you don't recognized this activity, please change your password immediately.
                </p>
                <div style="margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem; font-size: 0.8rem;">
                    &copy; Arya — Built with curiosity and code.
                </div>
            </div>
        `
    };

const resp = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "Arya Security <onboarding@resend.dev>",
    to: [toEmail],
    subject: mailOptions.subject,
    html: mailOptions.html,
  }),
});

if (!resp.ok) {
  const text = await resp.text();
  console.error("[MAIL] Email API failed:", resp.status, text);
  return;
}

console.log("[MAIL] Email API sent OK");

}

const DATA_FILE = path.join(__dirname, 'content.json');

// --- Routes ---

// REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.json({ success: false, error: 'All fields are required' });
        }

        // Check existing
        const existing = await db.findUserByEmail(email);
        if (existing) {
            return res.json({ success: false, error: 'Email already exists' });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User
        await db.createUser({
            name,
            email,
            password: hashedPassword
        });

        console.log(`New Account: ${name} (${email})`);
        res.json({ success: true, message: 'Account created! Please login.' });

    } catch (e) {
        console.error("Register Error:", e);
        res.json({ success: false, error: 'Server Error' });
    }
});

// LOGIN API
app.post('/api/login', async (req, res) => {
    const { email, password, type } = req.body;

    // Sanitize
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPass = password ? password.trim() : '';

    console.log(`Login Mode: ${type}, Email: ${cleanEmail}`);

    try {
        const user = await db.findUserByEmail(cleanEmail);

        if (type === 'admin') {
            // ADMIN LOGIN
            // 1. Verify Master Key (Site Password) from content.json
            let content;
            try {
                content = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            } catch (e) {
                console.error("CRITICAL: Failed to read content.json for Master Key check!");
                return res.json({ success: false, error: 'Server Configuration Error' });
            }

            const sitePass = (content.sitePassword || '').trim();
            const providedKey = (req.body.masterKey || '').trim();

            if (sitePass === '') {
                console.log('❌ Admin Login Failed: Site Master Key not configured');
                return res.json({ success: false, error: 'Site Master Key not configured' });
            }

            if (providedKey !== sitePass) {
                console.log('❌ Admin Login Failed: Invalid Master Key');
                return res.json({ success: false, error: 'Invalid Site Master Key' });
            }
            console.log('✅ Master Key Verified');

            // 2. Verify Credentials
            const isHardcodedAdmin = (cleanEmail === 'www.vlarya.com@gmail.com' && cleanPass === 'Arya172010');
            let isDbAdmin = false;
            if (user && user.isAdmin && user.password) {
                isDbAdmin = await bcrypt.compare(cleanPass, user.password);
            }

            if (isHardcodedAdmin || isDbAdmin) {
                console.log('✅ Admin Success');
                res.cookie('admin_auth', 'true', { signed: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
                res.cookie('user_name', 'Admin', { signed: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
                res.cookie('user_email', cleanEmail, { signed: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

                // Trigger Email (Don't await, send in background)
                sendLoginEmail(cleanEmail, 'Admin');

                return res.json({ success: true, role: 'admin' });
            } else {
                return res.json({ success: false, error: 'Invalid Admin Credentials' });
            }
        } else {
            // USER LOGIN (DB Check)
            if (!user) {
                return res.json({ success: false, error: 'User not found. Please Sign Up.' });
            }

            // CRITICAL FIX: Check if password exists (legacy users might not have it)
            if (!user.password) {
                return res.json({ success: false, error: 'Account outdated. Please Register again.' });
            }

            const match = await bcrypt.compare(cleanPass, user.password);
            if (match) {
                console.log(`👤 User Success: ${user.name}`);
                // Cookies
                res.cookie('user_name', user.name, { signed: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
                res.cookie('user_email', cleanEmail, { signed: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

                // Trigger Email (Don't await, send in background)
                sendLoginEmail(cleanEmail, user.name);

                return res.json({ success: true, role: 'user', name: user.name });
            } else {
                return res.json({ success: false, error: 'Invalid Password' });
            }
        }
    } catch (e) {
        console.error("Login Error:", e);
        res.json({ success: false, error: 'Server Error: ' + e.message });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('admin_auth');
    res.clearCookie('user_name');
    res.clearCookie('user_email');
    res.json({ success: true });
});

app.get('/api/auth-status', (req, res) => {
    const isAdmin = req.signedCookies.admin_auth === 'true';
    const userName = req.signedCookies.user_name || null;
    const userEmail = req.signedCookies.user_email || null;
    res.json({ authenticated: isAdmin, name: userName, email: userEmail });
});

app.get('/api/account', async (req, res) => {
    const userEmail = req.signedCookies.user_email || null;
    if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    try {
        const user = await db.findUserByEmail(userEmail);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        res.json({
            success: true,
            account: {
                name: user.name,
                email: user.email,
                isAdmin: !!user.isAdmin,
                createdAt: user.createdAt
            }
        });
    } catch (e) {
        console.error("Account Fetch Error:", e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.put('/api/account', async (req, res) => {
    const userEmail = req.signedCookies.user_email || null;
    if (!userEmail) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { name, password } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, error: 'Name is required' });
    }

    try {
        const user = await db.findUserByEmail(userEmail);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const updates = { name };
        if (password) {
            updates.password = await bcrypt.hash(password, 10);
        }

        await db.updateUser(user.id, updates);
        res.json({ success: true, message: 'Account updated successfully' });
    } catch (e) {
        console.error("Account Update Error:", e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// --- Admin Specific Endpoints ---

// GET LOGS
app.get('/api/admin/logs', (req, res) => {
    if (req.signedCookies.admin_auth !== 'true') return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, logs: serverLogs });
});

// CONSOLE COMMANDS
app.post('/api/admin/console', (req, res) => {
    if (req.signedCookies.admin_auth !== 'true') return res.status(401).json({ error: 'Unauthorized' });
    const { command } = req.body;

    if (command === 'clear') {
        serverLogs.length = 0;
        console.log('Logs cleared via console.');
        return res.json({ success: true, message: 'Logs cleared.' });
    }

    res.json({ success: false, error: 'Unknown command' });
});

app.get('/api/admin/users', async (req, res) => {
    console.log('DEBUG: GET /api/admin/users - Admin Auth Cookie:', req.signedCookies.admin_auth);
    if (req.signedCookies.admin_auth !== 'true') {
        console.warn('DEBUG: Unauthorized attempt to fetch users API');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const rawUsers = await db.getAllUsers();
        console.log('DEBUG: Raw users from DB:', JSON.stringify(rawUsers, null, 2));

        if (!Array.isArray(rawUsers)) {
            throw new Error('Database did not return an array of users');
        }

        const users = rawUsers.map(u => {
            // Extremely robust cleaning and mapping
            const getProp = (obj, key) => {
                const k = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
                return k ? obj[k] : null;
            };

            const clean = (val) => {
                if (typeof val === 'string') {
                    return val.replace(/^['"]|['"]$/g, '').trim();
                }
                return val;
            };

            const name = getProp(u, 'name');
            const email = getProp(u, 'email');
            const isAdmin = getProp(u, 'isAdmin');
            const createdAt = getProp(u, 'createdAt');

            return {
                id: u.id || u.ID || null,
                name: clean(name) || 'Anonymous',
                email: clean(email) || 'N/A',
                isAdmin: isAdmin == 1 || isAdmin === true,
                password: u.password || 'N/A', // Send hashed password
                createdAt: createdAt
            };
        });

        console.log(`DEBUG: Sending ${users.length} cleaned users to client`);
        res.json({ success: true, users });
    } catch (e) {
        console.error("DEBUG: Fetch Users Error:", e);
        res.status(500).json({ success: false, error: 'Server Error: ' + e.message });
    }
});

app.post('/api/admin/users/update', async (req, res) => {
    if (req.signedCookies.admin_auth !== 'true') {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const { userId, updates } = req.body;
        if (!userId || !updates) {
            return res.status(400).json({ success: false, error: 'Missing userId or updates' });
        }

        // If updating password, hash it first
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        await db.updateUser(userId, updates);
        console.log(`✅ Admin updated user ${userId}:`, Object.keys(updates));
        res.json({ success: true, message: 'User updated successfully' });
    } catch (e) {
        console.error("Admin Update User Error:", e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.get('/api/content', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        let content;
        try {
            content = JSON.parse(data);
        } catch (parseError) {
            console.error("Content Parse Error:", parseError);
            return res.status(500).json({ error: 'Corrupted content data' });
        }

        // Track analytics (simplified: increment on data fetch)
        // We only increment if NOT logged in as admin to keep it clean
        if (req.signedCookies.admin_auth !== 'true') {
            if (!content.analytics) content.analytics = { totalViews: 0 };
            content.analytics.totalViews++;

            // Save back immediately (async, don't wait for it)
            fs.writeFile(DATA_FILE, JSON.stringify(content, null, 2), () => { });
        }

        res.json(content);
    });
});

app.post('/api/content', (req, res) => {
    if (req.signedCookies.admin_auth !== 'true') return res.status(401).json({ error: 'Unauthorized' });

    const newContent = req.body;
    if (!newContent || typeof newContent !== 'object' || Array.isArray(newContent)) {
        return res.status(400).json({ error: 'Invalid content payload' });
    }
    fs.writeFile(DATA_FILE, JSON.stringify(newContent, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: 'Failed to save data' });
        res.json({ success: true, message: 'Content updated successfully' });
    });
});

app.use((req, res, next) => next(new AppError(`Not Found - ${req.originalUrl}`, 404)));

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const safeError = err || {};
    const statusCode = Number.isInteger(safeError.statusCode) ? safeError.statusCode : 500;
    const isOperational = safeError.isOperational === true;
    const message = safeError.message || 'Something went wrong';

    if (process.env.NODE_ENV === 'production') {
        if (statusCode >= 500) {
            return res.status(statusCode).json({ success: false, message: 'Something went wrong' });
        }
        if (isOperational) {
            return res.status(statusCode).json({ success: false, message });
        }
        return res.status(statusCode).json({ success: false, message: 'Something went wrong' });
    }

    return res.status(statusCode).json({
        success: false,
        message,
        error: safeError,
        stack: safeError.stack
    });
});

server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin Panel at http://localhost:${PORT}/admin`);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    if (server && typeof server.close === 'function') {
        server.close(() => process.exit(1));
    } else {
        process.exit(1);
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (server && typeof server.close === 'function') {
        server.close(() => process.exit(1));
    } else {
        process.exit(1);
    }
});
