// server.js

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cors = require('cors');

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Firebase Admin Initialization ---
// Download your Firebase service account key and replace the path below
const serviceAccount = require('./firebaseServiceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// --- MongoDB Connection ---
mongoose.connect('mongodb://localhost:27017/ai-travel-packing', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// --- MongoDB Schemas ---
const userSchema = new mongoose.Schema({
  uid: String, // Firebase UID
  name: String,
  email: String,
  preferences: Object // e.g., { climate: 'cold', travelType: 'adventure', ... }
});

const packingListSchema = new mongoose.Schema({
  uid: String, // Firebase UID
  tripDetails: Object, // { climate, travelType, accommodation, companions }
  items: [String],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const PackingList = mongoose.model('PackingList', packingListSchema);

// --- Middleware: Firebase Auth Verification ---
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).send('No token provided');
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send('Invalid token');
  }
}

// --- AI Packing List Recommendation Logic ---
// This is a simple rule-based system. You can expand it as needed.
function generatePackingList({ climate, travelType, accommodation, companions }) {
  let items = [
    'Passport', 'Travel documents', 'Phone charger', 'Toiletries'
  ];

  // Climate-based items
  if (climate === 'cold') {
    items.push('Jacket', 'Gloves', 'Beanie', 'Thermal wear');
  } else if (climate === 'hot') {
    items.push('Sunscreen', 'Hat', 'Sunglasses', 'Shorts');
  } else if (climate === 'rainy') {
    items.push('Umbrella', 'Raincoat', 'Waterproof shoes');
  }

  // Travel type
  if (travelType === 'adventure') {
    items.push('Hiking boots', 'First aid kit', 'Backpack');
  } else if (travelType === 'business') {
    items.push('Formal wear', 'Laptop', 'Business cards');
  }

  // Accommodation
  if (accommodation === 'hostel') {
    items.push('Padlock', 'Towel', 'Flip flops');
  } else if (accommodation === 'camping') {
    items.push('Tent', 'Sleeping bag', 'Flashlight');
  }

  // Companions
  if (companions.includes('baby')) {
    items.push('Diapers', 'Baby food', 'Stroller', 'Baby wipes');
  }
  if (companions.includes('senior')) {
    items.push('Medication', 'Walking stick', 'Comfortable shoes');
  }
  if (companions.includes('pet')) {
    items.push('Pet food', 'Leash', 'Pet carrier');
  }

  // Remove duplicates
  return [...new Set(items)];
}

// --- API Endpoints ---

// 1. Register or update user profile
app.post('/api/profile', authenticate, async (req, res) => {
  const { name, preferences } = req.body;
  const { uid, email } = req.user;
  const user = await User.findOneAndUpdate(
    { uid },
    { name, email, preferences },
    { upsert: true, new: true }
  );
  res.json(user);
});

// 2. Get user profile
app.get('/api/profile', authenticate, async (req, res) => {
  const { uid } = req.user;
  const user = await User.findOne({ uid });
  res.json(user);
});

// 3. Generate AI packing list
app.post('/api/packing-list/recommend', authenticate, async (req, res) => {
  const { climate, travelType, accommodation, companions } = req.body;
  const items = generatePackingList({ climate, travelType, accommodation, companions });
  res.json({ items });
});

// 4. Save packing list
app.post('/api/packing-list', authenticate, async (req, res) => {
  const { tripDetails, items } = req.body;
  const { uid } = req.user;
  const packingList = new PackingList({ uid, tripDetails, items });
  await packingList.save();
  res.json(packingList);
});

// 5. Get all packing lists for user
app.get('/api/packing-list', authenticate, async (req, res) => {
  const { uid } = req.user;
  const lists = await PackingList.find({ uid }).sort({ createdAt: -1 });
  res.json(lists);
});

// 6. (Optional) Send notification (example)
app.post('/api/notify', authenticate, async (req, res) => {
  const { fcmToken, message } = req.body;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: 'AI Travel Packing Assistant',
        body: message
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/*
  --- How to use this backend ---
  1. Place your Firebase service account key as 'firebaseServiceAccountKey.json' in the root.
  2. Make sure MongoDB is running locally or update the connection string.
  3. Use Firebase Authentication on your frontend to get the ID token and send it in the 'Authorization' header as 'Bearer <token>'.
  4. Use the endpoints to manage profiles, generate packing lists, and save them.
  5. Expand the AI logic as needed!
*/ 