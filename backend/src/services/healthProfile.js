const db = require('../db');

const FIELDS = [
    'blood_type', 'height_cm', 'weight_kg', 'allergies', 'chronic_conditions',
    'current_medications', 'emergency_contact_name', 'emergency_contact_phone', 'notes',
];

async function getHealthProfile(userId) {
    const { rows } = await db.query('SELECT * FROM health_profiles WHERE user_id = $1', [userId]);
    return rows[0] || null;
}

async function upsertHealthProfile(userId, body) {
    const values = FIELDS.map((f) => {
        const v = body[f];
        return v === undefined || v === '' ? null : v;
    });
    const { rows } = await db.query(
        `INSERT INTO health_profiles (user_id, ${FIELDS.join(', ')})
         VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT (user_id) DO UPDATE SET ${FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(', ')}
         RETURNING *`,
        [userId, ...values]
    );
    return rows[0];
}

module.exports = { getHealthProfile, upsertHealthProfile };
