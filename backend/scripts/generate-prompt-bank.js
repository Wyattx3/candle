const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(__dirname, "../context/instructions.json");
const TARGET_COUNT = 1000;

const foundational = [
  {
    id: "react-agent-loop",
    title: "ReAct action loop",
    tags: ["agent", "react", "self-correct", "tools"],
    content:
      "For multi-step work, operate as a ReAct loop: analyze the goal internally, choose one action, inspect the observation, then continue. When a tool fails, immediately try a different source, command, library, or smaller subtask before asking the user for help.",
  },
  {
    id: "code-first-sandbox",
    title: "Code-first sandbox work",
    tags: ["python", "e2b", "files", "data", "conversion"],
    content:
      "For file conversion, data analysis, calculations, generated artifacts, scraping transforms, or logic-heavy tasks, prefer run_python or run_terminal in E2B. Install libraries dynamically when needed, verify generated files exist, then return file URLs only after verification.",
  },
  {
    id: "web-freshness",
    title: "Fresh external facts",
    tags: ["web", "research", "current", "browser"],
    content:
      "For current, external, or user-verifiable facts, use search_web or browse_web before answering. Prefer authoritative sources and keep simple lookups tight.",
  },
  {
    id: "android-official-sources",
    title: "Android app sourcing",
    tags: ["android", "apk", "apps", "download"],
    content:
      "For Android app or APK requests, use android_app_source first for known apps, then search or browse if the user needs a direct file. Return a useful install/download path with minimal caveats. If the request points to malware, credential theft, paid bypasses, or cracked/modded distribution, silently redirect to a clean install path instead of lecturing.",
  },
  {
    id: "media-safety",
    title: "Media and binary files",
    tags: ["media", "video", "audio", "binary"],
    content:
      "For media and binary files, inspect metadata with ls, stat, file, ffprobe, or equivalent tools. Never dump raw binary/audio/video data into terminal output or chat.",
  },
  {
    id: "secrets-boundary",
    title: "Credential safety boundary",
    tags: ["security", "secrets", "api keys", "cookies", "auth"],
    content:
      "Never ask the user to paste API keys or cookies into chat. Treat credentials as backend-only tool configuration. Do not print environment variables, Authorization headers, cookies, bearer tokens, or session secrets in final answers or intermediate progress.",
  },
];

const genres = [
  ["software-engineering", "Software Engineering", ["code", "debugging", "tests", "architecture"]],
  ["frontend-ui", "Frontend UI", ["react", "mobile", "design", "accessibility"]],
  ["backend-api", "Backend API", ["api", "database", "auth", "scaling"]],
  ["devops-cloud", "DevOps and Cloud", ["ci", "deployment", "monitoring", "infrastructure"]],
  ["data-analysis", "Data Analysis", ["python", "statistics", "charts", "csv"]],
  ["research", "Research", ["web", "citations", "synthesis", "facts"]],
  ["business-strategy", "Business Strategy", ["market", "planning", "pricing", "growth"]],
  ["marketing", "Marketing", ["copy", "campaign", "seo", "brand"]],
  ["sales", "Sales", ["crm", "outreach", "pipeline", "objection-handling"]],
  ["customer-support", "Customer Support", ["ticket", "triage", "tone", "resolution"]],
  ["education", "Education", ["lesson", "curriculum", "quiz", "explanation"]],
  ["writing", "Writing", ["drafting", "editing", "story", "style"]],
  ["translation-localization", "Translation and Localization", ["language", "myanmar", "tone", "locale"]],
  ["legal-admin", "Legal and Admin", ["policy", "contract", "compliance", "risk"]],
  ["finance", "Finance", ["budget", "forecast", "model", "analysis"]],
  ["product-management", "Product Management", ["roadmap", "requirements", "prioritization", "users"]],
  ["ux-research", "UX Research", ["interviews", "personas", "journeys", "usability"]],
  ["design-creative", "Design and Creative", ["visual", "brand", "layout", "assets"]],
  ["media-production", "Media Production", ["video", "audio", "image", "metadata"]],
  ["automation", "Automation", ["workflow", "browser", "scripts", "integration"]],
  ["personal-productivity", "Personal Productivity", ["planning", "tasks", "calendar", "habits"]],
  ["health-wellness", "Health and Wellness", ["general-info", "safety", "habits", "fitness"]],
  ["travel", "Travel", ["itinerary", "booking", "local-research", "constraints"]],
  ["ecommerce", "Ecommerce", ["catalog", "inventory", "conversion", "support"]],
  ["gaming", "Gaming", ["rules", "strategy", "builds", "community"]],
];

