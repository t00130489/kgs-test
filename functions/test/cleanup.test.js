const assert = require('assert');
const functionsTest = require('firebase-functions-test')();
const admin = require('firebase-admin');

// initializeApp をダミー化
admin.initializeApp = () => {};

const now = 1000000;
const originalNow = Date.now;
Date.now = () => now;

// テスト用の部屋データ
const roomsData = {
  oldRoom: { settings: { createdAt: now - 25 * 60 * 60 * 1000 } },
  recentRoom: { settings: { createdAt: now - 23 * 60 * 60 * 1000 } },
};

let updates = {};
const roomsRef = {
  once: async () => ({
    forEach: (cb) => {
      Object.entries(roomsData).forEach(([key, room]) => {
        cb({
          key,
          child: (name) => ({
            val: () => (name === 'settings' ? room.settings : null),
          }),
        });
      });
    },
  }),
  update: async (u) => {
    updates = u;
  },
};

admin.database = () => ({ ref: () => roomsRef });

const { scheduledCleanupRooms } = require('../index');

scheduledCleanupRooms()
  .then(() => {
    Date.now = originalNow;
    try {
      assert.deepStrictEqual(updates, { oldRoom: null });
      console.log('Test passed');
      functionsTest.cleanup();
    } catch (err) {
      console.error(err);
      functionsTest.cleanup();
      process.exit(1);
    }
  })
  .catch((err) => {
    Date.now = originalNow;
    console.error(err);
    functionsTest.cleanup();
    process.exit(1);
  });
