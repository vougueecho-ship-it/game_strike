/** Default chat + vision model for this API key (2.5-* returns 404 for new projects). */
export function resolveGeminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.5-flash';
}