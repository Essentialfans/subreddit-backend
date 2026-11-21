# Implement in AiInstaReels — Video → Wan prompt (model-aware)

**Target chat:** [AI Generation site](bc-da3abf39-58ed-490c-9f87-f7a1341a3545)  
**Product:** ainstareel.com / `CRM_AICONTENT`  
**Related test chat:** [AI prompting](617b0b01-75c5-4700-bb93-0ccf72589b4a) (`~/video-to-wan`)

Paste this whole file into the AI Generation site chat and ask it to integrate.

---

## What we want (product intent)

A **separate layout/page** (not just the existing Enhance toggle) where the operator can:

1. **Drop / upload a source video** (the reel to recreate).
2. **Pick a prompt LLM** (UI dropdown):
   - Grok 4.7 (best for adult / explicit scene beats — least soft-censor)
   - Gemini 4 (Hydrogen / Neon — good general video understanding)
   - Claude Opus 5.5 (strong adult detail fallback)
3. **Pick a My Model / creator** (existing identity library).
4. Get a **paste-ready Wan 3.0 prompt** that:
   - Locks **dialogue verbatim** (ASR / Whisper-class transcript)
   - Describes **scene, wardrobe, motion, camera, timestamps, voice, negatives**
   - Does **NOT** describe the looks / face / body of the person in the source video
   - Instead references **My Model characteristic features** via identity refs (`@Image1` etc.) so Wan uses *our* creator, not the copied influencer’s face

Then the operator can send that prompt into the existing Wan 3.0 generate flow with My Model refs attached.

### Why “don’t prompt the copied look”

Today reverse-prompting often writes “blonde platinum hair, her face…”. That fights My Model identity. The LLM must:

- Treat source video as **choreography + wardrobe + set + dialogue**
- Treat My Model as **who appears**
- Output phrases like: `the presenter from @Image1 / reference images` — never copy hair/face/body of the source person unless the operator explicitly wants look-alike mode

---

## Current state on ainstareel (do not break)

| Piece | Location | Today |
|---|---|---|
| Enhance LLM (hardcoded) | `src/lib/kie/chat.ts` → `ENHANCE_CHAT_MODEL = "gemini-3-8-flash-openai"` | No picker |
| Enhance API | `POST /api/generation/enhance` | Uses that constant |
| Video UI toggle | `src/components/generation/video-dock.tsx` — “Enhance with AI” | On/off only |
| Image UI toggle | `src/components/generation/generate-dock.tsx` | Same |
| Wan recipes | `src/lib/generation/prompt-recipes.ts` | Already model-aware for Wan |
| Enhance orchestration | `src/lib/generation/prompt.ts` | Recipe + kie chat |
| Wan create | `POST /api/generation/create` → `wan/3-0-video` | Works |
| My Models | existing creator / identity picker in docks | Works |

**Missing:** dedicated **Video → Prompt** layout + LLM dropdown + identity-aware reverse prompt (strip source appearance).

---

## Suggested UX

### New route

`/video/prompt-from-clip` (or `/studio/recreate-prompt`)

Layout (one job):

1. **Left / top:** source video dropzone + preview  
2. **Controls:**
   - My Model selector (required) — same source as docks
   - Prompt LLM selector: `grok-4-7` | `gemini-4-hydrogen` (or neon) | `claude-opus-5-5`
   - Optional: “Look-alike mode” (default **OFF**) — when off, strip source identity from prompt
   - Target video model: Wan 3.0 / Wan 3.0 Prime (for recipe)
   - Duration / aspect hints (from clip metadata)
3. **Actions:** `Generate prompt` → shows editable prompt textarea  
4. **Secondary:** `Send to Video studio` — opens `/video/single` with prompt + My Model prefilled

Keep existing `/video/single` Enhance toggle; optionally later wire its LLM to the same picker.

---

## Backend / pipeline

### Steps per job

1. Upload source clip (reuse `/api/generation/upload` or existing file helpers).
2. **ASR** for verbatim dialogue (Whisper server-side or kie speech). Word-level if possible. Do **not** trust the vision LLM alone for screams / off-mic lines (e.g. `BEN!`).
3. Extract **keyframes** (including mid-clip action beats). Grok/Claude are image-first; Gemini 4 can take video when available.
4. Call selected LLM with:
   - System: Wan recreate recipe + **identity rules**
   - User: transcript + keyframes (and/or video) + My Model name / trait summary (from creator profile, not face pixels if you already store traits)
