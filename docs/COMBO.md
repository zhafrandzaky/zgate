# ZGate — Combo & Fallback System Documentation

## What is a Combo?

A **Combo** is an ordered chain of AI models that ZGate uses for request routing. When you make a request through ZGate's API, the combo determines which provider handles it first, and which providers serve as fallbacks if the primary fails.

### Key Concept: Order = Execution

The order of models in a combo is the **execution order**:
- **Position 1** (top) = **PRIMARY** — always used first
- **Position 2** = **FALLBACK 1** — used if primary fails
- **Position 3** = **FALLBACK 2** — used if fallback 1 fails
- And so on...

This is not "preference" — it's a **deterministic execution sequence**.

---

## Creating a Combo (Dashboard)

1. Go to Dashboard → Combos
2. Click "Create Combo"
3. Name your combo (e.g., "My AI Stack")
4. Add models by searching your connected providers
5. Drag and drop to reorder (top = primary)
6. Save

### Combo Builder UX

- **Drag handle** — GripVertical icon on left of each item
- **Position badges:**
  - Position 1: `PRIMARY` badge (accent/indigo color)
  - Position 2+: `FALLBACK 1`, `FALLBACK 2`, etc. (muted color)
- **Visual hierarchy** — Position 1 is more prominent (larger card, border accent)
- **Reorder feedback** — Items shift with layout animation during drag
- **Empty state** — "Add at least 2 models to enable fallback"
- **Single item** — Badge shows `ONLY` instead of `PRIMARY`
- **Auto-save** — Saves on reorder (500ms debounce), shows "Saved" checkmark

### Combo List Page

Each combo card displays the chain:
```
[kiro/claude-sonnet] → [deepseek/v4-flash] → [openrouter/llama]
PRIMARY               FALLBACK 1             FALLBACK 2
```

Click to open builder. Drag to reorder combo priority.

---

## Using a Combo

Once created, use the combo name as the model parameter in your API requests:

```
Endpoint: https://zgate.ziron.dev/v1
Model: <combo-name>        ← use combo name, not provider/model
API Key: sk-zg-xxxx
```

### Example: Claude Code Configuration
```json
{
  "apiEndpoint": "https://zgate.ziron.dev/v1",
  "model": "my-ai-stack",
  "apiKey": "sk-zg-your-key-here"
}
```

ZGate automatically routes to the right provider based on the combo configuration.

---

## Fallback Trigger Conditions

Fallback to the next model in the combo is triggered by:

| Condition | Description |
|-----------|-------------|
| 401 Unauthorized | Invalid/expired credentials |
| 403 Forbidden | Access denied |
| 429 Rate Limited | Provider rate limit hit |
| 500 Internal Error | Provider server error |
| 502 Bad Gateway | Provider gateway error |
| 503 Service Unavailable | Provider maintenance/overload |
| Connection Timeout | No response within 30s |
| TCP Disconnect | Connection dropped mid-stream |
| Malformed Response | 3+ consecutive broken JSON chunks |
| Content Filter | `finish_reason: content_filter` |
| Stream Error | `finish_reason: error` |
| Empty Stream | No first chunk within 10s |

---

## Full Seamless Fallback

**Principle: The client never knows fallback occurred as long as at least one provider is available.**

### Fallback Behavior Matrix

| Scenario | Behavior | Client Experience |
|----------|----------|-------------------|
| Error before first chunk | Restart to next provider | No awareness, minor delay |
| Error after partial stream (< 20 chars) | Restart to next provider | No awareness, brief pause |
| Error after partial stream (≥ 20 chars) | Recovery context → continue | Stream never breaks |
| Non-streaming error | Buffer + retry | Complete transparency |
| All providers fail | Return error | Client sees error |

### Chunk ID Rewriting

When switching providers mid-stream, ZGate rewrites chunk IDs to remain sequential:

```
Provider 1 chunks:  id=chatcmpl-abc, index=0,1,2  → client receives: 0,1,2
[ERROR at provider 1]
Provider 2 chunks:  id=chatcmpl-xyz, index=0,1,2  → ZGate rewrites → client receives: 3,4,5
```

### Full Seamless Stream Flow

```
ZGate receives request
    │
    ▼
Open stream to client (SSE headers sent)
    │
    ▼
Provider 1 streaming...
    ├── chunk [id=0] → buffer + forward to client ✓
    ├── chunk [id=1] → buffer + forward to client ✓
    ├── chunk [id=2] → buffer + forward to client ✓
    └── ERROR (mid-stream / timeout / 500)
            │
            │  ← client unaware, stream stays open
            ▼
    Build recovery request:
    - original messages
    - + {"role":"assistant","content":"<partial from buffer>"}
    - send to Provider 2 (stream still open to client)
            │
            ▼
    Provider 2 streaming...
    ├── chunk [id=0] → rewrite id=3 → buffer + forward to client ✓
    ├── chunk [id=1] → rewrite id=4 → buffer + forward to client ✓
    └── [DONE] → forward to client ✓

Client experience: one continuous stream from id=0 to completion.
No interruption, no error, no indicator.
```

