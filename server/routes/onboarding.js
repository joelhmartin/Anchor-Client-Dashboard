import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { query } from '../db.js';
import { createNotificationsForAdmins, notifyAdminsByEmail } from '../services/notifications.js';

const router = express.Router();

const TOKEN_TTL_HOURS = parseInt(process.env.ONBOARDING_TOKEN_TTL_HOURS || '72', 10);
function normalizeBase(value) {
  if (!value) return null;
  let base = String(value).trim();
  if (!/^https?:\/\//i.test(base)) {
    const isLocal = base.startsWith('localhost') || base.startsWith('127.0.0.1');
    base = `${isLocal ? 'http' : 'https'}://${base}`;
  }
  return base.replace(/\/$/, '');
}

function resolveBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const isLocalHost = host && (host.includes('localhost') || host.includes('127.0.0.1'));

  const localOverride = normalizeBase(process.env.LOCAL_APP_BASE_URL);
  if (isLocalHost && localOverride) return localOverride;

  if (isLocalHost && process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  const fromEnv = normalizeBase(process.env.APP_BASE_URL || process.env.CLIENT_APP_URL);
  if (fromEnv) return fromEnv;

  if (host) return normalizeBase(`${proto}://${host}`);

  return 'http://localhost:3000';
}

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const avatarDir = path.join(uploadRoot, 'avatars');
const brandDir = path.join(uploadRoot, 'brand');
[uploadRoot, avatarDir, brandDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function storage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname?.replace?.(/[^\w.-]+/g, '_') || 'upload';
      cb(null, `${Date.now()}_${safeName}`);
    }
  });
}

