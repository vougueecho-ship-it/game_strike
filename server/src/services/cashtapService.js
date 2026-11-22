import crypto from 'crypto';

const CASHTAP_BASE_URL = 'https://api.cashtap.cash/checkout/v1';

/**
 * Creates a live CashTap Checkout Session.
 * Spec: https://cashtap.cash/llms.txt
 * POST /checkout/v1/sessions
 */
export async function createCashTapSession({
  amount,
  game,
  ticketId,
  userId,
  customerEmail,
  paymentMethod,
  successUrl,
  cancelUrl,
  apiKeyOverride,
}) {
  const apiKey = apiKeyOverride || process.env.CASHTAP_SECRET_KEY;
  if (!apiKey) {
    throw new Error('CashTap API key (CASHTAP_SECRET_KEY) is not configured.');
  }

  const numericAmount = Number(Number(amount).toFixed(2));
  if (Number.isNaN(numericAmount) || numericAmount < 0.5 || numericAmount > 100000) {
    throw new Error('Amount must be between $0.50 and $100,000 USD.');
  }

  const body = {
    amount: numericAmount,
    line_items: [
      {
        name: game ? `GameStrike.io — ${game} Load` : 'GameStrike.io Credit Deposit',
        description: `Ticket ${ticketId}`,
        quantity: 1,
        unit_amount: numericAmount,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      ticket_id: String(ticketId),
      user_id: String(userId),
      game: String(game || 'Wallet'),
    },
  };

  if (customerEmail && customerEmail.includes('@')) {
    body.customer_email = customerEmail;
  }

  // Only pass payment_methods if a specific canonical CashTap method was chosen.
  // Omitting it offers every enabled method on the merchant's CashTap account.
  const canonicalMethods = ['cashapp', 'coinbase', 'wallet'];
  if (paymentMethod && canonicalMethods.includes(paymentMethod)) {
    body.payment_methods = [paymentMethod];
  }

  const res = await fetch(`${CASHTAP_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `CashTap API error (${res.status})`;
    const err = new Error(msg);
    err.code = data?.error?.code || 'cashtap_error';
    err.status = res.status;
    throw err;
  }

  return data;
}

/**
 * Retrieves the live status of a CashTap Checkout Session.
 * GET /checkout/v1/sessions/{session_id}
 */
export async function retrieveCashTapSession(sessionId, apiKeyOverride) {
  const apiKey = apiKeyOverride || process.env.CASHTAP_SECRET_KEY;
  if (!apiKey) {
    throw new Error('CashTap API key (CASHTAP_SECRET_KEY) is not configured.');
  }

  const res = await fetch(
    `${CASHTAP_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to retrieve CashTap session (${res.status})`);
  }
  return data;
}

/**
 * Verifies X-CashTap-Signature header using HMAC-SHA256 over `${t}.${rawBody}`.
 * Spec: https://cashtap.cash/llms.txt#webhooks
 */
export function verifyCashTapSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!secret || !header || !rawBody) return false;

  let t = '';
  const sigs = [];
  for (const part of String(header).split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') sigs.push(v);
  }

  if (!t || sigs.length === 0) return false;
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest();

  return sigs.slice(0, 5).some((s) => {
    return (
      /^[0-9a-f]{64}$/i.test(s) &&
      crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected)
    );
  });
}

