
import fetch from 'node-fetch';

async function testLogin() {
    console.log("Testing Admin Login with blank Master Key...");

    // First, let's verify what the server thinks the master key is
    // Actually, we can't easily do that without another API, 
    // but the user said it is working when left blank.

    const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'www.vlarya.com@gmail.com',
            password: 'Arya172010',
            type: 'admin',
            masterKey: ''
        })
    });

    const data = await res.json();
    console.log("Result:", JSON.stringify(data, null, 2));

    if (data.success) {
        console.log("❌ BUG REPRODUCED: Login succeeded with blank master key!");
    } else {
        console.log("✅ FAIL: Login failed as expected (No bug or check server state).");
        console.log("Error was:", data.error);
    }
}

testLogin().catch(console.error);
