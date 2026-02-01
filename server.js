import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './database.js';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

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
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const isProd = process.env.NODE_ENV === 'production';

// --- Middleware ---
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
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
    const ext = path.extname(req.path || '');
    if (ext && ext !== '.html') {
        return next();
    }
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

// --- Email Configuration ---
const emailEnabled = process.env.EMAIL_ENABLED === 'true';
const emailConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM
};

const missingEmailKeys = [];
if (emailEnabled) {
    if (!emailConfig.host) missingEmailKeys.push('SMTP_HOST');
    if (!emailConfig.port) missingEmailKeys.push('SMTP_PORT');
    if (!emailConfig.user) missingEmailKeys.push('SMTP_USER');
    if (!emailConfig.pass) missingEmailKeys.push('SMTP_PASS');
    if (!emailConfig.from) missingEmailKeys.push('SMTP_FROM');
    if (missingEmailKeys.length) {
        const error = new Error(JSON.stringify({
            message: 'Email is enabled but SMTP configuration is incomplete.',
            missingKeys: missingEmailKeys
        }));
        throw error;
    }
}

const transporter = emailEnabled
    ? nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.port === 465,
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_PORT === '465',
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    })
    : null;

async function sendMailSafe(options) {
    if (!emailEnabled || !transporter) {
        console.log(`[MAIL] Skipping email for ${options?.to}: EMAIL_ENABLED is false.`);
        return;
    }
  try {
  await transporter.sendMail({
    from: emailConfig.from,
    ...options
  });
} catch (error) {
  console.error(`[MAIL] Error sending email to ${options?.to}:`, error);
}

    if (!isEmailEnabled || !transporter) {
        console.log(`[MAIL] Skipping email for ${options?.to}: Email is disabled or not configured.`);
        return;
    }
    try {
        await transporter.sendMail(options);
        console.log(`[MAIL] Sent: ${options.subject} -> ${options.to}`);
    } catch (error) {
        console.error(`[MAIL] Error sending email to ${options?.to}:`, error);
    }
}

async function sendVerificationEmail(user, token) {
    const verifyUrl = `${APP_BASE_URL}/api/verify-email?token=${encodeURIComponent(token)}`;
    await sendMailSafe({
        from: `"Arya Security" <${emailConfig.from}>`,
        to: user.email,
        subject: 'Verify your email',
        html: `
            <div style="font-family: sans-serif; background-color: #050505; color: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #00f3ff;">
                <h1 style="color: #00f3ff; margin-bottom: 1rem;">Verify your email</h1>
                <p>Hi <strong>${user.name || 'there'}</strong>,</p>
                <p>Confirm your email to activate your account.</p>
                <p style="margin: 1.5rem 0;">
                  <a href="${verifyUrl}" style="color:#050505; background:#00f3ff; padding:0.75rem 1.25rem; border-radius:6px; text-decoration:none; font-weight:bold;">Verify Email</a>
                </p>
                <p style="font-size:0.85rem; color:#777;">If the button doesn't work, open this link:</p>
                <p style="font-size:0.85rem; color:#aaa;">${verifyUrl}</p>
            </div>
        `
    });
}

