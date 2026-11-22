/**
 * Pluggable Payment Gateway API Adapter
 * -------------------------------------
 * Drop in any Payment Gateway API (Cash App Business, Stripe, NOWPayments,
 * CoinPayments, Chime, custom checkout) via Admin Panel -> Payment Gateways
 * or MongoDB, and deposits/withdrawals + webhooks route automatically.
 */

export async function createDepositIntent(gateway, { amount, ticketId, playerName, game }) {
  const cfg = gateway?.apiConfig;

  if (cfg?.isConnected && cfg?.baseUrl) {
    try {
      const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cfg.apiKey || '',
          Authorization: cfg.apiKey ? `Bearer ${cfg.apiKey}` : '',
        },
        body: JSON.stringify({
          orderId: ticketId,
          amount,
          currency: 'USD',
          description: `GameStrike.io Load - ${game} (${playerName})`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          mode: 'live-gateway',
          checkoutUrl: data.checkoutUrl || data.payment_url || '',
          handle: data.payAddress || data.handle || gateway.handle,
          externalRef: data.id || data.payment_id || ticketId,
        };
      }
    } catch (err) {
      console.error(`[PaymentGateway] Error calling ${gateway.name}:`, err.message);
    }
  }

  return {
    mode: 'manual-tag',
    checkoutUrl: '',
    handle: gateway?.handle || '$GameStrikeDesk',
    externalRef: ticketId,
  };
}

export async function createWithdrawalPayout(gateway, { amount, ticketId, payoutTag }) {
  const cfg = gateway?.apiConfig;

  if (cfg?.isConnected && cfg?.baseUrl) {
    try {
      const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cfg.apiKey || '',
          Authorization: cfg.apiKey ? `Bearer ${cfg.apiKey}` : '',
        },
        body: JSON.stringify({
          payoutId: ticketId,
          amount,
          destination: payoutTag,
        }),
      });
      if (response.ok) {
        return { mode: 'live-gateway', ...(await response.json()) };
      }
    } catch (err) {
      console.error(`[PaymentGateway] Payout error on ${gateway.name}:`, err.message);
    }
  }

  return {
    mode: 'manual-cashier',
    status: 'pending-admin-approval',
    externalRef: ticketId,
  };
}

