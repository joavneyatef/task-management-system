# Backend Handoff – Long Beach Operations System

Implemented in the supplied project without redesigning the existing UI.

## Implemented

1. **Server-side authentication**
   - Express login/signup endpoints.
   - HttpOnly session cookie.
   - Salted scrypt password hashing.
   - Public user directory returns profile data only; password/PIN are never returned.
   - `/api/auth/me` verifies the current server session.
   - Logout invalidates the browser session cookie.

2. **API authorization**
   - All API routes after the authentication endpoints require an authenticated session.
   - State writes are checked against the authenticated user's role and operational scope.
   - User/account changes are restricted to management.
   - User deletion is GM-only; task/complaint deletion is management-only.

3. **Task reassignment / Switch**
   - `POST /api/tasks/:id/switch`
   - Server records the person who actually performed the transfer.
   - `createdBy` remains the original sender.
   - Transfer history is persisted.
   - Frontend Switch now calls this endpoint instead of only changing React state.

4. **Notifications**
   - `POST /api/notifications/:id/acknowledge`
   - Acknowledgement is stored server-side, so refresh does not resurrect the popup.
   - Notification writes are scoped to the authenticated account/team rules.

5. **Exclusivi**
   - `GET /api/exclusivi/feedback?from=<unix>&to=<unix>` server-side proxy.
   - The Exclusivi credential stays on the server and is not exposed to React.
   - The endpoint returns an explicit configuration error if no approved vendor credential is configured.

6. **Persistent data**
   - Existing JSON datastore remains the persistence layer for this handoff so the project runs without a native database dependency.
   - Passwords in the bundled demo data are already hashed.
   - For multi-server/cloud deployment, migrate the persistence layer to PostgreSQL/MySQL before horizontal scaling.

## Local demo password

Existing bundled demo accounts use `123456` for local testing. The value is stored as a salted hash.

## Required production environment

Copy `.env.example` to `.env` and set:

- `SESSION_SECRET` – long random secret.
- `EXCLUSIVI_SESSION_TOKEN` or the official Exclusivi authentication mechanism supplied by the vendor.
- `EXCLUSIVI_BASE_URL` if different from the default.

Never put the Exclusivi credential in a Vite/React client environment variable.
