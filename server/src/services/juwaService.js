import crypto from 'crypto';

const DEFAULT_JUWA_BASE_URL = 'https://external.juwa777.com';

export const JUWA_STATUS_CODES = {
  0: 'Success',
  1: 'Invalid agent ID',
  2: 'Invalid request parameters',
  3: 'Invalid token',
  4: 'Token expired',
  5: 'Access IP is not whitelisted in Juwa API Whitelist IP',
  6: 'Insufficient agent balance',
  7: 'Insufficient user balance',
  8: 'Invalid user ID',
  9: 'User account frozen',
  10: 'User is currently in game (force player offline first)',
  11: 'Invalid amount',
  12: 'Recharge failed, please try again later',
  13: 'Recharge permission denied',
  14: 'Withdrawal failed, please try again later',
  15: 'Withdrawal amount exceeds daily limit',
  16: 'Withdrawal under review',
  17: 'Withdrawal permission denied',
  18: 'Account name format error (letters, numbers, and underscores only)',
  19: 'Agent has no register user permission',
  20: 'Account name already exists',
  21: 'System failed',
  22: 'Number of register IPs exceeds upper limit',
  23: 'Password must be 6 to 32 characters',
  400: 'Parameter error',
};

function resolveJuwaConfig(apiConfig = {}) {
  const isVault =
    apiConfig.provider === 'gamevault999' ||
    String(apiConfig.baseUrl || '').includes('gamevault999');

  const envBase = isVault
    ? process.env.GAMEVAULT_BASE_URL || 'https://apius.gamevault999.com'
    : process.env.JUWA_BASE_URL || DEFAULT_JUWA_BASE_URL;
  const envAgent = isVault ? process.env.GAMEVAULT_AGENT_ID : process.env.JUWA_AGENT_ID;
  const envSecret = isVault ? process.env.GAMEVAULT_SECRET_KEY : process.env.JUWA_SECRET_KEY;

  const baseUrl = (apiConfig.baseUrl || envBase).replace(/\/$/, '');
  const agentId = String(apiConfig.agentId || envAgent || '').trim();
  const secretKey = String(
    apiConfig.apiSecret || apiConfig.apiKey || envSecret || ''
  ).trim();

  const label = isVault ? 'Game Vault 999' : 'Juwa 777';
  if (!agentId || !secretKey) {
    throw new Error(
      `${label} credentials missing: set ${isVault ? 'GAMEVAULT_AGENT_ID & GAMEVAULT_SECRET_KEY' : 'JUWA_AGENT_ID & JUWA_SECRET_KEY'} in server/.env or Admin Panel → Games & APIs.`
    );
  }
  return { baseUrl, agentId, secretKey };
}

/**
 * Generates Juwa 777 global auth parameters:
 * token = MD5(`${agent_id}:${timestamp}:${secret_key}`) (32-char lowercase)
 */
function buildJuwaAuth(agentId, secretKey) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = crypto
    .createHash('md5')
    .update(`${agentId}:${timestamp}:${secretKey}`)
    .digest('hex')
    .toLowerCase();
  return { agent_id: agentId, timestamp, token };
}