---

## Ordering Logic

### Default Strategy: `fallback`
- Always start with position 1
- Move to next position only on error/unavailable
- Seamless — AI never stops when switching providers

### Round-Robin Strategy
- Distributes requests evenly across all providers in the combo
- Still has fallback: if the scheduled provider fails, skip to next
- Useful for load distribution across multiple accounts

### Account-Level Round-Robin

Within a single provider, if the user has **multiple accounts** (ProviderConnections):
- Requests distribute round-robin across accounts
- Each account tracks its own cooldown independently
- When one account hits rate limit, skip to next account for same provider
- Only move to next combo model when ALL accounts for current provider are exhausted

### Exponential Backoff for 429

When a provider returns 429 (rate limited):
```
Attempt 1: immediate retry next account
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s
Attempt 5: wait 16s
Max: 30s
```

After max backoff, mark account as "cooldown" for the backoff duration.

### Cooldown Mechanism

- After exhausting an account, it enters cooldown
- Cooldown duration = last backoff value
- After cooldown expires, account is available again
- Cooldown is per-account, not per-provider

---

## Output Consistency

When fallback occurs mid-stream, ZGate injects a **contextual recovery prompt** to the next provider to ensure output consistency:

### Recovery Instruction (injected as internal system message)

```
You are continuing an assistant response that was interrupted.
The partial response so far is included as the last assistant message.
Rules:
- Continue EXACTLY from the last word of the partial response
- Do NOT repeat anything already said
- Do NOT add any introduction, transition, or "continuing from before"
- Match the EXACT tone, language (same language as conversation), and style
- Match the EXACT formatting (if was using markdown/code blocks, continue that)
- Start directly with the next word or character
```

### Contextual Recovery System

ZGate's `recoveryContextAnalyzer` analyzes the conversation and partial response to build a complete recovery context:

1. **Detect language** — scan user messages for language (Indonesian/English/etc.)
2. **Summarize original task** — extract 1-2 sentence summary from last user message
3. **Summarize partial response** — analyze what was already covered
4. **Infer remaining** — what still needs to be completed
5. **Detect formatting context** — code blocks, markdown, lists, etc.

### Recovery Request Structure

```
messages: [
  // LAYER 1: Original system prompt
  { role: "system", content: "<original>" },

  // LAYER 2: Full conversation history
  { role: "user", content: "..." },
  { role: "assistant", content: "..." },

  // LAYER 3: Partial assistant response from buffer
  { role: "assistant", content: "<partial response>" },

  // LAYER 4: Recovery instruction
  {
    role: "user",
    content: "[SYSTEM RECOVERY] ORIGINAL TASK: ... ALREADY DELIVERED: ... STILL NEEDED: ..."
  }
]
```

### Edge Cases
- **Empty buffer** (error before first chunk): skip recovery, send original request
- **Too short** (< 20 chars): skip recovery instruction, AI continues naturally
- **Multiple fallbacks** (provider 1→2→3): rebuild analysis from cumulative partial
- **Unclosed code blocks**: inject closing ``` before recovery

---

## Example Setup

### Cost-Optimized Fallback Chain

```
Position 1: kiro/claude-sonnet-4.5     (PRIMARY — best quality)
Position 2: deepseek/deepseek-v4-flash  (FALLBACK 1 — fast, cheap)
Position 3: openrouter/llama-3.3-70b-free (FALLBACK 2 — free)
```

**Behavior:**
- Normal operation: always uses Claude Sonnet 4.5
- If Claude fails (rate limit, error): seamlessly falls back to DeepSeek
- If DeepSeek also fails: falls back to free Llama via OpenRouter
- Client always gets a response unless all three fail

### Multi-Account Round-Robin

```
Combo: "Production AI"
Position 1: kiro/account-1/claude-sonnet  ─┐
Position 1: kiro/account-2/claude-sonnet  ─┤ round-robin
Position 2: deepseek/deepseek-v4-pro      ─┘ fallback
```

### Internal Logging

All fallback events are logged internally:
- Console: `[FALLBACK] provider1 → provider2 at chunk 3, partial=47chars`
- UsageEntry: `fallbackCount`, `fallbackProviders` columns
- WS event: `{ type: "stream:fallback", requestId, fromProvider, toProvider, atChunk }`
- Dashboard shows: "This request used 1x fallback: kiro → deepseek"

Recovery requests are NOT billed to the user (only the original request is billed).
