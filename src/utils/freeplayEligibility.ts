import type { PlatformSettings, TicketItem, UserProfile } from '../types';

export function effectiveFreeplayClaimCount(user?: UserProfile, tickets: TicketItem[] = []) {
  const fromUser = Math.max(
    Number(user?.freeplayClaimCount || 0),
    user?.freeplayClaimed ? 1 : 0
  );
  const fromTickets = tickets.filter(
    (t) => t.type === 'freeplay' && t.status === 'Completed'
  ).length;
  return Math.max(fromUser, fromTickets);
}

export function hasPendingFreeplayTicket(tickets: TicketItem[] = []) {
  return tickets.some((t) => t.type === 'freeplay' && t.status === 'Processing');
}

export function freeplayDepositsRequired(settings?: PlatformSettings) {
  return Math.max(1, Number(settings?.freeplayDepositsBetweenClaims ?? 15));
}

export function freeplayEligibility(
  user?: UserProfile,
  settings?: PlatformSettings,
  tickets: TicketItem[] = []
) {
  const required = freeplayDepositsRequired(settings);
  const claimCount = effectiveFreeplayClaimCount(user, tickets);
  const since = Number(user?.depositsSinceLastFreeplay || 0);

  if (hasPendingFreeplayTicket(tickets)) {
    return {
      eligible: false as const,
      reason: 'pending' as const,
      depositsNeeded: 0,
      required,
      claimCount,
      since,
    };
  }
  if (claimCount === 0) {
    return { eligible: true as const, reason: '' as const, depositsNeeded: 0, required, claimCount, since };
  }
  if (since >= required) {
    return { eligible: true as const, reason: '' as const, depositsNeeded: 0, required, claimCount, since };
  }
  return {
    eligible: false as const,
    reason: 'deposits' as const,
    depositsNeeded: required - since,
    required,
    claimCount,
    since,
  };
}

export function freeplayEligibilityMessage(
  user?: UserProfile,
  settings?: PlatformSettings,
  tickets: TicketItem[] = []
) {
  const e = freeplayEligibility(user, settings, tickets);
  if (e.eligible) return '';
  if (e.reason === 'pending') {
    return 'Your freeplay is already in review — hang tight for our reply in chat.';
  }
  return `Next freeplay unlocks after ${e.depositsNeeded} more completed deposit${e.depositsNeeded === 1 ? '' : 's'} (${e.since}/${e.required} since your last one).`;
}