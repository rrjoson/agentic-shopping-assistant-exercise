# 🤖 Agentic Shopping Assistant - Workshop Exercise

> **Workshop**: "Bringing and Running AI Agents in the Browser"
> **Instructor**: Shivay Lamba (Senior Dev Ex Engineer at Qualcomm)
> **Event**: CityJS Singapore 2026
> **Date**: February 4, 2026
> **Location**: Rakuten Asia offices

---

## 📍 What This Is

This repo captures my hands-on exercise from Shivay's workshop on building AI agents that run entirely in the browser. We transformed a basic chat interface into a full **agentic shopping assistant** with tools, RAG, and UI actions.

---

## 🚀 Starting Point vs What We Built

### Before (Step1 branch)
```
┌─────────────────────────────────────┐
│  Basic WebLLM Chat                  │
│  ─────────────────                  │
│  • Qwen 1B model running locally    │
│  • Simple prompt: "You are helpful" │
│  • Text in → Text out               │
│  • No actions, no tools             │
└─────────────────────────────────────┘
```

### After (exercise/agentic-shopping-assistant branch)
```
┌─────────────────────────────────────────────────────────┐
│  Agentic Shopping Assistant                             │
│  ──────────────────────────                             │
│  • 8 tools the AI can call                              │
│  • RAG with semantic search                             │
│  • AI controls the UI (navigation!)                     │
│  • Auto-generated system prompts                        │
│  • Smart defaults for missing params                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠 What We Built

### 1. Tool System (Function Calling)
We created tools that the AI can invoke to take actions:

| Tool | What it does |
|------|-------------|
| `searchProducts` | Find products with semantic expansion |
| `addToCart` | Add items with smart color/size defaults |
| `removeFromCart` | Remove items by name |
| `viewCart` | Show cart contents |
| `getProductDetails` | Get detailed product info |
| `getRecommendations` | Personalized suggestions |
| `browseProducts` | **Navigate to shop page with filters!** |
| `searchFAQ` | RAG-powered FAQ search |

### 2. RAG (Retrieval Augmented Generation)
```
User: "find me dark colored items"
        ↓
┌─────────────────────────────────┐
│  SEMANTIC EXPANSION             │
│  "dark" → [black, gray, navy]   │
└─────────────────────────────────┘
        ↓
Results: Black Hoodie, Gray Beanie, etc.
```

### 3. Tool Actions (AI Controls the UI!)
Tools can return actions that the UI executes:
```typescript
return {
  nextPrompt: "Navigating to dark items...",
  action: {
    type: "navigate",
    url: "/products?colors=black,gray"
  }
}
```

### 4. First-Class System Prompts
Instead of manually writing tool docs, we auto-generate them:
```typescript
// ❌ Before: Manual, fragile
const SYSTEM_PROMPT = `TOOLS: 1. addToCart...`

// ✅ After: Auto-generated from tool definitions
const systemPrompt = buildSystemPrompt(tools);
// Uses toolsToSystemPrompt() to generate docs from Zod schemas
```

---

## 📚 Key Concepts Learned

### Function Calling (Text-Based vs Native)

| Approach | How it works |
|----------|-------------|
| **Native** (OpenAI, Claude API) | Model outputs structured JSON, API handles parsing |
| **Text-Based** (Our approach) | Model outputs XML in text, we parse it ourselves |

We used text-based because WebLLM doesn't support native function calling:
```xml
<functionCall>
  <name>addToCart</name>
  <parameters>
    <productId type="string">frog-beanie</productId>
  </parameters>
</functionCall>
```

### RAG Flow
```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ RETRIEVE │ ──▶ │ AUGMENT  │ ──▶ │ GENERATE │
└──────────┘     └──────────┘     └──────────┘
   Find             Add to           AI uses
  relevant         prompt as        enriched
   context         context          context
```

### Agentic AI vs Regular AI
```
Regular AI:  User → AI → Response (text only)
Agentic AI:  User → AI → [Tools] → Actions → Response
                         ↑
                    AI decides what
                    actions to take
```

---

## 📁 Files Changed

| File | What changed |
|------|-------------|
| `src/ai/tools/shoppingTools.ts` | **NEW** - All 8 tool definitions |
| `src/ai/prompts/shoppingAssistant.ts` | **NEW** - Prompt templates |
| `src/app/chat/Chat.tsx` | Enhanced with tool execution & navigation |
| `src/utils/agent/tool.ts` | Added `ToolAction` types |
| `src/utils/agent/toolsToSystemPrompt.ts` | Fixed description bug |

---

## 🏃 Running Locally

```bash
npm install
npm run dev
```

Then:
1. Click the sparkle button (bottom right)
2. Click "Load AI Model" (first time takes ~1-2 min)
3. Try: "add frog beanie to cart" or "find me dark items"

---

## 💡 Ideas for Next Steps

- [ ] **Try [Mastra](https://mastra.ai/)** - Build production-ready AI agents with TypeScript. Mastra provides agent orchestration, workflows, tool management, and integrations out of the box
- [ ] Implement memory (conversation history)
- [ ] Add more tool actions (openModal, scroll)
- [ ] Real vector embeddings for product search
- [ ] Multi-turn tool calling

---

## 🙏 Credits

- **Workshop**: Shivay Lamba ([@howabortnow](https://twitter.com/howdyshivay))
- **Original Repo**: [cityjs-singapore-workshop](https://github.com/nicokoenig/cityjs-singapore-workshop)
- **Exercise by**: Ricardo (with Claude Opus 4.5)

---

## 📖 Original Workshop README

<details>
<summary>Click to expand original README</summary>

### Getting Started

```
npm install
npm run dev
```

### Env
This project supports two env variables in a `.env` file in the root of the project:
- `PORT`: the local port on which the dev server will listen (optional)
- `VITE_GOOGLE_GENERATIVE_AI_API_KEY`: the API_KEY for the Google Generative AI Studio

### Setup
```
- public      // public assets (mainly images)
- src         // main application logic
- - app       // layout components
- - store     // react context provider, data
- - theme     // UI components with limited logic
- - utils     // utility functions
- - App.tsx   // main App
- - index.css // set up tailwindcss
- - main.tsx  // main entry-point
- index.html  // set up vite
```

### Key Dependencies
- React, React Router, Headless UI, Heroicons
- Tailwind CSS, Nuqs, Showdown
- WebLLM, Hugging Face Transformers
- Zod, TypeScript, ESLint, Prettier

</details>
