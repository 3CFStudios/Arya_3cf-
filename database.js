import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let isConnected = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------- MODELS -------------------- */

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, index: true, required: true },
    password: { type: String },
    name: { type: String },
    avatarUrl: { type: String },
    bio: { type: String },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationTokenHash: { type: String },
    verificationTokenExpiresAt: { type: Date },
    verificationTokenSentAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIP: { type: String },
    lastLoginUserAgent: { type: String },
    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "users" }
);

const FollowSchema = new mongoose.Schema(
  {
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "follows" }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, required: true },
    content: { type: String, required: true },
    imageUrl: { type: String },
    videoUrl: { type: String },
    tags: { type: [String], default: [] },
    slug: { type: String, unique: true, index: true },
    status: { type: String, enum: ["published", "draft"], default: "draft" },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true, collection: "blog_posts" }
);

const ContentSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true, collection: "content" }
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
export const Follow = mongoose.models.Follow || mongoose.model("Follow", FollowSchema);
export const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", BlogPostSchema);
export const Content = mongoose.models.Content || mongoose.model("Content", ContentSchema);

/* -------------------- CONNECT -------------------- */

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing (set it in Render env vars / .env)");

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("authentication failed") || message.toLowerCase().includes("bad auth")) {
      throw new Error("Database authentication failed. Check MONGO_URI credentials.");
    }
    throw error;
  }

  isConnected = true;
  console.log("✅ MongoDB connected");

  await ensureAdmin();
  await ensureContentSeed();
}

/* -------------------- SEEDING -------------------- */

async function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "www.vlarya.com@gmail.com";

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
      isVerified: true,
      password: adminHash
    });
    console.log("✅ Admin account initialized.");
  } else {
    // Repair if password missing / ensure admin flag
    if (!existing.password || existing.isAdmin !== true) {
      const adminHash = existing.password || (await bcrypt.hash(adminPlain, 10));
      await User.updateOne(
        { email: adminEmail },
        { $set: { password: adminHash, isAdmin: true, isVerified: true } }
      );
      console.log("✅ Admin account repaired.");
    }
  }
}

async function ensureContentSeed() {
  const doc = await Content.findOne({ key: "site_content" }).lean();
  if (!doc) {
    const seedPath = path.join(__dirname, "content.json");
    let seedValue = {
      sitePassword: "",
      analytics: { totalViews: 0 }
    };
    if (fs.existsSync(seedPath)) {
      try {
        seedValue = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      } catch (error) {
        console.warn("⚠️ Failed to parse content.json seed, using defaults.");
      }
    }
    await Content.create({
      key: "site_content",
      value: seedValue
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
  const { name, email, password, isVerified = false, avatarUrl = "", bio = "" } = profile;

  const created = await User.create({
    email,
    name,
    password,
    avatarUrl,
    bio,
    isVerified,
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
