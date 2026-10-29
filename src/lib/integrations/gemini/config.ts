export function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '';
  const trimmed = key.trim();
  if (trimmed) {
    // Ensure ADK and GenAI libraries pick it up
    process.env.GEMINI_API_KEY = trimmed;
    process.env.GOOGLE_GENAI_API_KEY = trimmed;
    process.env.GOOGLE_API_KEY = trimmed;
    return trimmed;
  }
  return null;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-3.7-flash';
}
