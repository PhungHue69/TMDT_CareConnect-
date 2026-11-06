// Liên kết gia đình (Family_Links): mời bằng mã QR hoặc số điện thoại, xem hồ sơ người thân
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { ah, HttpError } = require('../utils/http');
const { PHONE_RE } = require('./auth');
const { notify } = require('../services/notifications');
const { DEFAULT_PERMISSIONS, getActiveCaregivers, assertCanManage } = require('../services/family');
const { getHealthProfile, upsertHealthProfile } = require('../services/healthProfile');
const { getTodayDoses, summarize, getHistory } = require('../services/reminders');

const INVITE_TTL_HOURS = 24;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bỏ 0/O, 1/I/L dễ nhầm khi đọc cho bố mẹ

const MEMBER_FIELDS = 'u.id AS user_id, u.full_name, u.phone, u.avatar_url, u.date_of_birth, u.gender, u.ui_mode';

function generateCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    return code;
}

async function getUserName(id) {
    const { rows } = await db.query('SELECT full_name FROM users WHERE id = $1', [id]);
    return rows[0] ? rows[0].full_name : '';
}

function validRelationship(rel) {
    const value = (rel || '').trim();
    if (!value || value.length > 50) throw new HttpError(400, 'Vui lòng chọn mối quan hệ');
    return value;
}

// Danh sách thành viên: người tôi chăm sóc, người chăm sóc tôi, lời mời đang chờ
router.get('/', ah(async (req, res) => {
    const me = req.user.id;
    const asCaregiver = await db.query(
        `SELECT fl.id AS link_id, fl.relationship, fl.status, fl.created_at, ${MEMBER_FIELDS}
         FROM family_links fl JOIN users u ON u.id = fl.dependent_user_id
         WHERE fl.caregiver_user_id = $1 AND fl.status IN ('ACTIVE', 'PENDING')
         ORDER BY fl.created_at`,
        [me]
    );
    const asDependent = await db.query(
        `SELECT fl.id AS link_id, fl.relationship, fl.status, fl.created_at, ${MEMBER_FIELDS}
         FROM family_links fl JOIN users u ON u.id = fl.caregiver_user_id
         WHERE fl.dependent_user_id = $1 AND fl.status IN ('ACTIVE', 'PENDING')
         ORDER BY fl.created_at`,
        [me]
    );

    const dependents = asCaregiver.rows.filter((r) => r.status === 'ACTIVE');
    const doses = dependents.length ? await getTodayDoses(dependents.map((d) => d.user_id)) : [];
    for (const d of dependents) {
        d.today = doses.filter((x) => Number(x.patient_user_id) === Number(d.user_id));
        d.summary = summarize(d.today);
    }

    res.json({
        dependents,
        caregivers: asDependent.rows.filter((r) => r.status === 'ACTIVE'),
        outgoing: asCaregiver.rows.filter((r) => r.status === 'PENDING'),
        incoming: asDependent.rows.filter((r) => r.status === 'PENDING'),
    });
}));

// ------------------------------------------------------------ Mời bằng mã QR
router.post('/invites', ah(async (req, res) => {
    const relationship = validRelationship(req.body.relationship);
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const { rows } = await db.query(
            `INSERT INTO family_invites (code, caregiver_user_id, relationship, expires_at)
             VALUES ($1, $2, $3, now() + make_interval(hours => $4))
             ON CONFLICT (code) DO NOTHING
             RETURNING code, relationship, expires_at`,
            [code, req.user.id, relationship, INVITE_TTL_HOURS]
        );
        if (rows[0]) return res.status(201).json({ invite: rows[0] });
    }
    throw new HttpError(500, 'Không tạo được mã mời, vui lòng thử lại');
}));

async function loadInvite(client, code, lock = false) {
    const { rows } = await client.query(
        `SELECT i.*, u.full_name AS inviter_name, u.phone AS inviter_phone
         FROM family_invites i JOIN users u ON u.id = i.caregiver_user_id
         WHERE i.code = $1 ${lock ? 'FOR UPDATE OF i' : ''}`,
        [String(code || '').trim().toUpperCase()]
    );
    const invite = rows[0];
    if (!invite) throw new HttpError(404, 'Mã mời không đúng');
    if (invite.used_at) throw new HttpError(410, 'Mã mời này đã được sử dụng');
    if (new Date(invite.expires_at) < new Date()) throw new HttpError(410, 'Mã mời đã hết hạn, hãy nhờ người thân tạo mã mới');
    return invite;
}

// Xem trước lời mời trước khi đồng ý (trên máy Bố mẹ)
router.get('/invites/:code', ah(async (req, res) => {
    const invite = await loadInvite(db, req.params.code);
    res.json({
        invite: {
            code: invite.code,
            relationship: invite.relationship,
            inviter_name: invite.inviter_name,
            inviter_phone: invite.inviter_phone,
            expires_at: invite.expires_at,
            is_own: Number(invite.caregiver_user_id) === req.user.id,
        },
    });
}));