async function sendResetEmail(user, token) {
    const resetUrl = `${APP_BASE_URL}/reset.html?token=${encodeURIComponent(token)}`;
    await sendMailSafe({
        from: `"Arya Security" <${emailConfig.from}>`,

async function sendVerificationEmail(user, token) {
    const verifyUrl = `${APP_BASE_URL}/api/verify-email?token=${encodeURIComponent(token)}`;
    await sendMailSafe({
        from: `"Arya Security" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Verify your email',
        html: `
            <div style="font-family: sans-serif; background-color: #050505; color: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #00f3ff;">
                <h1 style="color: #00f3ff; margin-bottom: 1rem;">Verify your email</h1>
                <p>Hi <strong>${user.name || 'there'}</strong>,</p>
                <p>Confirm your email to activate your account.</p>
                <p style="margin: 1.5rem 0;">
                  <a href="${verifyUrl}" style="color:#050505; background:#00f3ff; padding:0.75rem 1.25rem; border-radius:6px; text-decoration:none; font-weight:bold;">Verify Email</a>
                </p>
                <p style="font-size:0.85rem; color:#777;">If the button doesn't work, open this link:</p>
                <p style="font-size:0.85rem; color:#aaa;">${verifyUrl}</p>
            </div>
        `
    });
}

async function sendResetEmail(user, token) {
    const resetUrl = `${APP_BASE_URL}/reset.html?token=${encodeURIComponent(token)}`;
    await sendMailSafe({
        from: `"Arya Security" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Reset your password',
        html: `
            <div style="font-family: sans-serif; background-color: #050505; color: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #bd00ff;">
                <h1 style="color: #bd00ff; margin-bottom: 1rem;">Reset your password</h1>
                <p>We received a password reset request for your account.</p>
                <p style="margin: 1.5rem 0;">
                  <a href="${resetUrl}" style="color:#050505; background:#bd00ff; padding:0.75rem 1.25rem; border-radius:6px; text-decoration:none; font-weight:bold;">Reset Password</a>
                </p>
                <p style="font-size:0.85rem; color:#777;">If the button doesn't work, open this link:</p>
                <p style="font-size:0.85rem; color:#aaa;">${resetUrl}</p>
            </div>
        `
    });
}

async function sendLoginAlertEmail(user, meta) {
    const timestamp = new Date().toLocaleString();
    await sendMailSafe({
        from: `"Arya Security" <${emailConfig.from}>`,
        from: `"Arya Security" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'New login detected',
        html: `
            <div style="font-family: sans-serif; background-color: #050505; color: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #00f3ff;">
                <h1 style="color: #00f3ff; margin-bottom: 1rem;">Security Alert</h1>
                <p>Hi <strong>${user.name || 'there'}</strong>,</p>
                <p>We detected a new login on <strong>${timestamp}</strong>.</p>
                <p><strong>IP:</strong> ${meta.ip || 'unknown'}<br/>
                   <strong>Device:</strong> ${meta.userAgent || 'unknown'}</p>
                <p style="margin-top: 2rem; font-size: 0.8rem; color: #666;">
                    If this wasn't you, please reset your password immediately.
                </p>
            </div>
        `
    });
}

// --- Cloudinary Configuration ---
const cloudinaryEnabled = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryEnabled) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

const mailDebugSecret = process.env.MAIL_DEBUG_SECRET;

const AUTH_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;

function getCookieOptions() {
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        signed: true,
        maxAge: AUTH_COOKIE_MAX_AGE
    };
}

function setAuthCookies(res, user) {
    const options = getCookieOptions();
    res.cookie('user_id', user._id.toString(), options);
    res.cookie('user_name', user.name || '', options);
    res.cookie('user_email', user.email, options);
    res.cookie('admin_auth', user.isAdmin ? 'true' : 'false', options);
}

function clearAuthCookies(res) {
    const options = getCookieOptions();
    res.clearCookie('user_id', options);
    res.clearCookie('user_name', options);
    res.clearCookie('user_email', options);
    res.clearCookie('admin_auth', options);
}

function normalizeEmail(email) {
    return email ? email.trim().toLowerCase() : '';
}

function sanitizeText(value) {
    if (!value) return '';
    return String(value)
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '')
        .trim();
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function safeCompareSecrets(a = '', b = '') {
    const aBuf = Buffer.from(String(a));
    const bBuf = Buffer.from(String(b));
    if (aBuf.length !== bBuf.length) {
        const maxLength = Math.max(aBuf.length, bBuf.length);
        const aPad = Buffer.alloc(maxLength);
        const bPad = Buffer.alloc(maxLength);
        aBuf.copy(aPad);
        bBuf.copy(bPad);
        crypto.timingSafeEqual(aPad, bPad);
        return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
}

async function uploadBufferToCloudinary(buffer, folder) {
    if (!cloudinaryEnabled) {
        throw new Error('Cloudinary is not configured.');
    }
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
});

async function requireAuth(req, res, next) {
    const userId = req.signedCookies.user_id;
    if (!userId || !isValidObjectId(userId)) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = await db.User.findById(userId).lean();
    if (!user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    next();
}

async function uploadBufferToCloudinary(buffer, folder) {
    if (!cloudinaryEnabled) {
        throw new Error('Cloudinary is not configured.');
    }
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
});

async function requireAuth(req, res, next) {
    const userId = req.signedCookies.user_id;
    if (!userId || !isValidObjectId(userId)) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = await db.User.findById(userId).lean();
    if (!user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    next();
}

function requireSelfOrAdmin(req, res, next) {
    if (req.user?.isAdmin) return next();
    if (req.user && req.user._id.toString() === req.params.id) return next();
    return res.status(403).json({ success: false, error: 'Forbidden' });
}

function isMailDebugAllowed(req) {
    if (!isProd) return true;
    if (!mailDebugSecret) return false;
    return req.get('x-debug-secret') === mailDebugSecret;
}

// --- Routes ---

app.get('/api/debug/mail', async (req, res) => {
    if (!isMailDebugAllowed(req)) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }

    const envPresence = {
        EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',
        SMTP_HOST: Boolean(process.env.SMTP_HOST),
        SMTP_PORT: Boolean(process.env.SMTP_PORT),
        SMTP_USER: Boolean(process.env.SMTP_USER),
        SMTP_PASS: Boolean(process.env.SMTP_PASS),
        SMTP_FROM: Boolean(process.env.SMTP_FROM),
        MAIL_DEBUG_SECRET: Boolean(process.env.MAIL_DEBUG_SECRET)
    };

    let verifyResult = null;
    if (emailEnabled && transporter) {
        try {
            await transporter.verify();
            verifyResult = { ok: true };
        } catch (error) {
            verifyResult = { ok: false, error: error?.message || 'verify failed' };
        }
    }

    res.json({
        success: true,
        emailEnabled,
        nodeEnv: process.env.NODE_ENV || 'development',
        env: envPresence,
        verify: verifyResult
    });
});

// REGISTER API
app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const name = sanitizeText(req.body?.name);
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || '').trim();

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        const existing = await db.User.findOne({ email }).lean();
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = generateToken();
        const verificationTokenHash = hashToken(verificationToken);
        const verificationTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

        const created = await db.User.create({
            name,
            email,
            password: hashedPassword,
            isVerified: false,
            verificationTokenHash,
            verificationTokenExpiresAt,
            verificationTokenSentAt: new Date()
        });

        await sendVerificationEmail(created, verificationToken);

        console.log(`New Account: ${name} (${email})`);
        res.json({ success: true, message: 'Account created! Please verify your email.' });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// LOGIN API
app.post('/api/login', authLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '').trim();
    const type = req.body?.type || 'user';
    const masterKey = String(req.body?.masterKey || '').trim();

    console.log(`Login Mode: ${type}, Email: ${email}`);

    try {
        const user = await db.User.findOne({ email });
        if (!user) {
            const message = type === 'admin' ? 'Invalid credentials.' : 'User not found. Please Sign Up.';
            return res.status(400).json({ success: false, error: message });
            return res.status(400).json({ success: false, error: 'User not found. Please Sign Up.' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, error: 'Email not verified. Please verify first.', canResend: true });
        }

        if (!user.password) {
            return res.status(400).json({ success: false, error: 'Account outdated. Please Register again.' });
        }

        if (type === 'admin') {
            if (!user.isAdmin) {
                return res.status(403).json({ success: false, error: 'Invalid credentials.' });
            }
            const adminMasterKey = process.env.ADMIN_MASTER_KEY || '';
            if (!adminMasterKey) {
                return res.status(500).json({ success: false, error: 'Admin login is unavailable.' });
            }
            if (!masterKey || !safeCompareSecrets(masterKey, adminMasterKey)) {
                return res.status(403).json({ success: false, error: 'Invalid credentials.' });
            }
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            const message = type === 'admin' ? 'Invalid credentials.' : 'Invalid Password';
            return res.status(400).json({ success: false, error: message });

        if (!user.password) {
            return res.status(400).json({ success: false, error: 'Account outdated. Please Register again.' });
        }

        if (type === 'admin' && !user.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required.' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Password' });
        }

        setAuthCookies(res, user);

        const ip = req.ip;
        const userAgent = req.get('user-agent')?.slice(0, 250) || '';
        await db.User.updateOne(
            { _id: user._id },
            { $set: { lastLoginAt: new Date(), lastLoginIP: ip, lastLoginUserAgent: userAgent } }
        );

        sendLoginAlertEmail(user, { ip, userAgent });

        return res.json({ success: true, role: user.isAdmin ? 'admin' : 'user', name: user.name });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ success: false, error: 'Server Error: ' + e.message });
    }
});

app.post('/api/logout', (req, res) => {
    clearAuthCookies(res);
    res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    const user = req.user;
    res.json({
        success: true,
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl || user.avatar || '',
            bio: user.bio || '',
            isAdmin: !!user.isAdmin,
            isVerified: !!user.isVerified,
            createdAt: user.createdAt
        }
    });
});

app.get('/api/me/posts', requireAuth, async (req, res) => {
    const posts = await db.BlogPost.find({ authorId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
    res.json({
        success: true,
        posts: posts.map(post => ({
            id: post._id.toString(),
            title: post.title,
            slug: post.slug,
            status: post.status,
            createdAt: post.createdAt
        }))
    });
});

app.get('/api/auth-status', (req, res) => {
    const userName = req.signedCookies.user_name || null;
    const userEmail = req.signedCookies.user_email || null;
    const isAdmin = req.signedCookies.admin_auth === 'true';
    res.json({ authenticated: Boolean(userName), name: userName, email: userEmail, isAdmin });
});

app.get('/api/verify-email', async (req, res) => {
    const token = req.query?.token;
    if (!token) {
        return res.status(400).json({ success: false, error: 'Missing token' });
    }
    const tokenHash = hashToken(String(token));
    const user = await db.User.findOne({
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: { $gt: new Date() }
    });
    if (!user) {
        return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    }

    user.isVerified = true;
    user.verificationTokenHash = undefined;
    user.verificationTokenExpiresAt = undefined;
    user.verificationTokenSentAt = undefined;
    await user.save();

    if (req.accepts('html')) {
        return res.redirect('/login.html?verified=1');
    }
    res.json({ success: true, message: 'Email verified' });
});

app.post('/api/resend-verification', authLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await db.User.findOne({ email });
    if (!user || user.isVerified) {
        return res.json({ success: true, message: 'If the account exists, a verification email has been sent.' });
    }

    const now = Date.now();
    if (user.verificationTokenSentAt && now - new Date(user.verificationTokenSentAt).getTime() < 60 * 1000) {
        return res.status(429).json({ success: false, error: 'Please wait before requesting another email.' });
    }

    const verificationToken = generateToken();
    user.verificationTokenHash = hashToken(verificationToken);
    user.verificationTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    user.verificationTokenSentAt = new Date();
    await user.save();

    await sendVerificationEmail(user, verificationToken);
    res.json({ success: true, message: 'Verification email sent.' });
});

app.post('/api/forgot-password', authLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
        return res.json({ success: true, message: 'If the account exists, a reset email has been sent.' });
    }

    const user = await db.User.findOne({ email });
    if (user) {
        const resetToken = generateToken();
        user.resetTokenHash = hashToken(resetToken);
        user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
        await sendResetEmail(user, resetToken);
    }
    res.json({ success: true, message: 'If the account exists, a reset email has been sent.' });
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
    const token = req.body?.token;
    const newPassword = String(req.body?.password || '').trim();
    if (!token || !newPassword) {
        return res.status(400).json({ success: false, error: 'Token and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    }
    const tokenHash = hashToken(String(token));
    const user = await db.User.findOne({
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: { $gt: new Date() }
    });
    if (!user) {
        return res.status(400).json({ success: false, error: 'Invalid or expired token.' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    res.json({ success: true, message: 'Password reset successful.' });
});

// Profiles
app.get('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const user = await db.User.findById(id).lean();
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
        success: true,
        user: {
            id: user._id.toString(),
            name: user.name,
            avatarUrl: user.avatarUrl || user.avatar || '',
            bio: user.bio || '',
            followersCount: user.followersCount || 0,
            followingCount: user.followingCount || 0,
            createdAt: user.createdAt
        }
    });
});

app.patch('/api/users/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const updates = {};
    if (req.body?.name) updates.name = sanitizeText(req.body.name);
    if (req.body?.bio !== undefined) updates.bio = sanitizeText(req.body.bio).slice(0, 500);
    if (req.body?.avatarUrl) updates.avatarUrl = sanitizeText(req.body.avatarUrl);

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    await db.User.updateOne({ _id: id }, { $set: updates });
    res.json({ success: true, message: 'Profile updated' });
});

app.post('/api/users/:id/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    if (req.user._id.toString() !== id) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    try {
        const result = await uploadBufferToCloudinary(req.file.buffer, 'avatars');
        await db.User.updateOne({ _id: id }, { $set: { avatarUrl: result.secure_url } });
        res.json({ success: true, avatarUrl: result.secure_url });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        res.status(500).json({ success: false, error: 'Upload failed' });
    }
});

// Follow system
app.post('/api/follow/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    if (req.user._id.toString() === id) {
        return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }

    const targetUser = await db.User.findById(id).lean();
    if (!targetUser) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }

    try {
        await db.Follow.create({ followerId: req.user._id, followingId: id });
        await db.User.updateOne({ _id: req.user._id }, { $inc: { followingCount: 1 } });
        await db.User.updateOne({ _id: id }, { $inc: { followersCount: 1 } });
        res.json({ success: true });
    } catch (error) {
        if (String(error?.code) === '11000') {
            return res.status(400).json({ success: false, error: 'Already following' });
        }
        console.error('Follow error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.delete('/api/follow/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const result = await db.Follow.deleteOne({ followerId: req.user._id, followingId: id });
    if (result.deletedCount) {
        await db.User.updateOne({ _id: req.user._id }, { $inc: { followingCount: -1 } });
        await db.User.updateOne({ _id: id }, { $inc: { followersCount: -1 } });
    }
    res.json({ success: true });
});

app.get('/api/users/:id/followers', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, follows] = await Promise.all([
        db.Follow.countDocuments({ followingId: id }),
        db.Follow.find({ followingId: id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('followerId', 'name avatarUrl bio followersCount followingCount')
            .lean()
    ]);

    const items = follows.map(f => ({
        id: f.followerId?._id?.toString(),
        name: f.followerId?.name,
        avatarUrl: f.followerId?.avatarUrl || '',
        bio: f.followerId?.bio || '',
        followersCount: f.followerId?.followersCount || 0,
        followingCount: f.followerId?.followingCount || 0
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/users/:id/following', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    }
    res.json({ success: true });
});

app.get('/api/users/:id/followers', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, follows] = await Promise.all([
        db.Follow.countDocuments({ followingId: id }),
        db.Follow.find({ followingId: id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('followerId', 'name avatarUrl bio followersCount followingCount')
            .lean()
    ]);

    const items = follows.map(f => ({
        id: f.followerId?._id?.toString(),
        name: f.followerId?.name,
        avatarUrl: f.followerId?.avatarUrl || '',
        bio: f.followerId?.bio || '',
        followersCount: f.followerId?.followersCount || 0,
        followingCount: f.followerId?.followingCount || 0
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/users/:id/following', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, follows] = await Promise.all([
        db.Follow.countDocuments({ followerId: id }),
        db.Follow.find({ followerId: id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('followingId', 'name avatarUrl bio followersCount followingCount')
            .lean()
    ]);

    const items = follows.map(f => ({
        id: f.followingId?._id?.toString(),
        name: f.followingId?.name,
        avatarUrl: f.followingId?.avatarUrl || '',
        bio: f.followingId?.bio || '',
        followersCount: f.followingId?.followersCount || 0,
        followingCount: f.followingId?.followingCount || 0
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/users/:id/is-following', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const exists = await db.Follow.exists({ followerId: req.user._id, followingId: id });
    res.json({ success: true, isFollowing: Boolean(exists) });
});

// Blog
function slugifyTitle(title) {
    return sanitizeText(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 80);
}

async function generateUniqueSlug(title, excludeId) {
    const base = slugifyTitle(title) || 'post';
    let slug = base;
    let counter = 1;
    while (true) {
        const query = { slug };
        if (excludeId) {
            query._id = { $ne: excludeId };
        }
        const exists = await db.BlogPost.exists(query);
        if (!exists) return slug;
        counter += 1;
        slug = `${base}-${counter}`;
    }
}

app.get('/api/blog', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || '6', 10)));
    const skip = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q) : '';
    const tag = req.query.tag ? String(req.query.tag) : '';

    const filter = { status: 'published' };
    if (q) filter.title = { $regex: q, $options: 'i' };
    if (tag) filter.tags = tag;

    const [total, posts] = await Promise.all([
        db.BlogPost.countDocuments(filter),
        db.BlogPost.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    const items = posts.map(post => ({
        id: post._id.toString(),
        title: post.title,
        summary: post.summary,
        imageUrl: post.imageUrl || '',
        videoUrl: post.videoUrl || '',
        tags: post.tags || [],
        slug: post.slug,
        createdAt: post.createdAt
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/blog/:slug', async (req, res) => {
    const post = await db.BlogPost.findOne({ slug: req.params.slug, status: 'published' }).lean();
    if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, post });
});

app.get('/api/admin/blog', requireAuth, requireAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, follows] = await Promise.all([
        db.Follow.countDocuments({ followerId: id }),
        db.Follow.find({ followerId: id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('followingId', 'name avatarUrl bio followersCount followingCount')
            .lean()
    ]);

    const items = follows.map(f => ({
        id: f.followingId?._id?.toString(),
        name: f.followingId?.name,
        avatarUrl: f.followingId?.avatarUrl || '',
        bio: f.followingId?.bio || '',
        followersCount: f.followingId?.followersCount || 0,
        followingCount: f.followingId?.followingCount || 0
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/users/:id/is-following', requireAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const exists = await db.Follow.exists({ followerId: req.user._id, followingId: id });
    res.json({ success: true, isFollowing: Boolean(exists) });
});

// Blog
function slugifyTitle(title) {
    return sanitizeText(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 80);
}

async function generateUniqueSlug(title, excludeId) {
    const base = slugifyTitle(title) || 'post';
    let slug = base;
    let counter = 1;
    while (true) {
        const query = { slug };
        if (excludeId) {
            query._id = { $ne: excludeId };
        }
        const exists = await db.BlogPost.exists(query);
        if (!exists) return slug;
        counter += 1;
        slug = `${base}-${counter}`;
    }
}

app.get('/api/blog', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || '6', 10)));
    const skip = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q) : '';
    const tag = req.query.tag ? String(req.query.tag) : '';

    const filter = { status: 'published' };
    if (q) filter.title = { $regex: q, $options: 'i' };
    if (tag) filter.tags = tag;

    const [total, posts] = await Promise.all([
        db.BlogPost.countDocuments(filter),
        db.BlogPost.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    const items = posts.map(post => ({
        id: post._id.toString(),
        title: post.title,
        summary: post.summary,
        imageUrl: post.imageUrl || '',
        videoUrl: post.videoUrl || '',
        tags: post.tags || [],
        slug: post.slug,
        createdAt: post.createdAt
    }));

    res.json({ success: true, total, page, limit, items });
});

app.get('/api/blog/:slug', async (req, res) => {
    const post = await db.BlogPost.findOne({ slug: req.params.slug, status: 'published' }).lean();
    if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, post });
});

app.get('/api/admin/blog', requireAuth, requireAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, posts] = await Promise.all([
        db.BlogPost.countDocuments({}),
        db.BlogPost.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    res.json({ success: true, total, page, limit, items: posts });
});

    const [total, posts] = await Promise.all([
        db.BlogPost.countDocuments({}),
        db.BlogPost.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ]);

    res.json({ success: true, total, page, limit, items: posts });
});

app.post('/api/admin/blog', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const title = sanitizeText(req.body?.title);
        const summary = sanitizeText(req.body?.summary);
        const content = sanitizeText(req.body?.content);
        const status = req.body?.status === 'published' ? 'published' : 'draft';
        const videoUrl = sanitizeText(req.body?.videoUrl || '');
        const tags = (req.body?.tags || '')
            .split(',')
            .map(tag => sanitizeText(tag))
            .filter(Boolean);

        if (!title || !summary || !content) {
            return res.status(400).json({ success: false, error: 'Title, summary, and content are required.' });
        }

        let imageUrl = sanitizeText(req.body?.imageUrl || '');
        if (req.file) {
            const uploadResult = await uploadBufferToCloudinary(req.file.buffer, 'blog');
            imageUrl = uploadResult.secure_url;
        }

        const slug = await generateUniqueSlug(title);

        const post = await db.BlogPost.create({
            title,
            summary,
            content,
            imageUrl,
            videoUrl,
            tags,
            slug,
            status,
            authorId: req.user._id
        });

        res.json({ success: true, post });
    } catch (error) {
        console.error('Create blog error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.patch('/api/admin/blog/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid blog id' });
        }

        const updates = {};
        if (req.body?.title) updates.title = sanitizeText(req.body.title);
        if (req.body?.summary) updates.summary = sanitizeText(req.body.summary);
        if (req.body?.content) updates.content = sanitizeText(req.body.content);
        if (req.body?.status) updates.status = req.body.status === 'published' ? 'published' : 'draft';
        if (req.body?.videoUrl !== undefined) updates.videoUrl = sanitizeText(req.body.videoUrl || '');
        if (req.body?.tags !== undefined) {
            updates.tags = String(req.body.tags)
                .split(',')
                .map(tag => sanitizeText(tag))
                .filter(Boolean);
        }
        if (req.body?.imageUrl) updates.imageUrl = sanitizeText(req.body.imageUrl);

        if (req.file) {
            const uploadResult = await uploadBufferToCloudinary(req.file.buffer, 'blog');
            updates.imageUrl = uploadResult.secure_url;
        }

        if (updates.title) {
            updates.slug = await generateUniqueSlug(updates.title, id);
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, error: 'No updates provided' });
        }

        await db.BlogPost.updateOne({ _id: id }, { $set: updates });
        res.json({ success: true, message: 'Blog updated' });
    } catch (error) {
        console.error('Update blog error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.patch('/api/admin/blog/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid blog id' });
        }

        const updates = {};
        if (req.body?.title) updates.title = sanitizeText(req.body.title);
        if (req.body?.summary) updates.summary = sanitizeText(req.body.summary);
        if (req.body?.content) updates.content = sanitizeText(req.body.content);
        if (req.body?.status) updates.status = req.body.status === 'published' ? 'published' : 'draft';
        if (req.body?.videoUrl !== undefined) updates.videoUrl = sanitizeText(req.body.videoUrl || '');
        if (req.body?.tags !== undefined) {
            updates.tags = String(req.body.tags)
                .split(',')
                .map(tag => sanitizeText(tag))
                .filter(Boolean);
        }
        if (req.body?.imageUrl) updates.imageUrl = sanitizeText(req.body.imageUrl);

        if (req.file) {
            const uploadResult = await uploadBufferToCloudinary(req.file.buffer, 'blog');
            updates.imageUrl = uploadResult.secure_url;
        }

        if (updates.title) {
            updates.slug = await generateUniqueSlug(updates.title, id);
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, error: 'No updates provided' });
        }

        await db.BlogPost.updateOne({ _id: id }, { $set: updates });
        res.json({ success: true, message: 'Blog updated' });
    } catch (error) {
        console.error('Update blog error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.delete('/api/admin/blog/:id', requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: 'Invalid blog id' });
    }
    await db.BlogPost.deleteOne({ _id: id });
    res.json({ success: true, message: 'Blog deleted' });
});

// Account alias for existing UI
app.get('/api/account', requireAuth, (req, res) => {
    const user = req.user;
    res.json({
        success: true,
        account: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            isAdmin: !!user.isAdmin,
            bio: user.bio || '',
            avatarUrl: user.avatarUrl || user.avatar || '',
            createdAt: user.createdAt
        }
    });
});

app.put('/api/account', requireAuth, async (req, res) => {
    const user = req.user;
    const name = sanitizeText(req.body?.name);
    const password = req.body?.password;
    const bio = req.body?.bio;
    const updates = {};

    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = sanitizeText(bio).slice(0, 500);
    if (password) updates.password = await bcrypt.hash(String(password), 10);

    if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    await db.User.updateOne({ _id: user._id }, { $set: updates });
    res.json({ success: true, message: 'Account updated successfully' });
});

// --- Admin Specific Endpoints ---

// GET LOGS
app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, logs: serverLogs });
});

// CONSOLE COMMANDS
app.post('/api/admin/console', requireAuth, requireAdmin, (req, res) => {
    const { command } = req.body;

    if (command === 'clear') {
        serverLogs.length = 0;
        console.log('Logs cleared via console.');
        return res.json({ success: true, message: 'Logs cleared.' });
    }

    res.json({ success: false, error: 'Unknown command' });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    console.log('DEBUG: GET /api/admin/users - Admin Auth Cookie:', req.signedCookies.admin_auth);

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

app.post('/api/admin/users/update', requireAuth, requireAdmin, async (req, res) => {
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

app.get('/api/content', async (req, res) => {
    try {
        const content = await db.getContent();
        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }
        if (req.signedCookies.admin_auth !== 'true') {
            const analytics = content.analytics || { totalViews: 0 };
            analytics.totalViews = (analytics.totalViews || 0) + 1;
            content.analytics = analytics;
            await db.setContent(content);
        }
        res.json(content);
    } catch (error) {
        console.error('Content fetch error:', error);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

app.post('/api/content', requireAuth, requireAdmin, async (req, res) => {
    const newContent = req.body;
    if (!newContent || typeof newContent !== 'object' || Array.isArray(newContent)) {
        return res.status(400).json({ error: 'Invalid content payload' });
    }
    try {
        await db.setContent(newContent);
        res.json({ success: true, message: 'Content updated successfully' });
    } catch (error) {
        console.error('Content update error:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});



app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin Panel at http://localhost:${PORT}/admin`);
});
