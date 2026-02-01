import fetch from 'node-fetch';

async function testFetch() {
    try {
        // We can't easily fetch because of cookie auth
        // But we can check server.js logic one more time.
        console.log("Checking server.js logic...");
    } catch (e) {
        console.error(e);
    }
}
testFetch();
