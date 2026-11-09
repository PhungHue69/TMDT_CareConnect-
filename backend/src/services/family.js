const db = require('../db');
const { HttpError } = require('../utils/http');

const DEFAULT_PERMISSIONS = { view_health: true, order_for: true, manage_reminders: true };

// Những người Con đang chăm sóc (liên kết ACTIVE) một người
async function getActiveCaregivers(dependentId) {
    const { rows } = await db.query(
        `SELECT u.id, u.full_name, u.phone, fl.relationship
         FROM family_links fl JOIN users u ON u.id = fl.caregiver_user_id
         WHERE fl.dependent_user_id = $1 AND fl.status = 'ACTIVE'`,
        [dependentId]
    );
    return rows;
}

/**
 * Kiểm tra actor có được thao tác trên tài khoản patient không:
 * chính chủ, hoặc là Con có liên kết ACTIVE và không bị tắt quyền tương ứng.
 */
async function assertCanManage(actorId, patientId, permission = 'manage_reminders') {
    if (Number(actorId) === Number(patientId)) return { self: true, relationship: null };
    const { rows } = await db.query(
        `SELECT relationship, permissions_json FROM family_links
         WHERE caregiver_user_id = $1 AND dependent_user_id = $2 AND status = 'ACTIVE'`,
        [actorId, patientId]
    );
    if (!rows[0]) throw new HttpError(403, 'Bạn chưa liên kết gia đình với tài khoản này');
    const perms = rows[0].permissions_json || DEFAULT_PERMISSIONS;
    if (perms[permission] === false) throw new HttpError(403, 'Bạn không được cấp quyền thực hiện thao tác này');
    return { self: false, relationship: rows[0].relationship };
}

module.exports = { DEFAULT_PERMISSIONS, getActiveCaregivers, assertCanManage };
