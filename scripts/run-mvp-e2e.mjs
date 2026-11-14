import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startLocalServer } from "../backend/local-server/server.mjs";

const require = createRequire(import.meta.url);
const { runLiveServerScenario } = require("../examples/react-native/src/simulator.js");

const OWNER_ID = "user-owner-1";
const TESTER_ID = "user-tester-1";
const INTRUDER_ID = "user-intruder-1";

const SCENARIOS = [
  {
    key: "kotlin",
    label: "Kotlin Native",
    appId: "app-example-kotlin",
    ownerEnrollmentId: "enr-owner-kotlin",
    packageName: "io.testerloop.example",
    appKey: "tl_pk_example_android_0001",
    wrapper: null,
    certSha256: "AA:11:22:33:44:55:66:77:88:99:00:11",
    installId: "install-kotlin-001",
  },
  {
    key: "flutter",
    label: "Flutter",
    appId: "app-example-flutter",
    ownerEnrollmentId: "enr-owner-flutter",
    packageName: "io.testerloop.example.flutter",
    appKey: "tl_pk_example_flutter_0001",
    wrapper: "flutter",
    certSha256: "BB:11:22:33:44:55:66:77:88:99:00:22",
    installId: "install-flutter-001",
  },
  {
    key: "react_native",
    label: "React Native",
    appId: "app-example-rn",
    ownerEnrollmentId: "enr-owner-rn",
    packageName: "io.testerloop.example.rn",
    appKey: "tl_pk_example_rn_0001",
    wrapper: "react_native",
    certSha256: "CC:11:22:33:44:55:66:77:88:99:00:33",
    installId: "install-rn-001",
  },
];

