# n8n AI WhatsApp Sales Agent

An autonomous AI sales agent built with **n8n**, **GPT-4o**, and **Chatwoot** that handles the full sales cycle over WhatsApp — from first contact to appointment booking — without human intervention.

## What it does

This system receives WhatsApp messages via Chatwoot webhooks, processes them through an AI agent powered by GPT-4o, and responds intelligently based on the prospect's intent, stage in the funnel, and the services they're interested in.

### Key capabilities

- **Multi-format input**: Processes text, voice messages (via Whisper transcription), and images (via GPT-4o vision)
- **Lead qualification**: Scores and classifies prospects automatically across multiple service lines
- **Appointment booking**: Checks Google Calendar availability and books meetings with Google Meet links
- **Automated follow-ups**: Sends personalized follow-up messages based on lead stage, service interest, and time since last interaction
- **Team escalation**: Notifies the team via Telegram when human intervention is needed
- **Appointment reminders**: Sends WhatsApp confirmation messages on the day of scheduled appointments
- **Message buffering**: Uses Redis to aggregate rapid consecutive messages before processing
- **Deduplication**: Prevents processing the same message twice
- **Conversation memory**: Maintains context across messages using PostgreSQL chat memory

## Architecture

```
WhatsApp → Chatwoot Webhook → n8n
                                 ├── Message dedup (Redis)
                                 ├── Human/bot routing check
                                 ├── Format detection (text/audio/image)
                                 │     ├── Audio → Whisper STT
                                 │     ├── Image → GPT-4o Vision
                                 │     └── Text → direct
                                 ├── Message buffer (Redis, 10s window)
                                 ├── GPT-4o Agent with tools:
                                 │     ├── Knowledge Base (Google Sheets)
                                 │     ├── Lead Registration (sub-workflow)
                                 │     ├── Google Calendar (check/book/update)
                                 │     ├── Team Escalation (Telegram)
                                 │     ├── SEO Audit Bot (Telegram)
                                 │     ├── SEO Fit Lookup (Google Sheets)
                                 │     ├── Calculator
                                 │     └── Think (reasoning tool)
                                 ├── Response splitting (multi-part messages)
                                 └── Chatwoot API (send messages)
```

## Workflows

| File | Description |
|------|-------------|
| `AgencyBot - Flujo 1 v3.json` | Main AI agent workflow — handles all incoming WhatsApp conversations |
| `AgencyBot - Confirmar Cita.json` | Daily cron job (9am Mon-Fri) that sends appointment reminders |
| `AgencyBot - Followup 24hrs v4.json` | Automated follow-up for leads that haven't responded in 6-24 hours |

## Tech stack

- **n8n** — workflow automation and orchestration
- **GPT-4o** — AI agent (chat + vision + audio transcription)
- **Chatwoot** — WhatsApp Business API and conversation management
- **Google Calendar** — appointment scheduling with Meet integration
- **Google Sheets** — knowledge base, lead database, and SEO fit data
- **Telegram** — team notifications and escalation
- **Redis** — message buffering and deduplication
- **PostgreSQL** — conversation memory persistence

## Setup

1. Import the JSON workflows into your n8n instance
2. Configure the required credentials in n8n:
   - OpenAI API
   - Google Calendar OAuth2
   - Google Sheets OAuth2
   - Telegram Bot API
   - Redis connection
   - PostgreSQL connection
3. Set up Chatwoot with a WhatsApp inbox and configure the webhook to point to your n8n webhook URL
4. Replace all `YOUR_*` placeholder values with your actual credentials and IDs
5. Activate the workflows

## Security note

All credentials, API tokens, webhook URLs, and personally identifiable information have been replaced with descriptive placeholders (e.g., `YOUR_CHATWOOT_API_TOKEN`). The workflows are fully functional templates — just add your own credentials.

## License

MIT
