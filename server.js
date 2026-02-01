import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as db from "./database.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Log Capturing ---
const serverLogs = [];
const MAX_LOGS = 200;
const originalLog = console.log;
const originalError = console.error;

function captureLog(type, args) {
  const message = args.map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ");
  const logEntry = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;
  serverLogs.push(logEntry);
  if (serverLogs.length > MAX_LOGS) serverLogs.shift();

  if (type === "INFO") originalLog(...args);
  else originalError(...args);
}

console.log = (...args) => captureLog("INFO", args);
console.error = (...args) => captureLog("ERROR", args);

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Set SESSION_SECRET in Render env vars (don’t rely on fallback)
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-in-render";

const cookieOptions = {
  signed: true,
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production"
};

// --- Middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser(SESSION_SECRET));

// --- Security: Block Sensitive Files ---
app.use((req, res, next) => {
  const sensitive = [".env", "server.js", "database.sqlite", "database.js", "content.json"];
  if (sensitive.some(file => req.url.includes(file))) {
    return res.status(403).send("Forbidden");
  }
  next();
});

// --- Security: Protect Admin Routes ---
app.use("/admin", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.signedCookies.admin_auth === "true") next();
  else res.redirect("/login.html?tab=admin");
});

// Serve frontend: if 'dist' exists, we are in production
const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) app.use(express.static(distPath));
else app.use(express.static("."));

// --- Email Configuration ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_PORT === "465",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendLoginEmail(toEmail, userName) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[MAIL] Skipping email for ${toEmail}: No credentials in env`);
    return;
  }

  const mailOptions = {
    from: `"Arya Security" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "🚀 New Login Detected!",
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

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Login notification sent to ${toEmail}`);
  } catch (error) {
    console.error(`[MAIL] Error sending email to ${toEmail}:`, error);
  }
}

// --- Routes ---