async function callJuwaEndpoint(endpointPath, params = {}, apiConfig = {}) {
  const { baseUrl, agentId, secretKey } = resolveJuwaConfig(apiConfig);
  const auth = buildJuwaAuth(agentId, secretKey);

  const endpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const queryUrl = `${baseUrl}${endpoint}?agent_id=${encodeURIComponent(auth.agent_id)}&timestamp=${encodeURIComponent(auth.timestamp)}&token=${encodeURIComponent(auth.token)}`;

  const form = new FormData();
  form.append('agent_id', auth.agent_id);
  form.append('timestamp', auth.timestamp);
  form.append('token', auth.token);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      form.append(k, String(v));
    }
  }

  const res = await fetch(queryUrl, {
    method: 'POST',
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (!json) {
    throw new Error(`Juwa API returned non-JSON response (HTTP ${res.status})`);
  }

  if (Number(json.code) !== 0) {
    const desc =
      JUWA_STATUS_CODES[Number(json.code)] ||
      json.msg ||
      `Juwa API error code ${json.code}`;
    const err = new Error(`[Juwa Code ${json.code}] ${desc}`);
    err.juwaCode = Number(json.code);
    throw err;
  }

  return json;
}

// 2.1.1 Add Player Account
export async function juwaAddUser({ account, loginPwd }, apiConfig = {}) {
  const cleanAccount = String(account).replace(/[^A-Za-z0-9_]/g, '').slice(0, 24);
  const res = await callJuwaEndpoint(
    '/api/external/addUser',
    { account: cleanAccount, login_pwd: loginPwd },
    apiConfig
  );
  return {
    accountName: res.data?.account_name || cleanAccount,
    userId: String(res.data?.user_id || ''),
    loginPwd,
  };
}

// 2.1.6 Login name to get player ID
export async function juwaGetUserId(accountName, apiConfig = {}) {
  const res = await callJuwaEndpoint(
    '/api/external/getUserID',
    { account_name: accountName },
    apiConfig
  );
  return String(res.data?.user_id || '');
}

// Helper: accepts either numeric user_id or account_name
export async function resolveJuwaUserId(userIdOrAccount, apiConfig = {}) {
  const str = String(userIdOrAccount || '').trim();
  if (/^\d{5,}$/.test(str)) return str;
  return juwaGetUserId(str, apiConfig);
}

// 2.1.2 Recharge (Load Credits)
export async function juwaRecharge({ userIdOrAccount, amount, orderId }, apiConfig = {}) {
  const userId = await resolveJuwaUserId(userIdOrAccount, apiConfig);
  const res = await callJuwaEndpoint(
    '/api/external/recharge',
    {
      user_id: userId,
      amount: String(amount),
      order_id: String(orderId),
    },
    apiConfig
  );
  return res.data;
}

// 2.1.3 Withdraw (Redeem Credits)
export async function juwaWithdraw({ userIdOrAccount, amount, orderId }, apiConfig = {}) {
  const userId = await resolveJuwaUserId(userIdOrAccount, apiConfig);
  const res = await callJuwaEndpoint(
    '/api/external/withdraw',
    {
      user_id: userId,
      amount: String(amount),
      order_id: String(orderId),
    },
    apiConfig
  );
  return res.data;
}

// 2.1.4 Get Player Balance
export async function juwaGetPlayerBalance(userIdOrAccount, apiConfig = {}) {
  const userId = await resolveJuwaUserId(userIdOrAccount, apiConfig);
  const res = await callJuwaEndpoint(
    '/api/external/userBalance',
    { user_id: userId },
    apiConfig
  );
  return { userId, userBalance: res.data?.user_balance };
}

// 2.1.5 Get Agent Balance
export async function juwaGetAgentBalance(apiConfig = {}) {
  const res = await callJuwaEndpoint('/api/external/agentBalance', {}, apiConfig);
  return { agentBalance: res.data?.agent_balance };
}

// 2.1.7 Getting low-balance users
export async function juwaGetLowDepositUsers(
  { queryDate, page = 1, pageSize = 20 },
  apiConfig = {}
) {
  const res = await callJuwaEndpoint(
    '/api/external/external/getLowDepositUsers',
    { query_date: queryDate, page, page_size: pageSize },
    apiConfig
  );
  return { users: res.data || [], count: res.count || 0 };
}

// 2.1.8 Reset Player Password
export async function juwaResetPassword({ userIdOrAccount, newPassword }, apiConfig = {}) {
  const userId = await resolveJuwaUserId(userIdOrAccount, apiConfig);
  await callJuwaEndpoint(
    '/api/external/resetPassword',
    { user_id: userId, login_pwd: newPassword },
    apiConfig
  );
  return { userId, reset: true };
}

// 2.1.9 Force Player Offline
export async function juwaForcePlayerOffline(userIdOrAccount, apiConfig = {}) {
  const userId = await resolveJuwaUserId(userIdOrAccount, apiConfig);
  await callJuwaEndpoint('/api/external/playerOffline', { user_id: userId }, apiConfig);
  return { userId, offline: true };
}