// Bố mẹ nhập/quét mã -> liên kết ACTIVE ngay (người được mời tự thao tác nên coi như đã đồng ý)
router.post('/join', ah(async (req, res) => {
    const me = req.user.id;
    const link = await db.withTransaction(async (client) => {
        const invite = await loadInvite(client, req.body.code, true);
        const caregiverId = Number(invite.caregiver_user_id);
        if (caregiverId === me) throw new HttpError(400, 'Đây là mã do chính bạn tạo. Hãy mở mã này trên máy của người thân.');

        const existing = await client.query(
            'SELECT id, status FROM family_links WHERE caregiver_user_id = $1 AND dependent_user_id = $2',
            [caregiverId, me]
        );
        if (existing.rows[0] && existing.rows[0].status === 'ACTIVE') throw new HttpError(409, 'Hai tài khoản đã được liên kết từ trước');

        const { rows } = existing.rows[0]
            ? await client.query(
                `UPDATE family_links SET status = 'ACTIVE', relationship = $2, invite_code = $3,
                        permissions_json = COALESCE(permissions_json, $4)
                 WHERE id = $1 RETURNING *`,
                [existing.rows[0].id, invite.relationship, invite.code, DEFAULT_PERMISSIONS]
            )
            : await client.query(
                `INSERT INTO family_links (caregiver_user_id, dependent_user_id, relationship, permissions_json, status, invite_code)
                 VALUES ($1, $2, $3, $4, 'ACTIVE', $5) RETURNING *`,
                [caregiverId, me, invite.relationship, DEFAULT_PERMISSIONS, invite.code]
            );
        await client.query('UPDATE family_invites SET used_by_user_id = $2, used_at = now() WHERE id = $1', [invite.id, me]);
        return rows[0];
    });

    await notify(link.caregiver_user_id, {
        type: 'SYSTEM',
        title: 'Liên kết gia đình thành công',
        body: `${await getUserName(me)} (${link.relationship}) đã chấp nhận lời mời. Bạn có thể cài lịch nhắc uống thuốc cho ${link.relationship.toLowerCase()} ngay.`,
        data: { kind: 'FAMILY_LINKED', link_id: link.id, user_id: me },
    });
    res.status(201).json({ link });
}));

// ------------------------------------------------- Mời bằng số điện thoại
router.post('/links/by-phone', ah(async (req, res) => {
    const me = req.user.id;
    const relationship = validRelationship(req.body.relationship);
    const phone = (req.body.phone || '').trim();
    if (!PHONE_RE.test(phone)) throw new HttpError(400, 'Số điện thoại gồm 10 số và bắt đầu bằng 0');

    const target = await db.query("SELECT id, full_name FROM users WHERE phone = $1 AND role = 'BUYER'", [phone]);
    if (!target.rows[0]) {
        throw new HttpError(404, 'Chưa có tài khoản CareConnect với số này. Hãy đăng ký giúp người thân rồi mời lại, hoặc dùng mã QR.');
    }
    const targetId = Number(target.rows[0].id);
    if (targetId === me) throw new HttpError(400, 'Không thể tự liên kết với chính mình');

    const existing = await db.query(
        'SELECT id, status FROM family_links WHERE caregiver_user_id = $1 AND dependent_user_id = $2',
        [me, targetId]
    );
    const current = existing.rows[0];
    if (current && current.status === 'ACTIVE') throw new HttpError(409, 'Hai tài khoản đã được liên kết từ trước');
    if (current && current.status === 'PENDING') throw new HttpError(409, 'Đã gửi lời mời, đang chờ xác nhận');

    const { rows } = current
        ? await db.query(
            `UPDATE family_links SET status = 'PENDING', relationship = $2, permissions_json = COALESCE(permissions_json, $3)
             WHERE id = $1 RETURNING *`,
            [current.id, relationship, DEFAULT_PERMISSIONS]
        )
        : await db.query(
            `INSERT INTO family_links (caregiver_user_id, dependent_user_id, relationship, permissions_json, status)
             VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *`,
            [me, targetId, relationship, DEFAULT_PERMISSIONS]
        );

    await notify(targetId, {
        type: 'SYSTEM',
        title: 'Lời mời liên kết gia đình',
        body: `${await getUserName(me)} mời bạn liên kết với gia đình (bạn là "${relationship}" của người này). Vào mục Gia đình để đồng ý.`,
        data: { kind: 'FAMILY_LINK_REQUEST', link_id: rows[0].id, from_user_id: me },
    });
    res.status(201).json({ link: rows[0] });
}));

