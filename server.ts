import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  chunkScheduleBlocks,
  computeRealityShiftPreview,
  generateDeterministicSchedule,
} from './src/lib/scheduler.ts';
import type {
  Plan,
  PlanVersion,
  RealityShiftChangeSpec,
  Routine,
  ScheduleBlock,
  Task,
  UserProfile,
} from './src/types/lifeos.ts';

dotenv.config();

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'))
  : {
      projectId: '',
      apiKey: '',
      firestoreDatabaseId: '(default)',
    };

// Configurable Server-Side Gemini Model Setting (Engineering Correction #1)
const SUPPORTED_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

let configuredGeminiModel =
  process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim().length > 0
    ? process.env.GEMINI_MODEL.trim()
    : 'gemini-2.5-flash';
let lastVerifiedGeminiModel: string | null = null;

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function callGeminiWithFallback(params: {
  contents: string;
  systemInstruction: string;
  responseSchema?: any;
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getGenAIClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const candidateModels = Array.from(
    new Set([
      ...(lastVerifiedGeminiModel ? [lastVerifiedGeminiModel] : []),
      configuredGeminiModel,
      ...SUPPORTED_GEMINI_MODELS,
    ])
  );

  let lastErr: unknown = null;
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          ...(params.responseSchema
            ? {
                responseMimeType: 'application/json',
                responseSchema: params.responseSchema,
              }
            : {}),
        },
      });
      const text = response.text ?? '';
      lastVerifiedGeminiModel = modelName;
      return { text, modelUsed: modelName };
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err || '');
      // If model ID is not found or unsupported in this environment, try next supported model
      if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('All candidate Gemini models failed.');
}

// Rate limiter per user/IP for AI endpoints
const aiRateMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxPerMinute = 30): boolean {
  const now = Date.now();
  const entry = aiRateMap.get(key);
  if (!entry || now > entry.resetAt) {
    aiRateMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= maxPerMinute) {
    return false;
  }
  entry.count += 1;
  return true;
}

interface VerifiedAuthContext {
  uid: string;
  email: string;
  emailVerified: boolean;
  idToken: string;
  isDemo: boolean;
}

/**
 * Verifies the authenticated user from a Firebase ID Token via Google Identity Toolkit
 * or allows explicit isolated Demo Mode requests (`x-lifeos-demo: true`).
 * Never trusts a bare client-supplied UID for Firestore operations (Engineering Correction #3).
 */
async function verifyRequestAuth(req: Request): Promise<VerifiedAuthContext> {
  const isDemoHeader = req.headers['x-lifeos-demo'] === 'true';
  if (isDemoHeader) {
    return {
      uid: 'demo_student',
      email: 'demo@lifeos.local',
      emailVerified: true,
      idToken: '',
      isDemo: true,
    };
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED: Missing Bearer token.');
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new Error('UNAUTHORIZED: Empty Bearer token.');
  }

  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
  const resp = await fetch(lookupUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!resp.ok) {
    throw new Error('UNAUTHORIZED: Invalid or expired Firebase ID token.');
  }

  const data = (await resp.json()) as any;
  const account = data?.users?.[0];
  if (!account || !account.localId) {
    throw new Error('UNAUTHORIZED: Account not found for token.');
  }
  if (!account.emailVerified) {
    throw new Error('FORBIDDEN: Email address must be verified.');
  }

  return {
    uid: account.localId,
    email: account.email || '',
    emailVerified: Boolean(account.emailVerified),
    idToken,
    isDemo: false,
  };
}

// Firestore REST Value serialization helpers for Server-Side Privileged Operations
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && k !== 'id') {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function fromFirestoreDoc(docObj: any): any {
  if (!docObj || !docObj.fields) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(docObj.fields)) {
    out[k] = fromFirestoreValue(v);
  }
  if (docObj.name) {
    const parts = String(docObj.name).split('/');
    out.id = parts[parts.length - 1];
  }
  return out;
}

function getFirestoreBaseUrl(): string {
  const projectId = firebaseConfig.projectId;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
}

function getFirestoreDocName(relativePath: string): string {
  const projectId = firebaseConfig.projectId;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const clean = relativePath.replace(/^\/+/, '');
  return `projects/${projectId}/databases/${dbId}/documents/${clean}`;
}

async function firestoreGetDoc(relativePath: string, idToken: string): Promise<any | null> {
  const url = `${getFirestoreBaseUrl()}/${relativePath.replace(/^\/+/, '')}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore GET failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  return fromFirestoreDoc(json);
}

async function firestoreListCollection(relativePath: string, idToken: string): Promise<any[]> {
  const url = `${getFirestoreBaseUrl()}/${relativePath.replace(/^\/+/, '')}?pageSize=300`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (resp.status === 404) return [];
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore LIST failed (${resp.status}): ${text}`);
  }
  const json = (await resp.json()) as any;
  return (json.documents || []).map(fromFirestoreDoc).filter(Boolean);
}

