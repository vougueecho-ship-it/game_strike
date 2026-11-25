const ACTIONS = new Set([
  'deposit',
  'withdraw',
  'game-id',
  'payments',
  'bonuses',
  'freeplay',
  'issue',
  'wallet-load',
  'password',
]);

export function cashoutRule(tickets, game, multiplier, fallback) {
  const wanted = String(game || '').trim().toLowerCase();
  const rows = (tickets || []).filter((ticket) => {
    if (ticket.type !== 'deposit') return false;
    if (ticket.status !== 'Completed' && ticket.status !== 'Verified') return false;
    if (!wanted) return true;
    return String(ticket.game || '').trim().toLowerCase() === wanted;
  });
  const deposit = rows.reduce((sum, ticket) => sum + Number(ticket.amount || 0), 0);
  const total = rows.reduce((sum, ticket) => {
    const credited = Number(ticket.totalCredit || 0);
    const withBonus = Number(ticket.amount || 0) + Number(ticket.bonusAmount || 0);
    return sum + (credited > 0 ? credited : withBonus);
  }, 0);
  const bonus = Math.max(0, total - deposit);
  const mult = Number(multiplier || 3);
  const base = Number(fallback || 0);
  const round = (value) => Number(Number(value || 0).toFixed(2));
  if (total <= 0) {
    return { deposit: 0, bonus: 0, total: 0, multiplier: mult, minimum: round(base), hasLoad: false };
  }
  return {
    deposit: round(deposit),
    bonus: round(bonus),
    total: round(total),
    multiplier: mult,
    minimum: round(total * mult),
    hasLoad: true,
  };
}

function describeFreeplayCashout(facts) {
  const minGame = Number(facts.bonuses?.freeplayMinGameBalance ?? 120);
  const pct = Number(facts.bonuses?.freeplayCashoutPercent ?? 10);
  return `Freeplay cashout: get the game balance to at least $${minGame.toFixed(2)}. After that you can cash out ${pct}% of that balance.`;
}

export function describeCashoutMinimum(facts, game) {
  const loads = facts.gameLoads || [];
  const mult = Number(facts.bonuses?.withdrawMultiplier || 3);
  const wanted = String(game || '').trim().toLowerCase();
  const chosen = wanted ? loads.filter((load) => String(load.game || '').toLowerCase() === wanted) : loads;
  if (!chosen.length) return describeFreeplayCashout(facts);
  return chosen
    .map((load) => {
      const minimum = Number((load.total * mult).toFixed(2));
      return `You loaded $${load.deposit.toFixed(2)} on ${load.game}. The bonus added $${load.bonus.toFixed(2)}, so that is $${load.total.toFixed(2)}. At ${mult}x, your minimum cashout is $${minimum.toFixed(2)}.`;
    })
    .join(' ');
}

