/**
 * Cloudflare Pages Function：簽發 LiveKit 存取憑證（access token）
 *
 * 路由：POST /api/token
 *
 * 醫師（role=doctor）：
 *   需在 Authorization: Bearer <Firebase ID token> 帶入登入工作階段的 ID token，
 *   伺服器端會用 Google 公開憑證驗證簽章，並檢查 aud / iss / exp。
 *   identity 由 Firebase uid 產生，客戶端無法偽造。
 *
 * 病人（role=patient）：
 *   需帶入醫師分享連結中的 code（= HMAC-SHA256(room, PATIENT_CODE_SECRET) 前段），
 *   避免他人隨機猜測房間號進入診症。
 *
 * 必要的 Pages 環境變數（Settings → Variables and Secrets）：
 *   LIVEKIT_URL           e.g. wss://xxx.livekit.cloud
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 *   PATIENT_CODE_SECRET   自訂一串隨機長字串，用於產生/核對病人加入連結
 *   FIREBASE_PROJECT_ID   e.g. system-1e90a
 */

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const ROOM_PATTERN = /^consult-[A-Za-z0-9_-]{8,80}$/;
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

// 模組層級快取 Google 公開憑證（Cloudflare 會依隔離實例各自快取）
let certCache = { expiresAt: 0, byKid: null };

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    return await handlePost(request, env);
  } catch (err) {
    console.error('簽發 LiveKit token 失敗：', err);
    return json({ error: '伺服器內部錯誤' }, 500);
  }
}

export function onRequestGet() {
  return json({ error: 'Method Not Allowed，請使用 POST' }, 405);
}

async function handlePost(request, env) {
  const cfg = readConfig(env);
  if (cfg.missing.length > 0) {
    return json(
      { error: '伺服器尚未完成 LiveKit 設定，缺少環境變數：' + cfg.missing.join(', ') },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return json({ error: 'JSON 格式不正確' }, 400);
  }

  const room = cleanText(body.room, 90);
  const role = body.role === 'patient' ? 'patient' : body.role === 'doctor' ? 'doctor' : null;
  if (!room || !ROOM_PATTERN.test(room)) {
    return json({ error: '房間號格式不正確' }, 400);
  }
  if (!role) {
    return json({ error: 'role 必須是 doctor 或 patient' }, 400);
  }

  let identity;
  let displayName;

  if (role === 'doctor') {
    const authHeader = request.headers.get('Authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match) {
      return json({ error: '缺少登入憑證' }, 401);
    }
    let claims;
    try {
      claims = await verifyFirebaseIdToken(match[1], env.FIREBASE_PROJECT_ID);
    } catch (err) {
      return json({ error: '登入憑證無效或已過期：' + err.message }, 401);
    }
    identity = 'doctor_' + claims.sub;
    displayName = cleanText(claims.name || claims.email || '醫師', 40) || '醫師';
  } else {
    const code = cleanText(body.code, 64);
    if (!code) {
      return json({ error: '缺少病人加入碼' }, 401);
    }
    const expected = await makePatientJoinCode(env.PATIENT_CODE_SECRET, room);
    if (!timingSafeEqual(expected, code)) {
      return json({ error: '加入碼無效，請向醫師重新索取連結' }, 403);
    }
    identity = 'patient_' + crypto.randomUUID().replace(/-/g, '');
    displayName = cleanText(body.name, 40) || '病人';
  }

  const token = await mintLiveKitToken(env, {
    room,
    identity,
    name: displayName,
    role
  });
  const joinCode = await makePatientJoinCode(env.PATIENT_CODE_SECRET, room);

  return json({
    url: env.LIVEKIT_URL,
    token,
    room,
    identity,
    name: displayName,
    joinCode
  });
}

/* ------------------------------------------------------------------ */
/* LiveKit JWT（HS256，以 Web Crypto 實作，無第三方依賴）               */
/* ------------------------------------------------------------------ */

async function mintLiveKitToken(env, { room, identity, name, role }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: env.LIVEKIT_API_KEY,
    sub: identity,
    jti: crypto.randomUUID(),
    nbf: now - 10,
    exp: now + TOKEN_TTL_SECONDS,
    name,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: role === 'doctor',
      canUpdateOwnMetadata: true,
      hidden: false
    }
  };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = encodedHeader + '.' + encodedPayload;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + '.' + base64UrlEncode(new Uint8Array(signature));
}

