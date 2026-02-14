import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { defaultContent, normalizeContent } from './src/contentDefaults.js';

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
  { collection: 'users' }
);

const SiteContentSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['draft', 'published'], required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    version: { type: Number, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'site_content_versions' }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const SiteContent = mongoose.models.SiteContent || mongoose.model('SiteContent', SiteContentSchema);

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing (set it in Render env vars / .env)');

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  isConnected = true;
  console.log('✅ MongoDB connected');

  await ensureAdmin();
  await ensureContentSeed();
}

async function ensureAdmin() {
  const adminEmail = 'www.vlarya.com@gmail.com';
  const adminPlain = process.env.ADMIN_PASSWORD;
  if (!adminPlain) {
    console.log('⚠️ ADMIN_PASSWORD not set. Admin seeding skipped.');
    return;
  }

  const existing = await User.findOne({ email: adminEmail }).lean();
  if (!existing) {
    const adminHash = await bcrypt.hash(adminPlain, 10);
    await User.create({
      email: adminEmail,
      name: 'Arya (Admin)',
      isAdmin: true,
      password: adminHash
    });
    console.log('✅ Admin account initialized.');
    return;
  }

  if (!existing.password || existing.isAdmin !== true) {
    const adminHash = existing.password || (await bcrypt.hash(adminPlain, 10));
    await User.updateOne({ email: adminEmail }, { $set: { password: adminHash, isAdmin: true } });
    console.log('✅ Admin account repaired.');
  }
}

async function ensureContentSeed() {
  const activePublished = await SiteContent.findOne({ status: 'published', isActive: true }).lean();
  const activeDraft = await SiteContent.findOne({ status: 'draft', isActive: true }).lean();
  if (activePublished || activeDraft) return;

  await SiteContent.create({
    status: 'published',
    isActive: true,
    version: 1,
    data: normalizeContent(defaultContent),
    publishedAt: new Date()
  });
  await SiteContent.create({
    status: 'draft',
    isActive: true,
    version: 1,
    data: normalizeContent(defaultContent),
    publishedAt: null
  });
  console.log('✅ Site content initialized in Mongo.');
}

async function getMaxVersion() {
  await connectDB();
  const max = await SiteContent.findOne({}).sort({ version: -1 }).lean();
  return max?.version || 0;
}

export async function getActiveContent(status) {
  await connectDB();
  const doc = await SiteContent.findOne({ status, isActive: true }).sort({ updatedAt: -1 }).lean();
  return doc || null;
}

export async function saveDraftContent(content) {
  await connectDB();
  const normalized = normalizeContent(content);
  const existingDraft = await SiteContent.findOne({ status: 'draft', isActive: true });

  if (existingDraft) {
    existingDraft.data = normalized;
    existingDraft.updatedAt = new Date();
    await existingDraft.save();
    return existingDraft.toObject();
  }

  const newVersion = (await getMaxVersion()) + 1;
  return SiteContent.create({
    status: 'draft',
    isActive: true,
    version: newVersion,
    data: normalized,
    publishedAt: null
  });
}

export async function publishDraftContent() {
  await connectDB();
  const draft = await SiteContent.findOne({ status: 'draft', isActive: true });
  if (!draft) throw new Error('No active draft found');

  await SiteContent.updateMany({ status: 'published', isActive: true }, { $set: { isActive: false } });

  const publishedVersion = (await getMaxVersion()) + 1;
  const published = await SiteContent.create({
    status: 'published',
    isActive: true,
    version: publishedVersion,
    data: normalizeContent(draft.data),
    publishedAt: new Date()
  });

  draft.version = publishedVersion;
  draft.data = normalizeContent(draft.data);
  await draft.save();

  const oldPublished = await SiteContent.find({ status: 'published' }).sort({ updatedAt: -1 }).skip(10);
  if (oldPublished.length) {
    const ids = oldPublished.map((item) => item._id);
    await SiteContent.deleteMany({ _id: { $in: ids }, isActive: false });
  }

  return published.toObject();
}

export async function getContentHistory() {
  await connectDB();
  return SiteContent.find({ status: 'published' }).sort({ version: -1 }).limit(10).lean();
}

export async function rollbackToVersion(version) {
  await connectDB();
  const target = await SiteContent.findOne({ status: 'published', version: Number(version) }).lean();
  if (!target) throw new Error('Version not found');

  return publishFromData(target.data);
}

async function publishFromData(data) {
  await SiteContent.updateMany({ status: 'published', isActive: true }, { $set: { isActive: false } });
  const nextVersion = (await getMaxVersion()) + 1;
  return SiteContent.create({
    status: 'published',
    isActive: true,
    version: nextVersion,
    data: normalizeContent(data),
    publishedAt: new Date()
  });
}

// Legacy compatibility
export async function getContent() {
  const published = await getActiveContent('published');
  return published?.data || normalizeContent(defaultContent);
}

export async function setContent(newContent) {
  const saved = await saveDraftContent(newContent);
  return saved.data;
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

connectDB().catch(console.error);
