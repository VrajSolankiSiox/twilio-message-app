import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export type UserRole = "admin" | "employee";

export interface User {
  _id: ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  await db.collection<User>("users").createIndex({ email: 1 }, { unique: true });
  indexesEnsured = true;
}

export async function ensureAdminUser(): Promise<void> {
  await ensureIndexes();
  const db = await getDb();
  const count = await db.collection<User>("users").countDocuments();

  if (count > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.collection<User>("users").insertOne({
    _id: new ObjectId(),
    fullName: "Admin",
    email: email.toLowerCase(),
    passwordHash,
    role: "admin",
    createdAt: new Date(),
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  await ensureAdminUser();
  const db = await getDb();
  return db.collection<User>("users").findOne({ email: email.toLowerCase() });
}

export async function findUserById(id: string): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null;
  await ensureIndexes();
  const db = await getDb();
  return db.collection<User>("users").findOne({ _id: new ObjectId(id) });
}

export async function verifyUserPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export async function createUser(
  fullName: string,
  email: string,
  password: string,
  role: UserRole = "employee"
): Promise<User> {
  await ensureIndexes();
  const db = await getDb();

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user: User = {
    _id: new ObjectId(),
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role,
    createdAt: new Date(),
  };

  await db.collection<User>("users").insertOne(user);
  return user;
}

export async function listUsers(): Promise<
  Array<{ id: string; fullName: string; email: string; role: UserRole; createdAt: string }>
> {
  await ensureIndexes();
  const db = await getDb();
  const users = await db
    .collection<User>("users")
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  return users.map((u) => ({
    id: u._id.toString(),
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }));
}