/* ------------------------------------------------------------------ */
/* 病人加入碼（HMAC）                                                   */
/* ------------------------------------------------------------------ */

async function makePatientJoinCode(secret, room) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode('livekit-patient:' + room)
  );
  return base64UrlEncode(new Uint8Array(sig)).slice(0, 22);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Firebase ID token 驗證（RS256 + Google x509 公開憑證）               */
/* ------------------------------------------------------------------ */

async function verifyFirebaseIdToken(idToken, projectId) {
  if (!projectId) {
    throw new Error('伺服器未設定 FIREBASE_PROJECT_ID');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('token 格式不正確');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecodeString(headerB64));
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('不支援的簽章演算法');
  }

  const claims = JSON.parse(base64UrlDecodeString(payloadB64));
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) throw new Error('token 已過期');
  if (claims.aud !== projectId) throw new Error('token 對象不符');
  if (claims.iss !== 'https://securetoken.google.com/' + projectId) {
    throw new Error('token 簽發者不符');
  }
  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new Error('token 缺少主體');
  }

  const certPem = await getGoogleCert(header.kid);
  if (!certPem) throw new Error('找不到對應的公開憑證');

  const certDer = pemToDer(certPem);
  const spkiDer = extractSpkiFromCertificate(certDer);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spkiDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    base64UrlDecode(signatureB64),
    new TextEncoder().encode(headerB64 + '.' + payloadB64)
  );
  if (!valid) throw new Error('簽章驗證失敗');

  return claims;
}

async function getGoogleCert(kid) {
  const now = Date.now();
  if (!certCache.byKid || certCache.expiresAt - 60000 < now) {
    const response = await fetch(FIREBASE_CERTS_URL, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error('無法取得 Google 公開憑證');
    const byKid = await response.json();
    let maxAgeMs = 60 * 60 * 1000;
    const cacheControl = response.headers.get('Cache-Control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
    if (maxAgeMatch) maxAgeMs = parseInt(maxAgeMatch[1], 10) * 1000;
    certCache = { expiresAt: now + maxAgeMs, byKid };
  }
  return certCache.byKid[kid] || null;
}

/* 從 X.509 憑證 DER 中取出 SubjectPublicKeyInfo（Web Crypto 只吃 SPKI） */
function extractSpkiFromCertificate(der) {
  // Certificate ::= SEQUENCE { tbsCertificate SEQUENCE, ... }
  const cert = readTlv(der, 0);
  let p = cert.headerEnd;

  const tbs = readTlv(der, p); // TBSCertificate SEQUENCE
  p = tbs.headerEnd;

  if (der[p] === 0xa0) p = readTlv(der, p).end; // [0] EXPLICIT version（可選）
  p = readTlv(der, p).end; // serialNumber INTEGER
  p = readTlv(der, p).end; // signature AlgorithmIdentifier SEQUENCE
  p = readTlv(der, p).end; // issuer Name SEQUENCE
  p = readTlv(der, p).end; // validity SEQUENCE
  p = readTlv(der, p).end; // subject Name SEQUENCE

  const spki = readTlv(der, p); // subjectPublicKeyInfo SEQUENCE
  return der.slice(spki.start, spki.end);
}

function readTlv(buf, offset) {
  const tag = buf[offset];
  const [length, lengthBytes] = readDerLength(buf, offset + 1);
  const headerEnd = offset + 1 + lengthBytes;
  return { tag, start: offset, headerEnd, end: headerEnd + length };
}

function readDerLength(buf, offset) {
  const first = buf[offset];
  if (first < 0x80) return [first, 1];
  const byteCount = first & 0x7f;
  let value = 0;
  for (let i = 1; i <= byteCount; i++) {
    value = value * 256 + buf[offset + i];
  }
  return [value, 1 + byteCount];
}

function pemToDer(pem) {
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

function readConfig(env) {
  const required = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'PATIENT_CODE_SECRET',
    'FIREBASE_PROJECT_ID'
  ];
  const missing = required.filter((key) => !env[key]);
  return { missing };
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeString(value) {
  return new TextDecoder().decode(base64UrlDecode(value));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  });
}