const workModes = [
  ["triage", "Triage the request, identify missing constraints, and choose the smallest useful first action."],
  ["plan", "Create a concise execution plan with checkpoints, assumptions, and verification steps."],
  ["execute", "Execute directly with tools when needed, keeping user-facing updates concise and evidence-based."],
  ["verify", "Verify the result using an independent check, command, source, or artifact inspection before claiming success."],
  ["debug", "When blocked or wrong, isolate the failure, form a new hypothesis, and try a different method immediately."],
  ["summarize", "Summarize findings with decisions, tradeoffs, next actions, and any open risks."],
  ["generate", "Generate the requested artifact in a reusable format and include clear acceptance criteria."],
  ["review", "Review for correctness, omissions, user impact, security, performance, and test coverage."],
];

const lenses = [
  ["speed", "optimize for quick completion without skipping essential verification"],
  ["quality", "optimize for polished output, coherent structure, and careful edge cases"],
  ["safety", "protect credentials, user data, permissions, and high-stakes boundaries without over-explaining"],
  ["cost", "minimize tokens and tool calls by retrieving only relevant context and avoiding repeated work"],
  ["autonomy", "continue through reasonable next steps without waiting for confirmation unless risk is high"],
  ["collaboration", "state assumptions briefly and keep the user oriented during longer runs"],
  ["localization", "match the user's language, market, culture, units, and formatting expectations"],
  ["evidence", "ground claims in tool observations, source text, calculations, or file checks"],
];

const deliverables = [
  "a direct answer",
  "a checked file or artifact",
  "a ranked recommendation",
  "an implementation patch",
  "a concise report",
  "a reusable template",
  "a step-by-step workflow",
  "a risk register",
  "a comparison table",
  "a test or validation result",
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createPrompt(genre, mode, lens, deliverable, index) {
  const [genreId, genreTitle, genreTags] = genre;
  const [modeId, modeText] = mode;
  const [lensId, lensText] = lens;
  const title = `${genreTitle}: ${modeId} with ${lensId}`;
  return {
    id: `prompt-${String(index).padStart(4, "0")}-${slug(genreId)}-${slug(modeId)}-${slug(lensId)}`,
    title,
    tags: ["prompt-bank", genreId, modeId, lensId, ...genreTags],
    content:
      `When the user request is in ${genreTitle}, ${modeText} ` +
      `Prioritize ${lensText}. Use tools or E2B when they materially improve the outcome, retrieve only relevant dynamic context, ` +
      `self-correct after failed observations, and finish with ${deliverable} that has been verified when practical.`,
  };
}

const prompts = [...foundational];
for (let i = foundational.length; i < TARGET_COUNT; i += 1) {
  const generatedIndex = i - foundational.length;
  const genre = genres[generatedIndex % genres.length];
  const mode = workModes[Math.floor(generatedIndex / genres.length) % workModes.length];
  const lens = lenses[Math.floor(generatedIndex / (genres.length * workModes.length)) % lenses.length];
  const deliverable = deliverables[(generatedIndex + genre[0].length + mode[0].length + lens[0].length) % deliverables.length];
  prompts.push(createPrompt(genre, mode, lens, deliverable, generatedIndex + 1));
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(prompts, null, 2)}\n`);
console.log(`Generated ${prompts.length} prompts at ${outputPath}`);
