// One-off migration: `node scripts/migrate-fields.js`
//  - users:   Role -> role (lowercase), isActive (boolean) -> status ("active" | "blocked")
//  - requests: backfill createdAt from the ObjectId timestamp where it is missing
// Safe to run more than once.
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function migrate() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();

  try {
    const db = client.db('redlife');
    const users = db.collection('user');
    const requests = db.collection('donationRequests');

    // `Role` wins over `role`: it is the field the old client read and the one edited by hand in the DB
    const roles = await users.updateMany(
      { $or: [{ Role: { $exists: true } }, { role: { $exists: false } }] },
      [
        { $set: { role: { $toLower: { $ifNull: ['$Role', '$role', 'donor'] } } } },
        { $unset: 'Role' },
      ]
    );
    console.log(`users: role set on ${roles.modifiedCount}`);

    const statuses = await users.updateMany(
      { $or: [{ isActive: { $exists: true } }, { status: { $exists: false } }] },
      [
        {
          $set: {
            status: {
              $cond: [{ $eq: ['$isActive', false] }, 'blocked', { $ifNull: ['$status', 'active'] }],
            },
          },
        },
        { $unset: 'isActive' },
      ]
    );
    console.log(`users: status set on ${statuses.modifiedCount}`);

    const created = await requests.updateMany(
      { createdAt: { $exists: false } },
      [{ $set: { createdAt: { $toDate: '$_id' } } }]
    );
    console.log(`donationRequests: createdAt backfilled on ${created.modifiedCount}`);
  } finally {
    await client.close();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
