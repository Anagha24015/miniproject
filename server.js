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
    'Passport', 'Travel documents', 'Phone charger', 'Toiletries', 'Face masks', 'Hand sanitizer', 'Snacks', 'Reusable water bottle'
  ];

  // Climate-based items
  if (climate === 'cold') {
    items.push(
      'Sweaters', 'Thermal wear', 'Jacket', 'Gloves', 'Beanie', 'Woolen socks', 'Heating pads', 'Moisturizer', 'Lip balm', 'Scarf', 'Ear muffs', 'Boots'
    );
  } else if (climate === 'hot') {
    items.push(
      'Sunscreen', 'Hat', 'Sunglasses', 'Shorts', 'Light cotton clothes', 'Flip flops', 'Aloe vera gel', 'Water bottle', 'Deodorant', 'Cooling towel'
    );
  } else if (climate === 'rainy') {
    items.push(
      'Umbrella', 'Raincoat', 'Waterproof shoes', 'Quick-dry clothes', 'Plastic bags for wet clothes', 'Waterproof backpack cover', 'Extra socks'
    );
  }

  // Travel type
  if (travelType === 'adventure') {
    items.push(
      'Hiking boots', 'First aid kit', 'Backpack', 'Energy bars', 'Water purification tablets', 'Map/Compass', 'Multi-tool', 'Headlamp', 'Insect repellent', 'Sunscreen', 'Whistle'
    );
  } else if (travelType === 'business') {
    items.push(
      'Formal wear', 'Laptop', 'Business cards', 'Dress shoes', 'Notebook & pen', 'Portable charger', 'Presentation materials', 'Tie/Scarf', 'Grooming kit'
    );
  } else if (travelType === 'leisure') {
    items.push(
      'Casual wear', 'Swimsuit', 'Camera', 'Books/e-reader', 'Travel pillow', 'Sunglasses', 'Guidebook'
    );
  }

  // Accommodation
  if (accommodation === 'hostel') {
    items.push('Padlock', 'Towel', 'Flip flops', 'Ear plugs', 'Eye mask', 'Travel sheet', 'Portable charger');
  } else if (accommodation === 'camping') {
    items.push('Tent', 'Sleeping bag', 'Flashlight', 'Camping stove', 'Camping utensils', 'Insect repellent', 'Portable water filter', 'Camping chair', 'Fire starter');
  } else if (accommodation === 'hotel') {
    items.push('Travel-size toiletries', 'Slippers', 'Laundry bag');
  }

  // Companions
  if (Array.isArray(companions)) {
    const companionsLower = companions.map(c => c.toLowerCase());
    if (companionsLower.some(c => ['baby', 'kid', 'kids', 'child', 'children', 'infant', 'toddler'].includes(c))) {
      items.push(
        'Diapers', 'Baby wipes', 'Baby food/formula', 'Bottles', 'Toys', 'Stroller', 'Car seat', 'Kids medicine', 'Thermometer', 'Extra clothes for kids', 'Snacks for kids', 'Blanket', 'Pacifier', 'Sippy cup', 'Story books', 'Child sunscreen', 'Child ID bracelet'
      );
    }
    if (companionsLower.some(c => ['senior', 'senior citizen', 'elderly', 'old', 'grandparent'].includes(c))) {
      items.push(
        'Medication', 'Walking stick', 'Comfortable shoes', 'Medical documents', 'Reading glasses', 'Hearing aid batteries', 'Pill organizer', 'Neck pillow', 'Light snacks', 'Emergency contact info'
      );
    }
    if (companionsLower.some(c => ['pet', 'dog', 'cat', 'animal'].includes(c))) {
      items.push(
        'Pet food', 'Leash', 'Pet carrier', 'Pet toys', 'Water bowl', 'Pet bed', 'Waste bags', 'Vaccination records', 'Pet medication', 'Grooming supplies'
      );
    }
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
  try {
    const { climate, travelType, accommodation, companions } = req.body;
    const items = generatePackingList({ climate, travelType, accommodation, companions });
    res.json({ items });
  } catch (err) {
    console.error('Error in /api/packing-list/recommend:', err);
    res.status(500).json({ error: err.message });
  }
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

// 7. Delete user profile and all related data
app.delete('/api/delete-profile', authenticate, async (req, res) => {
  const { uid } = req.user;
  try {
    // Delete user from Firebase Auth
    await admin.auth().deleteUser(uid);
    // Delete user profile from MongoDB
    await User.deleteOne({ uid });
    // Delete all packing lists for this user
    await PackingList.deleteMany({ uid });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting profile:', err);
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