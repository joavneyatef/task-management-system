import crypto from 'crypto';
import prisma from '../db';
import { User, UserRole } from '../../src/types';
import { resolveSessionSecret } from './secret';

// Env var, else a per-install secret persisted next to the data store. Never a
// literal — see server/services/secret.ts.
const SESSION_SECRET = resolveSessionSecret();

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, hashed: string): boolean {
  if (!hashed || !plain) return false;
  if (!hashed.startsWith('scrypt$')) {
    return plain === hashed;
  }
  const parts = hashed.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const originalDerived = parts[2];
  if (!salt || !originalDerived) return false;

  const derivedBuf = crypto.scryptSync(plain, salt, 64);
  const originalBuf = Buffer.from(originalDerived, 'hex');
  // A corrupt or truncated stored hash must fail verification, not crash the
  // request: timingSafeEqual throws on a length mismatch.
  if (originalBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

export function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecialOrDigit = /[0-9\W_]/.test(password);
  return hasMinLength && hasLower && hasUpper && hasSpecialOrDigit;
}

export function signSession(userId: string): string {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = `${userId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySession(token?: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!userId || !expiresAt || Date.now() > expiresAt) return null;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(`${userId}.${expiresAtStr}`).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return userId;
}

export function sanitizePublicUser(u: any): User {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as UserRole,
    title: u.title,
    email: u.email,
    phone: u.phone || '',
    avatar: u.avatar || '',
    status: u.status as any,
    skills: typeof u.skills === 'string' ? JSON.parse(u.skills || '[]') : u.skills || [],
    departmentId: u.departmentId || undefined,
    parentId: u.parentId || undefined,
    managerId: u.managerId || undefined,
    positionCode: u.positionCode || undefined,
    updatedAt: u.updatedAt ? u.updatedAt.toISOString() : undefined
  };
}

export async function loginUser(identifier: string, passwordPlain: string) {
  const idQuery = identifier.trim().toLowerCase();
  
  const allUsers = await prisma.user.findMany();
  const user = allUsers.find(u => 
    (u.id && u.id.toLowerCase() === idQuery) ||
    (u.email && u.email.toLowerCase() === idQuery) ||
    (u.username && u.username.toLowerCase() === idQuery) ||
    (u.name && u.name.toLowerCase() === idQuery)
  );

  if (!user || !verifyPassword(passwordPlain, user.password)) {
    return { success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid name/email or password.' };
  }

  if (user.status === 'Off Duty') {
    return { success: false, error: 'ACCOUNT_DISABLED', message: 'This account is currently off duty.' };
  }

  const token = signSession(user.id);
  return { success: true, token, user: sanitizePublicUser(user) };
}

export async function signupUser(params: {
  name: string;
  email: string;
  password: string;
  role: 'Director' | 'Manager' | 'Assistant';
  departmentId?: string;
  parentId: string;
  avatar?: string;
}) {
  const { name, email, password, role, departmentId, parentId, avatar } = params;

  if (!isValidPassword(password)) {
    return {
      success: false,
      error: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters and include uppercase, lowercase, and numbers or symbols.'
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail } }
  });

  if (existing) {
    return { success: false, error: 'EMAIL_EXISTS', message: 'This job email is already in use.' };
  }

  const parent = await prisma.user.findUnique({ where: { id: parentId } });
  const validParent =
    (role === 'Director' && parent && (parent.role === 'GM' || parent.role === 'GeneralManager')) ||
    (role === 'Manager' && parent && (parent.role === 'Director' || parent.role === 'GM' || parent.role === 'GeneralManager')) ||
    (role === 'Assistant' && parent && (parent.role === 'Manager' || parent.role === 'Director'));

  if (!validParent) {
    return { success: false, error: 'INVALID_HIERARCHY', message: 'Reports To supervisor does not match the selected role.' };
  }

  const dept = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
  const resolvedDeptId = dept ? dept.id : (parent ? parent.departmentId : null);
  const deptName = dept ? dept.name.replace(/ Department/i, '') : '';
  const title =
    role === 'Director'
      ? (deptName ? `Director ${deptName}` : 'Director')
      : role === 'Manager'
      ? (deptName ? `${deptName} Manager` : 'Manager')
      : (deptName ? `${deptName} Assistant` : 'Assistant');

  const usernameBase = normalizedEmail.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase() || `user${Date.now()}`;
  const usernameCollision = await prisma.user.findUnique({ where: { username: usernameBase } });
  const username = usernameCollision ? `${usernameBase}-${Date.now().toString().slice(-4)}` : usernameBase;
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const createdUser = await prisma.user.create({
    data: {
      id,
      username,
      name: name.trim(),
      email: normalizedEmail,
      role,
      title,
      phone: '',
      avatar: avatar || '',
      status: 'Active',
      password: hashPassword(password),
      departmentId: resolvedDeptId,
      parentId: parent ? parent.id : null,
      managerId: parent ? parent.id : null,
      positionCode: role,
      skills: JSON.stringify([])
    }
  });

  return { success: true, user: sanitizePublicUser(createdUser) };
}

export async function updateUserProfile(userId: string, data: {
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  newPassword?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: 'USER_NOT_FOUND', message: 'User not found.' };

  const updateData: any = {};

  if (data.email && data.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail }, id: { not: userId } }
    });
    if (existing) {
      return { success: false, error: 'EMAIL_EXISTS', message: 'This email is already in use.' };
    }
    updateData.email = normalizedEmail;
  }

  if (data.name && data.name.trim()) updateData.name = data.name.trim();
  if (data.phone !== undefined) updateData.phone = data.phone.trim();
  if (data.avatar !== undefined) updateData.avatar = data.avatar.trim();

  if (data.newPassword) {
    if (!isValidPassword(data.newPassword)) {
      return {
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters and contain uppercase, lowercase, and numbers or symbols.'
      };
    }
    updateData.password = hashPassword(data.newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  return { success: true, user: sanitizePublicUser(updated) };
}
