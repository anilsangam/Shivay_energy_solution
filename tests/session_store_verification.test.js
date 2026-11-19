/**
 * SHIVAY ENERGY SOLUTIONS — SESSION STORE PRODUCTION VERIFICATION
 * Tests:
 * 1. connect-mongo v6 export resolution & factory compatibility
 * 2. MongoStore instantiation with options (touchAfter: 3600, collectionName: 'sessions', ttl)
 * 3. Session lifecycle methods (set, get, touch, destroy)
 * 4. touchAfter throttling behavior (skips write < 1h, writes >= 1h)
 * 5. Production fail-fast guard (No silent MemoryStore degradation)
 */
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
    }
}

console.log('\n============================================================');
console.log('🔒 VERIFICATION: CONNECT-MONGO V6 & SESSION STORE LIFECYCLE');
console.log('============================================================\n');

(async () => {
    // 1. Export resolution
    runTest('connect-mongo export resolves valid MongoStore class with static create method', () => {
        const connectMongo = require('connect-mongo');
        const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
        assert(typeof MongoStore === 'function', 'MongoStore must be a class/function');
        assert(typeof MongoStore.create === 'function', 'MongoStore.create must be a callable factory function');
    });

    // 2. Instantiation with options
    runTest('MongoStore instantiates with touchAfter: 3600, collectionName: "sessions", and 14-day TTL', () => {
        const connectMongo = require('connect-mongo');
        const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
        const store = MongoStore.create({
            mongoUrl: 'mongodb://localhost:27017/test_ses',
            collectionName: 'sessions',
            ttl: 14 * 24 * 60 * 60,
            touchAfter: 3600,
            autoRemove: 'native'
        });
        assert(store instanceof require('express-session').Store, 'Store must inherit from express-session.Store');
        assert.strictEqual(store.options.touchAfter, 3600, 'touchAfter option must equal 3600 seconds');
        assert.strictEqual(store.options.collectionName, 'sessions', 'collectionName must be "sessions"');
        assert.strictEqual(store.options.ttl, 1209600, 'TTL must equal 14 days in seconds');
    });

    // 3. Lifecycle simulation (mocking collectionP)
    await runAsyncTest('MongoStore set, get, touch and destroy operate correctly', async () => {
        const connectMongo = require('connect-mongo');
        const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
        const store = MongoStore.create({
            mongoUrl: 'mongodb://localhost:27017/dummy',
            collectionName: 'sessions',
            touchAfter: 3600
        });

        const inMemDb = new Map();
        store.collectionP = Promise.resolve({
            updateOne: async (query, update, opts) => {
                const existing = inMemDb.get(query._id) || {};
                const merged = Object.assign({}, existing, update.$set);
                inMemDb.set(query._id, merged);
                return { acknowledged: true };
            },
            findOne: async (query) => {
                const doc = inMemDb.get(query._id);
                return doc || null;
            },
            deleteOne: async (query) => {
                const existed = inMemDb.has(query._id);
                inMemDb.delete(query._id);
                return { deletedCount: existed ? 1 : 0 };
            }
        });

        const testSession = {
            cookie: { maxAge: 86400000, expires: new Date(Date.now() + 86400000) },
            user: { _id: '507f191e810c19729de860ea', name: 'Test User', role: 'SUPER_ADMIN' }
        };

        // SET
        await new Promise((resolve, reject) => {
            store.set('sess_123', testSession, (err) => err ? reject(err) : resolve());
        });
        assert(inMemDb.has('sess_123'), 'Session sess_123 must be written to store on set');

        // GET
        const retrieved = await new Promise((resolve, reject) => {
            store.get('sess_123', (err, data) => err ? reject(err) : resolve(data));
        });
        assert.strictEqual(retrieved.user.name, 'Test User', 'Retrieved session user must match stored data');

        // DESTROY
        await new Promise((resolve, reject) => {
            store.destroy('sess_123', (err) => err ? reject(err) : resolve());
        });
        assert(!inMemDb.has('sess_123'), 'Session sess_123 must be removed on destroy');
    });

    // 4. touchAfter throttling verification
    await runAsyncTest('MongoStore touch() throttles writes within 1 hour and executes writes after 1 hour', async () => {
        const connectMongo = require('connect-mongo');
        const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
        const store = MongoStore.create({
            mongoUrl: 'mongodb://localhost:27017/dummy',
            collectionName: 'sessions',
            touchAfter: 3600
        });

        let touchWriteCount = 0;
        store.collectionP = Promise.resolve({
            updateOne: async () => {
                touchWriteCount++;
                return { acknowledged: true };
            }
        });

        const now = Date.now();
        const recentSession = { lastModified: new Date(now - 1000 * 60 * 15) }; // 15 mins ago
        const expiredTouchSession = { lastModified: new Date(now - 1000 * 60 * 65) }; // 65 mins ago

        // Touch recent session -> should NOT write
        await new Promise((resolve, reject) => {
            store.touch('sess_recent', recentSession, (err) => err ? reject(err) : resolve());
        });
        assert.strictEqual(touchWriteCount, 0, 'Touch within 1 hour must NOT trigger a database write');

        // Touch older session -> MUST write
        await new Promise((resolve, reject) => {
            store.touch('sess_old', expiredTouchSession, (err) => err ? reject(err) : resolve());
        });
        assert.strictEqual(touchWriteCount, 1, 'Touch after 1 hour MUST trigger a database write to extend expiration');
    });

    // 5. Production fail-fast guard
    runTest('server.js contains production fail-fast error handling for session store', () => {
        const fs = require('fs');
        const serverCode = fs.readFileSync('server.js', 'utf8');
        assert(
            serverCode.includes('FATAL CONFIGURATION ERROR: Production environment cannot operate with an insecure MemoryStore'),
            'server.js must fail fast if MongoStore fails in production'
        );
        assert(
            serverCode.includes('FATAL CONFIGURATION ERROR: Neither MONGODB_URI nor MONGO_URI is configured for production session persistence'),
            'server.js must fail fast if MongoDB URI is missing in production'
        );
    });

    console.log('\n============================================================');
    console.log(`🎯 SESSION STORE VERIFICATION: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
})();