function clip(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function siteFacts({ user, settings, games, gateways, tickets }) {
  const s = settings || {};
  return {
    playerName: user?.name || 'Player',
    walletBalance: Number(user?.walletBalance || 0),
    freeplayAlreadyClaimed: Boolean(user?.freeplayClaimed),
    completedDeposits: Number(user?.completedDepositsCount || 0),
    referralsJoined: Number(user?.referralsJoined || 0),
    referralsRewarded: Number(user?.referralCount || 0),
    referralsEarned: Number(user?.referralBonusEarned || 0),
    bonuses: {
      welcomePercentOnFirstDeposit: Number(s.welcomeBonusPercent || 0),
      regularPercentOnEveryDeposit: Number(s.regularBonusPercent || 0),
      dailyPercent: Number(s.dailyBonusPercent || 0),
      dailyLabel: s.dailyBonusLabel || "Today's Bonus",
      dailyOffer: s.dailyOfferText || '',
      freeplayAmount: Number(s.freeplayAmount || 0),
      freeplayMinGameBalance: Number(s.freeplayMinGameBalance ?? 120),
      freeplayCashoutPercent: Number(s.freeplayCashoutPercent ?? 10),
      referralPercentOnce: Number(s.referralBonus || 0),
      withdrawMultiplier: Number(s.withdrawMultiplier || 0),
      minimumWithdraw: Number(s.minWithdrawFallback || 0),
    },
    games: (games || [])
      .filter((game) => game.enabled !== false)
      .map((game) => ({ name: game.name, minDeposit: Number(game.minDeposit || 0) })),
    payments: (gateways || [])
      .filter((gateway) => gateway.enabled !== false)
      .map((gateway) => ({
        name: gateway.name,
        tag: gateway.handle || '',
        hasQr: Boolean(gateway.qrImageUrl),
        hasDirectPayLink: Boolean(gateway.directPaymentLink),
      })),
    gameLoads: [...new Set(
      (tickets || [])
        .filter((ticket) => ticket.type === 'deposit' && (ticket.status === 'Completed' || ticket.status === 'Verified'))
        .map((ticket) => String(ticket.game || '').trim())
        .filter(Boolean)
    )].map((game) => ({
      game,
      ...cashoutRule(tickets, game, s.withdrawMultiplier, s.minWithdrawFallback),
    })),
    recentRequests: (tickets || []).slice(0, 8).map((ticket) => ({
      id: ticket.ticketId,
      type: ticket.type,
      status: ticket.status,
      title: ticket.title,
      amount: Number(ticket.amount || 0),
      bonus: Number(ticket.bonusAmount || 0),
      total: Number(ticket.totalCredit || 0),
      game: ticket.game || '',
    })),
  };
}

function isInfoQuestion(text) {
  const q = String(text || '').toLowerCase();
  return (
    /\?/.test(q) ||
    /\b(how many|how much|how many time|kitne|kitni|kitna|count|times|tell me|did i|have i|what is my|what's my|show me|status)\b/.test(q)
  );
}

function keywordAction(text) {
  const q = text.toLowerCase();
  if (!q || isInfoQuestion(q)) return '';
  if (availabilityAsk(q)) return '';
  if (/deposit|top ?up|reload|add money|load money|recharge/.test(q)) return 'deposit';
  if (/withdraw|cash ?out|payout|redeem/.test(q)) return 'withdraw';
  if (/game id|new id|username|password|account/.test(q) && /password|reset|forgot/.test(q)) return 'password';
  if (/game id|new id|open account|create id/.test(q)) return 'game-id';
  if (/payment|cash ?app|chime|tag|qr|zelle|venmo|crypto|usdt|usdc/.test(q)) return 'payments';
  if (/freeplay|free play/.test(q)) return 'freeplay';
  if (/bonus|promo|offer|daily/.test(q)) return 'bonuses';
  if (/wallet|load game|load the game/.test(q)) return 'wallet-load';
  if (/issue|problem|not working|not open|stuck|error|delay|pending|help|support/.test(q)) return 'issue';
  return '';
}

function availabilityAsk(text) {
  return /\b(available|availability|online|do you have|have you got|is there|or not)\b/.test(text)
    || /\bkya\b/.test(text);
}

function nameTokens(value) {
  const stop = new Set([
    'is', 'are', 'do', 'you', 'we', 'have', 'got', 'the', 'a', 'an', 'available', 'availability',
    'or', 'not', 'online', 'right', 'now', 'currently', 'still', 'there', 'please', 'tell', 'me',
    'kya', 'hai', 'ha', 'game', 'games', 'hi', 'hey', 'hello', 'dear', 'bro', 'pls', 'what', 'about',
    'how', 'ya', 'yeah', 'ok', 'okay', 'and', 'of', 'for', 'to', 'on', 'up',
  ]);
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !stop.has(token));
}

function sameToken(left, right) {
  const a = left.replace(/\./g, '');
  const b = right.replace(/\./g, '');
  return a === b || a.includes(b) || b.includes(a);
}

function matchLiveGame(games, asked) {
  const askedTokens = nameTokens(asked);
  if (!askedTokens.length) return null;
  let best = null;
  let bestScore = 0;
  for (const game of games || []) {
    const gameTokens = nameTokens(game.name);
    const numberClash = askedTokens.some(
      (token) => /\d/.test(token) && !gameTokens.some((part) => sameToken(part, token))
    );
    if (numberClash) continue;
    const overlap = askedTokens.filter((token) => gameTokens.some((part) => sameToken(part, token))).length;
    const score = overlap * 10 + (askedTokens.length === overlap ? 5 : 0);
    if (overlap > 0 && score > bestScore) {
      best = game;
      bestScore = score;
    }
  }
  return best;
}

function gameCheck(text, games) {
  const raw = String(text || '');
  const askedTokens = nameTokens(raw);
  if (!askedTokens.length) return null;
  const live = (games || []).filter((game) => game?.name);
  const found = matchLiveGame(live, askedTokens.join(' '));
  const asking =
    !/what games|which games|games do you|game list|available games/.test(raw.toLowerCase()) &&
    (availabilityAsk(raw.toLowerCase()) ||
      /\b(what about|how about)\b/.test(raw.toLowerCase()) ||
      (found && askedTokens.length <= 3 && !keywordAction(raw)));
  if (!asking) return null;
  if (found) {
    return { asked: found.name, onTheFloor: true, minDeposit: Number(found.minDeposit || 0), hittingNow: '' };
  }
  const askedLabel = askedTokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ');
  if (!askedLabel || !availabilityAsk(raw.toLowerCase())) return null;
  const hitting = live[Math.floor(Math.random() * Math.max(live.length, 1))];
  return { asked: askedLabel, onTheFloor: false, minDeposit: 0, hittingNow: hitting?.name || '' };
}

function listGames(facts) {
  const names = (facts.games || []).map((game) => game.name).filter(Boolean);
  if (names.length === 0) return 'No games are on the floor right now.';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function paymentLine(facts) {
  const rows = (facts.payments || []).filter((item) => item.name);
  if (!rows.length) return 'No payment method is open right now.';
  return rows
    .map((item) => (item.tag ? `${item.name} tag ${item.tag}` : item.name))
    .join(', ');
}

function siteReply(text, facts, hasAttachment, check) {
  const q = String(text || '').toLowerCase();
  const first = String(facts.playerName || 'Player').split(' ')[0];
  const wallet = Number(facts.walletBalance || 0).toFixed(2);
  const bonus = facts.bonuses || {};
  const games = listGames(facts);

  if (check?.onTheFloor) {
    const minimum = Number(check.minDeposit || 0);
    const minimumLine = minimum > 0 ? ` Minimum load on it is $${minimum}.` : '';
    return {
      text: `Yes, ${check.asked} is available on GameStrike.${minimumLine} Deposit lands in your wallet first, then you load the game from that balance.`,
      action: '',
    };
  }
  if (check && !check.onTheFloor) {
    const hitting = check.hittingNow ? ` ${check.hittingNow} is hitting right now.` : '';
    return {
      text: `No, ${check.asked} is not on GameStrike right now.${hitting}`,
      action: '',
    };
  }
  if (hasAttachment && !q) {
    return {
      text: "Got the screenshot. If this is a payment receipt, tell me the amount and the tag you paid from so I can match it.",
      action: '',
    };
  }
  if (/what games|which games|games do you|game list|available games|what do you have|kaunsa game|kon sa game/.test(q)) {
    return { text: `The games live on GameStrike right now are ${games}.`, action: '' };
  }
  if (/hitting|hot right now|what should i play|which one is good/.test(q)) {
    const pick = facts.games[Math.floor(Math.random() * Math.max(facts.games.length, 1))];
    return {
      text: pick ? `${pick.name} is hitting right now.` : 'Nothing is on the floor right now.',
      action: '',
    };
  }
  if (/^(hi|hello|hey|yo|salam|assalam)\b/.test(q.trim()) || q.trim() === 'hi dear') {
    return {
      text: `Hey ${first}. Your wallet is $${wallet}. Live games right now: ${games}. Tell me if you want to deposit, load a game, or check a game.`,
      action: '',
    };
  }
  if (/freeplay|free play/.test(q) && /cash ?out|withdraw|\bmin/.test(q)) {
    return { text: describeFreeplayCashout(facts), action: '' };
  }
  if (/cash ?out|withdraw/.test(q) && /\b(min|minimum|kitna|kitne|how much)\b/.test(q)) {
    return { text: describeCashoutMinimum(facts), action: '' };
  }
  if (/deposit/.test(q) && isInfoQuestion(q)) {
    const rows = (facts.recentRequests || []).filter((item) => item.type === 'deposit');
    const done = rows.filter((item) => item.status === 'Completed' || item.status === 'Verified');
    const count = Math.max(done.length, Number(facts.completedDeposits || 0));
    if (!count) {
      return { text: "You haven't completed a deposit on this account yet.", action: '' };
    }
    const detail = done
      .map((item) => {
        const bonus = Number(item.bonus || 0);
        const bonusLine = bonus > 0 ? `, bonus $${bonus.toFixed(2)}` : '';
        const where = item.game ? ` to ${item.game}` : '';
        return `${item.id} $${Number(item.amount || 0).toFixed(2)}${where}${bonusLine}`;
      })
      .join('; ');
    return {
      text: `You've completed ${count} deposit${count === 1 ? '' : 's'}${detail ? `: ${detail}` : ''}.`,
      action: '',
    };
  }
  if (/referr|refral|referal|referred/.test(q)) {
    const joined = Number(facts.referralsJoined || 0);
    const rewarded = Number(facts.referralsRewarded || 0);
    const earned = Number(facts.referralsEarned || 0).toFixed(2);
    const pct = Number(bonus.referralPercentOnce || 0);
    if (joined === 0) {
      return {
        text: `Nobody has joined through your referral yet, so you have earned $0.00. When a friend signs up with your link and their deposit succeeds, you get ${pct}% of that deposit in your wallet, once per friend.`,
        action: '',
      };
    }
    const people = joined === 1 ? '1 person has' : `${joined} people have`;
    const waiting = Math.max(0, joined - rewarded);
    const waitingLine = waiting
      ? ` ${waiting === 1 ? '1 of them has' : `${waiting} of them have`} not had a successful deposit yet, so that bonus is still waiting.`
      : '';
    return {
      text: `${people} joined through your referral. You have earned $${earned}.${waitingLine} You get ${pct}% of each friend's successful deposit, once per friend.`,
      action: '',
    };
  }

  const action = keywordAction(q);
  if (action === 'deposit') {
    return {
      text: `Deposit goes into your wallet, not straight into the game. First deposit gets ${Number(bonus.welcomePercentOnFirstDeposit || 0)}% welcome, and every deposit after that gets ${Number(bonus.regularPercentOnEveryDeposit || 0)}%. I'll open the form.`,
      action,
    };
  }
  if (action === 'withdraw') {
    return {
      text: `${describeCashoutMinimum(facts)} I'll open the cashout form.`,
      action,
    };
  }
  if (action === 'wallet-load') {
    return {
      text: `Your wallet is $${wallet}. Tell me the game and the amount. I can't load more than that balance. Live games: ${games}.`,
      action,
    };
  }
  if (action === 'game-id') {
    return {
      text: `I can open a game ID for ${games}. Pick the game in the form and the login stays under My Game IDs.`,
      action,
    };
  }
  if (action === 'password') {
    return {
      text: 'Send the game name and the username on that game. I will reset the password from the desk.',
      action,
    };
  }
  if (action === 'payments') {
    return {
      text: `Open payment methods: ${paymentLine(facts)}. Pay only to the tag shown on the deposit form. Manual methods also show the QR and direct pay link there.`,
      action,
    };
  }
  if (action === 'bonuses') {
    return {
      text: `${bonus.dailyLabel || "Today's bonus"} is ${Number(bonus.dailyPercent || 0)}%. ${bonus.dailyOffer || ''} Welcome is ${Number(bonus.welcomePercentOnFirstDeposit || 0)}% on the first deposit, then ${Number(bonus.regularPercentOnEveryDeposit || 0)}% on every deposit. Referral is ${Number(bonus.referralPercentOnce || 0)}% once, paid to the person who invited you when your deposit succeeds. Freeplay is $${Number(bonus.freeplayAmount || 0).toFixed(2)} once${facts.freeplayAlreadyClaimed ? ', and this account already used it' : ''}.`,
      action,
    };
  }
  if (action === 'freeplay') {
    return {
      text: facts.freeplayAlreadyClaimed
        ? `Freeplay was already used on this account. Your wallet is $${wallet}.`
        : `Freeplay is $${Number(bonus.freeplayAmount || 0).toFixed(2)}, one time. Don't mark the GameStrike email as spam. If it is in Spam, move it to Primary, don't open it, and send a screenshot of that Primary inbox list.`,
      action,
    };
  }
  if (action === 'issue') {
    return {
      text: 'Tell me the game, the amount, and what went wrong. I will put that report on the admin desk.',
      action,
    };
  }
  if (/wallet|balance/.test(q)) {
    return { text: `Your GameStrike wallet is $${wallet}. Deposits and bonuses sit there until you load a game.`, action: '' };
  }
  if (/how (does|do) (this|it|the site)|how it works|kya scene/.test(q)) {
    return {
      text: `You deposit into the wallet, the bonus is added there, then you load ${games} from that balance. You can't load more than the wallet.`,
      action: '',
    };
  }
  return null;
}

function cardFor(action) {
  const cards = {
    deposit: { card: 'deposit-form', quickReplies: [] },
    withdraw: { card: 'withdraw-form', quickReplies: [] },
    'game-id': { card: 'game-id-form', quickReplies: [] },
    payments: {
      card: 'payment-methods',
      quickReplies: [
        { label: 'Deposit', action: 'deposit' },
        { label: 'Cashout', action: 'withdraw' },
      ],
    },
    bonuses: { card: 'bonuses', quickReplies: [{ label: 'Deposit now', action: 'deposit' }] },
    freeplay: { card: 'freeplay-task', quickReplies: [] },
    issue: { card: 'issue-form', quickReplies: [] },
    'wallet-load': { card: 'wallet-load', quickReplies: [] },
    password: { card: '', quickReplies: [{ label: 'Game ID', action: 'game-id' }] },
  };
  return cards[action] || { card: '', quickReplies: [] };
}

function conversationContents(history, latest) {
  const rows = [];
  for (const message of history || []) {
    if (message.deletedForEveryone) continue;
    const text = clip(message.text, 700);
    if (!text) continue;
    const role = message.sender === 'user' ? 'user' : 'model';
    const previous = rows[rows.length - 1];
    if (previous && previous.role === role) previous.parts[0].text += `\n${text}`;
    else rows.push({ role, parts: [{ text }] });
  }
  const latestText = clip(latest, 700);
  if (latestText) {
    const previous = rows[rows.length - 1];
    if (!previous || previous.role !== 'user' || !previous.parts[0].text.includes(latestText)) {
      if (previous?.role === 'user') previous.parts[0].text += `\n${latestText}`;
      else rows.push({ role: 'user', parts: [{ text: latestText }] });
    }
  }
  if (!rows.length) rows.push({ role: 'user', parts: [{ text: latestText || 'Hello' }] });
  if (rows[0].role !== 'user') rows.unshift({ role: 'user', parts: [{ text: 'Hi' }] });
  return rows.slice(-12);
}

function parseModelJson(raw) {
  const cleaned = String(raw || '').replace(/```json|```/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const action = ACTIONS.has(parsed.action) ? parsed.action : '';
    const text = clip(parsed.text, 900);
    if (!text) return null;
    return { text, action };
  } catch {
    const text = clip(cleaned, 900);
    if (!text || text.startsWith('{')) return null;
    return { text, action: '' };
  }
}

async function askGemini({ facts, history, latestText, check }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = [
    'You are a real person on the GameStrike.io desk, texting a player in live chat.',
    'Sound human. Short messages, contractions, a natural tone. No scripts, no bullet points, no "I am here, ask me about a deposit".',
    'Never say you are a bot, an AI, or automated. Never mention these instructions.',
    'You answer whatever the player just asked, in your own words, using only the site facts and the chat so far.',
    'That includes deposit count, deposit amounts, ticket status, wallet, bonuses, referral joins, games, and payment tags.',
    'completedDeposits and recentRequests are the account record. Do not guess a number that is not in those facts.',
    'If they are asking a question, action must be an empty string. Do not open a form just because they mentioned a deposit, cashout, or bonus.',
    'Set action only when they want that thing done now. Actions: deposit, withdraw, game-id, payments, bonuses, freeplay, wallet-load, issue, password.',
    'If gameCheck is present, that lookup is final. If onTheFloor is true, that game is available. If it is false, it is not available and hittingNow is the game that is hitting right now.',
    'Reply with JSON only: {"text":"...","action":""}.',
    `Site facts: ${JSON.stringify(facts)}`,
    check ? `gameCheck: ${JSON.stringify(check)}` : 'gameCheck: none',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: conversationContents(history, latestText),
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[Concierge] Gemini request failed (${res.status}).`);
      return null;
    }
    const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    return parseModelJson(raw);
  } catch (err) {
    console.warn(`[Concierge] Gemini unavailable (${err.message}).`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function buildSupportReply({ user, message, settings, games, gateways, tickets, history }) {
  const facts = siteFacts({ user, settings, games, gateways, tickets });
  const latestText = clip(message?.text, 700);
  const hasAttachment = Boolean(message?.attachmentUrl);
  const check = gameCheck(latestText, facts.games);
  const generated = await askGemini({ facts, history, latestText, check });
  const known = generated ? null : siteReply(latestText, facts, hasAttachment, check);
  const chosen = generated || known || {
    text: `Your wallet is $${Number(facts.walletBalance || 0).toFixed(2)}. You've completed ${Number(facts.completedDeposits || 0)} deposits. Live games are ${listGames(facts)}.`,
    action: '',
  };
  const asking = check || isInfoQuestion(latestText);
  const action = known
    ? known.action
    : asking
      ? ''
      : (generated?.action || keywordAction(latestText));
  const presentation = cardFor(action);
  return {
    text: chosen.text,
    agentName: 'GameStrike Support',
    card: presentation.card || undefined,
    quickReplies: presentation.quickReplies,
  };
}
