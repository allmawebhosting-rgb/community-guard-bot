# Allma AI — Complete Feature & Capability Reference

> **Allma AI** is Uganda's smartest agricultural co-pilot — a conversational, multimodal AI assistant built directly into the AgriHub platform for smallholder farmers across East Africa. It completes real farming work end-to-end inside a single chat thread: buying produce, selling goods, diagnosing crops and livestock, renting equipment, and giving personalized advice.

---

## 1. Identity & Conversational Personality

- **Name:** Allma AI (always introduces itself on first message)
- **Tone:** Warm, clear, plain English, knowledgeable like a trusted agricultural extension officer
- **Currency:** Ugandan Shilling (UGX)
- **Units:** Metric (kg, litres, hectares, km)
- **Approach:** Proactive, practical, one-question-per-turn, always confirms understanding before moving forward
- **Mission:** Complete tasks end-to-end in the chat. Never redirect users to another page.

---

## 2. Guided Step-by-Step Flows

Allma AI is built around five guided flows. Each flow is rendered as a premium progress header in the chat UI and uses suggestion chips, action cards, and image previews to guide the user.

### 2.1 Sell Flow — "List & Sell" (7 steps)
Guides a farmer from idea to published marketplace listing.

1. **Category** — Choose: produce, livestock, seeds & inputs, equipment, or other
2. **Photos** — Prompts the user to attach up to 4 photos; AI reviews quality and gives tips
3. **Product details** — Crop/animal name, variety, condition
4. **Quantity & unit** — e.g., 200 kg, 5 × 90 kg bags, 3 head of cattle
5. **Price** — AI calls live market benchmarks before asking the farmer's price
6. **Location** — District for pickup/delivery
7. **Review & publish** — AI generates a professional title and description; user confirms before publishing

**Smart features:**
- Photo quality review (score, feedback, improvement tips)
- Auto-generated professional title and description
- Live market benchmark pricing
- Image upload to `marketplace-images` storage bucket
- Publishes to `marketplace_listings` table
- Emits a `::receipt` card after publishing

### 2.2 Buy Flow — "Buy Produce" (5 steps)
Finds and orders products from the marketplace.

1. **What they want** — Crop, livestock, input, or equipment
2. **Requirements** — District, quantity, budget, grade
3. **Search & show results** — AI calls the marketplace and renders up to 3 `::listing` cards
4. **Compare & guide** — AI compares price, distance, quantity, and answers product questions
5. **Confirm & order** — Recaps exact listing, quantity, and total; places order after confirmation

**Smart features:**
- Multi-listing comparison with pros/cons
- Filter by category, district, price, keyword
- Verified seller context
- Negotiation: can suggest `make_offer` if price is above market
- Emits order `::receipt` after successful order
- WhatsApp handoff to finalize payment/delivery

### 2.3 Diagnose Flow — "Diagnose Crops / Livestock" (6 steps)
Vision-powered diagnosis for plant and animal health.

1. **Subject** — Crop or livestock name
2. **Symptoms** — What the farmer sees, when it started, affected parts
3. **Photo request** — Prompts a clear photo with capture tips
4. **AI analysis** — Calls `diagnose_crop` or `diagnose_livestock` with the image
5. **Findings** — Diagnosis, confidence %, causes, treatment steps, recommended products, when to call a vet
6. **Prevention & next steps** — Preventive advice + optional farm record logging

**Smart features:**
- Vision model analysis of uploaded photos
- Structured diagnosis JSON with confidence scoring
- Local disease context (MLN, BXW, FMD, Newcastle, East Coast Fever, etc.)
- Product recommendations (Yara, Osho, Victoria Seeds, etc.)
- High-risk disease warnings
- Saves results to `ai_diagnoses` table

### 2.4 Rent Flow — "Rent Equipment" (5 steps)
Finds and books tractors and farm tools.

1. **Equipment & district** — What equipment and where
2. **Show results** — AI renders `::equipment` cards with daily rate and district
3. **Rental dates** — Start and end date; AI checks availability before booking
4. **Confirm** — Recaps equipment, dates, total days, total cost
5. **Book** — Confirms booking and emits a `::receipt`

**Smart features:**
- Availability conflict checking
- Nearest free-window proposals if dates clash
- WhatsApp handoff to finalize logistics
- Booking records saved to `equipment_bookings`

### 2.5 Advice Flow — "Farming Advice" (1 step)
Instant answers to any farming question.

- Planting, weather, prices, pests, finance, soil, irrigation, post-harvest
- Uganda-specific guidance (local varieties, seasons, districts, common problems)
- After answering, AI proactively suggests next steps (e.g., "Want to buy seeds?" or "Shall I log this to your farm records?")

---

## 3. AI Tool Arsenal

Allma AI has 22+ callable tools that perform real actions in the platform.

