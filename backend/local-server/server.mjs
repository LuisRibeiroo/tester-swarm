import http from "node:http";
import { generateKeyPairSync, randomUUID, webcrypto } from "node:crypto";
import path from "node:path";
import { URL, pathToFileURL } from "node:url";

const { subtle } = webcrypto;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const INACTIVE_ENROLLMENT_STATUSES = new Set(["dropped", "rejected", "completed"]);
const ELIGIBLE_FEEDBACK_STATUSES = new Set(["active", "at_risk", "completed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_USER_ID_RE = /^user-[A-Za-z0-9_-]+$/;

function base64UrlEncode(data) {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(str) {
  return new Uint8Array(Buffer.from(str, "base64url"));
}

function parseJwkFromEnv(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kty === "EC" && parsed.crv === "P-256") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveKeyPair(options = {}) {
  const optPriv = options.privateJwk ?? parseJwkFromEnv(process.env.TRACKING_JWT_PRIVATE_JWK);
  const optPub = options.publicJwk ?? parseJwkFromEnv(process.env.TRACKING_JWT_PUBLIC_JWK);

  if (optPriv) {
    const derivedPub = optPub ?? (({ d: _ignored, ...rest }) => rest)(optPriv);
    return { privateJwk: optPriv, publicJwk: derivedPub };
  }

  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk: publicKey.export({ format: "jwk" }),
  };
}

let defaultKeyPair = null;
function getDefaultKeyPair() {
  if (!defaultKeyPair) {
    defaultKeyPair = resolveKeyPair();
  }
  return defaultKeyPair;
}

export async function signTrackingJwt(
  claims,
  { ttlSeconds = 30 * 24 * 3600, privateJwk, now = () => new Date() } = {},
) {
  const jwk = privateJwk ?? getDefaultKeyPair().privateJwk;
  const key = await subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const iat = Math.floor(now().getTime() / 1000);
  const fullClaims = {
    iss: "testerswarm",
    aud: "sdk",
    sub: claims.sub,
    pkg: claims.pkg,
    kind: claims.kind,
    tz: claims.tz,
    iat,
    exp: iat + ttlSeconds,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })),
  );
  const payloadB64 = base64UrlEncode(
    encoder.encode(JSON.stringify(fullClaims)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput),
  );

  return {
    token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`,
    expiresAt: new Date(fullClaims.exp * 1000).toISOString(),
  };
}

export async function verifyTrackingJwt(
  token,
  { publicJwk, now = () => new Date() } = {},
) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  } catch {
    return null;
  }
  if (!header || header.alg !== "ES256") return null;

  const jwk = publicJwk ?? getDefaultKeyPair().publicJwk;
  const key = await subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  const encoder = new TextEncoder();
  const ok = await subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(sigB64),
    encoder.encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }

  const nowSec = Math.floor(now().getTime() / 1000);
  if (
    !payload ||
    payload.iss !== "testerswarm" ||
    payload.aud !== "sdk" ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSec
  ) {
    return null;
  }
  return payload;
}

function getLocalDay(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function sendJson(res, body, status = 200, extraHeaders = {}) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function sendError(res, code, message, status = 400, extra = {}) {
  sendJson(res, { error: code, message, ...extra }, status);
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function decodeJwtPayloadUnsafe(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function createLocalBackend(options = {}) {
  const now = options.now ?? (() => new Date());
  const nowIso = () => now().toISOString();
  const { privateJwk, publicJwk } = resolveKeyPair(options);

  let ledgerSeq = 1;
  let sdkEventSeq = 1;

  const createdAt = nowIso();

  const config = new Map([
    [
      "points",
      {
        required_days: 14,
        min_active_days: 10,
        min_foreground_seconds: 60,
        max_absence_days: 2,
        slots: 12,
        buffer_slots: 3,
        cost_points: 120,
        points_per_active_day: 1,
        bonus_completion: 3,
        bonus_feedback: 2,
        bonus_welcome: 10,
        expire_days: 360,
      },
    ],
    [
      "community",
      {
        google_group_url: "https://groups.google.com/g/testerswarm-testers",
        reddit_community_url: "https://www.reddit.com/r/AndroidAppTesters",
        hub_account_type: "personal",
      },
    ],
  ]);

  const featuredProducts = [
    { id: "featured_24h", duration_hours: 24, reference_usd: 4.99, active: true },
    { id: "featured_72h", duration_hours: 72, reference_usd: 11.99, active: true },
    { id: "featured_7d", duration_hours: 168, reference_usd: 24.99, active: true },
  ];

  const profiles = new Map([
    [
      "user-owner-1",
      {
        id: "user-owner-1",
        display_name: "Owner Example",
        avatar_url: null,
        locale: "pt-BR",
        timezone: "America/Sao_Paulo",
        reputation: 1.0,
        fcm_token: null,
        banned_at: null,
        created_at: createdAt,
      },
    ],
    [
      "user-tester-1",
      {
        id: "user-tester-1",
        display_name: "Tester Example",
        avatar_url: null,
        locale: "pt-BR",
        timezone: "America/Sao_Paulo",
        reputation: 1.0,
        fcm_token: null,
        banned_at: null,
        created_at: createdAt,
      },
    ],
  ]);

  const devices = [
    {
      id: "dev-owner-1",
      user_id: "user-owner-1",
      android_id_hash: "seed-owner-device-hash",
      model: "Pixel 8 Pro",
      sdk_int: 35,
      integrity_ok_at: createdAt,
      last_seen_at: createdAt,
      created_at: createdAt,
    },
  ];

  const apps = [
    {
      id: "app-example-kotlin",
      owner_id: "user-owner-1",
      package_name: "dev.testerswarm.example",
      name: "Tester Swarm Native Example",
      short_description: "App Android nativo Kotlin de exemplo com TesterSwarm SDK.",
      description: "App de exemplo em Kotlin para validação do fluxo 12x14.",
      category: "Tools",
      icon_path: null,
      screenshots: [],
      play_optin_url: "https://play.google.com/apps/testing/dev.testerswarm.example",
      app_key: "ts_pk_example_android_0001",
      signing_cert_sha256: null,
      sdk_debug_ok_at: null,
      sdk_verified_at: null,
      created_at: createdAt,
    },
    {
      id: "app-example-flutter",
      owner_id: "user-owner-1",
      package_name: "dev.testerswarm.example.flutter",
      name: "Tester Swarm Flutter Example",
      short_description: "App Flutter de exemplo com wrapper TesterSwarm SDK.",
      description: "App de exemplo em Flutter para validação do fluxo 12x14.",
      category: "Tools",
      icon_path: null,
      screenshots: [],
      play_optin_url: "https://play.google.com/apps/testing/dev.testerswarm.example.flutter",
      app_key: "ts_pk_example_flutter_0001",
      signing_cert_sha256: null,
      sdk_debug_ok_at: null,
      sdk_verified_at: null,
      created_at: createdAt,
    },
    {
      id: "app-example-rn",
      owner_id: "user-owner-1",
      package_name: "dev.testerswarm.example.rn",
      name: "Tester Swarm React Native Example",
      short_description: "App React Native de exemplo com wrapper TesterSwarm SDK.",
      description: "App de exemplo em React Native para validação do fluxo 12x14.",
      category: "Tools",
      icon_path: null,
      screenshots: [],
      play_optin_url: "https://play.google.com/apps/testing/dev.testerswarm.example.rn",
      app_key: "ts_pk_example_rn_0001",
      signing_cert_sha256: null,
      sdk_debug_ok_at: null,
      sdk_verified_at: null,
      created_at: createdAt,
    },
  ];

  const rules = config.get("points");
  const campaigns = [
    {
      id: "camp-draft-kotlin",
      app_id: "app-example-kotlin",
      status: "draft",
      slots: rules.slots,
      buffer_slots: rules.buffer_slots,
      required_days: rules.required_days,
      min_active_days: rules.min_active_days,
      cost_points: rules.cost_points,
      active_count: 0,
      completed_count: 0,
      published_at: null,
      deadline_at: null,
      completed_at: null,
      created_at: createdAt,
    },
    {
      id: "camp-draft-flutter",
      app_id: "app-example-flutter",
      status: "draft",
      slots: rules.slots,
      buffer_slots: rules.buffer_slots,
      required_days: rules.required_days,
      min_active_days: rules.min_active_days,
      cost_points: rules.cost_points,
      active_count: 0,
      completed_count: 0,
      published_at: null,
      deadline_at: null,
      completed_at: null,
      created_at: createdAt,
    },
    {
      id: "camp-draft-rn",
      app_id: "app-example-rn",
      status: "draft",
      slots: rules.slots,
      buffer_slots: rules.buffer_slots,
      required_days: rules.required_days,
      min_active_days: rules.min_active_days,
      cost_points: rules.cost_points,
      active_count: 0,
      completed_count: 0,
      published_at: null,
      deadline_at: null,
      completed_at: null,
      created_at: createdAt,
    },
  ];

  const enrollments = [
    {
      id: "enr-owner-kotlin",
      campaign_id: "camp-draft-kotlin",
      tester_id: "user-owner-1",
      device_id: "dev-owner-1",
      kind: "owner_validation",
      status: "pending",
      enrolled_at: createdAt,
      first_handshake_at: null,
      streak_days: 0,
      active_days: 0,
      last_present_day: null,
      last_active_day: null,
      completed_at: null,
      dropped_at: null,
      drop_reason: null,
    },
    {
      id: "enr-owner-flutter",
      campaign_id: "camp-draft-flutter",
      tester_id: "user-owner-1",
      device_id: "dev-owner-1",
      kind: "owner_validation",
      status: "pending",
      enrolled_at: createdAt,
      first_handshake_at: null,
      streak_days: 0,
      active_days: 0,
      last_present_day: null,
      last_active_day: null,
      completed_at: null,
      dropped_at: null,
      drop_reason: null,
    },
    {
      id: "enr-owner-rn",
      campaign_id: "camp-draft-rn",
      tester_id: "user-owner-1",
      device_id: "dev-owner-1",
      kind: "owner_validation",
      status: "pending",
      enrolled_at: createdAt,
      first_handshake_at: null,
      streak_days: 0,
      active_days: 0,
      last_present_day: null,
      last_active_day: null,
      completed_at: null,
      dropped_at: null,
      drop_reason: null,
    },
  ];

  const dailyActivity = new Map();
  const sdkEvents = [];
  const creditedDays = new Set();

  const pointsLedger = [
    {
      id: ledgerSeq++,
      user_id: "user-owner-1",
      kind: "admin_adjust",
      bucket: "available",
      amount: 400,
      ref_type: "seed",
      ref_id: null,
      created_at: createdAt,
    },
    {
      id: ledgerSeq++,
      user_id: "user-tester-1",
      kind: "bonus_completion",
      bucket: "available",
      amount: 125,
      ref_type: "seed",
      ref_id: null,
      created_at: createdAt,
    },
  ];

  const feedbacks = [];
  const purchases = [];
  const featuredBookings = [];
  const featuredCredits = [];

  function ensureProfile(userId) {
    if (!profiles.has(userId)) {
      profiles.set(userId, {
        id: userId,
        display_name: userId,
        avatar_url: null,
        locale: "pt-BR",
        timezone: "America/Sao_Paulo",
        reputation: 1.0,
        fcm_token: null,
        banned_at: null,
        created_at: nowIso(),
      });
    }
    return profiles.get(userId);
  }

  function authenticate(req) {
    const rawHeaderUser = req.headers["x-user-id"];
    if (typeof rawHeaderUser === "string" && rawHeaderUser.trim().length > 0) {
      const uid = rawHeaderUser.trim();
      ensureProfile(uid);
      return { userId: uid };
    }

    const authHeader = req.headers["authorization"];
    if (typeof authHeader !== "string" || !authHeader.toLowerCase().startsWith("bearer ")) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    if (profiles.has(token) || UUID_RE.test(token) || LOCAL_USER_ID_RE.test(token)) {
      ensureProfile(token);
      return { userId: token };
    }

    if (token.startsWith("local:") && token.length > 6) {
      const uid = token.slice(6).trim();
      if (!uid) return null;
      ensureProfile(uid);
      return { userId: uid };
    }

    const payload = decodeJwtPayloadUnsafe(token);
    if (payload?.aud === "sdk") return null;
    const sub = payload?.sub ?? payload?.user_id;
    if (typeof sub === "string" && sub.trim().length > 0) {
      const uid = sub.trim();
      ensureProfile(uid);
      return { userId: uid };
    }

    return null;
  }

  function getWallet(userId) {
    let available = 0;
    let pending = 0;
    for (const entry of pointsLedger) {
      if (entry.user_id !== userId) continue;
      if (entry.bucket === "available") available += entry.amount;
      if (entry.bucket === "pending") pending += entry.amount;
    }
    return { available, pending };
  }

  function computeAllWallets() {
    const out = {};
    for (const userId of profiles.keys()) {
      out[userId] = getWallet(userId);
    }
    return out;
  }

  function appendLedger({ user_id, kind, bucket, amount, ref_type = null, ref_id = null }) {
    const entry = {
      id: ledgerSeq++,
      user_id,
      kind,
      bucket,
      amount,
      ref_type,
      ref_id,
      created_at: nowIso(),
    };
    pointsLedger.push(entry);
    return entry;
  }

  function syncCampaignCounters(campaignId) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    let activeCount = 0;
    let completedCount = 0;
    for (const enr of enrollments) {
      if (enr.campaign_id !== campaignId || enr.kind !== "tester") continue;
      if (enr.status === "active" || enr.status === "at_risk") activeCount += 1;
      if (enr.status === "completed") completedCount += 1;
    }
    campaign.active_count = activeCount;
    campaign.completed_count = completedCount;
  }

  function findLiveCampaign(appId) {
    return campaigns.find(
      (c) => c.app_id === appId && (c.status === "recruiting" || c.status === "in_progress"),
    );
  }

  function ensureOwnerValidationEnrollment(appId, userId) {
    const app = apps.find((a) => a.id === appId);
    if (!app || app.owner_id !== userId) return null;

    const appCampaignIds = new Set(
      campaigns.filter((c) => c.app_id === app.id).map((c) => c.id),
    );
    const existing = enrollments.find(
      (e) =>
        appCampaignIds.has(e.campaign_id) &&
        e.tester_id === userId &&
        e.kind === "owner_validation" &&
        !INACTIVE_ENROLLMENT_STATUSES.has(e.status),
    );
    if (existing) return existing;

    let draftCampaign = campaigns.find((c) => c.app_id === app.id && c.status === "draft");
    if (!draftCampaign) {
      const pts = config.get("points");
      draftCampaign = {
        id: `camp-${randomUUID()}`,
        app_id: app.id,
        status: "draft",
        slots: pts.slots,
        buffer_slots: pts.buffer_slots,
        required_days: pts.required_days,
        min_active_days: pts.min_active_days,
        cost_points: pts.cost_points,
        active_count: 0,
        completed_count: 0,
        published_at: null,
        deadline_at: null,
        completed_at: null,
        created_at: nowIso(),
      };
      campaigns.push(draftCampaign);
    }

    let ownerDevice = devices.find((d) => d.user_id === userId);
    if (!ownerDevice) {
      ownerDevice = {
        id: `dev-${randomUUID()}`,
        user_id: userId,
        android_id_hash: `owner-hash-${userId}`,
        model: "Local Validation Device",
        sdk_int: 35,
        integrity_ok_at: nowIso(),
        last_seen_at: nowIso(),
        created_at: nowIso(),
      };
      devices.push(ownerDevice);
    }

    const created = {
      id: `enr-${randomUUID()}`,
      campaign_id: draftCampaign.id,
      tester_id: userId,
      device_id: ownerDevice.id,
      kind: "owner_validation",
      status: "pending",
      enrolled_at: nowIso(),
      first_handshake_at: null,
      streak_days: 0,
      active_days: 0,
      last_present_day: null,
      last_active_day: null,
      completed_at: null,
      dropped_at: null,
      drop_reason: null,
    };
    enrollments.push(created);
    return created;
  }

  function getSnapshot() {
    return {
      config: Object.fromEntries(config),
      featured_products: featuredProducts.map((p) => ({ ...p })),
      profiles: Array.from(profiles.values()).map((p) => ({ ...p })),
      devices: devices.map((d) => ({ ...d })),
      apps: apps.map((a) => ({ ...a })),
      campaigns: campaigns.map((c) => ({ ...c })),
      enrollments: enrollments.map((e) => ({ ...e })),
      daily_activity: Array.from(dailyActivity.values()).map((d) => ({
        ...d,
        sources: [...d.sources],
      })),
      sdk_events: sdkEvents.map((ev) => ({ ...ev })),
      points_ledger: pointsLedger.map((l) => ({ ...l })),
      wallets: computeAllWallets(),
      feedback: feedbacks.map((f) => ({ ...f })),
      purchases: purchases.map((p) => ({ ...p })),
      featured_bookings: featuredBookings.map((b) => ({ ...b })),
      featured_credits: featuredCredits.map((c) => ({ ...c })),
    };
  }

  async function handleDeviceRegister(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    if (!body?.android_id_hash) {
      return sendError(res, "missing_android_id_hash", "android_id_hash is required", 400);
    }

    const existing = devices.find((d) => d.android_id_hash === body.android_id_hash);
    if (existing && existing.user_id !== auth.userId) {
      return sendError(res, "device_bound_other_account", "One account per device enforced", 409);
    }

    const integrityPassed = Boolean(
      typeof body.integrity_token === "string" && body.integrity_token.length >= 8,
    );
    const ts = nowIso();

    let device;
    if (existing) {
      existing.model = body.model ?? existing.model;
      existing.sdk_int = body.sdk_int ?? existing.sdk_int;
      existing.integrity_ok_at = integrityPassed ? ts : null;
      existing.last_seen_at = ts;
      device = existing;
    } else {
      device = {
        id: randomUUID(),
        user_id: auth.userId,
        android_id_hash: body.android_id_hash,
        model: body.model ?? null,
        sdk_int: body.sdk_int ?? null,
        integrity_ok_at: integrityPassed ? ts : null,
        last_seen_at: ts,
        created_at: ts,
      };
      devices.push(device);
    }

    let welcomeAwarded = false;
    if (integrityPassed) {
      const hasWelcome = pointsLedger.some(
        (entry) => entry.user_id === auth.userId && entry.kind === "bonus_welcome",
      );
      if (!hasWelcome) {
        const welcomePts = config.get("points")?.bonus_welcome ?? 10;
        appendLedger({
          user_id: auth.userId,
          kind: "bonus_welcome",
          bucket: "available",
          amount: welcomePts,
          ref_type: "device",
          ref_id: device.id,
        });
        welcomeAwarded = true;
      }
    }

    return sendJson(res, { device_id: device.id, welcome_awarded: welcomeAwarded });
  }

  async function handleTrackingToken(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    let enrollment = null;
    if (body?.enrollment_id) {
      enrollment = enrollments.find((e) => e.id === body.enrollment_id) ?? null;
    } else if (body?.app_id || body?.package_name) {
      const targetApp = apps.find(
        (a) =>
          (body.app_id && a.id === body.app_id) ||
          (body.package_name && a.package_name === body.package_name),
      );
      if (!targetApp || targetApp.owner_id !== auth.userId) {
        return sendError(res, "forbidden", "App not found for owner", 403);
      }
      enrollment = ensureOwnerValidationEnrollment(targetApp.id, auth.userId);
    } else {
      return sendError(res, "missing_enrollment_id", "enrollment_id is required", 400);
    }

    if (!enrollment || enrollment.tester_id !== auth.userId) {
      return sendError(res, "forbidden", "Enrollment not found for user", 403);
    }

    if (INACTIVE_ENROLLMENT_STATUSES.has(enrollment.status)) {
      return sendError(res, "enrollment_inactive", "Enrollment is no longer active", 409);
    }

    const campaign = campaigns.find((c) => c.id === enrollment.campaign_id);
    const app = campaign ? apps.find((a) => a.id === campaign.app_id) : null;
    if (!app) {
      return sendError(res, "forbidden", "App not found for enrollment", 403);
    }

    const profile = profiles.get(auth.userId);
    const { token, expiresAt } = await signTrackingJwt(
      {
        sub: enrollment.id,
        pkg: app.package_name,
        kind: enrollment.kind,
        tz: profile?.timezone ?? "America/Sao_Paulo",
      },
      { privateJwk, now },
    );

    return sendJson(res, { token, expires_at: expiresAt });
  }

  async function handleSdkHandshake(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    if (!body?.appKey || !body?.packageName || !body?.installId || !body?.signingCertSha256) {
      return sendError(res, "missing_fields", "Missing required handshake fields", 400);
    }

    const app = apps.find((a) => a.app_key === body.appKey);
    if (!app || app.package_name !== body.packageName) {
      return sendError(res, "invalid_app_key", "appKey does not match packageName", 403);
    }

    const liveCampaign = findLiveCampaign(app.id);
    if (!body.token) {
      const enabled = Boolean(liveCampaign) || !app.sdk_verified_at;
      return sendJson(res, {
        status: enabled ? "not_enrolled" : "disabled",
        enabled,
        flushIntervalSec: 30,
      });
    }

    const claims = await verifyTrackingJwt(body.token, { publicJwk, now });
    if (!claims || claims.pkg !== body.packageName) {
      return sendError(res, "invalid_token", "Invalid or mismatched tracking token", 403);
    }

    const enrollment = enrollments.find((e) => e.id === claims.sub);
    if (!enrollment || INACTIVE_ENROLLMENT_STATUSES.has(enrollment.status)) {
      return sendJson(res, { status: "disabled", enabled: false, flushIntervalSec: 60 });
    }

    const enrollmentCampaign = campaigns.find((c) => c.id === enrollment.campaign_id);
    if (!enrollmentCampaign || enrollmentCampaign.app_id !== app.id) {
      return sendError(res, "invalid_token", "Token enrollment does not belong to app", 403);
    }

    const isPlayInstaller = body.installer === "com.android.vending";
    const debuggable = Boolean(body.debuggable);
    const ts = nowIso();

    if (enrollment.kind === "owner_validation") {
      if (isPlayInstaller && !debuggable) {
        app.signing_cert_sha256 = app.signing_cert_sha256 ?? body.signingCertSha256;
        app.sdk_verified_at = ts;
      } else {
        app.sdk_debug_ok_at = ts;
      }
    } else {
      const strictPlayStore =
        body.strictPlayStore === true || process.env.STRICT_PLAY_STORE === "true";
      if (strictPlayStore && (!isPlayInstaller || debuggable)) {
        return sendError(
          res,
          "invalid_install_source",
          "Closed test build must come from Play Store",
          403,
        );
      }
      if (
        (strictPlayStore || !debuggable) &&
        app.signing_cert_sha256 &&
        app.signing_cert_sha256 !== body.signingCertSha256
      ) {
        return sendError(res, "cert_mismatch", "Signing certificate mismatch", 403);
      }
    }

    if (enrollment.status === "pending") {
      enrollment.status = "active";
      enrollment.first_handshake_at = ts;
      syncCampaignCounters(enrollment.campaign_id);
    }

    sdkEvents.push({
      id: sdkEventSeq++,
      received_at: ts,
      app_id: app.id,
      enrollment_id: enrollment.id,
      install_id: body.installId,
      event_id: `hs_${body.installId}_${now().getTime()}`,
      type: "handshake",
      payload: {
        versionCode: body.versionCode ?? 1,
        installer: body.installer ?? null,
        debuggable,
        sdk: {
          platform: body.sdk?.platform ?? "android",
          version: body.sdk?.version ?? "1.0.0",
          wrapper: body.sdk?.wrapper === undefined ? null : body.sdk.wrapper,
        },
      },
    });

    return sendJson(res, { status: "tracking", enabled: true, flushIntervalSec: 30 });
  }

  async function handleSdkEvents(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    if (!body?.appKey || !body?.packageName || !body?.token || !Array.isArray(body.events)) {
      return sendError(res, "missing_fields", "Missing required fields", 400);
    }

    const claims = await verifyTrackingJwt(body.token, { publicJwk, now });
    if (!claims || claims.pkg !== body.packageName) {
      return sendError(res, "invalid_token", "Invalid or expired tracking token", 403);
    }

    const app = apps.find((a) => a.app_key === body.appKey);
    if (!app || app.package_name !== body.packageName) {
      return sendError(res, "invalid_app_key", "Unknown appKey", 403);
    }

    const enrollment = enrollments.find((e) => e.id === claims.sub);
    if (!enrollment || !["active", "at_risk"].includes(enrollment.status)) {
      return sendJson(res, { accepted: [], enabled: false });
    }

    const installId = body.installId ?? "";
    const accepted = [];
    let addedFgSeconds = 0;
    let addedSessions = 0;
    const ts = nowIso();

    for (const ev of body.events.slice(0, 100)) {
      if (!ev?.id || (ev.type !== "ping" && ev.type !== "session")) continue;

      const duplicate = sdkEvents.some(
        (existing) =>
          existing.app_id === app.id &&
          existing.install_id === installId &&
          existing.event_id === ev.id,
      );
      if (duplicate) {
        accepted.push(ev.id);
        continue;
      }

      sdkEvents.push({
        id: sdkEventSeq++,
        received_at: ts,
        app_id: app.id,
        enrollment_id: enrollment.id,
        install_id: installId,
        event_id: ev.id,
        type: ev.type,
        payload: ev,
      });

      accepted.push(ev.id);
      if (ev.type === "session" && typeof ev.foregroundMs === "number" && ev.foregroundMs > 0) {
        const cappedSec = Math.min(Math.floor(ev.foregroundMs / 1000), 4 * 3600);
        addedFgSeconds += cappedSec;
        addedSessions += 1;
      }
    }

    const day = getLocalDay(claims.tz, now());
    const activityKey = `${enrollment.id}:${day}`;
    const currentDay = dailyActivity.get(activityKey);
    const nextFgSeconds = (currentDay?.foreground_seconds ?? 0) + addedFgSeconds;
    const nextSessions = (currentDay?.sessions ?? 0) + addedSessions;
    const mergedSources = Array.from(new Set([...(currentDay?.sources ?? []), "sdk"]));

    dailyActivity.set(activityKey, {
      enrollment_id: enrollment.id,
      day,
      present: true,
      foreground_seconds: nextFgSeconds,
      sessions: nextSessions,
      sources: mergedSources,
    });

    enrollment.last_present_day = day;
    if (enrollment.status === "at_risk") {
      enrollment.status = "active";
      syncCampaignCounters(enrollment.campaign_id);
    }

    const ptsCfg = config.get("points");
    const minFgSeconds = ptsCfg?.min_foreground_seconds ?? 60;
    const pointsPerActiveDay = ptsCfg?.points_per_active_day ?? 1;

    if (nextFgSeconds >= minFgSeconds && !creditedDays.has(activityKey)) {
      creditedDays.add(activityKey);
      enrollment.active_days += 1;
      enrollment.streak_days += 1;
      enrollment.last_active_day = day;

      if (enrollment.kind === "tester") {
        appendLedger({
          user_id: enrollment.tester_id,
          kind: "earn_pending",
          bucket: "pending",
          amount: pointsPerActiveDay,
          ref_type: "enrollment",
          ref_id: enrollment.id,
        });
      }
    }

    return sendJson(res, { accepted, enabled: true });
  }

  async function handleHubPresence(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    const packages = Array.isArray(body?.packages) ? body.packages : [];
    const profile = profiles.get(auth.userId);
    const day = getLocalDay(profile?.timezone ?? "America/Sao_Paulo", now());

    let recorded = 0;
    for (const enr of enrollments) {
      if (enr.tester_id !== auth.userId) continue;
      if (!["active", "at_risk"].includes(enr.status)) continue;

      const campaign = campaigns.find((c) => c.id === enr.campaign_id);
      const app = campaign ? apps.find((a) => a.id === campaign.app_id) : null;
      if (!app || !packages.includes(app.package_name)) continue;

      const activityKey = `${enr.id}:${day}`;
      const existing = dailyActivity.get(activityKey);
      const sources = Array.from(new Set([...(existing?.sources ?? []), "hub_presence"]));

      dailyActivity.set(activityKey, {
        enrollment_id: enr.id,
        day,
        present: true,
        foreground_seconds: existing?.foreground_seconds ?? 0,
        sessions: existing?.sessions ?? 0,
        sources,
      });

      enr.last_present_day = day;
      recorded += 1;
    }

    return sendJson(res, { day, recorded });
  }

  function handleSdkConfig(req, res, url) {
    const appKey = url.searchParams.get("appKey");
    if (!appKey) {
      return sendError(res, "missing_app_key", "Query param appKey is required", 400);
    }

    const cacheHeaders = { "Cache-Control": "public, max-age=300" };
    const app = apps.find((a) => a.app_key === appKey);
    if (!app) {
      return sendJson(res, { enabled: false, flushIntervalSec: 60 }, 200, cacheHeaders);
    }

    const liveCampaign = findLiveCampaign(app.id);
    const enabled = Boolean(liveCampaign) || !app.sdk_verified_at;
    return sendJson(res, { enabled, flushIntervalSec: 30 }, 200, cacheHeaders);
  }

  async function handleRpcPublishCampaign(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    const appId = body?.p_app_id;
    if (!appId) {
      return sendError(res, "missing_app_id", "p_app_id is required", 400);
    }

    const app = apps.find((a) => a.id === appId);
    if (!app || app.owner_id !== auth.userId) {
      return sendError(res, "app_not_found_or_forbidden", "app_not_found_or_forbidden", 403);
    }

    if (!app.sdk_verified_at) {
      return sendError(res, "sdk_not_verified", "sdk_not_verified", 400);
    }

    if (findLiveCampaign(app.id)) {
      return sendError(res, "campaign_already_live", "campaign_already_live", 409);
    }

    const ptsCfg = config.get("points");
    const cost = ptsCfg?.cost_points ?? 120;
    const slots = ptsCfg?.slots ?? 12;
    const bufferSlots = ptsCfg?.buffer_slots ?? 3;
    const requiredDays = ptsCfg?.required_days ?? 14;
    const minActiveDays = ptsCfg?.min_active_days ?? 10;

    const { available } = getWallet(auth.userId);
    if (available < cost) {
      return sendError(res, "insufficient_points", "insufficient_points", 400);
    }

    const publishedAt = now();
    const deadlineAt = new Date(publishedAt.getTime() + 45 * 24 * 3600 * 1000);
    const campaign = {
      id: randomUUID(),
      app_id: app.id,
      status: "recruiting",
      slots,
      buffer_slots: bufferSlots,
      required_days: requiredDays,
      min_active_days: minActiveDays,
      cost_points: cost,
      active_count: 0,
      completed_count: 0,
      published_at: publishedAt.toISOString(),
      deadline_at: deadlineAt.toISOString(),
      completed_at: null,
      created_at: publishedAt.toISOString(),
    };
    campaigns.push(campaign);

    appendLedger({
      user_id: auth.userId,
      kind: "spend_campaign",
      bucket: "available",
      amount: -cost,
      ref_type: "campaign",
      ref_id: campaign.id,
    });

    return sendJson(res, {
      id: campaign.id,
      campaign_id: campaign.id,
      status: campaign.status,
      campaign,
    });
  }

  async function handleRpcEnrollInCampaign(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    const { p_campaign_id: campaignId, p_device_id: deviceId } = body ?? {};
    if (!campaignId || !deviceId) {
      return sendError(res, "missing_fields", "p_campaign_id and p_device_id are required", 400);
    }

    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign || campaign.status !== "recruiting") {
      return sendError(res, "campaign_not_recruiting", "campaign_not_recruiting", 400);
    }

    const app = apps.find((a) => a.id === campaign.app_id);
    if (app && app.owner_id === auth.userId) {
      return sendError(res, "cannot_test_own_app", "cannot_test_own_app", 403);
    }

    if (campaign.active_count + campaign.completed_count >= campaign.slots + campaign.buffer_slots) {
      return sendError(res, "campaign_full", "campaign_full", 409);
    }

    const device = devices.find((d) => d.id === deviceId && d.user_id === auth.userId);
    if (!device) {
      return sendError(res, "invalid_device", "invalid_device", 400);
    }

    const duplicate = enrollments.find(
      (e) => e.campaign_id === campaign.id && e.tester_id === auth.userId,
    );
    if (duplicate) {
      return sendError(res, "already_enrolled", "already_enrolled", 409);
    }

    const profile = profiles.get(auth.userId);
    const maxEnrollments = (profile?.reputation ?? 1.0) < 0.5 ? 5 : 20;
    const activeEnrollments = enrollments.filter(
      (e) => e.tester_id === auth.userId && ["pending", "active", "at_risk"].includes(e.status),
    ).length;
    if (activeEnrollments >= maxEnrollments) {
      return sendError(res, "enrollment_limit_reached", "enrollment_limit_reached", 409);
    }

    const enrollment = {
      id: randomUUID(),
      campaign_id: campaign.id,
      tester_id: auth.userId,
      device_id: deviceId,
      kind: "tester",
      status: "pending",
      enrolled_at: nowIso(),
      first_handshake_at: null,
      streak_days: 0,
      active_days: 0,
      last_present_day: null,
      last_active_day: null,
      completed_at: null,
      dropped_at: null,
      drop_reason: null,
    };
    enrollments.push(enrollment);

    return sendJson(res, {
      id: enrollment.id,
      enrollment_id: enrollment.id,
      status: enrollment.status,
      enrollment,
    });
  }

  async function handleRpcSubmitFeedback(req, res) {
    const auth = authenticate(req);
    if (!auth) {
      return sendError(res, "unauthorized", "Valid Bearer token required", 401);
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendError(res, "invalid_json", "Malformed JSON body", 400);
    }

    const {
      p_enrollment_id: enrollmentId,
      p_rating: rating,
      p_liked: liked,
      p_issues: issues,
      p_suggestion: suggestion,
    } = body ?? {};

    if (!enrollmentId) {
      return sendError(res, "missing_enrollment_id", "p_enrollment_id is required", 400);
    }

    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendError(res, "invalid_rating", "p_rating must be an integer between 1 and 5", 400);
    }

    const enrollment = enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment || enrollment.tester_id !== auth.userId) {
      return sendError(res, "enrollment_not_found_or_forbidden", "enrollment_not_found_or_forbidden", 403);
    }

    if (!ELIGIBLE_FEEDBACK_STATUSES.has(enrollment.status)) {
      return sendError(res, "enrollment_not_eligible", "enrollment_not_eligible", 400);
    }

    if (feedbacks.some((f) => f.enrollment_id === enrollmentId)) {
      return sendError(res, "feedback_already_submitted", "feedback_already_submitted", 409);
    }

    const likedText = typeof liked === "string" ? liked.trim() : "";
    const issuesText = typeof issues === "string" ? issues.trim() : "";
    const suggestionText = typeof suggestion === "string" ? suggestion.trim() : "";
    const totalLen = likedText.length + issuesText.length + suggestionText.length;
    const status = totalLen >= 30 ? "approved" : "submitted";

    const feedback = {
      id: randomUUID(),
      enrollment_id: enrollmentId,
      rating,
      liked: liked ?? null,
      issues: issues ?? null,
      suggestion: suggestion ?? null,
      status,
      created_at: nowIso(),
    };
    feedbacks.push(feedback);

    const bonusAmount = config.get("points")?.bonus_feedback ?? 2;
    let bonusAwarded = 0;
    if (status === "approved") {
      appendLedger({
        user_id: auth.userId,
        kind: "bonus_feedback",
        bucket: "available",
        amount: bonusAmount,
        ref_type: "feedback",
        ref_id: feedback.id,
      });
      bonusAwarded = bonusAmount;
    }

    return sendJson(res, {
      id: feedback.id,
      feedback_id: feedback.id,
      status,
      bonus_awarded: bonusAwarded,
      feedback,
    });
  }

  async function handleRequest(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { pathname } = url;
    const method = req.method ?? "GET";

    if (method === "GET" && pathname === "/health") {
      return sendJson(res, {
        ok: true,
        apps: apps.length,
        campaigns: campaigns.length,
        enrollments: enrollments.length,
      });
    }

    if (method === "GET" && pathname === "/rest/v1/state") {
      return sendJson(res, getSnapshot());
    }

    if (method === "POST" && pathname === "/functions/v1/hub-device-register") {
      return handleDeviceRegister(req, res);
    }

    if (method === "POST" && pathname === "/functions/v1/hub-tracking-token") {
      return handleTrackingToken(req, res);
    }

    if (method === "POST" && pathname === "/functions/v1/sdk-handshake") {
      return handleSdkHandshake(req, res);
    }

    if (method === "POST" && pathname === "/functions/v1/sdk-events") {
      return handleSdkEvents(req, res);
    }

    if (method === "POST" && pathname === "/functions/v1/hub-presence") {
      return handleHubPresence(req, res);
    }

    if (method === "GET" && pathname === "/functions/v1/sdk-config") {
      return handleSdkConfig(req, res, url);
    }

    if (method === "POST" && pathname === "/rest/v1/rpc/publish_campaign") {
      return handleRpcPublishCampaign(req, res);
    }

    if (method === "POST" && pathname === "/rest/v1/rpc/enroll_in_campaign") {
      return handleRpcEnrollInCampaign(req, res);
    }

    if (method === "POST" && pathname === "/rest/v1/rpc/submit_feedback") {
      return handleRpcSubmitFeedback(req, res);
    }

    return sendError(res, "not_found", `Route ${method} ${pathname} not found`, 404);
  }

  return {
    privateJwk,
    publicJwk,
    signTrackingJwt: (claims, opts = {}) =>
      signTrackingJwt(claims, { privateJwk, now, ...opts }),
    verifyTrackingJwt: (token, opts = {}) =>
      verifyTrackingJwt(token, { publicJwk, now, ...opts }),
    ensureOwnerValidationEnrollment,
    getWallet,
    getSnapshot,
    handleRequest,
  };
}

export async function startLocalServer(port = 0, options = {}) {
  const backend = options.backend ?? createLocalBackend(options);
  const server = http.createServer((req, res) => {
    Promise.resolve(backend.handleRequest(req, res)).catch((err) => {
      if (!res.headersSent) {
        sendError(res, "internal_error", err?.message ?? "Unexpected error", 500);
      } else {
        res.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once("error", onError);
    const listenArgs = options.host ? [port, options.host] : [port];
    server.listen(...listenArgs, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const hostForUrl = options.host && options.host !== "0.0.0.0" && options.host !== "::"
    ? options.host
    : "127.0.0.1";
  const url = `http://${hostForUrl}:${actualPort}`;

  return {
    server,
    backend,
    port: actualPort,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function resolveEntrypoint(entryPath = process.argv[1]) {
  if (!entryPath) return null;
  return pathToFileURL(path.resolve(entryPath)).href;
}

if (import.meta.url === resolveEntrypoint()) {
  const port = Number(process.env.PORT ?? 54321);
  const { url } = await startLocalServer(port);
  console.log(`TesterSwarm local backend listening on ${url}`);
}
