# LifeOS Zero-Trust Firestore Security Specification

## 1. Data Invariants
1. **Strict Account Isolation**: Every document across `/users/{uid}` and its 9 subcollections (`tasks`, `goals`, `routines`, `scheduleBlocks`, `plans`, `planVersions`, `planVersions/{versionId}/chunks`, `focusSessions`, `activities`, `simulations`) is strictly scoped to `request.auth.uid == uid` with `request.auth.token.email_verified == true`.
2. **Identity & Ownership Immutability**: Every record's `userId` must equal `uid` on creation and cannot be changed on update (`incoming().userId == existing().userId`). `createdAt` is immutable on update.
3. **Protected Audit & Version History Records**:
   - `planVersions/{versionId}`, `planVersions/{versionId}/chunks/{chunkId}`, and `activities/{activityId}` are **immutable append-only records** (`allow update, delete: if false;`).
   - Creating a `PlanVersion` requires `serverValidated == true`, bounded summary fields, and atomic consistency with the active plan version (`getAfter` on `/users/$(uid)/plans/active`).
   - Updating `/users/{uid}/plans/{planId}` enforces monotonic version increments (`incoming().currentVersion == existing().currentVersion + 1`) so stale previews cannot overwrite newer schedules.
4. **Bounded Document Sizes**:
   - All strings have explicit `.size() <= MAX` boundaries.
   - `PlanVersionChunk.blocks` is bounded (`size() <= 40`) to prevent oversized 1MB Firestore documents.

## 2. The "Dirty Dozen" Adversarial Payloads (Blocked by Rules)
1. **Cross-Tenant Read/List**: Authenticated user `uid_B` attempts `get` or `list` on `/users/uid_A/tasks` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Token with `email_verified: false` attempts write on `/users/uid_A` -> `PERMISSION_DENIED`.
3. **Owner Spoofing on Create**: User `uid_A` creates `/users/uid_A/tasks/t1` with `userId: "uid_B"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Payload includes an undeclared field `isAdmin: true` on `/users/uid_A/tasks/t1` -> Rejected by `.keys().hasOnly(...)`.
5. **Negative or 10,000-Minute Task Duration**: Task payload with `estimatedMinutes: -10` or `estimatedMinutes: 99999` -> Rejected by range guard (`1..1440`).
6. **ID Poisoning Attack**: Document ID containing special characters or `> 128` chars -> Rejected by `isValidId()`.
7. **Audit Log Tampering**: Client attempts `update` or `delete` on `/users/uid_A/activities/act_1` -> `PERMISSION_DENIED` (`allow update, delete: if false`).
8. **Plan Version History Deletion/Mutation**: Client attempts `update` or `delete` on `/users/uid_A/planVersions/v_1` -> `PERMISSION_DENIED`.
9. **Stale Plan Version Rollback Overwrite**: Client attempts to update `/users/uid_A/plans/active` with `currentVersion <= existing().currentVersion` -> `PERMISSION_DENIED`.
10. **Oversized Version Chunk Injection**: Client attempts to write `blocks` list with `> 40` items into `/planVersions/v_1/chunks/c_0` -> `PERMISSION_DENIED`.
11. **Mutating Immutable `createdAt` or `userId`**: Update payload modifies `createdAt` on a task or goal -> `PERMISSION_DENIED`.
12. **Unauthenticated Blanket Access**: Null auth attempts read/write on any path -> Rejected by global default-deny and `isOwner(uid)`.