interface FirestoreWriteOp {
  type: 'set' | 'delete';
  path: string;
  data?: Record<string, any>;
}

/**
 * Commits write operations in bounded batches of <= 400 operations to respect Firestore's 500-op batch limit.
 */
async function firestoreCommitOps(ops: FirestoreWriteOp[], idToken: string): Promise<void> {
  const BATCH_LIMIT = 400;
  const commitUrl = `${getFirestoreBaseUrl()}:commit`;

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const writes = slice.map((op) => {
      if (op.type === 'delete') {
        return { delete: getFirestoreDocName(op.path) };
      }
      return {
        update: {
          name: getFirestoreDocName(op.path),
          fields: toFirestoreFields(op.data || {}),
        },
      };
    });

    const resp = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Firestore atomic commit failed (${resp.status}): ${errText}`);
    }
  }
}

/**
 * Persists a validated schedule version, bounded version chunks (<= 40 blocks each),
 * active scheduleBlocks, and an immutable ActivityLog on the server.
 */
async function persistServerValidatedPlanTransition(params: {
  uid: string;
  idToken: string;
  planId: string;
  horizonStartDate: string;
  horizonEndDate: string;
  expectedBaseVersion: number | null;
  reason: string;
  summaryText: string;
  newBlocks: ScheduleBlock[];
  activityAction: string;
}): Promise<{ newVersion: number; plan: Plan; planVersion: PlanVersion }> {
  const {
    uid,
    idToken,
    planId,
    horizonStartDate,
    horizonEndDate,
    expectedBaseVersion,
    reason,
    summaryText,
    newBlocks,
    activityAction,
  } = params;

  const nowIso = new Date().toISOString();
  const existingPlan = (await firestoreGetDoc(`users/${uid}/plans/${planId}`, idToken)) as Plan | null;

  if (expectedBaseVersion !== null && existingPlan) {
    if (existingPlan.currentVersion !== expectedBaseVersion) {
      const err: any = new Error(
        `STALE_PLAN_VERSION: Active schedule is at version ${existingPlan.currentVersion}, but preview was computed against version ${expectedBaseVersion}. Please recalculate before applying.`
      );
      err.statusCode = 409;
      err.code = 'STALE_PLAN_VERSION';
      throw err;
    }
  }

  const parentVersion = existingPlan ? existingPlan.currentVersion : 0;
  const nextVersion = parentVersion + 1;

  // Stamp all blocks with the server-verified scheduleVersion
  const stampedBlocks: ScheduleBlock[] = newBlocks.map((b) => ({
    ...b,
    userId: uid,
    planId,
    scheduleVersion: nextVersion,
    updatedAt: nowIso,
    createdAt: b.createdAt || nowIso,
  }));

  const chunks = chunkScheduleBlocks(uid, nextVersion, stampedBlocks, nowIso, 40);

  const nextPlan: Plan = {
    id: planId,
    userId: uid,
    horizonStart: horizonStartDate,
    horizonEnd: horizonEndDate,
    currentVersion: nextVersion,
    status: 'active',
    lastReason: reason.slice(0, 500),
    updatedAt: nowIso,
  };

  const versionDocId = `v_${nextVersion}`;
  const planVersion: PlanVersion = {
    id: versionDocId,
    userId: uid,
    planId,
    version: nextVersion,
    parentVersion,
    reason: reason.slice(0, 500),
    blockCount: stampedBlocks.length,
    chunkCount: chunks.length,
    summaryText: (summaryText || reason).slice(0, 2000),
    serverValidated: true,
    createdAt: nowIso,
  };

  // List existing scheduleBlocks so removed blocks are cleaned up atomically
  const existingBlocks = await firestoreListCollection(`users/${uid}/scheduleBlocks`, idToken);
  const newBlockIds = new Set(stampedBlocks.map((b) => b.id));

  const ops: FirestoreWriteOp[] = [];

  // 1. Update or create active Plan document
  ops.push({
    type: 'set',
    path: `users/${uid}/plans/${planId}`,
    data: nextPlan,
  });

  // 2. Create immutable PlanVersion document
  ops.push({
    type: 'set',
    path: `users/${uid}/planVersions/${versionDocId}`,
    data: planVersion,
  });

  // 3. Create bounded PlanVersionChunk documents
  for (const chunk of chunks) {
    ops.push({
      type: 'set',
      path: `users/${uid}/planVersions/${versionDocId}/chunks/${chunk.id}`,
      data: chunk,
    });
  }

  // 4. Delete obsolete scheduleBlocks and write current scheduleBlocks
  for (const oldBlk of existingBlocks) {
    if (oldBlk?.id && !newBlockIds.has(oldBlk.id)) {
      ops.push({
        type: 'delete',
        path: `users/${uid}/scheduleBlocks/${oldBlk.id}`,
      });
    }
  }

  for (const blk of stampedBlocks) {
    ops.push({
      type: 'set',
      path: `users/${uid}/scheduleBlocks/${blk.id}`,
      data: blk,
    });
  }

  // 5. Append immutable ActivityLog entry
  const actId = `act_${Date.now()}_v${nextVersion}`;
  ops.push({
    type: 'set',
    path: `users/${uid}/activities/${actId}`,
    data: {
      userId: uid,
      action: activityAction,
      targetId: versionDocId,
      summary: `${reason} (v${nextVersion}, ${stampedBlocks.length} blocks)`.slice(0, 500),
      createdAt: nowIso,
    },
  });

  await firestoreCommitOps(ops, idToken);

  return { newVersion: nextVersion, plan: nextPlan, planVersion };
}

/**
 * Deterministic fallback parser for natural-language tasks when Gemini API is unavailable or rate-limited.
 */
function deterministicParseTaskFallback(rawText: string, referenceNowIso: string) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  let estimatedMinutes = 60;
  const hourMatch = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i.exec(text);
  const minMatch = /(\d+)\s*(?:minutes?|mins?|m\b)/i.exec(text);
  if (hourMatch) {
    estimatedMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
  } else if (minMatch) {
    estimatedMinutes = parseInt(minMatch[1], 10);
  }
  estimatedMinutes = Math.max(15, Math.min(480, estimatedMinutes));

  let category: Task['category'] = 'personal';
  if (/(study|exam|lecture|class|assignment|homework|paper|read chapter|networking|math|physics|cs\s*\d+)/i.test(lower)) {
    category = 'academic';
  } else if (/(code|coding|build|debug|implement|deploy|api|react|typescript|rust|python)/i.test(lower)) {
    category = 'coding';
  } else if (/(client|freelance|meeting|invoice|proposal|work|presentation)/i.test(lower)) {
    category = 'work';
  } else if (/(gym|workout|run|lift|cardio|fitness|yoga)/i.test(lower)) {
    category = 'fitness';
  } else if (/(guitar|draw|sketch|paint|piano|music|practice)/i.test(lower)) {
    category = 'hobby';
  }

  let priority: Task['priority'] = 'medium';
  if (/(urgent|critical|asap|exam|midterm|final)/i.test(lower)) priority = 'critical';
  else if (/(important|high|deadline|due)/i.test(lower)) priority = 'high';
  else if (/(optional|low|whenever)/i.test(lower)) priority = 'low';

  let preferredTimeOfDay: Task['preferredTimeOfDay'] = 'any';
  if (/morning/i.test(lower)) preferredTimeOfDay = 'morning';
  else if (/afternoon/i.test(lower)) preferredTimeOfDay = 'afternoon';
  else if (/evening/i.test(lower)) preferredTimeOfDay = 'evening';
  else if (/night|tonight/i.test(lower)) preferredTimeOfDay = 'night';

  const ambiguities: string[] = [];
  if (/(before|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)/i.test(lower)) {
    ambiguities.push(
      'Relative day reference detected in natural language. Please confirm or adjust the exact due date and time before saving.'
    );
  }

  return {
    title: text.replace(/\s+for\s+\d+\s*(?:hours?|hrs?|minutes?|mins?).*$/i, '').slice(0, 140) || text.slice(0, 140),
    description: `Parsed from: "${text}"`,
    category,
    priority,
    estimatedMinutes,
    isSplittable: estimatedMinutes >= 60,
    minSessionMinutes: Math.min(30, estimatedMinutes),
    preferredTimeOfDay,
    energyLevel: priority === 'critical' || priority === 'high' ? 'high' : 'medium',
    dueAt: undefined,
    ambiguities,
  };
}

/**
 * Deterministic fallback interpreter for Reality Shift scenarios.
 */
function deterministicInterpretChangeFallback(
  prompt: string,
  tasks: Task[],
  cutoffIso: string
): RealityShiftChangeSpec {
  const lower = prompt.toLowerCase();

  const lateHoursMatch = /woke up\s+(\d+)\s*hours?\s*late/i.exec(lower);
  const lateMinsMatch = /woke up\s+(\d+)\s*minutes?\s*late/i.exec(lower);
  if (lateHoursMatch || lateMinsMatch || lower.includes('woke up late')) {
    const mins = lateHoursMatch
      ? parseInt(lateHoursMatch[1], 10) * 60
      : lateMinsMatch
      ? parseInt(lateMinsMatch[1], 10)
      : 120;
    return {
      scenarioType: 'late_start',
      summary: `Shift today's planning start forward by ${mins} minutes.`,
      shiftStartMinutes: mins,
      ambiguities: [],
    };
  }

  const extraMinsMatch = /extra\s+(\d+)\s*minutes?/i.exec(lower);
  const extraHoursMatch = /extra\s+(\d+)\s*hours?/i.exec(lower);
  if (lower.includes('extra') || lower.includes('longer') || lower.includes('overrun')) {
    const extra = extraMinsMatch
      ? parseInt(extraMinsMatch[1], 10)
      : extraHoursMatch
      ? parseInt(extraHoursMatch[1], 10) * 60
      : 90;
    const candidateTask = tasks.find((t) => !t.isFixed && t.status !== 'complete');
    return {
      scenarioType: 'task_overrun',
      summary: `Add ${extra} minutes of remaining effort to "${candidateTask?.title || 'current task'}".`,
      overrunTaskId: candidateTask?.id,
      extraMinutes: extra,
      ambiguities: candidateTask
        ? []
        : ['Select which specific task requires additional time.'],
    };
  }

  if (lower.includes('keep tonight free') || lower.includes('evening free')) {
    return {
      scenarioType: 'reserve_evening_free',
      summary: 'Protect this evening from 19:00 onward as personal free time.',
      freeFromHHmm: '19:00',
      ambiguities: [],
    };
  }

  if (lower.includes('move') && lower.includes('tomorrow')) {
    const codingTask =
      tasks.find((t) => t.category === 'coding' && !t.isFixed && t.status !== 'complete') ||
      tasks.find((t) => !t.isFixed && t.status !== 'complete');
    return {
      scenarioType: 'defer_task_tomorrow',
      summary: `Defer "${codingTask?.title || 'flexible task'}" to tomorrow's focus window.`,
      deferTaskId: codingTask?.id,
      ambiguities: [],
    };
  }

  if (lower.includes('finished') || lower.includes('completed')) {
    const readingTask =
      tasks.find((t) => t.title.toLowerCase().includes('read') && t.status !== 'complete') ||
      tasks.find((t) => !t.isFixed && t.status !== 'complete');
    return {
      scenarioType: 'complete_task',
      summary: `Mark "${readingTask?.title || 'task'}" complete and reclaim its scheduled time.`,
      completeTaskId: readingTask?.id,
      ambiguities: [],
    };
  }

  if (lower.includes('urgent') || lower.includes('deadline')) {
    const baseMs = Date.parse(cutoffIso) || Date.now();
    return {
      scenarioType: 'urgent_deadline',
      summary: 'Insert a new urgent 60-minute priority task due tonight.',
      urgentTask: {
        title: 'Urgent Priority Deliverable',
        estimatedMinutes: 60,
        dueAt: new Date(baseMs + 6 * 3600000).toISOString(),
        priority: 'critical',
        category: 'academic',
      },
      ambiguities: ['Confirm exact title and deadline for the new urgent task.'],
    };
  }

  // Default unexpected meeting 1 hour from cutoff
  const startMs = (Date.parse(cutoffIso) || Date.now()) + 2 * 3600000;
  const endMs = startMs + 3600000;
  return {
    scenarioType: 'unexpected_event',
    summary: `Block 60 minutes for "${prompt.slice(0, 80)}" and reschedule flexible tasks around it.`,
    unexpectedEvent: {
      title: prompt.slice(0, 80) || 'Unexpected Meeting',
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      category: 'work',
    },
    ambiguities: ['Verify the exact start and end time of the unexpected commitment.'],
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // 1. Server-side Gemini Model Configuration Endpoints (Engineering Correction #1)
  app.get('/api/ai/config', (_req: Request, res: Response) => {
    res.json({
      configuredModel: configuredGeminiModel,
      lastVerifiedModel: lastVerifiedGeminiModel,
      supportedModels: SUPPORTED_GEMINI_MODELS,
      apiKeyConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  app.post('/api/ai/config', async (req: Request, res: Response) => {
    try {
      await verifyRequestAuth(req);
      const requestedModel = String(req.body?.model || '').trim();
      if (!requestedModel || requestedModel.length > 80) {
        res.status(400).json({ error: 'Provide a valid Gemini model ID.' });
        return;
      }
      configuredGeminiModel = requestedModel;
      lastVerifiedGeminiModel = null;
      res.json({
        configuredModel: configuredGeminiModel,
        supportedModels: SUPPORTED_GEMINI_MODELS,
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Unauthorized' });
    }
  });

  // 2. Natural-Language Task Parsing Endpoint
  app.post('/api/ai/parse-task', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      if (!checkRateLimit(authCtx.uid)) {
        res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
        return;
      }

      const rawText = String(req.body?.text || '').trim();
      const referenceNowIso = String(req.body?.referenceNowIso || new Date().toISOString());
      const timezone = String(req.body?.timezone || 'UTC');

      if (!rawText || rawText.length > 500) {
        res.status(400).json({ error: 'Provide a natural-language task description (1-500 chars).' });
        return;
      }

      try {
        const { text, modelUsed } = await callGeminiWithFallback({
          contents: `Current user time: ${referenceNowIso} (Timezone: ${timezone}).\nUser input: "${rawText}"`,
          systemInstruction:
            'You are the LifeOS task parser. Extract structured task fields from the user request. ' +
            'CRITICAL RULE: Never guess an exact ISO dueAt timestamp if the user phrase is ambiguous (e.g., "before Thursday evening" or "sometime next week"). ' +
            'If a date/time is relative or ambiguous, explain what needs user confirmation in `ambiguities` and only set `dueAt` if clearly anchored to the provided reference time.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              category: {
                type: Type.STRING,
                enum: ['academic', 'coding', 'work', 'fitness', 'hobby', 'personal'],
              },
              priority: {
                type: Type.STRING,
                enum: ['low', 'medium', 'high', 'critical'],
              },
              estimatedMinutes: { type: Type.INTEGER },
              dueAt: { type: Type.STRING },
              isSplittable: { type: Type.BOOLEAN },
              minSessionMinutes: { type: Type.INTEGER },
              preferredTimeOfDay: {
                type: Type.STRING,
                enum: ['morning', 'afternoon', 'evening', 'night', 'any'],
              },
              energyLevel: {
                type: Type.STRING,
                enum: ['low', 'medium', 'high'],
              },
              ambiguities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'title',
              'category',
              'priority',
              'estimatedMinutes',
              'isSplittable',
              'preferredTimeOfDay',
              'energyLevel',
              'ambiguities',
            ],
          },
        });

        const parsed = JSON.parse(text.trim());
        res.json({ parsed, modelUsed, source: 'gemini' });
      } catch (aiErr: any) {
        const fallback = deterministicParseTaskFallback(rawText, referenceNowIso);
        res.json({
          parsed: fallback,
          modelUsed: 'deterministic-fallback',
          source: 'fallback',
          warning: aiErr?.message || 'Used deterministic parser fallback.',
        });
      }
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Unauthorized' });
    }
  });

  // 3. Reality Shift Natural-Language Change Interpreter
  app.post('/api/ai/interpret-change', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      if (!checkRateLimit(authCtx.uid)) {
        res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
        return;
      }

      const prompt = String(req.body?.prompt || '').trim();
      const cutoffIso = String(req.body?.cutoffIso || new Date().toISOString());
      const timezone = String(req.body?.timezone || 'UTC');
      const tasks = Array.isArray(req.body?.tasks) ? (req.body.tasks as Task[]).slice(0, 40) : [];

      if (!prompt || prompt.length > 600) {
        res.status(400).json({ error: 'Provide a valid disruption description (1-600 chars).' });
        return;
      }

      const taskContext = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        remainingMinutes: t.remainingMinutes,
        status: t.status,
      }));

      try {
        const { text, modelUsed } = await callGeminiWithFallback({
          contents: `Current time: ${cutoffIso} (Timezone: ${timezone}).\nActive user tasks: ${JSON.stringify(
            taskContext
          )}\nUser Reality Shift request: "${prompt}"`,
          systemInstruction:
            'You are the LifeOS Reality Shift interpreter. Convert the user disruption statement into a structured RealityShiftChangeSpec. ' +
            'Do NOT invent tasks that do not exist unless scenarioType is "urgent_deadline" or "unexpected_event". ' +
            'Match existing task IDs from the provided list when referencing a task.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenarioType: {
                type: Type.STRING,
                enum: [
                  'late_start',
                  'task_overrun',
                  'unexpected_event',
                  'reduce_remaining_day',
                  'defer_task_tomorrow',
                  'reserve_evening_free',
                  'urgent_deadline',
                  'complete_task',
                  'custom',
                ],
              },
              summary: { type: Type.STRING },
              shiftStartMinutes: { type: Type.INTEGER },
              overrunTaskId: { type: Type.STRING },
              extraMinutes: { type: Type.INTEGER },
              deferTaskId: { type: Type.STRING },
              freeFromHHmm: { type: Type.STRING },
              completeTaskId: { type: Type.STRING },
              unexpectedEvent: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  startAt: { type: Type.STRING },
                  endAt: { type: Type.STRING },
                },
              },
              urgentTask: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  estimatedMinutes: { type: Type.INTEGER },
                  dueAt: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    enum: ['low', 'medium', 'high', 'critical'],
                  },
                  category: {
                    type: Type.STRING,
                    enum: ['academic', 'coding', 'work', 'fitness', 'hobby', 'personal'],
                  },
                },
              },
              ambiguities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['scenarioType', 'summary', 'ambiguities'],
          },
        });

        const changeSpec = JSON.parse(text.trim()) as RealityShiftChangeSpec;
        res.json({ changeSpec, modelUsed, source: 'gemini' });
      } catch (aiErr: any) {
        const fallbackSpec = deterministicInterpretChangeFallback(prompt, tasks, cutoffIso);
        res.json({
          changeSpec: fallbackSpec,
          modelUsed: 'deterministic-fallback',
          source: 'fallback',
          warning: aiErr?.message,
        });
      }
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Unauthorized' });
    }
  });

  // 4. AI Schedule Explanation & Planning Copilot Endpoint
  const handleAiExplainOrCopilot = async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      if (!checkRateLimit(authCtx.uid)) {
        res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
        return;
      }

      const question = String(req.body?.question || req.body?.prompt || 'Explain the current schedule trade-offs and bottlenecks.').trim();
      const tasks = Array.isArray(req.body?.tasks) ? (req.body.tasks as Task[]).slice(0, 40) : [];
      const blocks = Array.isArray(req.body?.blocks) ? (req.body.blocks as ScheduleBlock[]).slice(0, 50) : [];
      const conflicts = Array.isArray(req.body?.conflicts) ? req.body.conflicts.slice(0, 20) : [];
      const unscheduled = Array.isArray(req.body?.unscheduledTasks) ? req.body.unscheduledTasks.slice(0, 20) : [];

      const compactContext = {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          remainingMinutes: t.remainingMinutes,
          dueAt: t.dueAt,
          isFixed: t.isFixed,
          isSplittable: t.isSplittable,
          status: t.status,
        })),
        scheduledBlocksCount: blocks.length,
        sampleBlocks: blocks.slice(0, 20).map((b) => ({
          title: b.title,
          startAt: b.startAt,
          endAt: b.endAt,
          locked: b.locked,
          reasonCode: b.reasonCode,
        })),
        conflicts,
        unscheduled,
      };

      try {
        const { text, modelUsed } = await callGeminiWithFallback({
          contents: `User question: "${question}"\nActual User Schedule Data: ${JSON.stringify(compactContext)}`,
          systemInstruction:
            'You are the LifeOS Planning Copilot. Ground every statement strictly in the user\'s actual tasks, schedule blocks, and conflicts. ' +
            'Never invent appointments or tasks. Never make medical, psychological, or burnout claims. ' +
            'Never use guilt or shaming language; treat free time as a valid and healthy part of a schedule. ' +
            'Return a clear explanation, concrete bottlenecks, and up to 3 actionable options.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              bottlenecks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    actionType: {
                      type: Type.STRING,
                      enum: ['make_splittable', 'defer_low_priority', 'extend_deadline', 'run_reality_shift', 'keep_as_is'],
                    },
                  },
                  required: ['title', 'rationale', 'actionType'],
                },
              },
            },
            required: ['answer', 'bottlenecks', 'recommendations'],
          },
        });

        res.json({
          copilot: JSON.parse(text.trim()),
          modelUsed,
          source: 'gemini',
        });
      } catch (aiErr: any) {
        // Deterministic grounded explanation fallback
        const bottlenecks: string[] = [];
        if (unscheduled.length > 0) {
          bottlenecks.push(
            `${unscheduled.length} task(s) could not be scheduled (${unscheduled
              .map((u: any) => u.title)
              .join(', ')}).`
          );
        }
        if (conflicts.length > 0) {
          bottlenecks.push(`${conflicts.length} constraint conflict(s) detected in the current horizon.`);
        }
        res.json({
          copilot: {
            answer:
              unscheduled.length > 0
                ? `Your schedule currently has ${blocks.length} active blocks and ${unscheduled.length} unscheduled task(s). The primary constraint is available contiguous time before deadlines.`
                : `Your schedule has ${blocks.length} planned blocks with zero unscheduled tasks or hard constraint violations.`,
            bottlenecks,
            recommendations: [
              {
                title: 'Enable session splitting on long tasks',
                rationale: 'Allows 90–120m tasks to fit into 45m gaps between fixed classes.',
                actionType: 'make_splittable',
              },
              {
                title: 'Use Reality Shift to preview adjustments',
                rationale: 'Test deferring lower-priority work while keeping fixed classes locked.',
                actionType: 'run_reality_shift',
              },
            ],
          },
          modelUsed: 'deterministic-fallback',
          source: 'fallback',
          warning: aiErr?.message,
        });
      }
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Unauthorized' });
    }
  };

  app.post('/api/ai/explain-plan', handleAiExplainOrCopilot);
  app.post('/api/ai/copilot', handleAiExplainOrCopilot);

  // 5. Privileged Server-Side Plan Generation (Engineering Correction #3 & #4)
  app.post('/api/plans/generate', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      const {
        planId = 'active',
        profile,
        tasks,
        routines,
        existingBlocks = [],
        horizonStartDate,
        horizonEndDate,
        cutoffIso = new Date().toISOString(),
        baseVersion = null,
      } = req.body || {};

      if (!profile || !Array.isArray(tasks) || !Array.isArray(routines) || !horizonStartDate || !horizonEndDate) {
        res.status(400).json({ error: 'Invalid schedule generation payload.' });
        return;
      }

      if (profile.userId && profile.userId !== authCtx.uid && !authCtx.isDemo) {
        res.status(403).json({ error: 'FORBIDDEN: Profile userId does not match authenticated token.' });
        return;
      }

      const scheduleResult = generateDeterministicSchedule({
        userId: authCtx.uid,
        planId,
        scheduleVersion: (Number(baseVersion) || 0) + 1,
        profile,
        tasks,
        routines,
        existingBlocks,
        horizonStartDate,
        horizonEndDate,
        cutoffIso,
        sourceLabel: 'scheduler',
      });

      if (authCtx.isDemo) {
        const nextVersion = (Number(baseVersion) || 0) + 1;
        res.json({
          scheduleResult,
          plan: {
            id: planId,
            userId: authCtx.uid,
            horizonStart: horizonStartDate,
            horizonEnd: horizonEndDate,
            currentVersion: nextVersion,
            status: 'active',
            lastReason: `Generated schedule (${horizonStartDate} to ${horizonEndDate})`,
            updatedAt: new Date().toISOString(),
          },
          version: nextVersion,
        });
        return;
      }

      const persisted = await persistServerValidatedPlanTransition({
        uid: authCtx.uid,
        idToken: authCtx.idToken,
        planId,
        horizonStartDate,
        horizonEndDate,
        expectedBaseVersion: baseVersion !== null && baseVersion !== undefined ? Number(baseVersion) : null,
        reason: `Generated schedule (${horizonStartDate} to ${horizonEndDate})`,
        summaryText: `Scheduled ${scheduleResult.blocks.length} blocks (${scheduleResult.unscheduledTasks.length} unscheduled, ${scheduleResult.conflicts.length} conflicts).`,
        newBlocks: scheduleResult.blocks,
        activityAction: 'plan_generated',
      });

      res.json({
        scheduleResult: {
          ...scheduleResult,
          blocks: scheduleResult.blocks.map((b) => ({
            ...b,
            scheduleVersion: persisted.newVersion,
          })),
        },
        plan: persisted.plan,
        planVersion: persisted.planVersion,
        version: persisted.newVersion,
      });
    } catch (err: any) {
      const status = err.statusCode || (String(err.message).startsWith('UNAUTHORIZED') ? 401 : 500);
      res.status(status).json({ error: err.message || 'Failed to generate plan', code: err.code });
    }
  });

  // 6. Reality Shift Preview Endpoint (Isolated, Never Mutates Live Data)
  app.post('/api/plans/preview-replan', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      const {
        planId = 'active',
        baseVersion = 1,
        profile,
        tasks,
        routines,
        currentBlocks,
        horizonStartDate,
        horizonEndDate,
        cutoffIso = new Date().toISOString(),
        changeSpec,
      } = req.body || {};

      if (!profile || !Array.isArray(tasks) || !Array.isArray(currentBlocks) || !changeSpec) {
        res.status(400).json({ error: 'Missing required fields for Reality Shift preview.' });
        return;
      }

      const preview = computeRealityShiftPreview({
        userId: authCtx.uid,
        planId,
        baseVersion: Number(baseVersion) || 1,
        profile,
        tasks,
        routines: Array.isArray(routines) ? routines : [],
        currentBlocks,
        horizonStartDate,
        horizonEndDate,
        cutoffIso,
        changeSpec,
      });

      res.json({ preview });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Failed to compute preview' });
    }
  });

  // 7. Privileged Reality Shift Apply Endpoint (Server Version Check + Bounded Chunks)
  app.post('/api/plans/apply-replan', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      const {
        planId = 'active',
        baseVersion,
        horizonStartDate,
        horizonEndDate,
        reason = 'Reality Shift Replan',
        summaryText = '',
        afterBlocks,
      } = req.body || {};

      if (typeof baseVersion !== 'number' || !Array.isArray(afterBlocks) || !horizonStartDate || !horizonEndDate) {
        res.status(400).json({ error: 'Invalid apply-replan payload.' });
        return;
      }

      if (authCtx.isDemo) {
        const nextVersion = baseVersion + 1;
        res.json({
          version: nextVersion,
          plan: {
            id: planId,
            userId: authCtx.uid,
            horizonStart: horizonStartDate,
            horizonEnd: horizonEndDate,
            currentVersion: nextVersion,
            status: 'active',
            lastReason: reason,
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const persisted = await persistServerValidatedPlanTransition({
        uid: authCtx.uid,
        idToken: authCtx.idToken,
        planId,
        horizonStartDate,
        horizonEndDate,
        expectedBaseVersion: baseVersion,
        reason,
        summaryText,
        newBlocks: afterBlocks,
        activityAction: 'reality_shift_applied',
      });

      res.json({
        version: persisted.newVersion,
        plan: persisted.plan,
        planVersion: persisted.planVersion,
      });
    } catch (err: any) {
      const status = err.statusCode || (String(err.message).startsWith('UNAUTHORIZED') ? 401 : 500);
      res.status(status).json({ error: err.message || 'Failed to apply replan', code: err.code });
    }
  });

  // 8. Privileged Server-Side Undo Endpoint (Restores Prior Version Snapshot Safely)
  app.post('/api/plans/undo', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      const {
        planId = 'active',
        currentVersion,
        targetVersion,
        fallbackBlocks,
        horizonStartDate,
        horizonEndDate,
      } = req.body || {};

      if (typeof currentVersion !== 'number') {
        res.status(400).json({ error: 'Provide currentVersion to undo.' });
        return;
      }

      if (authCtx.isDemo) {
        const nextVersion = currentVersion + 1;
        res.json({
          version: nextVersion,
          restoredBlocks: Array.isArray(fallbackBlocks) ? fallbackBlocks : [],
          plan: {
            id: planId,
            userId: authCtx.uid,
            horizonStart: horizonStartDate || '2026-10-30',
            horizonEnd: horizonEndDate || '2026-11-05',
            currentVersion: nextVersion,
            status: 'active',
            lastReason: `Undo to version ${targetVersion || Math.max(1, currentVersion - 1)}`,
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const restoreVer = typeof targetVersion === 'number' ? targetVersion : currentVersion - 1;
      if (restoreVer < 1) {
        res.status(400).json({ error: 'No earlier schedule version exists to restore.' });
        return;
      }

      const chunkDocs = await firestoreListCollection(
        `users/${authCtx.uid}/planVersions/v_${restoreVer}/chunks`,
        authCtx.idToken
      );

      let restoredBlocks: ScheduleBlock[] = [];
      if (chunkDocs.length > 0) {
        chunkDocs.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
        for (const c of chunkDocs) {
          if (Array.isArray(c.blocks)) {
            restoredBlocks.push(...c.blocks);
          }
        }
      } else if (Array.isArray(fallbackBlocks)) {
        restoredBlocks = fallbackBlocks;
      }

      const persisted = await persistServerValidatedPlanTransition({
        uid: authCtx.uid,
        idToken: authCtx.idToken,
        planId,
        horizonStartDate: horizonStartDate || new Date().toISOString().slice(0, 10),
        horizonEndDate: horizonEndDate || new Date().toISOString().slice(0, 10),
        expectedBaseVersion: currentVersion,
        reason: `Undo: Restored schedule state from v${restoreVer}`,
        summaryText: `Restored ${restoredBlocks.length} blocks from version v${restoreVer}.`,
        newBlocks: restoredBlocks,
        activityAction: 'plan_undone',
      });

      res.json({
        version: persisted.newVersion,
        restoredBlocks: restoredBlocks.map((b) => ({
          ...b,
          scheduleVersion: persisted.newVersion,
        })),
        plan: persisted.plan,
        planVersion: persisted.planVersion,
      });
    } catch (err: any) {
      const status = err.statusCode || (String(err.message).startsWith('UNAUTHORIZED') ? 401 : 500);
      res.status(status).json({ error: err.message || 'Failed to undo plan', code: err.code });
    }
  });

  // 9. Isolated What-If Simulation Endpoint
  app.post('/api/simulations/run', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      const {
        baseVersion = 1,
        profile,
        tasks,
        routines,
        currentBlocks,
        horizonStartDate,
        horizonEndDate,
        cutoffIso = new Date().toISOString(),
        changeSpec,
      } = req.body || {};

      if (!profile || !Array.isArray(tasks) || !Array.isArray(currentBlocks) || !changeSpec) {
        res.status(400).json({ error: 'Invalid simulation parameters.' });
        return;
      }

      const simPreview = computeRealityShiftPreview({
        userId: authCtx.uid,
        planId: 'simulation_sandbox',
        baseVersion: Number(baseVersion) || 1,
        profile,
        tasks,
        routines: Array.isArray(routines) ? routines : [],
        currentBlocks,
        horizonStartDate,
        horizonEndDate,
        cutoffIso,
        changeSpec,
      });

      res.json({ simulation: simPreview });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Simulation failed' });
    }
  });

  // 10. Insights Summary Endpoint
  app.get('/api/insights/summary', async (req: Request, res: Response) => {
    try {
      const authCtx = await verifyRequestAuth(req);
      res.json({
        userId: authCtx.uid,
        status: 'ok',
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Unauthorized' });
    }
  });

  // Vite middleware in development, static assets in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LifeOS full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
