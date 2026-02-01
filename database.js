import mongoose from "mongoose";
import bcrypt from "bcryptjs";

let isConnected = false;

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, index: true, required: true },
    password: { type: String },
    name: { type: String },
    avatar: { type: String },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "users" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing (set it in Render env vars / .env)");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  isConnected = true;

  console.log("✅ MongoDB connected");
  await ensureAdmin();
}

async function ensureAdmin() {
  const adminEmail = "www.vlarya.com@gmail.com";

  // NOTE: you hardcoded a real password in your SQLite version.
  // Do NOT keep doing that. Use an env var in production.
  const adminPlain = process.env.ADMIN_PASSWORD || "Arya172010";

  const existing = await User.findOne({ email: adminEmail }).lean();

  if (!existing) {
    const adminHash = await bcrypt.hash(adminPlain, 10);
    await User.create({
      email: adminEmail,
      name: "Arya (Admin)",
      isAdmin: true,
      password: adminHash
    });
    console.log("Admin account initialized.");
  } else {
    // Repair if password missing
    if (!existing.password) {
      const adminHash = await bcrypt.hash(adminPlain, 10);
      await User.updateOne(
        { email: adminEmail },
        { $set: { password: adminHash, isAdmin: true } }
      );
      console.log("Admin account repaired.");
    }
  }
}

// Public API (same names as your SQLite module)

export async function findUserByEmail(email) {
  await connectDB();
  return User.findOne({ email }).lean();
}

export async function createUser(profile) {
  await connectDB();

  const { name, email, password } = profile;

  const created = await User.create({
    email,
    name,
    password,
    isAdmin: false
  });

  return { id: created._id.toString(), email: created.email, name: created.name };
}

export async function getUserById(id) {
  await connectDB();
  return User.findById(id).lean();
}

export async function getAllUsers() {
  await connectDB();
  const users = await User.find({})
    .sort({ createdAt: -1 })
    .lean();

  // Keep similar output shape (id field like sqlite)
  return users.map(u => ({
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    password: u.password,
    createdAt: u.createdAt
  }));
}

export async function updateUser(id, updates) {
  await connectDB();

  // Prevent changing _id by accident
  const { _id, id: ignoreId, ...safeUpdates } = updates;

  return User.updateOne({ _id: id }, { $set: safeUpdates });
}

// Connect on load (like your old initDB)
connectDB().catch(console.error);
