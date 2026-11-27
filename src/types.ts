export type RouteView = 'chat' | 'games' | 'admin';

export type ThreadId = 'concierge' | 'cashier' | 'accounts';

export interface PlatformSettings {
  welcomeBonusPercent: number;
  regularBonusPercent: number;
  referralBonus?: number;
  freeplayMinWithdraw?: number;
  freeplayMaxWithdraw?: number;
  withdrawMultiplier: number;
  minWithdrawFallback: number;
  enforceDeviceLimit?: boolean;
  dailyBonusPercent?: number;
  dailyBonusLabel?: string;
  dailyOfferText?: string;
  freeplayAmount?: number;
  freeplayMinGameBalance?: number;
  freeplayCashoutPercent?: number;
  freeplayDepositsBetweenClaims?: number;
  freeplayFromEmails?: string;
}

export interface UserProfile {
  _id?: string;
  id: string;
  name: string;
  username: string;
  contact: string;
  role?: 'player' | 'admin';
  status?: 'active' | 'suspended';
  isDeviceBlocked?: boolean;
  joinedAt: string;
  tier: 'Starter' | 'VIP Strike';
  completedDepositsCount?: number;
  lastDepositAmount?: number;
  lastBonusAmount?: number;
  lastTotalLoad?: number;
  referredBy?: string;
  referralCount?: number;
  referralBonusEarned?: number;
  walletBalance?: number;
  freeplayClaimed?: boolean;
  freeplayClaimCount?: number;
  depositsSinceLastFreeplay?: number;
  lastClientPlatform?: string;
  lastBrowserLabel?: string;
  lastUserAgent?: string;
  deviceId?: string;
  deviceFingerprint?: string;
  registrationIp?: string;
  stats?: {
    depositsCompleted?: number;
    depositsPending?: number;
    withdrawsCompleted?: number;
    withdrawsPending?: number;
    freeplayTickets?: number;
    gameIds?: number;
  };
  recentTickets?: Array<{
    ticketId: string;
    type: string;
    status: string;
    amount?: number;
    totalCredit?: number;
    game?: string;
    createdAt?: string;
  }>;
}

export interface GameItem {
  id: string;
  name: string;
  tag: string;
  category: 'Fish Tables' | 'Slots' | 'Sweeps' | 'Hot';
  platforms: ('iOS' | 'Android' | 'Web')[];
  minDeposit: number;
  playersOnline: number;
  accentFrom: string;
  accentTo: string;
  initials: string;
  imageUrl?: string;
  downloadUrl: string;
  featured?: boolean;
}

export interface PaymentGateway {
  id: string;
  name: string;
  handle: string;
  badge: string;
  eta: string;
  minAmount: number;
  maxAmount: number;
  fee: string;
  supportsDeposit: boolean;
  supportsWithdraw: boolean;
  color: string;
  qrImageUrl?: string;
  directPaymentLink?: string;
  instructions?: string;
  enabled?: boolean;
  apiConnected?: boolean;
}

export interface TicketItem {
  id: string;
  type: 'deposit' | 'withdraw' | 'game-id' | 'bonus' | 'issue' | 'freeplay';
  title: string;
  subtitle: string;
  amount?: number;
  bonusType?: string;
  bonusPercent?: number;
  bonusAmount?: number;
  totalCredit?: number;
  game?: string;
  gameUser?: string;
  gamePassword?: string;
  method?: string;
  receiptScreenshotUrl?: string;
  balanceScreenshotUrl?: string;
  qrScreenshotUrl?: string;
  status: 'Processing' | 'Verified' | 'Completed' | 'Rejected';
  createdAt: string;
}

export type InteractiveCardType =
  | 'deposit-form'
  | 'withdraw-form'
  | 'game-id-form'
  | 'payment-methods'
  | 'bonuses'
  | 'issue-form'
  | 'ticket-receipt'
  | 'wallet-load'
  | 'freeplay-task';

export interface QuickReply {
  label: string;
  action: string;
}

export interface ChatMessage {
  id: string;
  threadId: ThreadId;
  sender: 'agent' | 'user' | 'system';
  agentName?: string;
  text: string;
  timestamp: string;
  read?: boolean;
  edited?: boolean;
  deletedForEveryone?: boolean;
  replyTo?: {
    id: string;
    text: string;
    sender: string;
  };
  reactions?: Record<string, string[]>;
  attachmentUrl?: string;
  attachmentName?: string;
  quickReplies?: QuickReply[];
  card?: InteractiveCardType;
  cardData?: {
    ticketId?: string;
    ticketType?: TicketItem['type'];
    game?: string;
    amount?: number;
    method?: string;
    handle?: string;
    checkoutUrl?: string;
    sessionId?: string;
    loginId?: string;
    tempPass?: string;
    preselectedGame?: string;
  };
}
