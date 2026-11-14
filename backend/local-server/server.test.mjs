import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createLocalBackend,
  resolveEntrypoint,
  signTrackingJwt,
  startLocalServer,
  verifyTrackingJwt,
} from "./server.mjs";

async function jsonRequest(baseUrl, pathname, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, body: json };
}

describe("TesterLoop local backend server", () => {
  const serversToClose = [];

  afterEach(async () => {
    while (serversToClose.length > 0) {
      const srv = serversToClose.pop();
      await srv.close();
    }
  });

  async function bootServer(options) {
    const srv = await startLocalServer(0, options);
    serversToClose.push(srv);
    return srv;
  }

  it("exposes /health, /rest/v1/state, /functions/v1/sdk-config and resolveEntrypoint", async () => {
    const srv = await bootServer();

    const health = await jsonRequest(srv.url, "/health");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, {
      ok: true,
      apps: 3,
      campaigns: 3,
      enrollments: 3,
    });

    const stateRes = await jsonRequest(srv.url, "/rest/v1/state");
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.body.config.points.cost_points, 120);
    assert.equal(stateRes.body.featured_products.length, 3);
    assert.deepEqual(stateRes.body.wallets["user-owner-1"], { available: 400, pending: 0 });
    assert.deepEqual(stateRes.body.wallets["user-tester-1"], { available: 125, pending: 0 });

    const cfgRes = await jsonRequest(
      srv.url,
      "/functions/v1/sdk-config?appKey=tl_pk_example_android_0001",
    );
    assert.equal(cfgRes.status, 200);
    assert.deepEqual(cfgRes.body, { enabled: true, flushIntervalSec: 30 });

    const unknownCfg = await jsonRequest(srv.url, "/functions/v1/sdk-config?appKey=unknown");
    assert.equal(unknownCfg.status, 200);
    assert.deepEqual(unknownCfg.body, { enabled: false, flushIntervalSec: 60 });

    const samplePath = path.resolve("backend/local-server/server.mjs");
    assert.equal(resolveEntrypoint(samplePath), pathToFileURL(samplePath).href);
    assert.equal(resolveEntrypoint(), pathToFileURL(process.argv[1]).href);
    assert.equal(resolveEntrypoint(null), null);
    assert.equal(resolveEntrypoint(""), null);
  });

  it("signs and verifies ES256 tracking JWTs and rejects 403 when token is used for another package", async () => {
    const { token, expiresAt } = await signTrackingJwt({
      sub: "enr-owner-kotlin",
      pkg: "io.testerloop.example",
      kind: "owner_validation",
      tz: "America/Sao_Paulo",
    });

    assert.ok(token.split(".").length === 3);
    assert.ok(Date.parse(expiresAt) > Date.now());

    const claims = await verifyTrackingJwt(token);
    assert.ok(claims);
    assert.equal(claims.iss, "testerloop");
    assert.equal(claims.aud, "sdk");
    assert.equal(claims.sub, "enr-owner-kotlin");
    assert.equal(claims.pkg, "io.testerloop.example");
    assert.equal(claims.kind, "owner_validation");
    assert.equal(claims.tz, "America/Sao_Paulo");

    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.invalid_signature_aaaa`;
    assert.equal(await verifyTrackingJwt(tampered), null);

    const expired = await signTrackingJwt(
      {
        sub: "enr-owner-kotlin",
        pkg: "io.testerloop.example",
        kind: "owner_validation",
        tz: "America/Sao_Paulo",
      },
      { ttlSeconds: -10 },
    );
    assert.equal(await verifyTrackingJwt(expired.token), null);

    const srv = await bootServer();
    const tokRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
      method: "POST",
      headers: { Authorization: "Bearer user-owner-1" },
      body: { enrollment_id: "enr-owner-kotlin" },
    });
    assert.equal(tokRes.status, 200);
    assert.ok(tokRes.body.token);
    assert.ok(tokRes.body.expires_at);

    // Token issued for io.testerloop.example sent to io.testerloop.example.flutter -> 403
    const mismatchHandshake = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_flutter_0001",
        packageName: "io.testerloop.example.flutter",
        versionCode: 1,
        signingCertSha256: "CERT:FLUTTER",
        installer: null,
        debuggable: true,
        installId: "inst-mismatch",
        sdk: { platform: "android", version: "1.0.0", wrapper: "flutter" },
        token: tokRes.body.token,
      },
    });
    assert.equal(mismatchHandshake.status, 403);
    assert.equal(mismatchHandshake.body.error, "invalid_token");

    const mismatchEvents = await jsonRequest(srv.url, "/functions/v1/sdk-events", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_flutter_0001",
        packageName: "io.testerloop.example.flutter",
        installId: "inst-mismatch",
        token: tokRes.body.token,
        events: [{ type: "ping", id: "p1", clientTs: Date.now() }],
      },
    });
    assert.equal(mismatchEvents.status, 403);
    assert.equal(mismatchEvents.body.error, "invalid_token");
  });

  it("enforces 1 account per device (409) and awards +10 bonus_welcome once", async () => {
    const srv = await bootServer();

    const unauth = await jsonRequest(srv.url, "/functions/v1/hub-device-register", {
      method: "POST",
      body: { android_id_hash: "hash-device-1" },
    });
    assert.equal(unauth.status, 401);

    const first = await jsonRequest(srv.url, "/functions/v1/hub-device-register", {
      method: "POST",
      headers: { "x-user-id": "user-tester-1" },
      body: {
        android_id_hash: "hash-device-1",
        model: "Pixel 8",
        sdk_int: 35,
        integrity_token: "integrity-ok-token",
      },
    });
    assert.equal(first.status, 200);
    assert.ok(first.body.device_id);
    assert.equal(first.body.welcome_awarded, true);

    assert.deepEqual(srv.backend.getWallet("user-tester-1"), { available: 135, pending: 0 });

    const secondSameUser = await jsonRequest(srv.url, "/functions/v1/hub-device-register", {
      method: "POST",
      headers: { Authorization: "Bearer user-tester-1" },
      body: {
        android_id_hash: "hash-device-1",
        model: "Pixel 8",
        sdk_int: 35,
        integrity_token: "integrity-ok-token-2",
      },
    });
    assert.equal(secondSameUser.status, 200);
    assert.equal(secondSameUser.body.device_id, first.body.device_id);
    assert.equal(secondSameUser.body.welcome_awarded, false);
    assert.deepEqual(srv.backend.getWallet("user-tester-1"), { available: 135, pending: 0 });

    const otherUser = await jsonRequest(srv.url, "/functions/v1/hub-device-register", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: {
        android_id_hash: "hash-device-1",
        integrity_token: "integrity-ok-token",
      },
    });
    assert.equal(otherUser.status, 409);
    assert.equal(otherUser.body.error, "device_bound_other_account");
  });

  it("completes 2-step owner_validation (debug + Play Store TOFU) and publishes campaign (-120 pts)", async () => {
    const srv = await bootServer();

    const prePublish = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_app_id: "app-example-kotlin" },
    });
    assert.equal(prePublish.status, 400);
    assert.equal(prePublish.body.error, "sdk_not_verified");

    const tokenRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { enrollment_id: "enr-owner-kotlin" },
    });
    assert.equal(tokenRes.status, 200);
    const ownerToken = tokenRes.body.token;

    // Step 1: local debug build
    const step1 = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_android_0001",
        packageName: "io.testerloop.example",
        versionCode: 1,
        signingCertSha256: "DEBUG:SHA256",
        installer: null,
        debuggable: true,
        installId: "owner-debug-inst",
        sdk: { platform: "android", version: "1.0.0", wrapper: null },
        token: ownerToken,
      },
    });
    assert.equal(step1.status, 200);
    assert.deepEqual(step1.body, { status: "tracking", enabled: true, flushIntervalSec: 30 });

    let snap = srv.backend.getSnapshot();
    let kotlinApp = snap.apps.find((a) => a.id === "app-example-kotlin");
    assert.ok(kotlinApp.sdk_debug_ok_at);
    assert.equal(kotlinApp.sdk_verified_at, null);

    const afterStep1Publish = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_app_id: "app-example-kotlin" },
    });
    assert.equal(afterStep1Publish.status, 400);
    assert.equal(afterStep1Publish.body.error, "sdk_not_verified");

    // Step 2: Play Store closed track build (TOFU signing cert recorded)
    const step2 = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_android_0001",
        packageName: "io.testerloop.example",
        versionCode: 2,
        signingCertSha256: "PLAY:CERT:SHA256:KOTLIN",
        installer: "com.android.vending",
        debuggable: false,
        installId: "owner-play-inst",
        sdk: { platform: "android", version: "1.0.0", wrapper: null },
        token: ownerToken,
      },
    });
    assert.equal(step2.status, 200);

    snap = srv.backend.getSnapshot();
    kotlinApp = snap.apps.find((a) => a.id === "app-example-kotlin");
    assert.equal(kotlinApp.signing_cert_sha256, "PLAY:CERT:SHA256:KOTLIN");
    assert.ok(kotlinApp.sdk_verified_at);

    const publishRes = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_app_id: "app-example-kotlin" },
    });
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.status, "recruiting");
    assert.deepEqual(srv.backend.getWallet("user-owner-1"), { available: 280, pending: 0 });
  });

  it("blocks app owner from enrolling in their own app campaign (cannot_test_own_app)", async () => {
    const srv = await bootServer();

    const tokRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { enrollment_id: "enr-owner-kotlin" },
    });
    await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_android_0001",
        packageName: "io.testerloop.example",
        versionCode: 2,
        signingCertSha256: "PLAY:CERT:SHA256:KOTLIN",
        installer: "com.android.vending",
        debuggable: false,
        installId: "owner-play-inst",
        sdk: { platform: "android", version: "1.0.0", wrapper: null },
        token: tokRes.body.token,
      },
    });

    const pubRes = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_app_id: "app-example-kotlin" },
    });
    assert.equal(pubRes.status, 200);

    const enrollOwn = await jsonRequest(srv.url, "/rest/v1/rpc/enroll_in_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_campaign_id: pubRes.body.campaign_id, p_device_id: "dev-owner-1" },
    });
    assert.equal(enrollOwn.status, 403);
    assert.equal(enrollOwn.body.error, "cannot_test_own_app");
  });

  it("runs full tester flow across wrappers (null, flutter, react_native), deduplicates 65s events (+1 earn_pending), records hub-presence, and awards +2 bonus_feedback", async () => {
    const srv = await bootServer();

    // Validate & publish all 3 example apps
    const examples = [
      {
        appId: "app-example-kotlin",
        pkg: "io.testerloop.example",
        appKey: "tl_pk_example_android_0001",
        ownerEnr: "enr-owner-kotlin",
        wrapper: null,
      },
      {
        appId: "app-example-flutter",
        pkg: "io.testerloop.example.flutter",
        appKey: "tl_pk_example_flutter_0001",
        ownerEnr: "enr-owner-flutter",
        wrapper: "flutter",
      },
      {
        appId: "app-example-rn",
        pkg: "io.testerloop.example.rn",
        appKey: "tl_pk_example_rn_0001",
        ownerEnr: "enr-owner-rn",
        wrapper: "react_native",
      },
    ];

    const publishedCampaigns = [];
    for (const ex of examples) {
      const tokRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
        method: "POST",
        headers: { "x-user-id": "user-owner-1" },
        body: { enrollment_id: ex.ownerEnr },
      });
      await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
        method: "POST",
        body: {
          appKey: ex.appKey,
          packageName: ex.pkg,
          versionCode: 2,
          signingCertSha256: `CERT:${ex.appId}`,
          installer: "com.android.vending",
          debuggable: false,
          installId: `owner-${ex.appId}`,
          sdk: { platform: "android", version: "1.0.0", wrapper: ex.wrapper },
          token: tokRes.body.token,
        },
      });
      const pubRes = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
        method: "POST",
        headers: { "x-user-id": "user-owner-1" },
        body: { p_app_id: ex.appId },
      });
      assert.equal(pubRes.status, 200);
      publishedCampaigns.push({ ...ex, campaignId: pubRes.body.campaign_id });
    }
    assert.deepEqual(srv.backend.getWallet("user-owner-1"), { available: 40, pending: 0 });

    // Tester registers device (+10 welcome -> 135 available)
    const devRes = await jsonRequest(srv.url, "/functions/v1/hub-device-register", {
      method: "POST",
      headers: { "x-user-id": "user-tester-1" },
      body: {
        android_id_hash: "tester-device-hash",
        model: "Pixel 8",
        sdk_int: 35,
        integrity_token: "play-integrity-valid",
      },
    });
    assert.equal(devRes.status, 200);
    const deviceId = devRes.body.device_id;

    // Tester enrolls in all 3 campaigns and performs sdk-handshake with wrapper preserved
    const testerEnrollments = [];
    for (const camp of publishedCampaigns) {
      const enrRes = await jsonRequest(srv.url, "/rest/v1/rpc/enroll_in_campaign", {
        method: "POST",
        headers: { "x-user-id": "user-tester-1" },
        body: { p_campaign_id: camp.campaignId, p_device_id: deviceId },
      });
      assert.equal(enrRes.status, 200);
      assert.equal(enrRes.body.status, "pending");

      const tokRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
        method: "POST",
        headers: { "x-user-id": "user-tester-1" },
        body: { enrollment_id: enrRes.body.enrollment_id },
      });
      assert.equal(tokRes.status, 200);

      // Verify strictPlayStore rejects debug build when explicitly requested
      const strictReject = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
        method: "POST",
        body: {
          appKey: camp.appKey,
          packageName: camp.pkg,
          versionCode: 1,
          signingCertSha256: "DEBUG:CERT",
          installer: null,
          debuggable: true,
          strictPlayStore: true,
          installId: `tester-${camp.appId}`,
          sdk: { platform: "android", version: "1.0.0", wrapper: camp.wrapper },
          token: tokRes.body.token,
        },
      });
      assert.equal(strictReject.status, 403);
      assert.equal(strictReject.body.error, "invalid_install_source");

      // Local default accepts debug build for emulator testing
      const hsRes = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
        method: "POST",
        body: {
          appKey: camp.appKey,
          packageName: camp.pkg,
          versionCode: 1,
          signingCertSha256: "DEBUG:CERT",
          installer: null,
          debuggable: true,
          installId: `tester-${camp.appId}`,
          sdk: { platform: "android", version: "1.0.0", wrapper: camp.wrapper },
          token: tokRes.body.token,
        },
      });
      assert.equal(hsRes.status, 200);
      assert.deepEqual(hsRes.body, { status: "tracking", enabled: true, flushIntervalSec: 30 });

      testerEnrollments.push({
        ...camp,
        enrollmentId: enrRes.body.enrollment_id,
        token: tokRes.body.token,
      });
    }

    // Verify sdk_events recorded wrapper values accurately
    let snap = srv.backend.getSnapshot();
    for (const te of testerEnrollments) {
      const hsEvents = snap.sdk_events.filter(
        (ev) => ev.enrollment_id === te.enrollmentId && ev.type === "handshake",
      );
      assert.equal(hsEvents.length, 1);
      assert.equal(hsEvents[0].payload.sdk.wrapper, te.wrapper);
    }

    // Send 65s session event + duplicate event id -> deduplicated & +1 earn_pending once
    const kotlinTe = testerEnrollments[0];
    const evRes1 = await jsonRequest(srv.url, "/functions/v1/sdk-events", {
      method: "POST",
      body: {
        appKey: kotlinTe.appKey,
        packageName: kotlinTe.pkg,
        installId: `tester-${kotlinTe.appId}`,
        token: kotlinTe.token,
        events: [
          { type: "ping", id: "ping-1", clientTs: Date.now() },
          { type: "session", id: "sess-1", startTs: Date.now() - 65000, foregroundMs: 65000 },
          { type: "session", id: "sess-1", startTs: Date.now() - 65000, foregroundMs: 65000 },
        ],
      },
    });
    assert.equal(evRes1.status, 200);
    assert.deepEqual(evRes1.body, {
      accepted: ["ping-1", "sess-1", "sess-1"],
      enabled: true,
    });

    // Second batch with duplicate sess-1 plus another 70s session -> still only 1 daily point
    const evRes2 = await jsonRequest(srv.url, "/functions/v1/sdk-events", {
      method: "POST",
      body: {
        appKey: kotlinTe.appKey,
        packageName: kotlinTe.pkg,
        installId: `tester-${kotlinTe.appId}`,
        token: kotlinTe.token,
        events: [
          { type: "session", id: "sess-1", startTs: Date.now() - 65000, foregroundMs: 65000 },
          { type: "session", id: "sess-2", startTs: Date.now() - 70000, foregroundMs: 70000 },
        ],
      },
    });
    assert.equal(evRes2.status, 200);
    assert.deepEqual(evRes2.body, { accepted: ["sess-1", "sess-2"], enabled: true });

    snap = srv.backend.getSnapshot();
    const enrAfterEvents = snap.enrollments.find((e) => e.id === kotlinTe.enrollmentId);
    assert.equal(enrAfterEvents.status, "active");
    assert.equal(enrAfterEvents.active_days, 1);
    assert.equal(enrAfterEvents.streak_days, 1);

    const activityAfterEvents = snap.daily_activity.find(
      (d) => d.enrollment_id === kotlinTe.enrollmentId,
    );
    assert.equal(activityAfterEvents.present, true);
    assert.equal(activityAfterEvents.foreground_seconds, 135);
    assert.equal(activityAfterEvents.sessions, 2);
    assert.deepEqual(activityAfterEvents.sources, ["sdk"]);

    assert.deepEqual(srv.backend.getWallet("user-tester-1"), { available: 135, pending: 1 });

    // Hub Presence marks installed packages
    const presenceRes = await jsonRequest(srv.url, "/functions/v1/hub-presence", {
      method: "POST",
      headers: { "x-user-id": "user-tester-1" },
      body: { packages: ["io.testerloop.example", "io.testerloop.example.flutter"] },
    });
    assert.equal(presenceRes.status, 200);
    assert.equal(presenceRes.body.recorded, 2);

    snap = srv.backend.getSnapshot();
    const kotlinActivity = snap.daily_activity.find(
      (d) => d.enrollment_id === kotlinTe.enrollmentId,
    );
    assert.deepEqual(kotlinActivity.sources, ["sdk", "hub_presence"]);
    assert.equal(kotlinActivity.foreground_seconds, 135);

    // Submit feedback (>= 30 trimmed chars) -> approved +2 bonus_feedback
    const fbRes = await jsonRequest(srv.url, "/rest/v1/rpc/submit_feedback", {
      method: "POST",
      headers: { "x-user-id": "user-tester-1" },
      body: {
        p_enrollment_id: kotlinTe.enrollmentId,
        p_rating: 5,
        p_liked: "Fast startup and intuitive offline flow",
        p_issues: "None on Pixel 8",
        p_suggestion: "Add quick export button",
      },
    });
    assert.equal(fbRes.status, 200);
    assert.equal(fbRes.body.status, "approved");
    assert.equal(fbRes.body.bonus_awarded, 2);

    // Short feedback (< 30 trimmed chars) -> submitted without bonus
    const flutterTe = testerEnrollments[1];
    const shortFbRes = await jsonRequest(srv.url, "/rest/v1/rpc/submit_feedback", {
      method: "POST",
      headers: { "x-user-id": "user-tester-1" },
      body: {
        p_enrollment_id: flutterTe.enrollmentId,
        p_rating: 4,
        p_liked: "   Nice app   ",
        p_issues: "",
        p_suggestion: "   OK   ",
      },
    });
    assert.equal(shortFbRes.status, 200);
    assert.equal(shortFbRes.body.status, "submitted");
    assert.equal(shortFbRes.body.bonus_awarded, 0);

    assert.deepEqual(srv.backend.getWallet("user-tester-1"), { available: 137, pending: 1 });
  });

  it("supports env-configured ES256 JWK pair, on-demand owner_validation, sdk-config toggle, and insufficient_points check", async () => {
    const base = createLocalBackend();
    const srv = await bootServer({
      privateJwk: base.privateJwk,
      publicJwk: base.publicJwk,
    });

    // Request token by app_id (on-demand lookup/creation of owner_validation)
    const tokRes = await jsonRequest(srv.url, "/functions/v1/hub-tracking-token", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { app_id: "app-example-kotlin" },
    });
    assert.equal(tokRes.status, 200);
    const verified = await base.verifyTrackingJwt(tokRes.body.token);
    assert.ok(verified);
    assert.equal(verified.kind, "owner_validation");

    // Verify Play build -> sdk_verified_at set, no live campaign yet -> sdk-config returns enabled: false
    const hs = await jsonRequest(srv.url, "/functions/v1/sdk-handshake", {
      method: "POST",
      body: {
        appKey: "tl_pk_example_android_0001",
        packageName: "io.testerloop.example",
        versionCode: 2,
        signingCertSha256: "CERT:KOTLIN",
        installer: "com.android.vending",
        debuggable: false,
        installId: "owner-inst-cfg",
        sdk: { platform: "android", version: "1.0.0", wrapper: null },
        token: tokRes.body.token,
      },
    });
    assert.equal(hs.status, 200);

    const cfgBeforePublish = await jsonRequest(
      srv.url,
      "/functions/v1/sdk-config?appKey=tl_pk_example_android_0001",
    );
    assert.equal(cfgBeforePublish.status, 200);
    assert.deepEqual(cfgBeforePublish.body, { enabled: false, flushIntervalSec: 30 });

    // Publish -> sdk-config returns enabled: true
    const pub = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-owner-1" },
      body: { p_app_id: "app-example-kotlin" },
    });
    assert.equal(pub.status, 200);

    const cfgAfterPublish = await jsonRequest(
      srv.url,
      "/functions/v1/sdk-config?appKey=tl_pk_example_android_0001",
    );
    assert.deepEqual(cfgAfterPublish.body, { enabled: true, flushIntervalSec: 30 });

    // Non-owner or insufficient points check: create new user with 0 pts cannot publish
    const forbiddenPub = await jsonRequest(srv.url, "/rest/v1/rpc/publish_campaign", {
      method: "POST",
      headers: { "x-user-id": "user-poor-1" },
      body: { p_app_id: "app-example-flutter" },
    });
    assert.equal(forbiddenPub.status, 403);
    assert.equal(forbiddenPub.body.error, "app_not_found_or_forbidden");
  });
});
