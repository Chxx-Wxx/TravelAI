const express = require("express");
const { randomUUID } = require("crypto");

const {
  ExpenseSyncError,
  canMemberViewExpense,
  canMemberViewPayment,
  expensePartyIds,
  hashSessionToken,
  issueSessionToken,
  normalizeExpense,
  normalizePayment,
  readBearerToken,
  stableHash,
} = require("./expense-sync-service");

function createExpenseSyncRouter({ hasDatabaseUrl, pool, memory }) {
  const router = express.Router();
  const sessions = new Map();
  const transactions = new Map();
  const payments = new Map();
  const revisions = new Map();
  const changes = [];
  const accessGrants = new Set();
  const registrationAttempts = new Map();
  const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
  const REGISTRATION_LIMIT = 20;

  function ledgerKey(tripId, id) {
    return `${tripId}:${id}`;
  }

  function accessGrantKey(tripId, memberId, userId) {
    return `${tripId}:${memberId}:${userId}`;
  }

  function allowDeviceRegistration(req) {
    const now = Date.now();
    const ip = String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
    const existing = registrationAttempts.get(ip);
    const current =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + REGISTRATION_WINDOW_MS };

    current.count += 1;
    registrationAttempts.set(ip, current);

    if (registrationAttempts.size > 500) {
      for (const [key, value] of registrationAttempts) {
        if (value.resetAt <= now) registrationAttempts.delete(key);
      }
    }

    if (current.count > REGISTRATION_LIMIT) {
      fail(
        429,
        "AUTH_REGISTRATION_RATE_LIMITED",
        "새 기기 등록 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        { retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }
      );
    }
  }

  function responseError(res, error) {
    if (error instanceof ExpenseSyncError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    console.error("지출 동기화 서버 오류:", {
      name: error?.name,
      code: error?.code,
    });

    return res.status(500).json({
      message: "지출 동기화 중 서버 오류가 발생했습니다.",
      code: "EXPENSE_SYNC_INTERNAL_ERROR",
    });
  }

  function fail(statusCode, code, message, details) {
    throw new ExpenseSyncError(statusCode, code, message, details);
  }

  function safePayloadHash(payload) {
    const { createdAt, updatedAt, changeHistory, ...stablePayload } = payload;
    return stableHash(stablePayload);
  }

  async function createDeviceSession(displayName) {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const issued = issueSessionToken();
    const normalizedDisplayName =
      String(displayName ?? "TravelAI 사용자").normalize("NFC").trim().slice(0, 80) ||
      "TravelAI 사용자";

    if (!hasDatabaseUrl) {
      const now = new Date().toISOString();
      const user = {
        id: userId,
        authProvider: "device_session",
        authSubject: sessionId,
        displayName: normalizedDisplayName,
        email: null,
        createdAt: now,
        updatedAt: now,
      };

      memory.users.push(user);
      sessions.set(issued.tokenHash, {
        id: sessionId,
        userId,
        expiresAt: issued.expiresAt,
        revokedAt: null,
      });

      return { user, ...issued };
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const userResult = await client.query(
        `
          INSERT INTO users (
            id, auth_provider, auth_subject, display_name
          )
          VALUES ($1, 'device_session', $2, $3)
          RETURNING id, auth_provider, auth_subject, display_name,
                    email, created_at, updated_at
        `,
        [userId, sessionId, normalizedDisplayName]
      );
      await client.query(
        `
          INSERT INTO auth_sessions (
            id, user_id, token_hash, expires_at
          )
          VALUES ($1, $2, $3, $4)
        `,
        [sessionId, userId, issued.tokenHash, issued.expiresAt]
      );
      await client.query("COMMIT");

      const row = userResult.rows[0];
      return {
        user: {
          id: row.id,
          authProvider: row.auth_provider,
          authSubject: row.auth_subject,
          displayName: row.display_name,
          email: row.email,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        ...issued,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function authenticate(req, res, next) {
    try {
      const token = readBearerToken(req.headers.authorization);

      if (!token) {
        fail(401, "AUTH_REQUIRED", "로그인 세션이 필요합니다.");
      }

      const tokenHash = hashSessionToken(token);

      if (!hasDatabaseUrl) {
        const session = sessions.get(tokenHash);

        if (
          !session ||
          session.revokedAt ||
          Date.parse(session.expiresAt) <= Date.now()
        ) {
          fail(401, "AUTH_INVALID_SESSION", "로그인 세션이 만료되었거나 유효하지 않습니다.");
        }

        const user = memory.users.find((item) => item.id === session.userId);

        if (!user) {
          fail(401, "AUTH_INVALID_SESSION", "로그인 사용자를 찾을 수 없습니다.");
        }

        req.auth = { user };
        return next();
      }

      const result = await pool.query(
        `
          UPDATE auth_sessions AS session
          SET last_used_at = NOW()
          FROM users AS app_user
          WHERE session.token_hash = $1
            AND session.user_id = app_user.id
            AND session.revoked_at IS NULL
            AND session.expires_at > NOW()
          RETURNING app_user.id, app_user.auth_provider,
                    app_user.auth_subject, app_user.display_name,
                    app_user.email, app_user.created_at, app_user.updated_at
        `,
        [tokenHash]
      );

      if (result.rowCount === 0) {
        fail(401, "AUTH_INVALID_SESSION", "로그인 세션이 만료되었거나 유효하지 않습니다.");
      }

      const row = result.rows[0];
      req.auth = {
        user: {
          id: row.id,
          authProvider: row.auth_provider,
          authSubject: row.auth_subject,
          displayName: row.display_name,
          email: row.email,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
      return next();
    } catch (error) {
      return responseError(res, error);
    }
  }

  async function getMember(tripId, userId, client = pool) {
    if (!hasDatabaseUrl) {
      const member = memory.tripMembers.find(
          (member) =>
            member.tripId === tripId &&
            member.userId === userId &&
            member.status === "active"
        ) ?? null;

      if (
        !member ||
        !accessGrants.has(accessGrantKey(tripId, member.id, userId))
      ) {
        return null;
      }

      return member;
    }

    const result = await client.query(
      `
        SELECT id, trip_id, user_id, display_name, role, status
        FROM trip_members AS member
        INNER JOIN trip_expense_access_grants AS access
          ON access.trip_id = member.trip_id
         AND access.member_id = member.id
         AND access.user_id = member.user_id
        WHERE member.trip_id = $1
          AND member.user_id = $2
          AND member.status = 'active'
      `,
      [tripId, userId]
    );
    return result.rows[0]
      ? {
          id: result.rows[0].id,
          tripId: result.rows[0].trip_id,
          userId: result.rows[0].user_id,
          displayName: result.rows[0].display_name,
          role: result.rows[0].role,
          status: result.rows[0].status,
        }
      : null;
  }

  async function requireMember(tripId, userId, client = pool) {
    const member = await getMember(tripId, userId, client);

    if (!member) {
      fail(403, "EXPENSE_TRIP_ACCESS_DENIED", "이 여행의 활성 멤버만 지출 원장에 접근할 수 있습니다.");
    }

    return member;
  }

  async function requirePartyMembers(tripId, partyIds, client = pool) {
    const uniqueIds = [...new Set(partyIds.filter(Boolean))];

    if (!hasDatabaseUrl) {
      const validIds = new Set(
        memory.tripMembers
          .filter(
            (member) => member.tripId === tripId && member.status !== "removed"
          )
          .map((member) => member.id)
      );

      if (uniqueIds.some((id) => !validIds.has(id))) {
        fail(400, "EXPENSE_MEMBER_OUTSIDE_TRIP", "거래 당사자는 모두 같은 여행 멤버여야 합니다.");
      }

      return;
    }

    const result = await client.query(
      `
        SELECT id
        FROM trip_members
        WHERE trip_id = $1
          AND status <> 'removed'
          AND id = ANY($2::uuid[])
      `,
      [tripId, uniqueIds]
    );

    if (result.rowCount !== uniqueIds.length) {
      fail(400, "EXPENSE_MEMBER_OUTSIDE_TRIP", "거래 당사자는 모두 같은 여행 멤버여야 합니다.");
    }
  }

  function nextMemoryRevision(tripId) {
    const revision = (revisions.get(tripId) ?? 0) + 1;
    revisions.set(tripId, revision);
    return revision;
  }

  async function nextDbRevision(client, tripId) {
    const result = await client.query(
      `
        INSERT INTO trip_expense_ledgers (trip_id, revision)
        VALUES ($1, 1)
        ON CONFLICT (trip_id)
        DO UPDATE SET
          revision = trip_expense_ledgers.revision + 1,
          updated_at = NOW()
        RETURNING revision
      `,
      [tripId]
    );
    return Number(result.rows[0].revision);
  }

  function withServerFields(payload, record) {
    return {
      ...payload,
      status: record.status,
      version: record.version,
      ledgerRevision: record.ledgerRevision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.cancelledAt ? { cancelledAt: record.cancelledAt } : {}),
    };
  }

  function dbExpense(row) {
    return withServerFields(row.payload, {
      status: row.status,
      version: row.version,
      ledgerRevision: Number(row.ledger_revision),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cancelledAt: row.cancelled_at,
    });
  }

  function dbPayment(row) {
    return withServerFields(row.payload, {
      status: row.status,
      version: row.version,
      ledgerRevision: Number(row.ledger_revision),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cancelledAt: row.cancelled_at,
    });
  }

  async function readLedger(tripId, actorMemberId) {
    if (!hasDatabaseUrl) {
      return {
        revision: revisions.get(tripId) ?? 0,
        expenses: [...transactions.values()]
          .filter((item) => item.tripId === tripId)
          .map((item) => item.payload)
          .filter((item) => canMemberViewExpense(item, actorMemberId)),
        payments: [...payments.values()]
          .filter((item) => item.tripId === tripId)
          .map((item) => item.payload)
          .filter((item) => canMemberViewPayment(item, actorMemberId)),
      };
    }

    const [revisionResult, expenseResult, paymentResult] = await Promise.all([
      pool.query(
        "SELECT revision FROM trip_expense_ledgers WHERE trip_id = $1",
        [tripId]
      ),
      pool.query(
        "SELECT * FROM expense_transactions WHERE trip_id = $1 ORDER BY created_at ASC, id ASC",
        [tripId]
      ),
      pool.query(
        "SELECT * FROM expense_settlement_payments WHERE trip_id = $1 ORDER BY created_at ASC, id ASC",
        [tripId]
      ),
    ]);

    return {
      revision: Number(revisionResult.rows[0]?.revision ?? 0),
      expenses: expenseResult.rows
        .map(dbExpense)
        .filter((item) => canMemberViewExpense(item, actorMemberId)),
      payments: paymentResult.rows
        .map(dbPayment)
        .filter((item) => canMemberViewPayment(item, actorMemberId)),
    };
  }

  async function createExpense(tripId, actorMember, input, options = {}) {
    const expense = normalizeExpense(input, actorMember.id);
    const partyIds = expensePartyIds(expense);

    if (!partyIds.includes(actorMember.id)) {
      fail(403, "EXPENSE_ACTOR_NOT_RELATED", "관련된 멤버만 거래를 등록할 수 있습니다.");
    }

    const requestHash = safePayloadHash(expense);

    if (!hasDatabaseUrl) {
      await requirePartyMembers(tripId, partyIds);
      const duplicate = [...transactions.values()].find(
        (item) =>
          item.tripId === tripId &&
          item.createdByMemberId === actorMember.id &&
          item.idempotencyKey === expense.idempotencyKey
      );

      if (duplicate) {
        if (duplicate.requestHash !== requestHash) {
          fail(409, "EXPENSE_IDEMPOTENCY_CONFLICT", "같은 요청 키가 다른 거래에 사용되었습니다.");
        }
        return { expense: duplicate.payload, duplicated: true };
      }

      if (transactions.has(ledgerKey(tripId, expense.id))) {
        fail(409, "EXPENSE_ID_CONFLICT", "같은 ID의 거래가 이미 존재합니다.");
      }

      const revision = nextMemoryRevision(tripId);
      const payload = withServerFields(expense, {
        status: expense.status,
        version: 1,
        ledgerRevision: revision,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      });
      const record = {
        tripId,
        payload,
        createdByMemberId: actorMember.id,
        idempotencyKey: expense.idempotencyKey,
        requestHash,
      };
      transactions.set(ledgerKey(tripId, expense.id), record);
      changes.push({ tripId, entityType: "transaction", entityId: expense.id, action: options.action ?? "created", revision });
      return { expense: payload, duplicated: false };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await requirePartyMembers(tripId, partyIds, client);
      const duplicateResult = await client.query(
        `
          SELECT * FROM expense_transactions
          WHERE trip_id = $1
            AND created_by_member_id = $2
            AND idempotency_key = $3
          FOR UPDATE
        `,
        [tripId, actorMember.id, expense.idempotencyKey]
      );

      if (duplicateResult.rowCount > 0) {
        const duplicate = duplicateResult.rows[0];
        if (duplicate.request_hash !== requestHash) {
          fail(409, "EXPENSE_IDEMPOTENCY_CONFLICT", "같은 요청 키가 다른 거래에 사용되었습니다.");
        }
        await client.query("COMMIT");
        return { expense: dbExpense(duplicate), duplicated: true };
      }

      const revision = await nextDbRevision(client, tripId);
      const result = await client.query(
        `
          INSERT INTO expense_transactions (
            id, trip_id, expense_type, currency, local_amount,
            owner_member_id, paid_by_member_id, lender_member_id,
            borrower_member_id, participant_member_ids, payload,
            status, version, ledger_revision, idempotency_key,
            request_hash, created_by_member_id, updated_by_member_id,
            created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::uuid[], $11::jsonb,
            $12, 1, $13, $14, $15, $16, $16, $17, $17
          )
          RETURNING *
        `,
        [
          expense.id,
          tripId,
          expense.expenseType,
          expense.currency,
          expense.localAmount,
          expense.ownerMemberId ?? null,
          expense.paidByMemberId ?? null,
          expense.lenderMemberId ?? null,
          expense.borrowerMemberId ?? null,
          expense.participantMemberIds ?? [],
          JSON.stringify(expense),
          expense.status,
          revision,
          expense.idempotencyKey,
          requestHash,
          actorMember.id,
          expense.createdAt,
        ]
      );
      await client.query(
        `
          INSERT INTO expense_change_log (
            trip_id, entity_type, entity_id, action, version,
            ledger_revision, changed_by_member_id, after_payload
          )
          VALUES ($1, 'transaction', $2, $3, 1, $4, $5, $6::jsonb)
        `,
        [tripId, expense.id, options.action ?? "created", revision, actorMember.id, JSON.stringify(expense)]
      );
      await client.query("COMMIT");
      return { expense: dbExpense(result.rows[0]), duplicated: false };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        const duplicateResult = await pool.query(
          `SELECT * FROM expense_transactions
           WHERE trip_id = $1
             AND created_by_member_id = $2
             AND idempotency_key = $3`,
          [tripId, actorMember.id, expense.idempotencyKey]
        );
        if (
          duplicateResult.rowCount > 0 &&
          duplicateResult.rows[0].request_hash === requestHash
        ) {
          return {
            expense: dbExpense(duplicateResult.rows[0]),
            duplicated: true,
          };
        }
        fail(409, "EXPENSE_ID_CONFLICT", "같은 ID 또는 요청 키의 거래가 이미 존재합니다.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateExpense(tripId, expenseId, actorMember, input, expectedVersion) {
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      fail(400, "EXPENSE_VERSION_REQUIRED", "수정할 거래의 version이 필요합니다.");
    }

    const normalized = normalizeExpense({ ...input, id: expenseId, idempotencyKey: input?.idempotencyKey ?? `update:${expenseId}` }, actorMember.id);

    if (!hasDatabaseUrl) {
      const key = ledgerKey(tripId, expenseId);
      const record = transactions.get(key);
      if (!record) fail(404, "EXPENSE_NOT_FOUND", "거래를 찾을 수 없습니다.");
      const current = record.payload;
      if (!canMemberViewExpense(current, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "관련된 멤버만 거래를 수정할 수 있습니다.");
      if (current.version !== expectedVersion) fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 거래가 변경되었습니다.", { current });
      await requirePartyMembers(tripId, expensePartyIds(normalized));
      if (!canMemberViewExpense(normalized, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "수정 후에도 현재 멤버가 거래 당사자여야 합니다.");
      const revision = nextMemoryRevision(tripId);
      const payload = withServerFields(
        { ...normalized, createdAt: current.createdAt, createdByMemberId: current.createdByMemberId, status: current.status },
        { status: current.status, version: expectedVersion + 1, ledgerRevision: revision, createdAt: current.createdAt, updatedAt: normalized.updatedAt, cancelledAt: current.cancelledAt }
      );
      transactions.set(key, { ...record, payload, requestHash: safePayloadHash(payload) });
      changes.push({ tripId, entityType: "transaction", entityId: expenseId, action: "updated", revision });
      return payload;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query("SELECT * FROM expense_transactions WHERE trip_id = $1 AND id = $2 FOR UPDATE", [tripId, expenseId]);
      if (currentResult.rowCount === 0) fail(404, "EXPENSE_NOT_FOUND", "거래를 찾을 수 없습니다.");
      const currentRow = currentResult.rows[0];
      const current = dbExpense(currentRow);
      if (!canMemberViewExpense(current, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "관련된 멤버만 거래를 수정할 수 있습니다.");
      if (currentRow.version !== expectedVersion) fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 거래가 변경되었습니다.", { current });
      await requirePartyMembers(tripId, expensePartyIds(normalized), client);
      if (!canMemberViewExpense(normalized, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "수정 후에도 현재 멤버가 거래 당사자여야 합니다.");
      const revision = await nextDbRevision(client, tripId);
      const payload = { ...normalized, createdAt: current.createdAt, createdByMemberId: current.createdByMemberId, status: current.status };
      const result = await client.query(
        `
          UPDATE expense_transactions
          SET expense_type = $3, currency = $4, local_amount = $5,
              owner_member_id = $6, paid_by_member_id = $7,
              lender_member_id = $8, borrower_member_id = $9,
              participant_member_ids = $10::uuid[], payload = $11::jsonb,
              version = version + 1, ledger_revision = $12,
              updated_by_member_id = $13, updated_at = NOW()
          WHERE trip_id = $1 AND id = $2 AND version = $14
          RETURNING *
        `,
        [tripId, expenseId, payload.expenseType, payload.currency, payload.localAmount, payload.ownerMemberId ?? null, payload.paidByMemberId ?? null, payload.lenderMemberId ?? null, payload.borrowerMemberId ?? null, payload.participantMemberIds ?? [], JSON.stringify(payload), revision, actorMember.id, expectedVersion]
      );
      await client.query(
        `INSERT INTO expense_change_log (trip_id, entity_type, entity_id, action, version, ledger_revision, changed_by_member_id, before_payload, after_payload)
         VALUES ($1, 'transaction', $2, 'updated', $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [tripId, expenseId, expectedVersion + 1, revision, actorMember.id, JSON.stringify(current), JSON.stringify(payload)]
      );
      await client.query("COMMIT");
      return dbExpense(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function changeExpenseStatus(tripId, expenseId, actorMember, expectedVersion, status) {
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) fail(400, "EXPENSE_VERSION_REQUIRED", "변경할 거래의 version이 필요합니다.");
    const action = status === "cancelled" ? "cancelled" : "restored";
    const key = ledgerKey(tripId, expenseId);

    if (!hasDatabaseUrl) {
      const record = transactions.get(key);
      if (!record) fail(404, "EXPENSE_NOT_FOUND", "거래를 찾을 수 없습니다.");
      const current = record.payload;
      if (!canMemberViewExpense(current, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "관련된 멤버만 거래 상태를 변경할 수 있습니다.");
      if (current.version !== expectedVersion) fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 거래가 변경되었습니다.", { current });
      const now = new Date().toISOString();
      const revision = nextMemoryRevision(tripId);
      const payload = { ...current, status, version: expectedVersion + 1, ledgerRevision: revision, updatedAt: now, updatedByMemberId: actorMember.id, ...(status === "cancelled" ? { cancelledAt: now } : { cancelledAt: undefined }) };
      transactions.set(key, { ...record, payload });
      changes.push({ tripId, entityType: "transaction", entityId: expenseId, action, revision });
      return payload;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query("SELECT * FROM expense_transactions WHERE trip_id = $1 AND id = $2 FOR UPDATE", [tripId, expenseId]);
      if (currentResult.rowCount === 0) fail(404, "EXPENSE_NOT_FOUND", "거래를 찾을 수 없습니다.");
      const current = dbExpense(currentResult.rows[0]);
      if (!canMemberViewExpense(current, actorMember.id)) fail(403, "EXPENSE_EDIT_DENIED", "관련된 멤버만 거래 상태를 변경할 수 있습니다.");
      if (currentResult.rows[0].version !== expectedVersion) fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 거래가 변경되었습니다.", { current });
      const revision = await nextDbRevision(client, tripId);
      const now = new Date().toISOString();
      const payload = { ...current, status, updatedAt: now, updatedByMemberId: actorMember.id, ...(status === "cancelled" ? { cancelledAt: now } : { cancelledAt: undefined }) };
      const result = await client.query(
        `UPDATE expense_transactions SET payload = $3::jsonb, status = $4, version = version + 1,
         ledger_revision = $5, updated_by_member_id = $6, updated_at = NOW(),
         cancelled_at = CASE WHEN $4 = 'cancelled' THEN NOW() ELSE NULL END
         WHERE trip_id = $1 AND id = $2 AND version = $7 RETURNING *`,
        [tripId, expenseId, JSON.stringify(payload), status, revision, actorMember.id, expectedVersion]
      );
      await client.query(
        `INSERT INTO expense_change_log (trip_id, entity_type, entity_id, action, version, ledger_revision, changed_by_member_id, before_payload, after_payload)
         VALUES ($1, 'transaction', $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [tripId, expenseId, action, expectedVersion + 1, revision, actorMember.id, JSON.stringify(current), JSON.stringify(payload)]
      );
      await client.query("COMMIT");
      return dbExpense(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function createPayment(tripId, actorMember, input) {
    const payment = normalizePayment(input, actorMember.id);
    const partyIds = [payment.fromMemberId, payment.toMemberId];
    if (!partyIds.includes(actorMember.id)) fail(403, "EXPENSE_ACTOR_NOT_RELATED", "정산 당사자만 상환을 기록할 수 있습니다.");
    await requirePartyMembers(tripId, partyIds);
    const requestHash = safePayloadHash(payment);

    if (!hasDatabaseUrl) {
      const duplicate = [...payments.values()].find((item) => item.tripId === tripId && item.createdByMemberId === actorMember.id && item.idempotencyKey === payment.idempotencyKey);
      if (duplicate) {
        if (duplicate.requestHash !== requestHash) fail(409, "EXPENSE_IDEMPOTENCY_CONFLICT", "같은 요청 키가 다른 정산에 사용되었습니다.");
        return { payment: duplicate.payload, duplicated: true };
      }
      if (payments.has(ledgerKey(tripId, payment.id))) fail(409, "EXPENSE_ID_CONFLICT", "같은 ID의 정산이 이미 존재합니다.");
      const revision = nextMemoryRevision(tripId);
      const payload = withServerFields(payment, { status: payment.status, version: 1, ledgerRevision: revision, createdAt: payment.createdAt, updatedAt: payment.updatedAt });
      payments.set(ledgerKey(tripId, payment.id), { tripId, payload, createdByMemberId: actorMember.id, idempotencyKey: payment.idempotencyKey, requestHash });
      changes.push({ tripId, entityType: "payment", entityId: payment.id, action: "created", revision });
      return { payment: payload, duplicated: false };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await requirePartyMembers(tripId, partyIds, client);
      const duplicateResult = await client.query("SELECT * FROM expense_settlement_payments WHERE trip_id = $1 AND created_by_member_id = $2 AND idempotency_key = $3 FOR UPDATE", [tripId, actorMember.id, payment.idempotencyKey]);
      if (duplicateResult.rowCount > 0) {
        if (duplicateResult.rows[0].request_hash !== requestHash) fail(409, "EXPENSE_IDEMPOTENCY_CONFLICT", "같은 요청 키가 다른 정산에 사용되었습니다.");
        await client.query("COMMIT");
        return { payment: dbPayment(duplicateResult.rows[0]), duplicated: true };
      }
      const revision = await nextDbRevision(client, tripId);
      const result = await client.query(
        `INSERT INTO expense_settlement_payments (
          id, trip_id, source, from_member_id, to_member_id, currency,
          local_amount, payload, status, version, ledger_revision,
          idempotency_key, request_hash, created_by_member_id,
          updated_by_member_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,1,$10,$11,$12,$13,$13,$14,$14)
        RETURNING *`,
        [payment.id, tripId, payment.source, payment.fromMemberId, payment.toMemberId, payment.currency, payment.localAmount, JSON.stringify(payment), payment.status, revision, payment.idempotencyKey, requestHash, actorMember.id, payment.createdAt]
      );
      await client.query(
        `INSERT INTO expense_change_log (trip_id, entity_type, entity_id, action, version, ledger_revision, changed_by_member_id, after_payload)
         VALUES ($1, 'payment', $2, 'created', 1, $3, $4, $5::jsonb)`,
        [tripId, payment.id, revision, actorMember.id, JSON.stringify(payment)]
      );
      await client.query("COMMIT");
      return { payment: dbPayment(result.rows[0]), duplicated: false };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        const duplicateResult = await pool.query(
          `SELECT * FROM expense_settlement_payments
           WHERE trip_id = $1
             AND created_by_member_id = $2
             AND idempotency_key = $3`,
          [tripId, actorMember.id, payment.idempotencyKey]
        );
        if (
          duplicateResult.rowCount > 0 &&
          duplicateResult.rows[0].request_hash === requestHash
        ) {
          return {
            payment: dbPayment(duplicateResult.rows[0]),
            duplicated: true,
          };
        }
        fail(409, "EXPENSE_ID_CONFLICT", "같은 ID 또는 요청 키의 정산이 이미 존재합니다.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function changePaymentStatus(
    tripId,
    paymentId,
    actorMember,
    expectedVersion,
    status
  ) {
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      fail(400, "EXPENSE_VERSION_REQUIRED", "변경할 정산의 version이 필요합니다.");
    }

    const action = status === "cancelled" ? "cancelled" : "restored";
    const key = ledgerKey(tripId, paymentId);

    if (!hasDatabaseUrl) {
      const record = payments.get(key);
      if (!record) fail(404, "EXPENSE_PAYMENT_NOT_FOUND", "정산 기록을 찾을 수 없습니다.");
      const current = record.payload;
      if (!canMemberViewPayment(current, actorMember.id)) {
        fail(403, "EXPENSE_EDIT_DENIED", "정산 당사자만 상태를 변경할 수 있습니다.");
      }
      if (current.version !== expectedVersion) {
        fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 정산 기록이 변경되었습니다.", { current });
      }
      const now = new Date().toISOString();
      const revision = nextMemoryRevision(tripId);
      const payload = {
        ...current,
        status,
        version: expectedVersion + 1,
        ledgerRevision: revision,
        updatedAt: now,
        updatedByMemberId: actorMember.id,
        ...(status === "cancelled"
          ? { cancelledAt: now }
          : { cancelledAt: undefined }),
      };
      payments.set(key, { ...record, payload });
      changes.push({ tripId, entityType: "payment", entityId: paymentId, action, revision });
      return payload;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        "SELECT * FROM expense_settlement_payments WHERE trip_id = $1 AND id = $2 FOR UPDATE",
        [tripId, paymentId]
      );
      if (currentResult.rowCount === 0) {
        fail(404, "EXPENSE_PAYMENT_NOT_FOUND", "정산 기록을 찾을 수 없습니다.");
      }
      const current = dbPayment(currentResult.rows[0]);
      if (!canMemberViewPayment(current, actorMember.id)) {
        fail(403, "EXPENSE_EDIT_DENIED", "정산 당사자만 상태를 변경할 수 있습니다.");
      }
      if (currentResult.rows[0].version !== expectedVersion) {
        fail(409, "EXPENSE_VERSION_CONFLICT", "다른 기기에서 정산 기록이 변경되었습니다.", { current });
      }
      const revision = await nextDbRevision(client, tripId);
      const now = new Date().toISOString();
      const payload = {
        ...current,
        status,
        updatedAt: now,
        updatedByMemberId: actorMember.id,
        ...(status === "cancelled"
          ? { cancelledAt: now }
          : { cancelledAt: undefined }),
      };
      const result = await client.query(
        `UPDATE expense_settlement_payments
         SET payload = $3::jsonb, status = $4, version = version + 1,
             ledger_revision = $5, updated_by_member_id = $6,
             updated_at = NOW(),
             cancelled_at = CASE WHEN $4 = 'cancelled' THEN NOW() ELSE NULL END
         WHERE trip_id = $1 AND id = $2 AND version = $7
         RETURNING *`,
        [tripId, paymentId, JSON.stringify(payload), status, revision, actorMember.id, expectedVersion]
      );
      await client.query(
        `INSERT INTO expense_change_log (
          trip_id, entity_type, entity_id, action, version,
          ledger_revision, changed_by_member_id, before_payload, after_payload
        ) VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [tripId, paymentId, action, expectedVersion + 1, revision, actorMember.id, JSON.stringify(current), JSON.stringify(payload)]
      );
      await client.query("COMMIT");
      return dbPayment(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  router.post("/auth/device-sessions", async (req, res) => {
    try {
      allowDeviceRegistration(req);
      const result = await createDeviceSession(req.body?.displayName);
      return res.status(201).json({
        user: result.user,
        accessToken: result.token,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      return responseError(res, error);
    }
  });

  router.get("/auth/session", authenticate, (req, res) =>
    res.json({ user: req.auth.user })
  );

  router.get("/trips/:tripId/expense-ledger", authenticate, async (req, res) => {
    try {
      const member = await requireMember(req.params.tripId, req.auth.user.id);
      const ledger = await readLedger(req.params.tripId, member.id);
      const sinceRevision = Number(req.query.sinceRevision);
      return res.json({
        ...ledger,
        unchanged: Number.isSafeInteger(sinceRevision) && sinceRevision === ledger.revision,
      });
    } catch (error) {
      return responseError(res, error);
    }
  });

  router.post("/trips/:tripId/expense-ledger/transactions", authenticate, async (req, res) => {
    try {
      const member = await requireMember(req.params.tripId, req.auth.user.id);
      const result = await createExpense(req.params.tripId, member, req.body);
      return res.status(result.duplicated ? 200 : 201).json(result);
    } catch (error) {
      return responseError(res, error);
    }
  });

  router.put("/trips/:tripId/expense-ledger/transactions/:expenseId", authenticate, async (req, res) => {
    try {
      const member = await requireMember(req.params.tripId, req.auth.user.id);
      const expense = await updateExpense(req.params.tripId, req.params.expenseId, member, req.body?.expense ?? req.body, Number(req.body?.version));
      return res.json({ expense });
    } catch (error) {
      return responseError(res, error);
    }
  });

  for (const [action, status] of [["cancel", "cancelled"], ["restore", "active"]]) {
    router.post(`/trips/:tripId/expense-ledger/transactions/:expenseId/${action}`, authenticate, async (req, res) => {
      try {
        const member = await requireMember(req.params.tripId, req.auth.user.id);
        const expense = await changeExpenseStatus(req.params.tripId, req.params.expenseId, member, Number(req.body?.version), status);
        return res.json({ expense });
      } catch (error) {
        return responseError(res, error);
      }
    });
  }

  router.post("/trips/:tripId/expense-ledger/payments", authenticate, async (req, res) => {
    try {
      const member = await requireMember(req.params.tripId, req.auth.user.id);
      const result = await createPayment(req.params.tripId, member, req.body);
      return res.status(result.duplicated ? 200 : 201).json(result);
    } catch (error) {
      return responseError(res, error);
    }
  });

  for (const [action, status] of [["cancel", "cancelled"], ["restore", "active"]]) {
    router.post(`/trips/:tripId/expense-ledger/payments/:paymentId/${action}`, authenticate, async (req, res) => {
      try {
        const member = await requireMember(req.params.tripId, req.auth.user.id);
        const payment = await changePaymentStatus(
          req.params.tripId,
          req.params.paymentId,
          member,
          Number(req.body?.version),
          status
        );
        return res.json({ payment });
      } catch (error) {
        return responseError(res, error);
      }
    });
  }

  router.post("/trips/:tripId/expense-ledger/import-preview", authenticate, async (req, res) => {
    try {
      const member = await requireMember(req.params.tripId, req.auth.user.id);
      const expenseInputs = Array.isArray(req.body?.expenses) ? req.body.expenses : [];
      const paymentInputs = Array.isArray(req.body?.payments) ? req.body.payments : [];
      const normalizedExpenses = expenseInputs.map((item) => normalizeExpense(item, member.id));
      const normalizedPayments = paymentInputs.map((item) => normalizePayment(item, member.id));

      for (const expense of normalizedExpenses) {
        await requirePartyMembers(req.params.tripId, expensePartyIds(expense));
        if (!canMemberViewExpense(expense, member.id)) fail(403, "EXPENSE_IMPORT_NOT_RELATED", "현재 멤버와 관련된 로컬 거래만 가져올 수 있습니다.");
      }
      for (const payment of normalizedPayments) {
        await requirePartyMembers(req.params.tripId, [payment.fromMemberId, payment.toMemberId]);
        if (!canMemberViewPayment(payment, member.id)) fail(403, "EXPENSE_IMPORT_NOT_RELATED", "현재 멤버와 관련된 정산만 가져올 수 있습니다.");
      }

      const ledger = await readLedger(req.params.tripId, member.id);
      const serverExpenseIds = new Set(ledger.expenses.map((item) => item.id));
      const serverPaymentIds = new Set(ledger.payments.map((item) => item.id));
      return res.json({
        previewId: stableHash({
          tripId: req.params.tripId,
          memberId: member.id,
          expenses: normalizedExpenses.map(safePayloadHash),
          payments: normalizedPayments.map(safePayloadHash),
        }),
        local: { expenses: normalizedExpenses.length, payments: normalizedPayments.length },
        newItems: {
          expenses: normalizedExpenses.filter((item) => !serverExpenseIds.has(item.id)).length,
          payments: normalizedPayments.filter((item) => !serverPaymentIds.has(item.id)).length,
        },
        existingItems: {
          expenses: normalizedExpenses.filter((item) => serverExpenseIds.has(item.id)).length,
          payments: normalizedPayments.filter((item) => serverPaymentIds.has(item.id)).length,
        },
        requiresExplicitConfirmation: true,
      });
    } catch (error) {
      return responseError(res, error);
    }
  });

  router._expenseSyncTestState = {
    sessions,
    transactions,
    payments,
    revisions,
    changes,
    accessGrants,
    grantAccess(tripId, memberId, userId) {
      if (process.env.NODE_ENV !== "test") {
        throw new Error("Test grants are available only in NODE_ENV=test.");
      }
      accessGrants.add(accessGrantKey(tripId, memberId, userId));
    },
  };

  return router;
}

module.exports = { createExpenseSyncRouter };
