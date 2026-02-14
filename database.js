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

const ContentSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true, collection: "content" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Content = mongoose.models.Content || mongoose.model("Content", ContentSchema);

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI missing (set it in Render env vars / .env)");

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  isConnected = true;
  console.log("✅ MongoDB connected");

  await ensureAdmin();
  await ensureContentSeed();
}

async function ensureAdmin() {
  const adminEmail = "www.vlarya.com@gmail.com";
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
  } else if (!existing.password || existing.isAdmin !== true) {
    const adminHash = existing.password || (await bcrypt.hash(adminPlain, 10));
    await User.updateOne(
      { email: adminEmail },
      { $set: { password: adminHash, isAdmin: true } }
    );
    console.log("✅ Admin account repaired.");
  }
}

async function ensureContentSeed() {
  const doc = await Content.findOne({ key: "site_content" }).lean();
  if (!doc) {
    await Content.create({
      key: "site_content",
      value: {
        hero: {
          titlePrefix: "Hi, I'm Arya ",
          titleSuffix: "",
          subtitle: "Builder. Tech nerd. Systems enjoyer.",
          description: "I design and build high performance software systems, games, AI powered tools, and experimental tech projects.",
          focusList: ["Game engines", "AI-driven tools", "Software architecture"],
          buttons: [
            { text: "View Projects", link: "#projects" },
            { text: "Contact Me", link: "#contact" }
          ]
        },
        about: { title: "About Me", p1: "", p2: "", enjoyList: [], apartList: [] },
        projects: [],
        skills: [],
        experience: [],
        achievements: [],
        blog: [],
        contact: { title: "Let's Talk", subtitle: "", email: "", phone: "", socials: [] },
        customSections: [],
        sectionOrder: ["home", "about", "projects", "skills", "experience", "blog", "contact"],
        theme: { primary: "#00f3ff", secondary: "#bd00ff", bg: "#050505" },
        analytics: { totalViews: 0 },
        sitePassword: ""
      }
    });
    console.log("✅ Content initialized in Mongo.");
  }
}

export async function findUserByEmail(email) {
  await connectDB();
  return User.findOne({ email }).lean();
}

export async function createUser(profile) {
  await connectDB();
  const { name, email, password } = profile;

  const created = await User.create({ email, name, password, isAdmin: false });

  return { id: created._id.toString(), email: created.email, name: created.name };
}

export async function getUserById(id) {
  await connectDB();
  return User.findById(id).lean();
}

export async function getAllUsers() {
  await connectDB();

  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  return users.map((u) => ({
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
  const { _id, id: ignoreId, ...safeUpdates } = updates;
  return User.updateOne({ _id: id }, { $set: safeUpdates });
}

export async function getContent() {
  await connectDB();
  const doc = await Content.findOne({ key: "site_content" }).lean();
  return doc?.value || null;
}

export async function setContent(newContent) {
  await connectDB();
  const updated = await Content.findOneAndUpdate(
    { key: "site_content" },
    { $set: { value: newContent } },
    { upsert: true, new: true }
  ).lean();
  return updated?.value || newContent;
}

connectDB().catch(console.error);
