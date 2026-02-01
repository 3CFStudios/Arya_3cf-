import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
    try {
        const db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        const adminEmail = 'www.vlarya.com@gmail.com';
        console.log(`Keeping Admin: ${adminEmail}`);

        const result = await db.run("DELETE FROM users WHERE email != ?", adminEmail);
        console.log(`Successfully deleted ${result.changes} non-admin users.`);

    } catch (e) {
        console.error("Cleanup failed:", e);
    }
})();