const uploadAvatar = multer({ storage: storage(avatarDir) });
const uploadBrandAsset = multer({ storage: storage(brandDir) });

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getTokenRecord(token) {
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT * FROM client_onboarding_tokens 
     WHERE token_hash = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

router.get('/:token', async (req, res) => {
  try {
    const record = await getTokenRecord(req.params.token);
    if (!record) return res.status(404).json({ message: 'Onboarding link is invalid or expired' });

    const [{ rows: userRows }, { rows: brandRows }, { rows: servicesRows }] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.first_name, u.last_name, cp.*, COALESCE(cp.client_identifier_value, '') AS client_identifier_value
         FROM users u
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
         WHERE u.id = $1`,
        [record.user_id]
      ),
      query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [record.user_id]),
      query('SELECT id, name, description, base_price, active FROM services WHERE user_id = $1 ORDER BY name ASC', [record.user_id])
    ]);

    if (!userRows.length) return res.status(404).json({ message: 'Client not found for onboarding' });

    res.json({
      user: {
        id: userRows[0].id,
        email: userRows[0].email,
        first_name: userRows[0].first_name,
        last_name: userRows[0].last_name
      },
      profile: {
        monthly_revenue_goal: userRows[0].monthly_revenue_goal || '',
        client_identifier_value: userRows[0].client_identifier_value || '',
        ai_prompt: userRows[0].ai_prompt || '',
        website_access_provided: userRows[0].website_access_provided || false,
        website_access_understood: userRows[0].website_access_understood || false,
        ga4_access_provided: userRows[0].ga4_access_provided || false,
        ga4_access_understood: userRows[0].ga4_access_understood || false,
        google_ads_access_provided: userRows[0].google_ads_access_provided || false,
        google_ads_access_understood: userRows[0].google_ads_access_understood || false,
        meta_access_provided: userRows[0].meta_access_provided || false,
        meta_access_understood: userRows[0].meta_access_understood || false,
        website_forms_details_provided: userRows[0].website_forms_details_provided || false,
        website_forms_details_understood: userRows[0].website_forms_details_understood || false,
        website_forms_uses_third_party: userRows[0].website_forms_uses_third_party || false,
        website_forms_uses_hipaa: userRows[0].website_forms_uses_hipaa || false,
        website_forms_connected_crm: userRows[0].website_forms_connected_crm || false,
        website_forms_custom: userRows[0].website_forms_custom || false,
        website_forms_notes: userRows[0].website_forms_notes || ''
      },
      brand: brandRows[0] || null,
      services: servicesRows
    });
  } catch (err) {
    console.error('[onboarding:get]', err);
    res.status(500).json({ message: 'Unable to load onboarding data' });
  }
});

router.post('/:token', async (req, res) => {
  try {
    const record = await getTokenRecord(req.params.token);
    if (!record) return res.status(404).json({ message: 'Onboarding link is invalid or expired' });
    const {
      display_name,
      password,
      monthly_revenue_goal,
      brand = {},
      services = [],
      client_identifier_value,
      website_access_provided,
      website_access_understood,
      ga4_access_provided,
      ga4_access_understood,
      google_ads_access_provided,
      google_ads_access_understood,
      meta_access_provided,
      meta_access_understood,
      website_forms_details_provided,
      website_forms_details_understood,
      website_forms_uses_third_party,
      website_forms_uses_hipaa,
      website_forms_connected_crm,
      website_forms_custom,
      website_forms_notes
    } = req.body || {};

    if (!display_name) return res.status(400).json({ message: 'Display name is required' });
    if (password && password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const nameParts = display_name.trim().split(' ').filter(Boolean);
    const firstName = nameParts.shift() || display_name.trim();
    const lastName = nameParts.join(' ');
    const updates = [];
    const params = [];
    if (firstName) {
      updates.push('first_name = $' + (params.length + 1));
      params.push(firstName);
    }
    updates.push('last_name = $' + (params.length + 1));
    params.push(lastName);
    if (password) {
      updates.push('password_hash = $' + (params.length + 1));
      params.push(await bcrypt.hash(password, 12));
    }
    if (updates.length) {
      params.push(record.user_id);
      await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
    }

    if (
      monthly_revenue_goal !== undefined ||
      client_identifier_value !== undefined ||
      website_access_provided !== undefined ||
      website_access_understood !== undefined ||
      ga4_access_provided !== undefined ||
      ga4_access_understood !== undefined ||
      google_ads_access_provided !== undefined ||
      google_ads_access_understood !== undefined ||
      meta_access_provided !== undefined ||
      meta_access_understood !== undefined ||
      website_forms_details_provided !== undefined ||
      website_forms_details_understood !== undefined ||
      website_forms_uses_third_party !== undefined ||
      website_forms_uses_hipaa !== undefined ||
      website_forms_connected_crm !== undefined ||
      website_forms_custom !== undefined ||
      website_forms_notes !== undefined
    ) {
      await query(
        `INSERT INTO client_profiles (
           user_id,
           monthly_revenue_goal,
           client_identifier_value,
           website_access_provided,
           website_access_understood,
           ga4_access_provided,
           ga4_access_understood,
           google_ads_access_provided,
           google_ads_access_understood,
           meta_access_provided,
           meta_access_understood,
           website_forms_details_provided,
           website_forms_details_understood,
           website_forms_uses_third_party,
           website_forms_uses_hipaa,
           website_forms_connected_crm,
           website_forms_custom,
           website_forms_notes
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (user_id) DO UPDATE SET
           monthly_revenue_goal = EXCLUDED.monthly_revenue_goal,
           client_identifier_value = EXCLUDED.client_identifier_value,
           website_access_provided = EXCLUDED.website_access_provided,
           website_access_understood = EXCLUDED.website_access_understood,
           ga4_access_provided = EXCLUDED.ga4_access_provided,
           ga4_access_understood = EXCLUDED.ga4_access_understood,
           google_ads_access_provided = EXCLUDED.google_ads_access_provided,
           google_ads_access_understood = EXCLUDED.google_ads_access_understood,
           meta_access_provided = EXCLUDED.meta_access_provided,
           meta_access_understood = EXCLUDED.meta_access_understood,
           website_forms_details_provided = EXCLUDED.website_forms_details_provided,
           website_forms_details_understood = EXCLUDED.website_forms_details_understood,
           website_forms_uses_third_party = EXCLUDED.website_forms_uses_third_party,
           website_forms_uses_hipaa = EXCLUDED.website_forms_uses_hipaa,
           website_forms_connected_crm = EXCLUDED.website_forms_connected_crm,
           website_forms_custom = EXCLUDED.website_forms_custom,
           website_forms_notes = EXCLUDED.website_forms_notes,
           updated_at = NOW()`,
        [
          record.user_id,
          monthly_revenue_goal || null,
          client_identifier_value || null,
          Boolean(website_access_provided),
          Boolean(website_access_understood),
          Boolean(ga4_access_provided),
          Boolean(ga4_access_understood),
          Boolean(google_ads_access_provided),
          Boolean(google_ads_access_understood),
          Boolean(meta_access_provided),
          Boolean(meta_access_understood),
          Boolean(website_forms_details_provided),
          Boolean(website_forms_details_understood),
          Boolean(website_forms_uses_third_party),
          Boolean(website_forms_uses_hipaa),
          Boolean(website_forms_connected_crm),
          Boolean(website_forms_custom),
          website_forms_notes ? String(website_forms_notes) : null
        ]
      );
    }

    if (brand && Object.keys(brand).length) {
      const existing = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [record.user_id]);
      const payload = {
        business_name: brand.business_name || existing.rows[0]?.business_name || '',
        business_description: brand.business_description || existing.rows[0]?.business_description || '',
        brand_notes: brand.brand_notes || existing.rows[0]?.brand_notes || '',
        website_url: brand.website_url || existing.rows[0]?.website_url || '',
        website_url: brand.website_url || existing.rows[0]?.website_url || ''
      };

      if (existing.rows.length) {
        await query(
          `UPDATE brand_assets
           SET business_name=$1, business_description=$2, brand_notes=$3, website_url=$4, updated_at=NOW()
           WHERE user_id=$5`,
          [payload.business_name, payload.business_description, payload.brand_notes, payload.website_url, record.user_id]
        );
      } else {
        await query(
          `INSERT INTO brand_assets (user_id, business_name, business_description, brand_notes, website_url)
           VALUES ($1,$2,$3,$4,$5)`,
          [record.user_id, payload.business_name, payload.business_description, payload.brand_notes, payload.website_url]
        );
      }
    }

    if (Array.isArray(services)) {
      await query('DELETE FROM services WHERE user_id = $1', [record.user_id]);
      for (const service of services) {
        if (!service?.name) continue;
        await query(
          `INSERT INTO services (user_id, name, description, base_price, active)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            record.user_id,
            service.name.trim(),
            service.description || '',
            service.base_price !== undefined && service.base_price !== null ? service.base_price : 0,
            service.active !== false
          ]
        );
      }
    }

    // Mark this token as consumed and invalidate any other outstanding tokens for this user.
    await query('UPDATE client_onboarding_tokens SET consumed_at = NOW() WHERE id = $1', [record.id]);
    await query(
      'UPDATE client_onboarding_tokens SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND consumed_at IS NULL AND revoked_at IS NULL',
      [record.user_id, record.id]
    );

    // Mark onboarding as completed (drives "Send onboarding email" button visibility).
    await query(
      `INSERT INTO client_profiles (user_id, onboarding_completed_at)
       VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET onboarding_completed_at = NOW(), updated_at = NOW()`,
      [record.user_id]
    );

    const { rows: userInfoRows } = await query('SELECT email, first_name, last_name FROM users WHERE id = $1', [record.user_id]);
    const onboardedUser = userInfoRows[0] || {};

    await createNotificationsForAdmins({
      title: 'Client onboarding completed',
      body: `${display_name || onboardedUser.email || 'Client'} just finished onboarding.`,
      linkUrl: '/client-hub',
      meta: { client_id: record.user_id }
    });

    const baseUrl = resolveBaseUrl(req);
    await notifyAdminsByEmail({
      subject: `Client onboarding completed: ${display_name || 'New Client'}`,
      text: `${display_name || onboardedUser.email || 'A client'} finished onboarding.\n\nView details: ${baseUrl}/client-hub`,
      html: `<p>${display_name || onboardedUser.email || 'A client'} finished onboarding.</p><p><a href="${baseUrl}/client-hub" target="_blank" rel="noopener">Open the Admin Hub</a></p>`
    });

    res.json({ message: 'Onboarding information saved', user_id: record.user_id });
  } catch (err) {
    console.error('[onboarding:submit]', err);
    res.status(500).json({ message: err.message || 'Unable to save onboarding information' });
  }
});

