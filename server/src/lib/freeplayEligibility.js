export function freeplayDepositsRequired(settings) {
  return Math.max(1, Number(settings?.freeplayDepositsBetweenClaims ?? 15));
}

/** First claim: no deposit gate. After that: need N completed deposits since last freeplay. */
export function freeplayEligibility(user, settings) {
  const required = freeplayDepositsRequired(settings);
  const claimCount = Number(user?.freeplayClaimCount || 0);
  const since = Number(user?.depositsSinceLastFreeplay || 0);
  if (claimCount === 0) {
    return { eligible: true, depositsNeeded: 0, required, claimCount, since };
  }
  if (since >= required) {
    return { eligible: true, depositsNeeded: 0, required, claimCount, since };
  }
  return {
    eligible: false,
    depositsNeeded: required - since,
    required,
    claimCount,
    since,
  };
}

export function freeplayEligibilityError(user, settings) {
  const e = freeplayEligibility(user, settings);
  if (e.eligible) return '';
  return `You need ${e.depositsNeeded} more completed deposit${e.depositsNeeded === 1 ? '' : 's'} before the next freeplay (${e.since}/${e.required} since your last one).`;
}