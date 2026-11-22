import {
  juwaAddUser,
  juwaForcePlayerOffline,
  juwaGetAgentBalance,
  juwaGetPlayerBalance,
  juwaRecharge,
  juwaResetPassword,
  juwaWithdraw,
} from './juwaService.js';

function usesExternalMd5Protocol(game) {
  const provider = String(game?.apiConfig?.provider || '').toLowerCase();
  const slug = String(game?.slug || '').toLowerCase();
  const name = String(game?.name || '').toLowerCase();
  return (
    provider === 'juwa777' ||
    provider === 'gamevault999' ||
    provider === 'external-md5' ||
    slug === 'juwa-777' ||
    slug === 'game-vault-999' ||
    name.includes('juwa') ||
    name.includes('vault')
  );
}

/**
 * Unified Pluggable Game API Adapter
 * Routes Juwa 777 (external.juwa777.com) & Game Vault 999 (apius.gamevault999.com)
 * through the exact MD5 + multipart/form-data External API client.
 */
export async function createGameAccount(game, user) {
  const cfg = game?.apiConfig || {};

  if (usesExternalMd5Protocol(game)) {
    const baseName = String(user?.username || user?.name || 'player')
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 10);
    const account = `gs_${baseName || 'user'}_${Math.floor(1000 + Math.random() * 8999)}`;
    const loginPwd = `Gs${Math.floor(100000 + Math.random() * 899999)}`;

    const created = await juwaAddUser({ account, loginPwd }, cfg);
    return {
      mode: `${cfg.provider || 'external'}-live`,
      loginId: created.accountName,
      playerUserId: created.userId,
      tempPass: created.loginPwd,
      externalRef: created.userId,
    };
  }

  if (cfg.isConnected && cfg.baseUrl) {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/accounts/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey || '',
        Authorization: cfg.apiSecret ? `Bearer ${cfg.apiSecret}` : '',
      },
      body: JSON.stringify({
        agentId: cfg.agentId,
        gameSlug: game.slug,
        playerCode: user.playerCode,
        playerName: user.name,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      return {
        mode: 'live-api',
        loginId: data.loginId || data.username,
        tempPass: data.password || data.tempPass,
        externalRef: data.referenceId || data.id || '',
      };
    }
  }

  throw new Error(`Game API is not configured yet for ${game?.name || 'this game'}.`);
}

export async function loadGameCredits(game, loginIdOrUserId, amount, orderId = `GS${Date.now()}`) {
  const cfg = game?.apiConfig || {};

  if (usesExternalMd5Protocol(game)) {
    const data = await juwaRecharge(
      { userIdOrAccount: loginIdOrUserId, amount, orderId },
      cfg
    );
    return { mode: 'juwa777-live', ...data };
  }

  if (cfg.isConnected && cfg.baseUrl) {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/credits/load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey || '',
        Authorization: cfg.apiSecret ? `Bearer ${cfg.apiSecret}` : '',
      },
      body: JSON.stringify({ agentId: cfg.agentId, loginId: loginIdOrUserId, amount, orderId }),
    });
    if (response.ok) return { mode: 'live-api', ...(await response.json()) };
  }

  return { mode: 'manual', status: 'pending-admin', loginId: loginIdOrUserId, amount };
}

export async function redeemGameCredits(game, loginIdOrUserId, amount, orderId = `WD${Date.now()}`) {
  const cfg = game?.apiConfig || {};

  if (usesExternalMd5Protocol(game)) {
    const data = await juwaWithdraw(
      { userIdOrAccount: loginIdOrUserId, amount, orderId },
      cfg
    );
    return { mode: 'juwa777-live', ...data };
  }

  if (cfg.isConnected && cfg.baseUrl) {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/credits/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey || '',
        Authorization: cfg.apiSecret ? `Bearer ${cfg.apiSecret}` : '',
      },
      body: JSON.stringify({ agentId: cfg.agentId, loginId: loginIdOrUserId, amount, orderId }),
    });
    if (response.ok) return { mode: 'live-api', ...(await response.json()) };
  }

  return { mode: 'manual', status: 'pending-admin', loginId: loginIdOrUserId, amount };
}

export async function resetGamePassword(game, loginIdOrUserId, newPassword) {
  const cfg = game?.apiConfig || {};
  if (usesExternalMd5Protocol(game)) {
    return juwaResetPassword({ userIdOrAccount: loginIdOrUserId, newPassword }, cfg);
  }
  throw new Error(`Password reset API not configured for ${game?.name || 'this game'}.`);
}

export async function getGamePlayerBalance(game, loginIdOrUserId) {
  const cfg = game?.apiConfig || {};
  if (usesExternalMd5Protocol(game)) {
    return juwaGetPlayerBalance(loginIdOrUserId, cfg);
  }
  throw new Error(`Balance API not configured for ${game?.name || 'this game'}.`);
}

export async function getGameAgentBalance(game) {
  const cfg = game?.apiConfig || {};
  if (usesExternalMd5Protocol(game)) {
    return juwaGetAgentBalance(cfg);
  }
  throw new Error(`Agent balance API not configured for ${game?.name || 'this game'}.`);
}

export async function forceGamePlayerOffline(game, loginIdOrUserId) {
  const cfg = game?.apiConfig || {};
  if (usesExternalMd5Protocol(game)) {
    return juwaForcePlayerOffline(loginIdOrUserId, cfg);
  }
  throw new Error(`Force offline API not configured for ${game?.name || 'this game'}.`);
}