// REGISTER API
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.json({ success: false, error: "All fields are required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.findUserByEmail(cleanEmail);
    if (existing) return res.json({ success: false, error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    await db.createUser({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword
    });

    console.log(`New Account: ${name} (${cleanEmail})`);
    res.json({ success: true, message: "Account created! Please login." });
  } catch (e) {
    console.error("Register Error:", e);
    res.json({ success: false, error: "Server Error" });
  }
});

// LOGIN API
app.post("/api/login", async (req, res) => {
  const { email, password, type } = req.body;

  const cleanEmail = email ? email.trim().toLowerCase() : "";
  const cleanPass = password ? password.trim() : "";

  console.log(`Login Mode: ${type}, Email: ${cleanEmail}`);

  try {
    const user = await db.findUserByEmail(cleanEmail);

    if (type === "admin") {
      // 1) Verify Master Key from Mongo content (NOT content.json)
      const content = (await db.getContent()) || {};
      const sitePass = (content.sitePassword || "").trim();
      const providedKey = (req.body.masterKey || "").trim();

      if (sitePass !== "") {
        if (providedKey !== sitePass) {
          console.log("❌ Admin Login Failed: Invalid Master Key");
          return res.json({ success: false, error: "Invalid Site Master Key" });
        }
        console.log("✅ Master Key Verified");
      }

      // 2) Verify admin credentials from DB only
      if (!user || !user.isAdmin || !user.password) {
        return res.json({ success: false, error: "Invalid Admin Credentials" });
      }

      const ok = await bcrypt.compare(cleanPass, user.password);
      if (!ok) return res.json({ success: false, error: "Invalid Admin Credentials" });

      console.log("✅ Admin Success");
      res.cookie("admin_auth", "true", cookieOptions);
      res.cookie("user_name", "Admin", cookieOptions);

      sendLoginEmail(cleanEmail, "Admin");
      return res.json({ success: true, role: "admin" });
    }

    // USER LOGIN
    if (!user) return res.json({ success: false, error: "User not found. Please Sign Up." });
    if (!user.password) return res.json({ success: false, error: "Account outdated. Please Register again." });

    const match = await bcrypt.compare(cleanPass, user.password);
    if (!match) return res.json({ success: false, error: "Invalid Password" });

    console.log(`👤 User Success: ${user.name}`);
    res.cookie("user_name", user.name || "User", cookieOptions);

    sendLoginEmail(cleanEmail, user.name || "User");
    return res.json({ success: true, role: "user", name: user.name });
  } catch (e) {
    console.error("Login Error:", e);
    res.json({ success: false, error: "Server Error: " + e.message });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("admin_auth");
  res.clearCookie("user_name");
  res.json({ success: true });
});

app.get("/api/auth-status", (req, res) => {
  const isAdmin = req.signedCookies.admin_auth === "true";
  const userName = req.signedCookies.user_name || null;
  res.json({ authenticated: isAdmin, name: userName });
});

// --- Admin Specific Endpoints ---

// GET LOGS
app.get("/api/admin/logs", (req, res) => {
  if (req.signedCookies.admin_auth !== "true") return res.status(401).json({ error: "Unauthorized" });
  res.json({ success: true, logs: serverLogs });
});

// CONSOLE COMMANDS
app.post("/api/admin/console", (req, res) => {
  if (req.signedCookies.admin_auth !== "true") return res.status(401).json({ error: "Unauthorized" });
  const { command } = req.body;

  if (command === "clear") {
    serverLogs.length = 0;
    console.log("Logs cleared via console.");
    return res.json({ success: true, message: "Logs cleared." });
  }

  res.json({ success: false, error: "Unknown command" });
});

app.get("/api/admin/users", async (req, res) => {
  console.log("DEBUG: GET /api/admin/users - Admin Auth Cookie:", req.signedCookies.admin_auth);
  if (req.signedCookies.admin_auth !== "true") {
    console.warn("DEBUG: Unauthorized attempt to fetch users API");
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const rawUsers = await db.getAllUsers();
    console.log("DEBUG: Raw users from DB:", JSON.stringify(rawUsers, null, 2));

    const users = rawUsers.map(u => ({
      id: u.id || null,
      name: u.name || "Anonymous",
      email: u.email || "N/A",
      isAdmin: u.isAdmin === true,
      password: u.password || "N/A",
      createdAt: u.createdAt
    }));

    res.json({ success: true, users });
  } catch (e) {
    console.error("DEBUG: Fetch Users Error:", e);
    res.status(500).json({ success: false, error: "Server Error: " + e.message });
  }
});

app.post("/api/admin/users/update", async (req, res) => {
  if (req.signedCookies.admin_auth !== "true") {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, updates } = req.body;
    if (!userId || !updates) {
      return res.status(400).json({ success: false, error: "Missing userId or updates" });
    }

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    await db.updateUser(userId, updates);
    console.log(`✅ Admin updated user ${userId}:`, Object.keys(updates));
    res.json({ success: true, message: "User updated successfully" });
  } catch (e) {
    console.error("Admin Update User Error:", e);
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

// CONTENT GET (Mongo)
app.get("/api/content", async (req, res) => {
  try {
    let content = await db.getContent();
    if (!content) {
      content = { sitePassword: "", analytics: { totalViews: 0 } };
      await db.setContent(content);
    }

    if (req.signedCookies.admin_auth !== "true") {
      if (!content.analytics) content.analytics = { totalViews: 0 };
      content.analytics.totalViews = (content.analytics.totalViews || 0) + 1;
      await db.setContent(content);
    }

    res.json(content);
  } catch (e) {
    console.error("Content GET Error:", e);
    res.status(500).json({ error: "Failed to read data" });
  }
});

// CONTENT POST (Mongo)
app.post("/api/content", async (req, res) => {
  if (req.signedCookies.admin_auth !== "true") return res.status(401).json({ error: "Unauthorized" });

  try {
    const newContent = req.body;
    await db.setContent(newContent);
    res.json({ success: true, message: "Content updated successfully" });
  } catch (e) {
    console.error("Content POST Error:", e);
    res.status(500).json({ error: "Failed to save data" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin Panel at http://localhost:${PORT}/admin`);
});
