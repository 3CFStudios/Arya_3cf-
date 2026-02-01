import mongoose from "mongoose";
import bcrypt from "bcryptjs";

let isConnected = false;

/* -------------------- MODELS -------------------- */

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

const ContentSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true, collection: "content" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Content = mongoose.models.Content || mongoose.model("Content", ContentSchema);

/* -------------------- CONNECT -------------------- */

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing (set it in Render env vars / .env)");

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000
  });

  isConnected = true;
  console.log("✅ MongoDB connected");

  await ensureAdmin();
  await ensureContentSeed();
}

/* -------------------- SEEDING -------------------- */

async function ensureAdmin() {
  const adminEmail = "www.vlarya.com@gmail.com";

  // IMPORTANT: set ADMIN_PASSWORD in Render env vars
  // Do NOT hardcode passwords in code.
  const adminPlain = process.env.ADMIN_PASSWORD;
  if (!adminPlain) {
    console.log("⚠️ ADMIN_PASSWORD not set. Admin seeding skipped.");
    return;
  }

  const existing = await User.findOne({ email: adminEmail }).lean();

  if (!existing) {
    const adminHash = await bcrypt.hash(adminPlain, 10);
    await User.create({
      email: adminEmail,
      name: "Arya (Admin)",
      isAdmin: true,
      password: adminHash
    });
    console.log("✅ Admin account initialized.");
  } else {
    // Repair if password missing / ensure admin flag
    if (!existing.password || existing.isAdmin !== true) {
      const adminHash = existing.password || (await bcrypt.hash(adminPlain, 10));
      await User.updateOne(
        { email: adminEmail },
        { $set: { password: adminHash, isAdmin: true } }
      );
      console.log("✅ Admin account repaired.");
    }
  }
}

async function ensureContentSeed() {
  const doc = await Content.findOne({ key: "site_content" }).lean();
  if (!doc) {
    await Content.create({
      key: "site_content",
      value: {
        sitePassword: "",
        analytics: { totalViews: 0 }
      }
    });
    console.log("✅ Content initialized in Mongo.");
  }
}

/* -------------------- USERS API (same as your old one) -------------------- */

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

  const users = await User.find({}).sort({ createdAt: -1 }).lean();

  // Map to your existing admin UI shape
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

  // Prevent id overwrite
  const { _id, id: ignoreId, ...safeUpdates } = updates;

  return User.updateOne({ _id: id }, { $set: safeUpdates });
}

/* -------------------- CONTENT API -------------------- */

export async function getContent() {
  await connectDB();
  const doc = await Content.findOne({ key: "site_content" }).lean();
  return doc?.value || null;
}

export async function setContent(newContent) {
  await connectDB();
  await Content.updateOne(
    { key: "site_content" },
    { $set: { value: newContent } },
    { upsert: true }
  );
  return true;
}

// Connect on load (keeps behavior similar to your SQLite init)
connectDB().catch(console.error);
