# Product

**Candle** is a mobile AI agent app. It pairs an Expo / React Native client (iOS, Android, web) with a TypeScript agent backend that can browse the web, run code in an E2B sandbox, and stream tool calls and reasoning back to the client over WebSocket.

## What it does

- Conversational chat UI with streaming reasoning, tool activity, and final answers.
- Backend agent powered by LangGraph (tool-calling state graph) using Cloudflare Workers AI as the LLM provider (default model `@cf/moonshotai/kimi-k2.6`).
- Sandboxed execution via E2B for Python, Node, terminal, and file management.
- Web search and browsing via You.com / Brave / Google CSE, with cheerio-based scraping.
- Pinecone-backed dynamic instruction retrieval for context-sensitive guidance.
- Artifact registry that tracks files / URLs the agent produces across turns so users can refer back to "that file from earlier".

## Key product behaviors

- Tool budget enforcement: prompts are classified `simple | moderate | complex` and given strict caps on tool / search / browse calls to prevent runaway loops.
- Failure detection: repeated identical tool errors trigger a nudge to switch approach.
- Conversation summarization: older history is condensed once it exceeds the threshold while preserving URLs and key user requests.
- Per-connection `RunContext` (no global state) keeps each WebSocket session isolated.

## App identity

- Display name: `Candle` (`app.json`)
- Package / slug: `Candle`, internal package name: `maii`
- URL scheme: `maii`
