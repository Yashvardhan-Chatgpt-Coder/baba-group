import mongoose from 'mongoose';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI is not set. Database features will not persist.');
    return;
  }

  if (isConnected) return;

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log(`✅ Connected to MongoDB (${mongoose.connection.db?.databaseName || 'Baba_Group'})`);
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
  }
}

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB Connection Error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB Disconnected.');
  isConnected = false;
});