async function requestJson(url, { method = "GET", userId, body } = {}) {
  const headers = {};
  if (userId) headers["x-user-id"] = userId;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function expectOk(url, opts, expectedStatus = 200) {
  const res = await requestJson(url, opts);
  assert.equal(
    res.status,
    expectedStatus,
    `${opts.method ?? "GET"} ${url} expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(res.data)}`,
  );
  return res.data;
}

async function expectError(url, opts, expectedStatus, expectedCode) {
  const res = await requestJson(url, opts);
  assert.equal(
    res.status,
    expectedStatus,
    `${opts.method ?? "GET"} ${url} expected error HTTP ${expectedStatus}, got ${res.status}: ${JSON.stringify(res.data)}`,
  );
  if (expectedCode) {
    assert.equal(
      res.data?.error,
      expectedCode,
      `Expected error code ${expectedCode}, got ${JSON.stringify(res.data)}`,
    );
  }
  return res.data;
}

function buildHandshakeBody(scenario, { token = null, installer = null, debuggable = true } = {}) {
  return {
    appKey: scenario.appKey,
    packageName: scenario.packageName,
    versionCode: 1,
    signingCertSha256: scenario.certSha256,
    installer,
    debuggable,
    installId: scenario.installId,
    sdk: {
      platform: "android",
      version: "1.0.0",
      wrapper: scenario.wrapper,
    },
    device: { sdkInt: 35 },
    token,
  };
}

function printSummary(rows) {
  console.log("\n=== MVP E2E Summary ===");
  for (const row of rows) {
    console.log(
      `[PASS] ${row.scenario.padEnd(13)} | wrapper=${String(row.wrapper).padEnd(12)} | fg=${row.fgSeconds}s | sources=${row.sources.join("+")} | active_days=${row.activeDays} | config=${row.configEnabled}`,
    );
  }
}

async function main() {
  const server = await startLocalServer(0);
  const baseUrl = server.url;
  const fnUrl = `${baseUrl}/functions/v1`;
  const rpcUrl = `${baseUrl}/rest/v1/rpc`;

  try {
    const health = await expectOk(`${baseUrl}/health`, { method: "GET" });
    assert.equal(health.ok, true);
    assert.equal(health.apps, 3);

    // 1. Owner onboarding & device registration (+10 bonus_welcome -> 410 available)
    const ownerDevice = await expectOk(`${fnUrl}/hub-device-register`, {
      method: "POST",
      userId: OWNER_ID,
      body: {
        android_id_hash: "e2e-owner-device-sha256",
        model: "Pixel 8 Pro",
        sdk_int: 35,
        integrity_token: "play-integrity-owner-valid-token",
      },
    });
    assert.equal(ownerDevice.welcome_awarded, true);

    let snapshot = await expectOk(`${baseUrl}/rest/v1/state`, { method: "GET" });
    assert.equal(snapshot.wallets[OWNER_ID].available, 410);

    // 2. 2-step SDK validation + campaign publishing for all 3 apps
    const publishedCampaigns = new Map();
    for (const scenario of SCENARIOS) {
      const { token: ownerToken } = await expectOk(`${fnUrl}/hub-tracking-token`, {
        method: "POST",
        userId: OWNER_ID,
        body: { enrollment_id: scenario.ownerEnrollmentId },
      });
      assert.ok(ownerToken && ownerToken.split(".").length === 3);

      const debugHs = await expectOk(`${fnUrl}/sdk-handshake`, {
        method: "POST",
        body: buildHandshakeBody(scenario, {
          token: ownerToken,
          installer: null,
          debuggable: true,
        }),
      });
      assert.equal(debugHs.status, "tracking");

      const playHs = await expectOk(`${fnUrl}/sdk-handshake`, {
        method: "POST",
        body: buildHandshakeBody(scenario, {
          token: ownerToken,
          installer: "com.android.vending",
          debuggable: false,
        }),
      });
      assert.equal(playHs.status, "tracking");

      const published = await expectOk(`${rpcUrl}/publish_campaign`, {
        method: "POST",
        userId: OWNER_ID,
        body: { p_app_id: scenario.appId },
      });
      assert.equal(published.status, "recruiting");
      publishedCampaigns.set(scenario.key, published.campaign);
    }

    snapshot = await expectOk(`${baseUrl}/rest/v1/state`, { method: "GET" });
    assert.equal(snapshot.wallets[OWNER_ID].available, 50); // 410 - (3 * 120)
    for (const scenario of SCENARIOS) {
      const app = snapshot.apps.find((a) => a.id === scenario.appId);
      assert.ok(app.sdk_debug_ok_at, `${scenario.key} missing sdk_debug_ok_at`);
      assert.ok(app.sdk_verified_at, `${scenario.key} missing sdk_verified_at`);
      assert.equal(app.signing_cert_sha256, scenario.certSha256);
    }

    // 3. Tester onboarding, 1-account-per-device enforcement, self-test block & enrollments
    const testerDevice = await expectOk(`${fnUrl}/hub-device-register`, {
      method: "POST",
      userId: TESTER_ID,
      body: {
        android_id_hash: "e2e-tester-device-sha256",
        model: "Galaxy S24",
        sdk_int: 34,
        integrity_token: "play-integrity-tester-valid-token",
      },
    });
    assert.equal(testerDevice.welcome_awarded, true);

    await expectError(
      `${fnUrl}/hub-device-register`,
      {
        method: "POST",
        userId: INTRUDER_ID,
        body: {
          android_id_hash: "e2e-tester-device-sha256",
          model: "Cloned Emulator",
          sdk_int: 34,
          integrity_token: "play-integrity-intruder-token",
        },
      },
      409,
      "device_bound_other_account",
    );

    await expectError(
      `${rpcUrl}/enroll_in_campaign`,
      {
        method: "POST",
        userId: OWNER_ID,
        body: {
          p_campaign_id: publishedCampaigns.get("kotlin").id,
          p_device_id: ownerDevice.device_id,
        },
      },
      403,
      "cannot_test_own_app",
    );

    const testerEnrollments = new Map();
    const testerTokens = new Map();
    for (const scenario of SCENARIOS) {
      const enrRes = await expectOk(`${rpcUrl}/enroll_in_campaign`, {
        method: "POST",
        userId: TESTER_ID,
        body: {
          p_campaign_id: publishedCampaigns.get(scenario.key).id,
          p_device_id: testerDevice.device_id,
        },
      });
      assert.equal(enrRes.status, "pending");
      testerEnrollments.set(scenario.key, enrRes.enrollment_id);

      const { token } = await expectOk(`${fnUrl}/hub-tracking-token`, {
        method: "POST",
        userId: TESTER_ID,
        body: { enrollment_id: enrRes.enrollment_id },
      });
      testerTokens.set(scenario.key, token);
    }

    // 4. Execute SDK lifecycle across Kotlin, Flutter & React Native
    const summaryRows = [];
    const expectedPackages = [];
    for (let i = 0; i < SCENARIOS.length; i += 1) {
      const scenario = SCENARIOS[i];
      const foreignScenario = SCENARIOS[(i + 1) % SCENARIOS.length];
      const enrollmentId = testerEnrollments.get(scenario.key);
      const token = testerTokens.get(scenario.key);
      const foreignToken = testerTokens.get(foreignScenario.key);

      // Cross-package token isolation must fail with 403 invalid_token
      await expectError(
        `${fnUrl}/sdk-handshake`,
        {
          method: "POST",
          body: buildHandshakeBody(scenario, { token: foreignToken, debuggable: true }),
        },
        403,
        "invalid_token",
      );

      let eventIdsToReplay = [];
      let sdkConfig;
      if (scenario.key === "react_native") {
        // Drive actual React Native example simulator against live local server
        const liveResult = await runLiveServerScenario({
          apiUrl: fnUrl,
          appKey: scenario.appKey,
          packageName: scenario.packageName,
          installId: scenario.installId,
          token,
        });
        assert.equal(liveResult.initialHandshake.status, "not_enrolled");
        assert.equal(liveResult.enrolledHandshake.status, "tracking");
        assert.equal(liveResult.events.accepted.length, 2);
        assert.equal(liveResult.config.enabled, true);
        eventIdsToReplay = liveResult.events.accepted;
        sdkConfig = liveResult.config;
      } else {
        const notEnrolled = await expectOk(`${fnUrl}/sdk-handshake`, {
          method: "POST",
          body: buildHandshakeBody(scenario, { token: null, debuggable: true }),
        });
        assert.equal(notEnrolled.status, "not_enrolled");
        assert.equal(notEnrolled.enabled, true);

        const trackingHs = await expectOk(`${fnUrl}/sdk-handshake`, {
          method: "POST",
          body: buildHandshakeBody(scenario, { token, debuggable: true }),
        });
        assert.equal(trackingHs.status, "tracking");
        assert.equal(trackingHs.enabled, true);

        const pingId = `ping-${scenario.key}-1`;
        const sessionId = `session-${scenario.key}-1`;
        eventIdsToReplay = [pingId, sessionId];

        const eventsRes = await expectOk(`${fnUrl}/sdk-events`, {
          method: "POST",
          body: {
            appKey: scenario.appKey,
            packageName: scenario.packageName,
            installId: scenario.installId,
            token,
            events: [
              { type: "ping", id: pingId, clientTs: Date.now() - 65000 },
              {
                type: "session",
                id: sessionId,
                startTs: Date.now() - 65000,
                foregroundMs: 65000,
              },
            ],
          },
        });
        assert.deepEqual(eventsRes.accepted, eventIdsToReplay);

        sdkConfig = await expectOk(
          `${fnUrl}/sdk-config?appKey=${encodeURIComponent(scenario.appKey)}`,
          { method: "GET" },
        );
      }

      // Replay duplicate session event IDs to verify idempotency
      const replayRes = await expectOk(`${fnUrl}/sdk-events`, {
        method: "POST",
        body: {
          appKey: scenario.appKey,
          packageName: scenario.packageName,
          installId: scenario.installId,
          token,
          events: [
            {
              type: "session",
              id: eventIdsToReplay[1],
              startTs: Date.now() - 65000,
              foregroundMs: 65000,
            },
          ],
        },
      });
      assert.deepEqual(replayRes.accepted, [eventIdsToReplay[1]]);

      // Submit >= 30 chars feedback -> approved +2 available points
      const feedbackRes = await expectOk(`${rpcUrl}/submit_feedback`, {
        method: "POST",
        userId: TESTER_ID,
        body: {
          p_enrollment_id: enrollmentId,
          p_rating: 5,
          p_liked: `Fluxo estavel no cenario ${scenario.label}.`,
          p_issues: "Nenhum crash observado.",
          p_suggestion: "Adicionar filtro por categoria.",
        },
      });
      assert.equal(feedbackRes.status, "approved");
      assert.equal(feedbackRes.bonus_awarded, 2);

      expectedPackages.push(scenario.packageName);
      summaryRows.push({
        scenario: scenario.label,
        wrapper: scenario.wrapper,
        enrollmentId,
        configEnabled: sdkConfig.enabled,
      });
    }

    // 5. Hub reports installed package presence for all 3 scenarios
    const presenceRes = await expectOk(`${fnUrl}/hub-presence`, {
      method: "POST",
      userId: TESTER_ID,
      body: { packages: expectedPackages },
    });
    assert.equal(presenceRes.recorded, 3);

    // 6. Inspect final state across Postgres-like backend snapshot
    snapshot = await expectOk(`${baseUrl}/rest/v1/state`, { method: "GET" });

    // Tester initial seed (125) + welcome bonus (10) + 3 feedbacks (3 * 2 = 6) = 141 available
    assert.equal(snapshot.wallets[TESTER_ID].available, 141);
    // 3 active days credited across the 3 scenarios = 3 pending points
    assert.equal(snapshot.wallets[TESTER_ID].pending, 3);

    for (const row of summaryRows) {
      const enr = snapshot.enrollments.find((e) => e.id === row.enrollmentId);
      assert.equal(enr.status, "active");
      assert.equal(enr.active_days, 1);
      assert.equal(enr.streak_days, 1);

      const activity = snapshot.daily_activity.find((d) => d.enrollment_id === row.enrollmentId);
      assert.equal(activity.present, true);
      assert.equal(activity.foreground_seconds, 65);
      assert.deepEqual(activity.sources.sort(), ["hub_presence", "sdk"]);

      const handshakes = snapshot.sdk_events.filter(
        (ev) => ev.enrollment_id === row.enrollmentId && ev.type === "handshake",
      );
      assert.equal(handshakes.length, 1);
      assert.equal(handshakes[0].payload.sdk.wrapper, row.wrapper);

      row.fgSeconds = activity.foreground_seconds;
      row.sources = activity.sources;
      row.activeDays = enr.active_days;
    }

    printSummary(summaryRows);
    console.log("ALL MVP E2E SCENARIOS PASSED.");
  } finally {
    await server.close();
  }
}

await main();
