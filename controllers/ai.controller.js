const db = require("../models/index");
const { PROFESSOR_STATUS } = require("../constants/professorStatus");
const { toPublicProfile } = require("./professor.controller");

const ProfessorProfile = db.ProfessorProfile;
const User = db.User;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter's free-tier models share a rate-limited pool per model, so a
// popular one can 429 at any moment. Trying a short ordered list — instead
// of a single model — keeps the feature working through that congestion.
const FALLBACK_MODELS = ["openai/gpt-oss-20b:free", "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-nano-30b-a3b:free"];

// This endpoint sits on a public, unauthenticated page and calls a
// third-party API, so a per-IP in-memory window keeps the free quota from
// being drained by a script — a real rate limiter isn't warranted at this
// traffic scale.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function toSummary(profile) {
  return {
    id: profile.id,
    name: profile.user?.full_name ?? "Unknown",
    headline: profile.headline,
    subjects: profile.subjects,
    price_per_session: Number(profile.price_per_session),
    rating_avg: Number(profile.rating_avg),
    total_reviews: profile.total_reviews,
    bio: (profile.bio || "").slice(0, 200),
  };
}

// The model isn't guaranteed to return clean JSON even when asked to —
// this recovers the first {...} block if there's stray text around it.
function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// POST /api/ai/recommend-professor — public; suggests professors for a
// student's stated need using an OpenRouter-hosted model.
exports.recommendProfessor = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }
    if (query.length > 500) {
      return res.status(400).json({ message: "query is too long (max 500 characters)" });
    }

    const ip = req.headers["x-forwarded-for"] || req.ip || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ message: "Too many requests — please wait a few minutes and try again." });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ message: "AI recommendations are not configured" });
    }

    const professors = await ProfessorProfile.findAll({
      where: { status: PROFESSOR_STATUS.APPROVED },
      include: [{ model: User, as: "user", attributes: ["id", "full_name", "avatar_url"] }],
      order: [["rating_avg", "DESC"]],
      limit: 30,
    });

    if (professors.length === 0) {
      return res.json({ recommendations: [] });
    }

    const systemPrompt = `You are an assistant for OfficeHours, a platform where students book office-hour sessions with professors across universities. Given a student's question and a JSON list of available professors, recommend the best 1-3 matches.

Respond with ONLY valid JSON in this exact shape, no other text, no markdown fences:
{"recommendations":[{"professor_id":"<id from the list>","reason":"<one short sentence, max 20 words, written directly to the student>"}]}

Rules:
- Only use professor_id values that appear in the provided list.
- Order recommendations best-match first.
- Only recommend a professor whose subjects, headline, or bio genuinely relate to the student's question — matching on real overlap, not vibes.
- The reason must be grounded only in that professor's actual subjects/headline/bio. Never claim expertise or offer help they have no listed connection to.
- If nothing in the list is a real match, return {"recommendations":[]} — an empty list is a correct, expected answer, not a failure.
- Never invent a professor_id.`;

    const userPrompt = `Student's question: "${query.trim()}"\n\nAvailable professors:\n${JSON.stringify(professors.map(toSummary))}`;

    const models = process.env.OPENROUTER_MODEL
      ? process.env.OPENROUTER_MODEL.split(",").map((m) => m.trim()).filter(Boolean)
      : FALLBACK_MODELS;

    let parsed = null;
    for (const model of models) {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
          "X-Title": "OfficeHours",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 400,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.error(`OpenRouter error (${model}):`, response.status, errBody);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const candidate = extractJson(content);
      if (candidate && Array.isArray(candidate.recommendations)) {
        parsed = candidate;
        break;
      }
      console.error(`Unparseable AI response (${model}):`, content);
    }

    if (!parsed) {
      return res.status(502).json({ message: "AI service is temporarily unavailable" });
    }

    const byId = new Map(professors.map((p) => [p.id, p]));
    const recommendations = parsed.recommendations
      .filter((r) => r && byId.has(r.professor_id))
      .slice(0, 3)
      .map((r) => ({
        professor: toPublicProfile(byId.get(r.professor_id)),
        reason: typeof r.reason === "string" ? r.reason.slice(0, 200) : "",
      }));

    return res.json({ recommendations });
  } catch (err) {
    console.error("recommendProfessor error:", err);
    return res.status(500).json({ message: "Something went wrong generating recommendations" });
  }
};
