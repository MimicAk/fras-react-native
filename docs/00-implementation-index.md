# CompreFace + Silent-Face — Implementation Guide

KYC-grade face recognition for FRAS using self-hosted open-source stack.
Zero variable API costs. Biometric data never leaves your server.

---

## Quick Summary

| Component | What | Where it runs |
|-----------|------|---------------|
| **CompreFace** | Face recognition (enroll + search) | Your EC2 server, port 8000 |
| **Silent-Face** | Liveness / anti-spoofing | Your EC2 server, port 8001 |
| **Node proxy** | Secure bridge (app never calls CompreFace directly) | Your existing Node backend |
| **cloudFace.service.js** | New mobile service | React Native app |
| **face.service.js** | Modified — cloud first, local fallback | React Native app |

---

## Document Index

| # | Doc | What it covers |
|---|-----|----------------|
| 01 | [Server Setup](./01-server-setup.md) | EC2 upgrade, Docker, CompreFace, Silent-Face, HTTPS |
| 02 | [Backend Endpoints](./02-backend-node-endpoints.md) | Node.js routes, migration script |
| 03 | [Database Migration](./03-database-migration.md) | SQLite schema changes (additive only) |
| 04 | [cloudFace.service.js](./04-cloudFace-service.md) | New service file — full source |
| 05 | [face.service.js changes](./05-face-service-integration.md) | Cloud-first recognition integration |
| 06 | [FaceEnrollmentScreen.js](./06-enrollment-screen-changes.md) | Cloud enroll on new employee |
| 07 | [backgroundSync changes](./07-background-sync-changes.md) | Audit columns in punch sync payload |

---

## Implementation Order

```
Week 1–2 (Server)
  └── Doc 01: Setup EC2, Docker, CompreFace, Silent-Face, HTTPS

Week 2–3 (Backend)
  └── Doc 02: Add Node routes, run migration script for existing employees

Week 3 (Database)
  └── Doc 03: Apply schema changes to schema.js (ALTER TABLE additions)

Week 4–5 (Mobile — core)
  ├── Doc 04: Create services/cloudFace.service.js
  ├── Doc 05: Modify services/face.service.js
  └── Doc 06: Modify screens/FaceEnrollmentScreen.js

Week 5–6 (Mobile — sync)
  └── Doc 07: Extend backgroundSync.service.js + punch.repository.js

Week 6–7 (Rollout)
  ├── Deploy to staging, test with real faces
  ├── Enable CLOUD_RECOGNITION_ENABLED toggle for pilot users
  └── Monitor logs, tune RECOGNITION_THRESHOLD if needed
```

---

## Key Design Decisions

### Cloud-first with local fallback
```
recognizeFaceService()
  ├── Online + cloud enabled?
  │     ├── checkLiveness() → fail → REJECT
  │     ├── cloudRecognizeFace() → match → RETURN (skip TFLite)
  │     └── cloud no match / error → fallthrough ↓
  └── oldLinearSearch() (existing TFLite + cosine similarity)
```

### Feature flag
- `CLOUD_RECOGNITION_ENABLED` stored in AsyncStorage
- Default: `false` (safe rollout — existing behavior until you flip it)
- Toggle in SettingsScreen

### Non-breaking changes
- **Zero** existing functionality removed
- All new columns use `.catch(() => {})` guard — safe on re-run
- Cloud path is wrapped in try/catch — any cloud error falls to local
- `improveFaceModelService` skips local model update when cloud handled recognition (prevents drift)

---

## Environment Variables (Node backend)

```env
COMPREFACE_URL=http://localhost:8000
COMPREFACE_API_KEY=<from CompreFace admin UI>
LIVENESS_URL=http://localhost:8001
LIVENESS_THRESHOLD=0.7
RECOGNITION_THRESHOLD=0.80
```

---

## CompreFace API Key Location

1. Open `http://YOUR_SERVER_IP:8080`
2. Login to CompreFace admin
3. Applications → FRAS → Face Recognition Service
4. Copy the API Key shown in the service panel

---

## Tuning `RECOGNITION_THRESHOLD`

| Value | Behavior |
|-------|----------|
| 0.95+ | Very strict — may reject valid faces in poor lighting |
| **0.80** | **Recommended starting point** |
| 0.70 | Lenient — more false accepts |

Start at 0.80 and adjust based on field testing.
Silent-Face threshold (0.70) is conservative on purpose — lower means more spoof attempts blocked.

---

## Troubleshooting

**CompreFace not enrolling:** Check `docker logs compreface-api`. Common issue: image quality too low (blurry/dark). CompreFace requires a clear face with `det_prob_threshold > 0.8`.

**Silent-Face always returns spoof:** Lighting matters. Ensure uniform lighting, no harsh shadows. Test with `curl` using a known-real face image.

**Cloud search timing out:** Check that the Node backend can reach `localhost:8000`. If Docker networking is the issue, use the container name (`compreface-api:8080`) instead of localhost.

**Recognition falls through to local every time:** Verify `CLOUD_RECOGNITION_ENABLED` is `'true'` in AsyncStorage (check Settings screen toggle).
