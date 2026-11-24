import { GameItem, PaymentGateway, ThreadId } from '../types';

// Static games removed — games are loaded dynamically from MongoDB (/api/games)
export const GAMES_CATALOG: GameItem[] = [];

// Live CashTap Automated Checkout Gateways (https://cashtap.cash/llms.txt)
export const PAYMENT_GATEWAYS: PaymentGateway[] = [
  {
    id: 'cashtap',
    name: 'All Methods',
    handle: 'pay.cashtap.cash',
    badge: 'Auto Instant',
    eta: 'Instant Auto',
    minAmount: 1,
    maxAmount: 100000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: false,
    color: '#10B981',
  },
  {
    id: 'cashapp',
    name: 'Cash App',
    handle: 'Instant CashApp Checkout',
    badge: 'Instant',
    eta: 'Instant Auto',
    minAmount: 1,
    maxAmount: 16000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: true,
    color: '#10B981',
  },
  {
    id: 'coinbase',
    name: 'Card, Bank or Apple Pay',
    handle: 'Debit / Bank / Apple Pay',
    badge: 'Card & Apple Pay',
    eta: 'Instant Auto',
    minAmount: 5,
    maxAmount: 10000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: false,
    color: '#2563EB',
  },
  {
    id: 'wallet',
    name: 'USDC',
    handle: 'USDC on Base — Any Wallet',
    badge: 'High Limit',
    eta: 'Instant Auto',
    minAmount: 0.5,
    maxAmount: 100000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: true,
    color: '#06B6D4',
  },
];

const KNOWN_METHOD_NAMES: Record<string, string> = {
  cashtap: 'All Methods',
  cashapp: 'Cash App',
  coinbase: 'Card, Bank or Apple Pay',
  wallet: 'USDC',
  chime: 'Chime',
};

export function paymentMethodName(gateway?: { id?: string; name?: string } | string | null): string {
  if (!gateway) return 'Payment';
  if (typeof gateway === 'string') return stripProviderLabel(gateway);
  const known = KNOWN_METHOD_NAMES[(gateway.id || '').toLowerCase()];
  if (known) return known;
  return stripProviderLabel(gateway.name || '');
}

function stripProviderLabel(raw: string): string {
  const name = raw
    .replace(/\s*[([{][^)\]}]*(?:cash\s*tap|api|manual\s*verify)[^)\]}]*[)\]}]/gi, '')
    .replace(/\b(via\s+)?cash\s*tap(\s+checkout|\s+api)?\b/gi, '')
    .replace(/\b(g\s*)?api\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,–—-]+|[\s,–—-]+$/g, '')
    .trim();
  return name || raw.trim();
}

export const PROMO_OFFERS = [
  {
    id: 'welcome-100',
    badge: 'NEW PLAYER',
    title: '100% First Deposit Match',
    description: 'Double your first automated CashTap deposit up to $200.',
    code: 'STRIKE100',
  },
  {
    id: 'daily-20',
    badge: 'DAILY BOOST',
    title: '20% Every Reload Bonus',
    description: 'Get 20% extra play credit on daily deposits of $20 or more.',
    code: 'RELOAD20',
  },
  {
    id: 'refer-10',
    badge: 'REFERRAL',
    title: '$10 Instant Freeplay',
    description: 'Invite a friend to GameStrike.io — once they load $20, you both receive $10 freeplay.',
    code: 'FRIEND10',
  },
];

export interface ThreadMeta {
  id: ThreadId;
  name: string;
  role: string;
  preview: string;
  badge?: string;
  online: boolean;
}

export const SUPPORT_THREADS: ThreadMeta[] = [
  {
    id: 'concierge',
    name: 'GameStrike Concierge',
    role: '24/7 Automated Gaming Desk',
    preview: 'Auto CashTap Deposits, Cashouts & Game IDs',
    badge: 'Main',
    online: true,
  },
  {
    id: 'cashier',
    name: 'Auto Cashier (CashTap)',
    role: 'Instant Hosted Checkout & Payouts',
    preview: 'CashApp Pay, Card/Apple Pay & USDC Wallet',
    online: true,
  },
  {
    id: 'accounts',
    name: 'Game IDs & Bonuses',
    role: 'API-Connected Game Accounts',
    preview: 'Instant Game ID provisioning & promos',
    online: true,
  },
];
