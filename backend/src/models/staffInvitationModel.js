const pool = require("../config/db");
const users = require("./userModel");
const { fail } = require("../utils/validation");

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function lockStaff(id, connection) {
  const [[user]] = await connection.execute(
    "SELECT * FROM users WHERE id = ? AND role IN ('organizer', 'coordinator') FOR UPDATE", [id]
  );
  if (!user) fail("Staff account not found", 404);
  return user;
}

async function issue(connection, userId, tokenHash) {
  await connection.execute("DELETE FROM staff_invitations WHERE user_id = ?", [userId]);
  await connection.execute(
    `INSERT INTO staff_invitations (user_id, token_hash, issued_at, expires_at)
     VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 24 HOUR)`,
    [userId, tokenHash]
  );
}

async function createStaff(assignment, tokenHash) {
  return transaction(async connection => {
    const user = await users.create({ ...assignment, password: "" }, connection);
    await issue(connection, user.id, tokenHash);
    return user;
  });
}

async function renew(id, tokenHash) {
  return transaction(async connection => {
    const user = await lockStaff(id, connection);
    if (user.status !== "active") fail("Restore staff access before sending a setup link", 409);
    if (!user.department?.trim()) fail("Assign a department before sending a setup link", 409);

    const [[sending]] = await connection.execute(
      `SELECT 1 FROM staff_invitations WHERE user_id = ? AND delivery_status = 'pending'
       AND issued_at > UTC_TIMESTAMP() - INTERVAL 30 SECOND`, [id]
    );
    if (sending) fail("An email is already being sent. Try again in a moment.", 409);

    if (!user.staff_verified || user.must_change_password) {
      // Move older, incomplete temporary-password accounts to the invitation flow.
      await connection.execute(
        `UPDATE users SET password = '', staff_verified = 0, must_change_password = 0,
         credential_version = credential_version + 1 WHERE id = ?`, [id]
      );
    }
    await issue(connection, id, tokenHash);
    return user;
  });
}

async function recordDelivery(id, tokenHash, deliveryStatus) {
  await pool.execute(
    "UPDATE staff_invitations SET delivery_status = ? WHERE user_id = ? AND token_hash = ?",
    [deliveryStatus, id, tokenHash]
  );
  return users.findStaff(id);
}

async function findRecipient(tokenHash) {
  const [[invite]] = await pool.execute(
    `SELECT user_id FROM staff_invitations WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()`,
    [tokenHash]
  );
  return invite?.user_id;
}

async function redeem(id, tokenHash, password) {
  return transaction(async connection => {
    const user = await lockStaff(id, connection);
    if (user.status !== "active" || !user.department?.trim()) return false;
    const [result] = await connection.execute(
      "DELETE FROM staff_invitations WHERE user_id = ? AND token_hash = ? AND expires_at > UTC_TIMESTAMP()",
      [id, tokenHash]
    );
    if (!result.affectedRows) return false;

    await connection.execute(
      `UPDATE users SET password = ?, staff_verified = 1, must_change_password = 0,
       credential_version = credential_version + 1 WHERE id = ?`, [password, id]
    );
    return true;
  });
}

async function updateAccess(id, assignment) {
  return transaction(async connection => {
    await lockStaff(id, connection);
    await users.updateStaff(id, assignment, connection);
    if (assignment.status === "suspended") {
      await connection.execute("DELETE FROM staff_invitations WHERE user_id = ?", [id]);
    }
    return users.findStaff(id, connection);
  });
}

module.exports = { createStaff, renew, recordDelivery, findRecipient, redeem, updateAccess };
