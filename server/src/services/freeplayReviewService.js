import { resolveGeminiModel } from './geminiConfig.js';

function parseReviewJson(raw) {
  const cleaned = String(raw || '').replace(/```json|```/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const decision = String(parsed.decision || '').toLowerCase();
    const playerMessage = String(parsed.playerMessage || parsed.reason || '').trim();
    if (decision === 'approve' || decision === 'reject') {
      return { decision, playerMessage: playerMessage.slice(0, 900) };
    }
  } catch {
  }
  return null;
}

/**
 * Returns { decision: 'approve'|'reject'|'manual', playerMessage }.
 * On API failure or quota, decision is 'manual' so admin can still review.
 */
export async function reviewFreeplayInboxScreenshot(screenshotDataUrl) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return { decision: 'manual', playerMessage: '' };

  const match = String(screenshotDataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return {
      decision: 'reject',
      playerMessage:
        'Screenshot file is not valid. Upload a clear photo or image of your Primary inbox list.',
    };
  }

  const model = resolveGeminiModel();
  const prompt = [
    'You verify GameStrike.io one-time freeplay inbox screenshots.',
    'APPROVE only if ALL are true:',
    '1) The image shows an email INBOX LIST (multiple emails), not an opened email.',
    '2) A GameStrike / GameStrike.io email is visible in that list (subject may mention freeplay).',
    '3) The email is in Primary / main inbox, not inside an opened message body.',
    '4) The screenshot is readable (not blank or cropped away).',
    'REJECT if: opened email view, spam folder only, no GameStrike email visible, chat/DM, payment receipt, game balance, or random unrelated image.',
    'When rejecting, playerMessage must be short, polite, human — tell them exactly how to fix (Primary tab, list view, GameStrike row visible, do not open, do not mark spam).',
    'When approving, playerMessage can be empty string.',
    'Reply JSON only: {"decision":"approve"|"reject","playerMessage":"..."}',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
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
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: match[1], data: match[2] } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[FreeplayReview] Gemini failed (${res.status}): ${data?.error?.message || 'unknown'}`);
      return { decision: 'manual', playerMessage: '' };
    }
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const parsed = parseReviewJson(raw);
    if (!parsed) return { decision: 'manual', playerMessage: '' };
    return parsed;
  } catch (err) {
    console.warn(`[FreeplayReview] ${err.message}`);
    return { decision: 'manual', playerMessage: '' };
  } finally {
    clearTimeout(timer);
  }
}