import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Gamepad2,
  Gift,
  ImagePlus,
  Landmark,
  RefreshCw,
} from 'lucide-react';
import {
  ChatMessage,
  GameItem,
  PaymentGateway,
  PlatformSettings,
  TicketItem,
  UserProfile,
} from '../types';
import { paymentMethodName } from '../data/catalog';

interface InlineChatCardProps {
  message: ChatMessage;
  user?: UserProfile;
  settings?: PlatformSettings;
  games: GameItem[];
  gateways: PaymentGateway[];
  tickets?: TicketItem[];
  onSubmitDeposit: (data: {
    game: string;
    amount: number;
    method: string;
    handle: string;
    receiptScreenshotUrl?: string;
    senderTag?: string;
  }) => void;
  onSubmitWithdraw: (data: {
    game: string;
    gameUser: string;
    amount: number;
    method: string;
    payoutTag: string;
    balanceScreenshotUrl?: string;
    qrScreenshotUrl?: string;
  }) => void;
  onSubmitGameId: (game: string) => void;
  onSubmitIssue?: (data: { category: string; game: string; referenceId: string; details: string }) => void;
  onClaimPromo: (promoTitle: string, code: string) => void;
  onLoadWallet?: (data: { game: string; amount: number; gameUser: string }) => Promise<string | void>;
  onSubmitFreeplay?: (screenshot: string) => Promise<void>;
  onSyncCashTap?: (ticketId: string) => void;
}

