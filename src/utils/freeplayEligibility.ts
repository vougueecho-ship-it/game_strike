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

export function freeplayDepositAmountRequired(settings?: PlatformSettings) {
  return Math.max(
    1,
    Number(
      settings?.freeplayDepositAmountRequired ??
        settings?.freeplayDepositsBetweenClaims ??
        15
    )
  );
}

export function depositAmountTowardFreeplay(user?: UserProfile) {
  if (user?.depositAmountSinceLastFreeplay != null) {
    return Number(user.depositAmountSinceLastFreeplay || 0);
  }
  return 0;
}

export function freeplayEligibility(
  user?: UserProfile,
  settings?: PlatformSettings,
  tickets: TicketItem[] = []
) {
  const required = freeplayDepositAmountRequired(settings);
  const claimCount = effectiveFreeplayClaimCount(user, tickets);
  const since = depositAmountTowardFreeplay(user);

  if (hasPendingFreeplayTicket(tickets)) {
    return {
      eligible: false as const,
      reason: 'pending' as const,
      amountNeeded: 0,
      required,
      claimCount,
      since,
    };
  }
  if (claimCount === 0) {
    return { eligible: true as const, reason: '' as const, amountNeeded: 0, required, claimCount, since };
  }
  if (since >= required) {
    return { eligible: true as const, reason: '' as const, amountNeeded: 0, required, claimCount, since };
  }
  return {
    eligible: false as const,
    reason: 'deposits' as const,
    amountNeeded: required - since,
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
  return `Next freeplay after $${e.amountNeeded.toFixed(2)} more in deposits ($${e.since.toFixed(2)} / $${e.required.toFixed(2)} since your last freeplay).`;
}