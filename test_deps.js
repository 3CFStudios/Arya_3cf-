import bcrypt from 'bcryptjs';
import * as db from './database.js';

async function testSystem() {
    console.log("Testing bcrypt...");
    const hash = await bcrypt.hash('test', 10);
    console.log("Hashed:", hash);
    const match = await bcrypt.compare('test', hash);
    console.log("Match:", match);

    console.log("Testing Database...");
    // Just wait a bit for DB init
    setTimeout(async () => {
        try {
            const user = await db.findUserByEmail('test@test.com');
            console.log("DB Read OK. User:", user);
            console.log("ALL SYSTEMS GO");
            process.exit(0);
        } catch (e) {
            console.error("DB Error:", e);
            process.exit(1);
        }
    }, 1000);
}

testSystem();