export const InlineChatCard: React.FC<InlineChatCardProps> = ({
  message,
  user,
  settings = {
    welcomeBonusPercent: 100,
    regularBonusPercent: 20,
    withdrawMultiplier: 3,
    minWithdrawFallback: 20,
  },
  games,
  gateways,
  tickets = [],
  onSubmitDeposit,
  onSubmitWithdraw,
  onSubmitGameId,
  onSubmitIssue,
  onClaimPromo,
  onLoadWallet,
  onSubmitFreeplay,
  onSyncCashTap,
}) => {
  const defaultGame =
    message.cardData?.preselectedGame ||
    (games.length > 0 ? games[0].name : 'GameStrike Wallet');

  const [game, setGame] = useState(defaultGame);
  const [amount, setAmount] = useState<number>(20);
  const [methodId, setMethodId] = useState(gateways[0]?.id || 'cashtap');
  const [activePayMethod, setActivePayMethod] = useState<PaymentGateway | null>(null);
  const [gameUser, setGameUser] = useState('');
  const [payoutTag, setPayoutTag] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [senderTag, setSenderTag] = useState('');
  const [balanceShotUrl, setBalanceShotUrl] = useState('');
  const [qrShotUrl, setQrShotUrl] = useState('');
  const [formErr, setFormErr] = useState('');
  const [issueCategory, setIssueCategory] = useState('Payment Sent, Credits Not Received');
  const [issueRef, setIssueRef] = useState('');
  const [issueDetails, setIssueDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const readImageFile = (file: File | undefined, cb: (dataUrl: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') cb(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const copyField = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const selectedGateway =
    gateways.find((g) => g.id === methodId) || gateways[0];

  if (message.card === 'wallet-load') {
    return (
      <form
        className="inline-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!onLoadWallet) return;
          setFormErr('');
          setSubmitted(true);
          try {
            const note = await onLoadWallet({ game, amount, gameUser });
            if (note) setFormErr(note);
          } finally {
            setSubmitted(false);
          }
        }}
      >
        <div className="inline-card-title"><span>Load from wallet · ${Number(user?.walletBalance || 0).toFixed(2)}</span></div>
        <select className="field-input" value={game} onChange={(e) => setGame(e.target.value)}>
          {games.map((g) => (
            <option key={g.id} value={g.name}>{g.name}</option>
          ))}
        </select>
        <input className="field-input" placeholder="Game login ID" value={gameUser} onChange={(e) => setGameUser(e.target.value)} />
        <input className="field-input" type="number" min={1} step="0.5" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        {formErr && <p style={{ color: '#f87171', fontSize: '0.78rem' }}>{formErr}</p>}
        <button className="btn-primary" type="submit" disabled={submitted}>Load ${amount || 0}</button>
      </form>
    );
  }

  if (message.card === 'freeplay-task') {
    return (
      <form
        className="inline-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!onSubmitFreeplay || !receiptUrl) {
            setFormErr('Upload the Primary inbox screenshot.');
            return;
          }
          setSubmitted(true);
          try {
            await onSubmitFreeplay(receiptUrl);
          } catch (err) {
            setFormErr((err as Error).message);
            setSubmitted(false);
          }
        }}
      >
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Screenshot the Primary inbox list. The GameStrike email should be visible there. Do not open it, and do not mark it as spam.
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') setReceiptUrl(reader.result);
            };
            reader.readAsDataURL(file);
          }}
        />
        {formErr && <p style={{ color: '#f87171', fontSize: '0.78rem' }}>{formErr}</p>}
        <button className="btn-primary" type="submit" disabled={submitted}>Submit inbox screenshot</button>
      </form>
    );
  }

  if (message.card === 'deposit-form') {
    const isFirstDeposit = Number(user?.completedDepositsCount || 0) === 0;
    const bonusPct = isFirstDeposit
      ? Number(settings.welcomeBonusPercent || 0)
      : Number(settings.regularBonusPercent || 0);
    const bonusAmt = Number(((amount * bonusPct) / 100).toFixed(2));
    const totalCredit = Number((amount + bonusAmt).toFixed(2));
    const isManualGw =
      selectedGateway &&
      !['cashtap', 'cashapp', 'coinbase', 'wallet'].includes(selectedGateway.id);

    return (
      <div className="inline-card">
        <div className="inline-card-header">
          <div className="inline-card-title">
            <ArrowDownCircle size={18} color="#ff1f4b" />
            <span>Deposit — {paymentMethodName(selectedGateway)}</span>
          </div>
          <span className="status-pill verified">
            {isFirstDeposit ? `+${bonusPct}% Welcome` : `+${bonusPct}% Reload`}
          </span>
        </div>

        <div className="field-group" style={{ marginBottom: 10 }}>
          <label className="field-label">Destination Game</label>
          <select
            className="field-input"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            value={game}
            onChange={(e) => setGame(e.target.value)}
            disabled={submitted}
          >
            {games.length === 0 ? (
              <option value="GameStrike Wallet">GameStrike Wallet Balance</option>
            ) : (
              games.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="field-group" style={{ marginBottom: 10 }}>
          <label className="field-label">Amount (USD)</label>
          <div className="amount-grid">
            {[10, 20, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                disabled={submitted}
                className={`amount-pill ${amount === val ? 'active' : ''}`}
                onClick={() => setAmount(val)}
              >
                ${val}
              </button>
            ))}
          </div>
          <input
            className="field-input mono"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            type="number"
            step="0.5"
            min={0.5}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 1)}
            disabled={submitted}
          />
        </div>

        {/* Live Welcome / Regular Bonus Calculation Preview */}
        <div className="ticket-mini" style={{ marginBottom: 10, padding: '9px 11px', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {isFirstDeposit ? 'Welcome Bonus (1st Deposit Only)' : 'Regular Reload Bonus'} ({bonusPct}%)
            </span>
            <strong className="mono" style={{ color: '#ffd166' }}>+${bonusAmt.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Game Credit</span>
            <strong className="mono" style={{ color: '#4ade80' }}>${totalCredit.toFixed(2)}</strong>
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 10 }}>
          <label className="field-label">Payment Method</label>
          <select
            className="field-input"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            value={methodId}
            onChange={(e) => {
              setMethodId(e.target.value);
              setFormErr('');
            }}
            disabled={submitted}
          >
            {gateways
              .filter((g) => g.supportsDeposit)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {paymentMethodName(g)}
                </option>
              ))}
          </select>
        </div>

        {isManualGw && selectedGateway && (
          <>
            <div className="ticket-mini" style={{ marginBottom: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Send ${amount} to official {paymentMethodName(selectedGateway)} Tag:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                <strong className="mono" style={{ fontSize: '0.86rem', color: '#ffd166' }}>
                  {selectedGateway.handle}
                </strong>
                <button
                  type="button"
                  className="msg-act-btn"
                  onClick={() => copyField('dep-tag', selectedGateway.handle)}
                  title="Copy payment tag"
                >
                  {copiedKey === 'dep-tag' ? <CheckCircle2 size={12} color="#22c55e" /> : <Copy size={12} />}
                </button>
              </div>

              {/* Direct payment link if available */}
              {selectedGateway.directPaymentLink && (
                <a
                  href={selectedGateway.directPaymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="pay-link-btn"
                >
                  <ExternalLink size={15} />
                  <span>Open Direct Payment Link</span>
                </a>
              )}

              {/* QR Code preview & 1-click Download */}
              {selectedGateway.qrImageUrl && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <img
                    src={selectedGateway.qrImageUrl}
                    alt={`${selectedGateway.name} QR Code`}
                    style={{ width: 130, height: 130, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <a
                      href={selectedGateway.qrImageUrl}
                      download={`${selectedGateway.name}-QR.png`}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                    >
                      <Download size={11} />
                      <span>Download QR</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="field-group" style={{ marginBottom: 10 }}>
              <label className="field-label">Your payment tag (the account you paid from)</label>
              <input
                className="field-input mono"
                placeholder="e.g. $yourchime or your name"
                value={senderTag}
                onChange={(e) => setSenderTag(e.target.value)}
                disabled={submitted}
              />
            </div>
            <div className="field-group" style={{ marginBottom: 10 }}>
              <label className="field-label">Upload Payment Receipt Screenshot (Required)</label>
              <label
                className="btn-secondary"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                <ImagePlus size={15} color="#ffd166" />
                <span>{receiptUrl ? 'Receipt Attached ✓ (Change)' : 'Choose Receipt Screenshot'}</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={submitted}
                  onChange={(e) => readImageFile(e.target.files?.[0], setReceiptUrl)}
                />
              </label>
              {receiptUrl && (
                <img
                  src={receiptUrl}
                  alt="Receipt preview"
                  style={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 9, marginTop: 6 }}
                />
              )}
            </div>
          </>
        )}

        {formErr && (
          <div style={{ color: '#ff6b86', fontSize: '0.78rem', marginBottom: 8 }}>{formErr}</div>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
          disabled={submitted}
          onClick={() => {
            if (isManualGw && (!receiptUrl || !senderTag.trim())) {
              setFormErr('Add your payment tag and the receipt screenshot.');
              return;
            }
            setFormErr('');
            setSubmitted(true);
            onSubmitDeposit({
              game,
              amount: Math.max(0.5, amount),
              method: selectedGateway?.id || 'cashtap',
              handle: selectedGateway?.handle || 'pay.cashtap.cash',
              receiptScreenshotUrl: receiptUrl || undefined,
              senderTag: senderTag.trim(),
            });
          }}
        >
          {submitted
            ? 'Deposit Submitted ✓'
            : isManualGw
            ? `Submit $${amount} Receipt (Load $${totalCredit})`
            : `Pay $${amount} with ${paymentMethodName(selectedGateway)} (Load $${totalCredit})`}
        </button>
      </div>
    );
  }

  if (message.card === 'withdraw-form') {
    const withdrawGateways = gateways.filter((g) => g.supportsWithdraw);
    const activeWdGw =
      withdrawGateways.find((g) => g.id === methodId) || withdrawGateways[0];

    const lastLoad =
      Number(user?.lastTotalLoad || 0) ||
      Number(user?.lastDepositAmount || 0) + Number(user?.lastBonusAmount || 0);
    const minWd =
      lastLoad > 0
        ? Number((lastLoad * Number(settings.withdrawMultiplier || 3)).toFixed(2))
        : Number(settings.minWithdrawFallback || 20);

    const savedGameCred = tickets.find(
      (t) =>
        t.type === 'game-id' &&
        String(t.game || '').toLowerCase() === String(game || '').toLowerCase() &&
        t.gameUser
    );
    const effectiveGameUser = gameUser || savedGameCred?.gameUser || '';

    return (
      <div className="inline-card">
        <div className="inline-card-header">
          <div className="inline-card-title">
            <ArrowUpCircle size={18} color="#22c55e" />
            <span>Manual Cashout / Withdraw</span>
          </div>
          <span className="status-pill verified">Min ${minWd}</span>
        </div>

        <div className="ticket-mini" style={{ marginBottom: 10, padding: '8px 10px', fontSize: '0.75rem', color: '#ffd166' }}>
          Rule: Minimum cashout is <strong>${minWd}</strong> ({settings.withdrawMultiplier}x of last load + bonus{lastLoad > 0 ? `: $${lastLoad}` : ''}). Both screenshots are required.
        </div>

        <div className="field-group" style={{ marginBottom: 9 }}>
          <label className="field-label">Game Platform</label>
          <select
            className="field-input"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            value={game}
            onChange={(e) => setGame(e.target.value)}
            disabled={submitted}
          >
            {games.length === 0 ? (
              <option value="GameStrike Wallet">GameStrike Wallet Balance</option>
            ) : (
              games.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="field-group" style={{ marginBottom: 9 }}>
          <label className="field-label">Your Game Username / ID</label>
          <input
            className="field-input mono"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            placeholder="e.g. gs_player_1024"
            value={effectiveGameUser}
            onChange={(e) => setGameUser(e.target.value)}
            disabled={submitted}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label className="field-label">Amount ($)</label>
            <input
              className="field-input mono"
              style={{ padding: '8px 10px', fontSize: '0.84rem' }}
              type="number"
              min={minWd}
              value={amount < minWd ? minWd : amount}
              onChange={(e) => setAmount(Number(e.target.value) || minWd)}
              disabled={submitted}
            />
          </div>
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label className="field-label">Payout Method</label>
            <select
              className="field-input"
              style={{ padding: '8px 10px', fontSize: '0.84rem' }}
              value={activeWdGw?.id || ''}
              onChange={(e) => setMethodId(e.target.value)}
              disabled={submitted}
            >
              {withdrawGateways.map((g) => (
                <option key={g.id} value={g.id}>
                  {paymentMethodName(g)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 9 }}>
          <label className="field-label">Your Payout Tag / Wallet</label>
          <input
            className="field-input"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            placeholder="e.g. $YourChimeTag or $CashTag"
            value={payoutTag}
            onChange={(e) => setPayoutTag(e.target.value)}
            disabled={submitted}
          />
        </div>

        {/* 2 MANDATORY SCREENSHOTS FOR WITHDRAWAL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <label
            className="btn-secondary"
            style={{ padding: '9px 8px', fontSize: '0.74rem', cursor: 'pointer', flexDirection: 'column', gap: 4 }}
          >
            <ImagePlus size={15} color={balanceShotUrl ? '#22c55e' : '#ffd166'} />
            <span>{balanceShotUrl ? '1. Balance ✓' : '1. Game Balance SS'}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              disabled={submitted}
              onChange={(e) => readImageFile(e.target.files?.[0], setBalanceShotUrl)}
            />
          </label>

          <label
            className="btn-secondary"
            style={{ padding: '9px 8px', fontSize: '0.74rem', cursor: 'pointer', flexDirection: 'column', gap: 4 }}
          >
            <ImagePlus size={15} color={qrShotUrl ? '#22c55e' : '#ffd166'} />
            <span>{qrShotUrl ? '2. Tag / QR ✓' : '2. Tag / QR Code SS'}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              disabled={submitted}
              onChange={(e) => readImageFile(e.target.files?.[0], setQrShotUrl)}
            />
          </label>
        </div>

        {formErr && (
          <div style={{ color: '#ff6b86', fontSize: '0.78rem', marginBottom: 8 }}>{formErr}</div>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
          disabled={submitted}
          onClick={() => {
            const finalAmt = amount < minWd ? minWd : amount;
            if (!effectiveGameUser.trim()) {
              setFormErr('Please enter your Game Username / ID.');
              return;
            }
            if (!balanceShotUrl || !qrShotUrl) {
              setFormErr('Please upload BOTH screenshots: (1) Game Balance and (2) Payout Tag / QR Code.');
              return;
            }
            setFormErr('');
            setSubmitted(true);
            onSubmitWithdraw({
              game,
              gameUser: effectiveGameUser.trim(),
              amount: finalAmt,
              method: activeWdGw?.id || 'chime',
              payoutTag: payoutTag.trim() || 'See Attached QR',
              balanceScreenshotUrl: balanceShotUrl,
              qrScreenshotUrl: qrShotUrl,
            });
          }}
        >
          {submitted ? 'Cashout Submitted ✓' : `Request $${amount < minWd ? minWd : amount} Cashout`}
        </button>
      </div>
    );
  }

  if (message.card === 'game-id-form') {
    const existingCred = tickets.find(
      (t) =>
        t.type === 'game-id' &&
        String(t.game || '').toLowerCase() === String(game || '').toLowerCase() &&
        t.status !== 'Rejected'
    );

    return (
      <div className="inline-card">
        <div className="inline-card-header">
          <div className="inline-card-title">
            <Gamepad2 size={18} color="#ffd166" />
            <span>{existingCred ? `${game} Credentials` : 'Create Instant Game ID'}</span>
          </div>
          <span className="status-pill verified">
            {existingCred ? (existingCred.gameUser ? 'Active ID' : 'Pending') : '1 ID / Game'}
          </span>
        </div>

        {games.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            No games are available yet. They will show up here as soon as they are live.
          </p>
        ) : (
          <>
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="field-label">Choose Connected Game</label>
              <select
                className="field-input"
                style={{ padding: '9px 10px', fontSize: '0.86rem' }}
                value={game}
                onChange={(e) => setGame(e.target.value)}
                disabled={submitted}
              >
                {games.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name} ({g.category})
                  </option>
                ))}
              </select>
            </div>

            {existingCred ? (
              existingCred.gameUser ? (
                <div className="ticket-mini" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: '0.76rem', color: '#4ade80', fontWeight: 600 }}>
                    ✓ You already have a {game} account — copy your credentials below:
                  </div>
                  <div className="receipt-row" style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Username</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <strong className="mono">{existingCred.gameUser}</strong>
                      <button
                        type="button"
                        className="msg-act-btn"
                        title="Copy Username"
                        onClick={() => copyField(`ex-u-${existingCred.id}`, existingCred.gameUser || '')}
                      >
                        {copiedKey === `ex-u-${existingCred.id}` ? (
                          <CheckCircle2 size={12} color="#22c55e" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="receipt-row" style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Password</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <strong className="mono">{existingCred.gamePassword || '—'}</strong>
                      <button
                        type="button"
                        className="msg-act-btn"
                        title="Copy Password"
                        onClick={() => copyField(`ex-p-${existingCred.id}`, existingCred.gamePassword || '')}
                      >
                        {copiedKey === `ex-p-${existingCred.id}` ? (
                          <CheckCircle2 size={12} color="#22c55e" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ticket-mini" style={{ padding: 11, fontSize: '0.8rem', color: '#ffd166' }}>
                  ⏳ Your {game} ID request ({existingCred.id}) is already pending with our Admin Desk. Duplicate requests are disabled.
                </div>
              )
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
                disabled={submitted}
                onClick={() => {
                  setSubmitted(true);
                  onSubmitGameId(game);
                }}
              >
                {submitted ? 'Game ID Requested ✓' : `Generate ${game} Login`}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (message.card === 'payment-methods') {
    const isFirstDeposit = Number(user?.completedDepositsCount || 0) === 0;
    const bonusPct = isFirstDeposit
      ? Number(settings.welcomeBonusPercent || 0)
      : Number(settings.regularBonusPercent || 0);
    const bonusAmt = Number(((amount * bonusPct) / 100).toFixed(2));
    const totalCredit = Number((amount + bonusAmt).toFixed(2));

    const curGw = activePayMethod || gateways.find((g) => g.id === methodId) || gateways[0];
    const isManual = curGw && !['cashtap', 'cashapp', 'coinbase', 'wallet'].includes(curGw.id);

    // If a user clicked "Pay with [Gateway]" or clicked the card, show direct interactive payment form!
    if (activePayMethod && curGw) {
      return (
        <div className="inline-card">
          <div className="inline-card-header">
            <button
              type="button"
              className="msg-act-btn"
              style={{ fontSize: '0.74rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setActivePayMethod(null)}
            >
              <span>← All Gateways</span>
            </button>
            <span className="status-pill verified">
              {paymentMethodName(curGw)}
            </span>
          </div>

          <div style={{ margin: '8px 0 12px 0' }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>
              Deposit via {paymentMethodName(curGw)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Min: ${curGw.minAmount || 5} • Max: ${curGw.maxAmount || 2500} • ETA: {curGw.eta || 'Instant'}
            </div>
          </div>

          {/* Destination Game */}
          <div className="field-group" style={{ marginBottom: 10 }}>
            <label className="field-label">Destination Game</label>
            <select
              className="field-input"
              style={{ padding: '8px 10px', fontSize: '0.84rem' }}
              value={game}
              onChange={(e) => setGame(e.target.value)}
              disabled={submitted}
            >
              {games.length === 0 ? (
                <option value="GameStrike Wallet">GameStrike Wallet Balance</option>
              ) : (
                games.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Amount Selection */}
          <div className="field-group" style={{ marginBottom: 10 }}>
            <label className="field-label">Amount (USD)</label>
            <div className="amount-grid">
              {[10, 20, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={submitted}
                  className={`amount-pill ${amount === val ? 'active' : ''}`}
                  onClick={() => setAmount(val)}
                >
                  ${val}
                </button>
              ))}
            </div>
            <input
              className="field-input mono"
              style={{ padding: '8px 10px', fontSize: '0.84rem' }}
              type="number"
              step="0.5"
              min={curGw.minAmount || 0.5}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 1)}
              disabled={submitted}
            />
          </div>

          {/* Live Bonus Preview */}
          <div className="ticket-mini" style={{ marginBottom: 10, padding: '9px 11px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {isFirstDeposit ? 'Welcome Match' : 'Reload Bonus'} ({bonusPct}%)
              </span>
              <strong className="mono" style={{ color: '#ffd166' }}>+${bonusAmt.toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Credits to Game</span>
              <strong className="mono" style={{ color: '#4ade80' }}>${totalCredit.toFixed(2)}</strong>
            </div>
          </div>

          {/* Manual Gateway Specifics: Handle, QR, Download, Direct Link */}
          {isManual && (
            <div className="ticket-mini" style={{ marginBottom: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Send ${amount} to official {paymentMethodName(curGw)} Tag:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                <strong className="mono" style={{ fontSize: '0.86rem', color: '#ffd166' }}>
                  {curGw.handle}
                </strong>
                <button
                  type="button"
                  className="msg-act-btn"
                  onClick={() => copyField(`gw-${curGw.id}`, curGw.handle)}
                  title="Copy payment tag"
                >
                  {copiedKey === `gw-${curGw.id}` ? <CheckCircle2 size={12} color="#22c55e" /> : <Copy size={12} />}
                </button>
              </div>

              {curGw.directPaymentLink && (
                <a
                  href={curGw.directPaymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="pay-link-btn"
                >
                  <ExternalLink size={15} />
                  <span>Open Direct Payment Link</span>
                </a>
              )}

              {curGw.qrImageUrl && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <img
                    src={curGw.qrImageUrl}
                    alt={`${curGw.name} QR Code`}
                    style={{ width: 130, height: 130, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="msg-act-btn"
                      style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = curGw.qrImageUrl!;
                        a.download = `${curGw.name.replace(/\s+/g, '_')}_QR.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                    >
                      <Download size={11} />
                      <span>Download QR Code</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Receipt Screenshot Upload for Manual Gateways */}
          {isManual && (
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="field-label">Payment Receipt Screenshot *</label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: receiptUrl ? '1px solid #22c55e' : '1px dashed var(--border-subtle)',
                  background: 'var(--bg-surface-soft)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  color: receiptUrl ? '#4ade80' : 'var(--text-muted)',
                }}
              >
                <ImagePlus size={15} />
                <span>{receiptUrl ? '✓ Receipt Attached (Tap to change)' : 'Tap to upload payment screenshot'}</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => readImageFile(e.target.files?.[0], setReceiptUrl)}
                  disabled={submitted}
                />
              </label>

              {receiptUrl && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <img
                    src={receiptUrl}
                    alt="Receipt preview"
                    style={{ maxHeight: 110, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }}
                  />
                </div>
              )}
            </div>
          )}

          {formErr && (
            <div style={{ color: '#ef4444', fontSize: '0.76rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} />
              <span>{formErr}</span>
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
            disabled={submitted}
            onClick={() => {
              if (isManual && !receiptUrl) {
                setFormErr('Please upload your payment screenshot/receipt so staff can verify & load.');
                return;
              }
              setSubmitted(true);
              onSubmitDeposit({
                game,
                amount,
                method: curGw.id,
                handle: curGw.handle,
                receiptScreenshotUrl: receiptUrl || undefined,
              });
            }}
          >
            {submitted ? 'Submitted to Cashier...' : `Pay $${amount} with ${paymentMethodName(curGw)}`}
          </button>
        </div>
      );
    }

    // Default Gateways Grid with 1-click Pay for each Gateway
    return (
      <div className="inline-card">
        <div className="inline-card-header">
          <div className="inline-card-title">
            <Landmark size={18} color="#2563eb" />
            <span>24/7 Verified Payment Gateways</span>
          </div>
          <span className="status-pill verified">0% Fee</span>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          Select any payment method below to deposit instantly with 100% Welcome / 20% Reload bonus:
        </p>

        <div style={{ display: 'grid', gap: 9 }}>
          {gateways.map((gw) => {
            return (
              <div
                key={gw.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 11,
                  background: 'var(--bg-surface-soft)',
                  border: '1px solid var(--border-subtle)',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: '0.88rem' }}>{paymentMethodName(gw)}</strong>
                    </div>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Min ${gw.minAmount || 5} • Max ${gw.maxAmount || 2500} • {gw.eta || 'Instant'}
                    </div>
                  </div>

                  {gw.handle && (
                    <button
                      type="button"
                      className="msg-act-btn"
                      onClick={() => copyField(`gw-tag-${gw.id}`, gw.handle)}
                      title="Copy handle"
                    >
                      {copiedKey === `gw-tag-${gw.id}` ? <CheckCircle2 size={12} color="#22c55e" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>

                {gw.handle && (
                  <div style={{ fontSize: '0.74rem', background: 'var(--bg-surface)', padding: '5px 8px', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tag / Handle:</span>
                    <strong className="mono" style={{ color: '#ffd166' }}>{gw.handle}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1, padding: '7px 10px', fontSize: '0.78rem' }}
                    onClick={() => {
                      setActivePayMethod(gw);
                      setMethodId(gw.id);
                    }}
                  >
                    Pay with {paymentMethodName(gw)}
                  </button>

                  {gw.directPaymentLink && (
                    <a
                      href={gw.directPaymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ padding: '7px 10px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <ExternalLink size={12} />
                      <span>Link</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (message.card === 'bonuses') {
    return (
      <div className="inline-card">
        <div className="inline-card-header">
          <div className="inline-card-title">
            <Gift size={18} color="#10b981" />
            <span>Active Bonuses & Freeplay</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            {
              title: `$${Number(settings.freeplayAmount || 0).toFixed(0)} Freeplay`,
              code: 'FREEPLAY',
              desc: 'Once after signup. Screenshot the Primary inbox list, not the opened email.',
            },
            {
              title: `${settings.welcomeBonusPercent}% Welcome`,
              code: 'WELCOME',
              desc: 'Added on your first successful deposit.',
            },
            {
              title: `${settings.regularBonusPercent}% Regular`,
              code: 'REGULAR',
              desc: 'Added on every deposit after the first.',
            },
            {
              title: `${settings.dailyBonusPercent || 0}% ${settings.dailyBonusLabel || "Today's Bonus"}`,
              code: 'DAILY',
              desc: 'Today’s extra bonus. Select this, then deposit.',
            },
          ].map((offer) => (
            <div
              key={offer.code}
              style={{
                padding: '10px 12px',
                borderRadius: 11,
                background: 'var(--bg-surface-soft)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: '0.84rem' }}>{offer.title}</strong>
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--gs-cobalt)', fontWeight: 700 }}>
                  {offer.code}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{offer.desc}</p>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', padding: '6px 10px', fontSize: '0.78rem' }}
                onClick={() => onClaimPromo(offer.title, offer.code)}
              >
                Claim in Chat
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (message.card === 'issue-form') {
    const issueTypes = [
      'Payment Sent, Credits Not Received',
      'Withdrawal Delay / Cashout Issue',
      'Game Not Opening / Login Error',
      'Account Stuck In-Game (Need Kick Offline)',
      'Other — Connect to Live Agent',
    ];

    return (
      <div className="inline-card" style={{ borderColor: 'rgba(255, 31, 75, 0.45)' }}>
        <div className="inline-card-header">
          <div className="inline-card-title">
            <AlertTriangle size={18} color="#ff1f4b" />
            <span>Report Issue / Live Agent</span>
          </div>
          <span className="status-pill processing">Priority Desk</span>
        </div>

        <div className="field-group" style={{ marginBottom: 9 }}>
          <label className="field-label">What happened?</label>
          <select
            className="field-input"
            style={{ padding: '8px 10px', fontSize: '0.84rem' }}
            value={issueCategory}
            onChange={(e) => setIssueCategory(e.target.value)}
            disabled={submitted}
          >
            {issueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label className="field-label">Game (Optional)</label>
            <select
              className="field-input"
              style={{ padding: '8px 10px', fontSize: '0.82rem' }}
              value={game}
              onChange={(e) => setGame(e.target.value)}
              disabled={submitted}
            >
              <option value="">General / Wallet</option>
              {games.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label className="field-label">Ticket / Game ID</label>
            <input
              className="field-input mono"
              style={{ padding: '8px 10px', fontSize: '0.82rem' }}
              placeholder="e.g. DEP-1024"
              value={issueRef}
              onChange={(e) => setIssueRef(e.target.value)}
              disabled={submitted}
            />
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 12 }}>
          <label className="field-label">Explain Briefly</label>
          <textarea
            className="field-input"
            rows={2}
            style={{ padding: '8px 10px', fontSize: '0.84rem', resize: 'none' }}
            placeholder="Describe the issue (you can also upload a screenshot using the image button below)..."
            value={issueDetails}
            onChange={(e) => setIssueDetails(e.target.value)}
            disabled={submitted}
          />
        </div>

        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
          disabled={submitted}
          onClick={() => {
            setSubmitted(true);
            onSubmitIssue?.({
              category: issueCategory,
              game,
              referenceId: issueRef.trim(),
              details: issueDetails.trim(),
            });
          }}
        >
          {submitted ? 'Escalated to Live Agent ✓' : 'Alert Live Support Agent Now'}
        </button>
      </div>
    );
  }

  if (message.card === 'ticket-receipt' && message.cardData) {
    const d = message.cardData;
    return (
      <div className="inline-card ticket-receipt">
        <div className="inline-card-header" style={{ borderBottomColor: 'rgba(16,185,129,0.22)' }}>
          <div className="inline-card-title">
            <CheckCircle2 size={18} color="#10b981" />
            <span>Ticket {d.ticketId}</span>
          </div>
          <span className="status-pill verified">
            {d.checkoutUrl ? 'CashTap Ready' : 'Confirmed'}
          </span>
        </div>

        {d.game && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Destination</span>
            <strong>{d.game}</strong>
          </div>
        )}
        {d.amount !== undefined && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Amount</span>
            <strong className="mono" style={{ color: 'var(--gs-emerald)' }}>${d.amount}</strong>
          </div>
        )}
        {d.method && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Gateway</span>
            <strong>{d.method}</strong>
          </div>
        )}
        {d.sessionId && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Session</span>
            <strong className="mono" style={{ fontSize: '0.74rem' }}>{d.sessionId}</strong>
          </div>
        )}
        {d.loginId && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Username / ID</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong className="mono">{d.loginId}</strong>
              <button
                type="button"
                className="msg-act-btn"
                title="Copy Username"
                onClick={() => copyField('login', d.loginId!)}
              >
                {copiedKey === 'login' ? (
                  <CheckCircle2 size={12} color="#22c55e" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        )}
        {d.tempPass && (
          <div className="receipt-row">
            <span style={{ color: 'var(--text-muted)' }}>Password</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong className="mono">{d.tempPass}</strong>
              <button
                type="button"
                className="msg-act-btn"
                title="Copy Password"
                onClick={() => copyField('pass', d.tempPass!)}
              >
                {copiedKey === 'pass' ? (
                  <CheckCircle2 size={12} color="#22c55e" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        )}

        {d.checkoutUrl && (
          <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
            <a
              href={d.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ width: '100%', padding: '10px 14px', fontSize: '0.84rem' }}
            >
              <span>Pay Now on CashTap</span>
              <ExternalLink size={15} />
            </a>

            {d.ticketId && onSyncCashTap && (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.78rem' }}
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  await onSyncCashTap(d.ticketId!);
                  setSyncing(false);
                }}
              >
                <RefreshCw size={13} />
                <span>{syncing ? 'Checking CashTap...' : 'Verify / Sync Payment Status'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
};
