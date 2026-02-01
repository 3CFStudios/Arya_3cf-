import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';

let db;

async function initDB() {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // Create table with PASSWORD column
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            avatar TEXT,
            isAdmin BOOLEAN DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Check if password column exists (migration for persistent DBs)
    try {
        await db.exec('ALTER TABLE users ADD COLUMN password TEXT');
    } catch (e) {
        // Ignore if exists
    }

    // Ensure Admin exists and has password
    const adminEmail = 'www.vlarya.com@gmail.com';
    const admin = await db.get('SELECT * FROM users WHERE email = ?', adminEmail);
    const adminHash = await bcrypt.hash('Arya172010', 10);

    if (!admin) {
        await db.run(`INSERT INTO users (email, name, isAdmin, password) VALUES (?, ?, ?, ?)`,
            [adminEmail, 'Arya (Admin)', 1, adminHash]);
        console.log("Admin account initialized.");
    } else {
        // Repair admin if password missing
        if (!admin.password) {
            await db.run('UPDATE users SET password = ?, isAdmin = 1 WHERE email = ?', [adminHash, adminEmail]);
            console.log("Admin account repaired.");
        }
    }

    console.log('Database initialized.');
}

async function ensureDB() {
    if (!db) await initDB();
    return db;
}

export async function findUserByEmail(email) {
    await ensureDB();
    return db.get('SELECT * FROM users WHERE email = ?', email);
}

export async function createUser(profile) {
    await ensureDB();
    const { name, email, password } = profile;
    const result = await db.run(
        `INSERT INTO users (email, name, password) VALUES (?, ?, ?)`,
        [email, name, password]
    );
    return { id: result.lastID, email, name };
}

export async function getUserById(id) {
    await ensureDB();
    return db.get('SELECT * FROM users WHERE id = ?', id);
}

export async function getAllUsers() {
    await ensureDB();
    return db.all('SELECT id, email, name, isAdmin, password, createdAt FROM users ORDER BY createdAt DESC');
}

export async function updateUser(id, updates) {
    await ensureDB();
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    return db.run(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        [...values, id]
    );
}

// Initialize on load
initDB().catch(console.error);