### Marketplace & Commerce
- **search_marketplace** — Search active listings by category, district, query, price
- **get_listing** — Fetch full details of a single listing
- **create_listing** — Publish a new listing (with optional image data URL)
- **place_order** — Place an order for a listing (requires explicit confirmation)
- **message_seller** — Send a direct message to a seller
- **make_offer** — Send a price offer / negotiation message to a seller
- **list_offers** — List this user's offers as buyer or seller
- **respond_offer** — Accept, reject, or counter an offer
- **my_orders** — List recent orders and bookings
- **update_order** — Update order status (cancelled, completed)
- **whatsapp_handoff** — Generate a WhatsApp link with a pre-filled message for off-platform finalization

### Equipment & Rentals
- **search_equipment** — Search available equipment by category, district, rate
- **check_availability** — Verify equipment availability for a date range
- **book_equipment** — Book equipment for selected dates

### Diagnosis
- **diagnose_crop** — Vision AI analysis of crop photos
- **diagnose_livestock** — Vision AI analysis of livestock photos + symptoms
- **review_listing_photo** — Photo quality review with actionable tips

### Memory & Context
- **remember** — Store durable facts (district, crops, budget, preferences, delivery address, language)
- **recall_history** — Search earlier conversations by keyword
- **save_draft** — Save an unfinished sell/buy/rent flow
- **get_draft** — Resume the most recent unfinished flow

### Weather
- **get_weather_alert** — Get current weather and farming alerts for a Uganda district

---

## 4. Persistent Memory & Reasoning Engine

Allma AI does not start from scratch every chat. It remembers.

- **User memory** stored in `ai_user_memory` table (kind, key, value, updated_at)
- **Facts remembered:** home district, crops grown, buying budget, preferred units, delivery address, language, interests
- **Conversation history** stored in `ai_conversations` + `ai_messages`
- **Threaded chats** — Every conversation is saved; users can return to previous threads
- **Recall:** AI can search past conversations for context ("the maize I asked about last week")
- **Drafts:** Incomplete flows are saved and can be resumed later
- **Context budget:** Up to 12k tokens of conversation history, with the system prompt excluded from trimming to preserve identity and instructions

---

## 5. Commerce Agent & Negotiation Intelligence

Allma AI acts as a full commerce agent, not just a chatbot.

- **Compare before recommending:** Presents top 2–3 listings with pros/cons and a clear recommendation
- **Negotiate:** If a price is above market range, AI can propose a fair counter-offer via `make_offer`
- **Trust & safety:** Flags suspiciously cheap prices (>40% below market) and warns against advance payment to strangers
- **Order lifecycle:** Can list orders, update status, and hand off to WhatsApp for payment/delivery coordination
- **Payment safety:** Never asks for card, PIN, or mobile money credentials. All payment is handled off-platform via WhatsApp handoff

---

## 6. Multimodal Support

Allma AI is built to handle images and files as first-class inputs.

- **Image uploads:** Up to 4 images per message (camera, gallery, or drag-and-drop)
- **File uploads:** General file attachments supported
- **Vision diagnosis:** Photos are sent directly to AI vision models for crop/livestock diagnosis
- **Listing photos:** Photos are uploaded to Supabase Storage (`marketplace-images` bucket)
- **Photo quality review:** AI evaluates lighting, framing, focus, and gives friendly improvement tips
- **Voice input:** Microphone button records audio and transcribes via Whisper (`/api/transcribe`)
- **Image previews:** Inline thumbnails in composer and chat bubbles
- **Signed URLs:** Private storage images are served via secure signed URLs

---

## 7. Premium UI / UX Features

The chat interface is designed to feel like a flagship AI product (ChatGPT-style) with a warm, farming-focused brand.

### Visual Design
- **Full-screen chat layout** — edge-to-edge, no wasted space
- **Ambient animated gradient background** (`gradient-aurora`, `animate-aurora`)
- **Grain texture overlay** for premium depth
- **Animated gradient text** for the Allma AI logo
- **Glass-morphism cards and composer shell**
- **Animated gradient rings** around suggestion chips and composer
- **Glow effects** on primary actions
- **Floating "Jump to latest" pill** when scrolled up
- **Top fade mask** so content dissolves under the header

### Launcher Cards (Empty State)
Four premium launcher tiles at the start of each chat:
- 🛒 Buy produce
- 🏷️ List & sell
- 🩺 Diagnose crops
- 🔧 Rent equipment

### In-Chat Components
- **Flow header** — progress bar showing current flow, step, and title
- **Suggestion chips** — clickable next-step options
- **Listing cards** — photo, price, unit, quantity, district, quick-buy action
- **Equipment cards** — photo, daily rate, district, category
- **Receipt cards** — order/listing/booking confirmation with ID and total
- **Photo prompt banner** — amber (sell) or rose (diagnose) banner prompting photo upload
- **Tool activity pills** — live indicators showing "Searching marketplace", "Reviewing photo", etc.
- **Model switch indicator** — shows when the AI falls back to a backup model
- **Copy button** — copy any assistant response to clipboard
- **Markdown rendering** — bold, lists, links, tables, code blocks via `react-markdown`

