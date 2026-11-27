/** Admin-set $ total of completed deposits needed after the first freeplay. */
export function freeplayDepositAmountRequired(settings) {
  return Math.max(
    1,
    Number(
      settings?.freeplayDepositAmountRequired ??
        settings?.freeplayDepositsBetweenClaims ??
        15
    )
  );
}

/** @deprecated use freeplayDepositAmountRequired */
export function freeplayDepositsRequired(settings) {
  return freeplayDepositAmountRequired(settings);
}

export function depositAmountTowardFreeplay(user) {
  if (user?.depositAmountSinceLastFreeplay != null) {
    return Number(user.depositAmountSinceLastFreeplay || 0);
  }
  return 0;
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

/** First claim: no deposit gate. After that: need $X in completed deposit amounts since last freeplay. */
export function freeplayEligibility(user, settings, tickets = []) {
  const required = freeplayDepositAmountRequired(settings);
  const claimCount = effectiveFreeplayClaimCount(user, tickets);
  const since = depositAmountTowardFreeplay(user);

  if (hasPendingFreeplayTicket(tickets)) {
    return {
      eligible: false,
      reason: 'pending',
      amountNeeded: 0,
      required,
      claimCount,
      since,
    };
  }

  if (claimCount === 0) {
    return { eligible: true, reason: '', amountNeeded: 0, required, claimCount, since };
  }
  if (since >= required) {
    return { eligible: true, reason: '', amountNeeded: 0, required, claimCount, since };
  }
  return {
    eligible: false,
    reason: 'deposits',
    amountNeeded: required - since,
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
  return `Deposit $${e.amountNeeded.toFixed(2)} more on completed deposits before the next freeplay ($${e.since.toFixed(2)} / $${e.required.toFixed(2)} since your last one).`;
}