export function freeplayDepositsRequired(settings) {
  return Math.max(1, Number(settings?.freeplayDepositsBetweenClaims ?? 15));
}

/** Accounts that claimed before freeplayClaimCount existed, or admin-completed tickets. */
export function effectiveFreeplayClaimCount(user, tickets = []) {
  const fromUser = Math.max(
    Number(user?.freeplayClaimCount || 0),
    user?.freeplayClaimed ? 1 : 0
  );
  const fromTickets = (tickets || []).filter(
    (t) => t.type === 'freeplay' && t.status === 'Completed'
  ).length;
  return Math.max(fromUser, fromTickets);
}

export function hasPendingFreeplayTicket(tickets = []) {
  return (tickets || []).some((t) => t.type === 'freeplay' && t.status === 'Processing');
}

/** First claim: no deposit gate. After that: need N completed deposits since last freeplay. */
export function freeplayEligibility(user, settings, tickets = []) {
  const required = freeplayDepositsRequired(settings);
  const claimCount = effectiveFreeplayClaimCount(user, tickets);
  const since = Number(user?.depositsSinceLastFreeplay || 0);

  if (hasPendingFreeplayTicket(tickets)) {
    return {
      eligible: false,
      reason: 'pending',
      depositsNeeded: 0,
      required,
      claimCount,
      since,
    };
  }

  if (claimCount === 0) {
    return { eligible: true, reason: '', depositsNeeded: 0, required, claimCount, since };
  }
  if (since >= required) {
    return { eligible: true, reason: '', depositsNeeded: 0, required, claimCount, since };
  }
  return {
    eligible: false,
    reason: 'deposits',
    depositsNeeded: required - since,
    required,
    claimCount,
    since,
  };
}

export function freeplayEligibilityError(user, settings, tickets = []) {
  const e = freeplayEligibility(user, settings, tickets);
  if (e.eligible) return '';
  if (e.reason === 'pending') {
    return 'Your freeplay screenshot is already being reviewed. Wait for that to finish before sending another.';
  }
  return `You need ${e.depositsNeeded} more completed deposit${e.depositsNeeded === 1 ? '' : 's'} before the next freeplay (${e.since}/${e.required} since your last one).`;
}