require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/testDB';

  console.log(`Connecting to MongoDB at: ${mongoURI}...`);

  try {
    // 1. Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('✅ Successfully connected to MongoDB!');

    // 2. Define a simple schema & model
    const userSchema = new mongoose.Schema({
      name: String,
      email: String,
      createdAt: { type: Date, default: Date.now }
    });

    const User = mongoose.model('TestUser', userSchema);

    // 3. Insert a sample record
    const sampleUser = await User.create({
      name: 'Hemalatha',
      email: 'hemalatha@example.com'
    });
    console.log('✅ Created test user document:', sampleUser);

    // 4. Retrieve records from database
    const users = await User.find();
    console.log(`✅ Retrieved ${users.length} user(s) from database:`, users);

    // 5. Keep test data saved so you can view it in MongoDB Compass!
    // await User.deleteMany({ email: 'hemalatha@example.com' });
    console.log('💡 Test data saved in database for MongoDB Compass!');

    // 6. Close connection
    await mongoose.connection.close();
    console.log('🔌 Connection closed cleanly.');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