router.post('/:token/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const record = await getTokenRecord(req.params.token);
    if (!record) return res.status(404).json({ message: 'Onboarding link is invalid or expired' });
    if (!req.file) return res.status(400).json({ message: 'Avatar file is required' });
    const url = `/uploads/avatars/${req.file.filename}`;
    await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, record.user_id]);
    res.json({ avatar_url: url });
  } catch (err) {
    console.error('[onboarding:avatar]', err);
    res.status(500).json({ message: 'Unable to upload avatar' });
  }
});

router.post('/:token/brand-assets', uploadBrandAsset.single('brand_asset'), async (req, res) => {
  try {
    const record = await getTokenRecord(req.params.token);
    if (!record) return res.status(404).json({ message: 'Onboarding link is invalid or expired' });
    if (!req.file) return res.status(400).json({ message: 'Brand file is required' });
    const url = `/uploads/brand/${req.file.filename}`;
    const logo = { id: uuidv4(), name: req.file.originalname || req.file.filename, url };
    const existing = await query('SELECT logos FROM brand_assets WHERE user_id = $1 LIMIT 1', [record.user_id]);
    const logos = existing.rows[0]?.logos || [];
    const nextLogos = Array.isArray(logos) ? [...logos, logo] : [logo];
    await query(
      `INSERT INTO brand_assets (user_id, logos)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET logos = $2, updated_at = NOW()`,
      [record.user_id, JSON.stringify(nextLogos)]
    );
    res.json({ logos: nextLogos });
  } catch (err) {
    console.error('[onboarding:brand-asset]', err);
    res.status(500).json({ message: 'Unable to upload brand asset' });
  }
});

export default router;
