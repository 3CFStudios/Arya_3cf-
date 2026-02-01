
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkUsers() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const users = await db.all('SELECT * FROM users');
    console.log(JSON.stringify(users, null, 2));
    await db.close();
}

checkUsers().catch(console.error);
