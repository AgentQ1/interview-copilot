# Interview Copilot

A real-time desktop-like web app that helps you during technical interviews by:
- Streaming a live (or demo) transcript
- Detecting questions automatically
- Retrieving grounded context from your resume and job description (RAG)
- Generating smart answers in three formats: 15 sec, STAR, Bullets

Built with **Go** backend + **plain HTML/CSS/JS** frontend + **WebSocket** streaming.

---

## Quick Start

```bash
# 1. Clone / enter the project
cd interview-copilot

# 2. Install Go dependencies
cd backend
go mod tidy

# 3. Run the server (serves frontend automatically)
go run .

# 4. Open in browser
open http://localhost:8080
```

> **Requires:** Go 1.21+. No CGO required (uses modernc.org/sqlite, pure Go).

---

## Usage

### Demo Mode (no uploads needed)
1. Open http://localhost:8080
2. Click **▶ Start Demo**
3. Watch the transcript fill in, questions get detected, and answers appear in real time.

### With Your Own Documents
1. Click **📎** (top right) to open the Knowledge Pack modal
2. Upload your **Resume** (.txt or .md)
3. Upload the **Job Description** (.txt or .md)
4. Click **⚡ Index Knowledge Pack**
5. Start the demo — answers will now be grounded by your actual documents.

> PDF parsing is not implemented in this MVP. Convert to `.txt` or `.md` first.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘1` / `Ctrl+1` | Switch to 15-second answer |
| `⌘2` / `Ctrl+2` | Switch to STAR format |
| `⌘3` / `Ctrl+3` | Switch to Bullets format |
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘P` / `Ctrl+P` | Pause / resume demo |
| `⌘M` / `Ctrl+M` | Add metrics to answer |
| `⌘F` / `Ctrl+F` | Focus question text box |
| `Esc` | Close modal / palette |

---

## Architecture

```
interview-copilot/
├── backend/
│   ├── main.go      # HTTP server, REST endpoints, static file serving
│   ├── ws.go        # WebSocket hub + client, command handler
│   ├── db.go        # SQLite init, CRUD for knowledge_chunks
│   ├── schema.go    # Chunk / Snippet types
│   ├── rag.go       # Text chunking, TF keyword scoring, retrieval
│   ├── answer.go    # Mock LLM: generates 15s / STAR / Bullets answers
│   ├── demo.go      # Scripted demo transcript + question/answer pipeline
│   └── go.mod
└── frontend/
    ├── index.html   # 3-column layout, modals, topbar, command bar
    ├── styles.css   # Linear/Notion-like light UI
    └── app.js       # WS client, event handlers, keyboard shortcuts
```

---

## WebSocket Event Schema

All events are JSON with shape `{ "type": string, "payload": object }`.

| Event | Payload |
|-------|---------|
| `session_status` | `{ live: bool, message: string }` |
| `transcript_partial` | `{ speaker, text, ts }` |
| `transcript_final` | `{ speaker, text, ts }` |
| `question_detected` | `{ question, confidence, tags[], ts }` |
| `rag_snippets` | `{ snippets: [{ source, title, text, score }] }` |
| `answer_draft` | `{ mode: "15s"\|"STAR"\|"bullets", text }` |

### Client → Server commands

```json
{ "type": "command", "payload": { "name": "shorten" } }
{ "type": "command", "payload": { "name": "add_metrics" } }
{ "type": "command", "payload": { "name": "make_technical" } }
{ "type": "command", "payload": { "name": "clarify" } }
{ "type": "command", "payload": { "name": "switch_mode", "payload": { "mode": "STAR", "question": "..." } } }
```

---

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload?type=resume\|jd` | Upload file (multipart) |
| `POST` | `/api/index` | Chunk and index uploaded files |
| `GET`  | `/api/status` | Indexing status + file list |
| `POST` | `/api/demo/start` | Start demo streaming |
| `POST` | `/api/demo/stop` | Stop demo streaming |

---

## Replacing the Mock LLM with OpenAI

In `backend/answer.go`, replace `GenerateAnswer()` with:

```go
func GenerateAnswer(question string, snippets []Snippet, mode string) string {
    client := openai.NewClient(os.Getenv("OPENAI_API_KEY"))
    // Build prompt from question + snippets + mode instructions
    // Call client.CreateChatCompletion(...)
    // Return response text
}
```

The rest of the architecture (WebSocket streaming, RAG, UI) stays identical.

---

## Sample Knowledge Pack Files

### resume.txt
```
Jane Smith — Senior Software Engineer

Skills: Go, Python, Kubernetes, AWS, PostgreSQL, Redis

Experience:
TechCorp (2021–present): Led backend platform team, built real-time data pipeline handling 1M events/day, reduced deployment time 10x.
StartupXYZ (2019–2021): Full-stack engineer, shipped 3 product features, improved test coverage from 40% to 85%.

Education: BS Computer Science, State University, 2019
```

### jd.txt
```
Senior Software Engineer — Platform Team

We are looking for a senior engineer to join our platform team.

Requirements:
- 5+ years of software engineering experience
- Strong background in distributed systems
- Experience with Go or Python
- Cloud infrastructure experience (AWS/GCP preferred)
- Excellent communication and collaboration skills

Nice to have:
- Kubernetes experience
- Experience with real-time data systems
- Mentorship experience
```