5. Return prompt + metadata (`llm`, `transcript`, `recipeId`).

### Identity rules for the system prompt (critical)

```
You are writing a Wan 3.0 recreate prompt for AiInstaReels.

Identity:
- The person who MUST appear is My Model: {{modelName}}.
- Reference images will be attached later as @Image1… — do NOT invent their face/hair/body.
- Do NOT describe the face, hair color, body type, age look, or ethnicity of anyone visible in the SOURCE video.
- DO describe wardrobe, set, props, motion, camera, timing, and dialogue exactly.

Dialogue:
- Lock dialogue VERBATIM from the provided transcript (including shouts).

Adult / explicit motion:
- If the source shows clothing lifted / body exposure, describe it accurately.
- Do not modestly rewrite or censor when Look-alike mode is off and the content is consenting adults.

Output:
- One paste-ready Wan 3.0 prompt: overall + timestamped beats + dialogue + natural voice + negatives.
```

### LLM wiring on kie.ai

Extend `src/lib/kie/chat.ts` (or add `src/lib/kie/prompt-llms.ts`):

| UI label | kie model / path |
|---|---|
| Grok 4.7 | `POST https://api.kie.ai/grok/v1/responses` model `grok-4-7` + keyframe `input_image`s |
| Gemini 4 | existing OpenAI-compatible chat path for Hydrogen/Neon (video or frames) |
| Opus 5.5 | Claude via kie chat/completions equivalent |

Accept `llm` on `POST /api/generation/enhance` **or** add `POST /api/generation/prompt-from-video`.

Prefer a **new** endpoint for the dedicated page so enhance stays fast/simple.

### New API sketch

`POST /api/generation/prompt-from-video`

```json
{
  "sourceVideoUrl": "...",
  "creatorId": "...",
  "llm": "grok-4-7",
  "videoModelId": "wan-3-0",
  "lookAlike": false,
  "durationSec": 15,
  "aspect": "9:16"
}
```

Response:

```json
{
  "ok": true,
  "prompt": "...",
  "transcript": "...",
  "llm": "grok-4-7",
  "recipeId": "wan-recreate",
  "note": "Identity stripped from source; use My Model refs on generate"
}
```

---

## Files likely to touch

- `src/app/(dashboard)/video/prompt-from-clip/page.tsx` — new page
- `src/components/generation/prompt-from-video-panel.tsx` — UI
- `src/app/api/generation/prompt-from-video/route.ts` — new API
- `src/lib/kie/chat.ts` / new `prompt-llms.ts` — multi-LLM
- `src/lib/generation/prompt-recipes.ts` — add `video-recreate-identity` recipe
- Nav / sidebar — link “Prompt from video”

Reuse: upload helpers, My Model picker, Wan create path, encrypted kie key (`keys.ts` / `crypto.ts`).

---

## Test evidence from video-to-wan chat

Local CLI: `~/video-to-wan`

| Artifact | Path |
|---|---|
| Grok 4.7 Wan prompt | `out/grok.wan-prompt.txt` |
| Whisper transcript | `out/Hump day….transcript.txt` |
| Wan render of Grok prompt | `out/grok-wan-render.mp4` (when ready) |
| Prior Gemini soft-censor issue | dress-lift ~6.5–7s missed; Grok kept bare buttocks beat |

Render settings that matched prior gen (`1795197791196-0kozr8v64epp.mp4`):

- model: `wan/3-0-video`
- `first_frame_url` from source frame 0
- `resolution`: `720P`
- `aspect_ratio`: `9:16`
- `duration`: `15`
- `audio`: `true`

---

## Acceptance checklist

- [ ] New page reachable from dashboard nav  
- [ ] Upload source video  
- [ ] Choose LLM: Grok 4.7 / Gemini 4 / Opus 5.5  
- [ ] Choose My Model  
- [ ] Prompt omits source person’s looks when look-alike is off  
- [ ] Prompt includes verbatim dialogue (incl. shouts)  
- [ ] Prompt includes wardrobe + motion beats (no soft-censor when using Grok/Opus on adult clips)  
- [ ] One-click handoff into Wan generate with My Model refs  
- [ ] Existing Enhance Flash path still works  

---

## Out of scope for first PR

- Replacing all Enhance calls with Grok (cost)  
- Full auto-generate without human prompt review  
- Training / LoRA — identity stays My Model image refs only  
