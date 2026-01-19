# Applied AI Take-Home Assessment

# “Trend-to-Idea Agent”

### Why we’re doing this

Gallium is building an **AI-native operating system for marketing**: systems that don’t just generate copy, but **research, decide, and ship** with speed + trust.

This challenge is about judging your ability to build an **agentic product that actually works end-to-end**: orchestration, tool use, streaming UX, accuracy, and product judgment.

---

## The goal

Build a **streaming, agentic chat interface** that can:

1. **Research** current trends / trending topics on the web (accurate + up-to-date) using **MCP servers / plugins of your choice**
2. Present the research clearly with **citations + timestamps**
3. Pause for a **HITL checkpoint** (human-in-the-loop) to confirm we like the research
4. After approval, spawn a **sub-agent** that generates **platform-specific content ideas** (LinkedIn / TikTok / X / etc.) aligned to:
    - the approved research
    - a **brand-aware system prompt** (Gallium)
    - a chosen “user persona” (you can define who the end-user is)

Everything should **stream** and the UI should show **progress + steps**. The **sub-agent’s stream must render in a separate UI surface** (e.g., a sidebar/panel), not mixed into the main chat.

We don’t need a beautiful UI, but we care a lot about **UX clarity and control**.

---

## Hard requirements

### 1) Must use LangGraph

- Use **LangGraph** as the orchestration layer (state machine / graph).

### 2) **Must use Convex**

- Use **Convex** as your backend for persistence and real-time updates.

### 3) Web research must be truly up-to-date

- Use MCP servers / plugins (your choice) to fetch trend data and supporting sources.
- Your output must include:
    - **Source URLs**
    - Any other relevant information of your choice

### 4) HITL interruption before idea generation

- The system must **stop** after presenting research and explicitly wait for approval.
- The user should be able to:
    - Approve and proceed
    - Ask for refinements (narrow scope, exclude a topic, add a region, change timeframe, etc.)
    - Restart research with an updated query

### 5) Streaming everywhere

- The main chat must stream:
    - step updates (what it’s doing)
    - partial research findings as they come in (not only final)
- The sub-agent must stream its own output **in a separate UI surface** (sidebar/panel).

### 6) UX expectations (light but intentional)

Your interface should make it easy to understand:

- What step the system is in
- What sources it used
- What it believes is trending and why
- Where user control is (approve/refine)

A “Cursor-like” feel is the inspiration: transparent steps + fast iteration.

---

## Brand context (must be embedded into your system prompt)

You can paraphrase, but your system should be “aware” of Gallium’s identity and generate ideas accordingly.

**Gallium**

- We’re building an **AI-native operating system for marketing**.
- We care about: **speed, leverage, rigor, systems thinking, and modern taste**.
- Our voice is usually: **clear, sharp, slightly edgy, technical but human** (no corporate fluff).
- We sell to: founders, growth leads, and small marketing teams who want to move faster with AI.
- What we like: concrete takeaways, strong opinions, punchy hooks, credible evidence, “this actually works” energy.

You may choose the end-user persona (e.g., “growth lead at a D2C brand”, “founder building in public”, etc.) – just be consistent.

---

## Suggested product flow (you can change it)

### Step 0: User prompt

Example:

> “What’s trending this week in creator monetization, and give me 10 content ideas for LinkedIn + X.”
> 

### Step 1: Research plan (streaming)

- Clarify scope automatically (time window, region, domain)
- Decide which tools/sources to query
- Begin streaming a “Research in progress” view

### Step 2: Trend retrieval + synthesis (streaming)

- Fetch trend candidates
- Enrich with sources and supporting evidence

### Step 3: Research report (must be reviewable)

Display something like:

- Top 5–10 trends
- For each: 1–2 sentence summary, why it matters, key supporting links, timestamps
- “Confidence” (simple scale is fine) + why

### Step 4: HITL checkpoint (required)

UI action: **Approve** / **Refine research** / **Restart**

### Step 5: Idea sub-agent (streams in sidebar)

After approval, spawn a sub-agent that generates:

- Platform-specific ideas (LinkedIn / TikTok / X / etc.)
- Each idea includes:
    - **Hook**
    - **Format** (post / thread / script / etc.)
    - **Angle** (why this will work)
    - **Which trend it maps to** (+ citation reference)
    - **A short description** (what to say/do)
        
        Optionally: include 2–3 variants per idea.
        

---

## What you submit

1. A GitHub repo or zip with local running instructions
2. (Optional): a live URL that allows us to use the app (can be hosted anywhere)

> We will go over your decisions and solution on a short call after your submission.
> 

---

## Constraints (to keep it hard but not massive)

- Keep the feature set focused on the flow above.
- Don’t overbuild auth, accounts, saved history, etc. (unless you want to).
- Prioritize: **correctness + UX clarity + streaming + clean orchestration**.

---

## What we’ll evaluate

- **Accuracy + freshness** of research (sources, timestamps, cross-checking)
- **LangGraph quality** (clear states, sensible node boundaries, debuggability)
- **Streaming UX** (feels responsive, understandable, not noisy)
- **HITL control** (clean pause, refinement loop works, no weird state bugs)
- **Sub-agent separation** (sidebar/panel streaming is real, not faked)
- **Code quality** (structure, readability, error handling)
- **Product judgment** (you built the right “minimum delightful” thing)

---

## Bonus points (completely optional)

If you feel like something is really worth adding and not so much effort to do. 

Examples:

- Source quality scoring (e.g., de-duplication, spam filtering, “trusted outlets” weighting)
- Caching (so repeated prompts don’t re-fetch everything)
- A simple “export” of research + ideas (markdown is fine)
- Basic eval harness (even a tiny one): “does every claim have a link?”

This is completely up to you and your creativity. 

---

**This challenge is meant to be very open ended. There is no “perfect” answer. You are free to use any tools, AI, coding tools, search the web, etc. to complete this assessment.** 

> As a reminder: After your submission we’ll do a short call to walk through your decisions and tradeoffs.
> 

**Best of luck!**