### Mobile-First UX
- **Single-row top header** — icons-only on mobile
- **Responsive composer** — never occluded by keyboard, uses `env(safe-area-inset-bottom)`
- **iOS auto-zoom prevention** — `text-base` on input fields
- **Bottom-locked composer** — stays anchored while scrolling
- **Mobile sidebar** — sheet-based chat history drawer
- **Icon-only quick-nav** — collapses neatly on small screens
- **Hamburger + New chat** — unified premium mobile toolbar via React Portal

---

## 8. AI Provider Engine

Allma AI supports multiple AI providers and can be switched at runtime from the admin page.

### Supported Providers
- **GitHub Models / GitHub Copilot** — powered by `https://models.github.ai/inference`
- **Lovable AI Gateway** — powered by `https://ai.gateway.lovable.dev`

### Model Fallback System
- **Primary model:** Configurable in admin settings
- **Fallback models:** Automatically cycles to backup models on 404, 429, 500, 502, 503, 504 errors
- **GitHub fallback models:** `openai/gpt-4o-mini`, `openai/gpt-4o`
- **Lovable fallback models:** `google/gemini-3.6-flash`, `google/gemini-2.5-flash`
- **Model normalization:** Converts legacy/bare model IDs to correct provider-prefixed IDs
- **Admin test button:** Test connectivity to the current provider from the admin page

### Configurable Keys
- `GITHUB_TOKEN` — server secret or stored in `admin_settings`
- `LOVABLE_API_KEY` — for Lovable AI Gateway
- `ai_provider`, `ai_model`, `ai_model_lovable` — runtime configurable via admin page

---

## 9. Authentication & Access

- **Logged-in users:** Full access to all tools, memory, threads, orders, and listings
- **Guest/free trial:** Unauthenticated users can try Allma AI for up to 3 questions via `/api/chat` with sign-up nudges
- **Demo account:** One-tap "Try the demo — no signup" button on the login page for instant access
- **Admin access:** All authenticated users can access the admin page to switch AI provider and model

---

## 10. Deep-Linking & Integrations

- **Ask Allma buttons** on marketplace listings and equipment cards start a pre-seeded chat
- **Seed prompts** (`?q=...`) can launch a chat with a specific topic already loaded
- **Route integration:** `/assistant/$threadId` deep-links to any saved conversation
- **WhatsApp handoff:** Generates a pre-filled WhatsApp message for any listing, equipment, or order

---

## 11. Data & Storage

- **Conversations:** `ai_conversations` table
- **Messages:** `ai_messages` table (role, content, attachments, meta, timestamps)
- **Memory:** `ai_user_memory` table
- **Diagnoses:** `ai_diagnoses` table
- **Drafts:** `ai_conversations.draft_data` field
- **Images:** Supabase Storage (`marketplace-images` bucket)
- **Admin settings:** `admin_settings` table for AI provider/model configuration

---

## 12. Smart Behavior Rules

- **One question at a time** — never overwhelms the farmer
- **Stay on the active flow** — does not change topic unless explicitly asked
- **Subject fixation** — the item under discussion (listing/equipment ID) stays fixed until the flow ends
- **Confirmation gate** — `place_order`, `create_listing`, and `book_equipment` require explicit `confirmed=true`
- **Proactive pricing** — mentions current market prices when buying or selling
- **Seasonal awareness** — references Uganda planting/harvest timing and current season
- **Local language** — uses local names (matoke, not banana)
- **Risk warnings** — flags urgent diseases and problems
- **Budget guidance** — suggests listing 5–10% above minimum acceptable price
- **Cross-sell only after flow completion** — never interrupts an active flow

---

## 13. Accessibility & Performance

- **Streaming responses** — AI tokens appear in real-time
- **Scroll management** — auto-scrolls to bottom only when user is already near bottom
- **Keyboard-friendly** — composer supports Enter-to-send, Shift+Enter for new lines
- **Focus management** — input is auto-focused after send and restore
- **Reduced motion-aware** — animations respect system preferences where possible
- **Error resilience** — graceful fallback messages and model switching on failures

---

## Summary

Allma AI is not a generic chatbot. It is a **context-aware, multimodal, commerce-capable farming co-pilot** that:

- Talks like a trusted local extension officer
- Remembers the farmer between sessions
- Buys, sells, diagnoses, and rents inside one chat
- Reviews photo quality and analyzes crop/livestock images
- Negotiates prices and manages orders
- Works offline-platform via WhatsApp handoff
- Adapts its AI model and provider at runtime
- Looks and feels premium on mobile and desktop
- Completes real farming work from the first message to the final confirmation

*Built for East African smallholder farmers. Powered by AgriHub.*