router.post('/links/:id/accept', ah(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE family_links SET status = 'ACTIVE'
         WHERE id = $1 AND dependent_user_id = $2 AND status = 'PENDING' RETURNING *`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy lời mời');
    await notify(rows[0].caregiver_user_id, {
        type: 'SYSTEM',
        title: 'Liên kết gia đình thành công',
        body: `${await getUserName(req.user.id)} (${rows[0].relationship}) đã đồng ý liên kết với bạn.`,
        data: { kind: 'FAMILY_LINKED', link_id: rows[0].id, user_id: req.user.id },
    });
    res.json({ link: rows[0] });
}));

router.post('/links/:id/reject', ah(async (req, res) => {
    const { rows } = await db.query(
        `UPDATE family_links SET status = 'REVOKED'
         WHERE id = $1 AND dependent_user_id = $2 AND status = 'PENDING' RETURNING *`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy lời mời');
    await notify(rows[0].caregiver_user_id, {
        type: 'SYSTEM',
        title: 'Lời mời liên kết bị từ chối',
        body: `${await getUserName(req.user.id)} đã từ chối lời mời liên kết.`,
        data: { kind: 'FAMILY_LINK_REJECTED', link_id: rows[0].id },
    });
    res.json({ link: rows[0] });
}));

// Hủy liên kết (một trong hai bên) hoặc thu hồi lời mời đã gửi
router.delete('/links/:id', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT * FROM family_links
         WHERE id = $1 AND (caregiver_user_id = $2 OR dependent_user_id = $2) AND status <> 'REVOKED'`,
        [req.params.id, me]
    );
    const link = rows[0];
    if (!link) throw new HttpError(404, 'Không tìm thấy liên kết');
    await db.query("UPDATE family_links SET status = 'REVOKED' WHERE id = $1", [link.id]);
    if (link.status === 'ACTIVE') {
        const other = Number(link.caregiver_user_id) === me ? link.dependent_user_id : link.caregiver_user_id;
        await notify(other, {
            type: 'SYSTEM',
            title: 'Đã hủy liên kết gia đình',
            body: `${await getUserName(me)} đã hủy liên kết gia đình với bạn.`,
            data: { kind: 'FAMILY_UNLINKED', link_id: link.id },
        });
    }
    res.json({ ok: true });
}));

// ------------------------------------------------- Hồ sơ người thân
router.get('/members/:userId', ah(async (req, res) => {
    const memberId = Number(req.params.userId);
    const access = await assertCanManage(req.user.id, memberId, 'view_health');
    const { rows } = await db.query(
        `SELECT ${MEMBER_FIELDS} FROM users u WHERE u.id = $1`,
        [memberId]
    );
    const addresses = await db.query(
        `SELECT id, label, recipient_name, recipient_phone, address_line, is_default
         FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at`,
        [memberId]
    );
    const today = await getTodayDoses([memberId]);
    res.json({
        member: { ...rows[0], relationship: access.relationship },
        health_profile: await getHealthProfile(memberId),
        addresses: addresses.rows,
        today,
        summary: summarize(today),
        history: await getHistory(memberId, 7),
    });
}));

router.put('/members/:userId/health', ah(async (req, res) => {
    const memberId = Number(req.params.userId);
    await assertCanManage(req.user.id, memberId, 'view_health');
    res.json({ health_profile: await upsertHealthProfile(memberId, req.body) });
}));

// Bố mẹ bấm "Nhờ con mua thuốc"
router.post('/help-request', ah(async (req, res) => {
    const me = req.user.id;
    const caregivers = await getActiveCaregivers(me);
    if (!caregivers.length) throw new HttpError(400, 'Bạn chưa có người thân nào đang chăm sóc');
    const { rows } = await db.query('SELECT full_name, phone FROM users WHERE id = $1', [me]);
    const message = (req.body.message || '').trim().slice(0, 500) || 'Mình cần mua thêm thuốc, liên hệ lại nhé.';
    for (const c of caregivers) {
        await notify(c.id, {
            type: 'SYSTEM',
            title: `${c.relationship} nhờ bạn mua thuốc`,
            body: `${rows[0].full_name}: "${message}"`,
            data: { kind: 'HELP_REQUEST', from_user_id: me, phone: rows[0].phone, relationship: c.relationship },
        });
    }
    res.json({ sent_to: caregivers.length });
}));

// Đơn thuốc trong gia đình: Con đặt cho Bố mẹ, hoặc Bố mẹ được con đặt cho
router.get('/orders', ah(async (req, res) => {
    const me = req.user.id;
    const { rows } = await db.query(
        `SELECT o.id, o.order_code, o.status, o.payment_status, o.total_amount, o.created_at,
                o.shipping_address_line, o.buyer_user_id, o.recipient_user_id,
                p.name AS pharmacy_name, b.full_name AS buyer_name, r.full_name AS recipient_name,
                fl.relationship,
                (SELECT json_agg(json_build_object('name', oi.product_name_snapshot, 'quantity', oi.quantity) ORDER BY oi.id)
                 FROM order_items oi WHERE oi.order_id = o.id) AS items
         FROM orders o
         JOIN pharmacies p ON p.id = o.pharmacy_id
         JOIN users b ON b.id = o.buyer_user_id
         JOIN users r ON r.id = o.recipient_user_id
         LEFT JOIN family_links fl ON fl.caregiver_user_id = o.buyer_user_id
              AND fl.dependent_user_id = o.recipient_user_id AND fl.status = 'ACTIVE'
         WHERE o.buyer_user_id <> o.recipient_user_id AND (o.buyer_user_id = $1 OR o.recipient_user_id = $1)
         ORDER BY o.created_at DESC
         LIMIT 20`,
        [me]
    );
    res.json({ orders: rows });
}));

module.exports = router;
