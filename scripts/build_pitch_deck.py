from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

OUTPUT = r"C:\Users\user\Downloads\allma-safety-ai-pitch-v6.pdf"
SCREENSHOT_CHAT = r"C:\Users\user\community-guard-bot\community-guard-bot\scripts\screenshot-chat.png"
SCREENSHOT_ALERTS = r"C:\Users\user\community-guard-bot\community-guard-bot\scripts\screenshot-alerts.png"
SCREENSHOT_NEARBY = r"C:\Users\user\community-guard-bot\community-guard-bot\scripts\screenshot-nearby.png"
PAGE_W, PAGE_H = landscape(letter)
INK = colors.HexColor("#17202A")
MUTED = colors.HexColor("#5C6870")
RED = colors.HexColor("#D71920")
CORAL = colors.HexColor("#F6D9D3")
GOLD = colors.HexColor("#F0C83E")
MINT = colors.HexColor("#DDF1E8")
CREAM = colors.HexColor("#FFFDF8")
LINE = colors.HexColor("#E7E1D9")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=RED, spaceAfter=8))
styles.add(ParagraphStyle(name="TitleBig", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=32, leading=35, textColor=INK, spaceAfter=12))
styles.add(ParagraphStyle(name="SlideTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="Lead", parent=styles["BodyText"], fontName="Helvetica", fontSize=14, leading=20, textColor=MUTED, spaceAfter=14))
styles.add(ParagraphStyle(name="Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=MUTED))
styles.add(ParagraphStyle(name="CardTitle", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="CardBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=13, textColor=MUTED))
styles.add(ParagraphStyle(name="Metric", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=22, leading=24, textColor=RED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="MetricLabel", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=MUTED, alignment=TA_CENTER))


def para(text, style="Body"):
    return Paragraph(text, styles[style])


def card(title, body, fill=colors.white):
    table = Table([[para(title, "CardTitle")], [para(body, "CardBody")]], colWidths=2.25 * inch)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))
    return table


def card_grid(cards, columns=3):
    rows = [cards[index:index + columns] for index in range(0, len(cards), columns)]
    while rows and len(rows[-1]) < columns:
        rows[-1].append(Spacer(1, 1))
    table = Table(rows, colWidths=[2.35 * inch] * columns, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return table


def screenshot(path, width=7.1 * inch, height=3.7 * inch):
    image = Image(path, width=width, height=height)
    image.hAlign = "LEFT"
    return image


def page_decor(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(CORAL)
    canvas.circle(PAGE_W - 28, PAGE_H - 28, 85, stroke=0, fill=1)
    canvas.setFillColor(RED)
    canvas.rect(0, 0, 9, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(34, 22, "ALLMA SAFETY AI  |  Uganda community safety infrastructure")
    canvas.drawRightString(PAGE_W - 34, 22, str(doc.page))
    canvas.restoreState()


doc = BaseDocTemplate(OUTPUT, pagesize=landscape(letter), leftMargin=0.55 * inch, rightMargin=0.55 * inch, topMargin=0.45 * inch, bottomMargin=0.45 * inch)
doc.addPageTemplates([PageTemplate(id="deck", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")], onPage=page_decor)])
story = []

story += [Spacer(1, 0.25 * inch), para("COMMUNITY SAFETY, MADE HUMAN", "Kicker"), para("Allma Safety AI", "TitleBig"), para("A calm, guided safety assistant for Uganda that turns uncertainty into the next right action.", "Lead"), screenshot(SCREENSHOT_CHAT, 7.2 * inch, 3.25 * inch), para("Live product view: guided help conversation with quick actions, direct facility calls, voice input, and persistent SOS.", "Small"), Spacer(1, 0.12 * inch)]
story.append(card_grid([
    card("One conversation", "Report an incident, ask for help, or find a nearby facility through guided chat.", CORAL),
    card("One-tap SOS", "Start an emergency flow, capture location, triage the situation, and coordinate help.", colors.HexColor("#FFF1EF")),
    card("One connected network", "Citizens, opt-in responders, and authorized command teams share a safety picture.", MINT),
]))
story += [Spacer(1, 0.1 * inch), para("Live product: allmasafetyai.online", "Small"), PageBreak()]

story += [para("THE PROBLEM", "Kicker"), para("When something feels unsafe, every second and every decision matters.", "SlideTitle"), para("People often do not know which number to call, what information to provide, or whether help is on the way. Institutions receive fragmented reports. Allma creates a shared path from first message to coordinated response.", "Lead")]
story.append(card_grid([
    card("For citizens", "Confusion, language barriers, unclear emergency options, and no simple way to track what was reported."),
    card("For responders", "Requests arrive without enough context, location confidence, or a safe way to accept and update assignments."),
    card("For command", "Reports, dispatch, alerts, and community signals are scattered across channels and difficult to prioritize."),
]))
story += [Spacer(1, 0.15 * inch), para("Allma is a coordination layer. It does not replace police, ambulance, fire, or other official emergency services.", "Small"), PageBreak()]

story += [para("THE CITIZEN EXPERIENCE", "Kicker"), para("A safety assistant that guides instead of overwhelming.", "SlideTitle"), para("The live product combines persistent chat, quick actions, clear progress markers, direct calls, and an always-available SOS control.", "Lead"), screenshot(SCREENSHOT_CHAT, 7.2 * inch, 3.05 * inch), para("Authenticated conversation screen captured from allmasafetyai.online.", "Small")]
story.append(card_grid([
    card("AI safety chat", "Plain-language help for crime reports, missing persons, lost and found, emergencies, advice, and nearby facilities."),
    card("Guided flows", "Focused questions, confirmation, and structured reports built step by step."),
    card("Multimodal input", "Voice input, attachments, image previews, and location-aware context."),
    card("Quick actions", "SOS, Report Crime, Missing Person, Lost and Found, Find Hospital, Find Police, Fire, Ambulance, and Nearby Help."),
    card("Saved history", "Authenticated users return to conversations, reports, reference numbers, status, and emergency history."),
    card("Safety boundary", "Independent-platform language and official-number guidance for urgent situations."),
]))
story.append(PageBreak())

story += [para("PUBLIC SAFETY SIGNALS", "Kicker"), para("Useful information is visible before a crisis.", "SlideTitle"), para("Allma exposes public-facing safety information without requiring an account, while keeping personal reports and operations behind authentication.", "Lead"), screenshot(SCREENSHOT_ALERTS, 7.2 * inch, 3.2 * inch), para("Safety Alerts: verified community notices, severity, area, timestamps, and a clear quiet-state when no alerts are active.", "Small"), Spacer(1, 0.12 * inch), screenshot(SCREENSHOT_NEARBY, 7.2 * inch, 3.2 * inch), para("Nearby Help: search and filter hospitals, police, fire, and ambulance facilities with direct call actions.", "Small"), PageBreak()]

story += [para("EMERGENCY SOS", "Kicker"), para("Fast action, measured coordination, privacy by design.", "SlideTitle"), para("SOS opens a dedicated emergency experience. It captures useful context, supports location sharing, and keeps the user informed through a visible timeline.", "Lead")]
story.append(card_grid([
    card("1. Activate", "Persistent SOS entry point with an immediate path.", colors.HexColor("#FFF1EF")),
    card("2. Understand", "AI-guided triage identifies category, severity, danger, and immediate need.", colors.HexColor("#FFF7D9")),
    card("3. Locate", "Location permission and freshness are explicit; exact coordinates are not public.", MINT),
    card("4. Coordinate", "Eligible contacts and responders are ranked by skills, distance, availability, and permissions.", colors.HexColor("#EEF3FA")),
    card("5. Update", "Communication and status changes show accepted, en route, arrived, assisting, or escalation.", colors.HexColor("#F2ECFA")),
    card("6. Escalate", "Community support supplements official emergency services.", CORAL),
]))
story.append(PageBreak())

story += [para("COMMUNITY RESPONDER NETWORK", "Kicker"), para("Opt in to help, with safety controls built into every step.", "SlideTitle"), para("Responders create a profile, choose an operating area and radius, select skills, grant location permission, and start offline. They receive selected requests only when available and able to help.", "Lead")]
story.append(card_grid([
    card("Onboarding", "Name, phone, language, operating area, responder type, skills, radius, permissions, and safety acknowledgement."),
    card("Availability", "Go online or offline and choose when requests can arrive."),
    card("Verification", "Professional or authority roles remain verification-required until confirmed."),
    card("Assignment inbox", "Minimal summaries, approximate distance, status, and active assignments."),
    card("Safe response", "Never confront armed suspects, enter fires, provide unqualified treatment, or create danger."),
    card("Official help first", "Community responders supplement, never replace, official services."),
]))
story.append(PageBreak())

story += [para("AUTHORIZED COMMAND", "Kicker"), para("A digital operations room for human-led decisions.", "SlideTitle"), para("Police Command is restricted to authenticated and authorized officers. Allma surfaces structured information and signals; humans retain command responsibility.", "Lead")]
story.append(card_grid([
    card("Command overview", "Live incident queue, critical and unassigned cases, responding resources, activity, and connection state."),
    card("Incident intake", "Search reports, filter priority and status, assign officers, and follow case progress."),
    card("Dispatch", "Coordinate officers and resources from dispatched through on-scene and resolved."),
    card("Case intelligence", "Separate confirmed, reported, unconfirmed, inferred, and missing facts."),
    card("Alerts and comms", "Publish community alerts, manage command communication, and preserve an audit record."),
    card("Analytics and maps", "Review geography, trends, response performance, resource signals, and data quality."),
]))
story.append(PageBreak())

story += [para("PLATFORM CAPABILITIES", "Kicker"), para("Structured data behind a simple conversation.", "SlideTitle"), para("Allma connects the user experience to persistent records, controlled access, and real-time operational workflows.", "Lead")]
metrics = Table([[para("UGANDA", "Metric"), para("24/7", "Metric"), para("1-TAP", "Metric"), para("HUMAN-LED", "Metric")], [para("coverage focus", "MetricLabel"), para("availability goal", "MetricLabel"), para("SOS entry", "MetricLabel"), para("command model", "MetricLabel")]], colWidths=[1.8 * inch] * 4)
metrics.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
story.append(metrics)
story += [Spacer(1, 0.2 * inch), para("<font color='#D71920'>-</font> Supabase-backed authentication, reports, facilities, alerts, responder profiles, assignments, officer access, and audit events."), para("<font color='#D71920'>-</font> Access boundaries keep citizen records, responder data, and police operations in their intended contexts."), para("<font color='#D71920'>-</font> Voice transcription, attachments, secure storage patterns, and structured AI tool flows."), para("<font color='#D71920'>-</font> Live updates for operational activity and retryable error states on public data views."), para("<font color='#D71920'>-</font> Responsive interface with mobile navigation, persistent composer, direct call links, theme support, and accessible labels."), PageBreak()]

story += [para("ROADMAP AND MEASUREMENT", "Kicker"), para("Move from a working product to a trusted safety network.", "SlideTitle"), para("The product foundation is in place. The next phase should focus on operational partnerships, verified data, reliability, and measurable response outcomes.", "Lead")]
story.append(card_grid([
    card("Partnership readiness", "Formalize integrations with police, ambulance, fire, hospitals, and trusted organizations."),
    card("Coverage quality", "Verify facility directories, district coverage, official numbers, and published alerts."),
    card("Reliability", "Monitor query health, AI fallback behavior, delivery, location freshness, and completion."),
    card("Trust and safety", "Add consent reviews, abuse reporting, responder verification, retention controls, and audits."),
    card("Impact metrics", "Measure guidance time, report completion, escalation, responder acceptance, and resolution."),
    card("Responsible AI", "Label observations, show uncertainty, and keep consequential decisions with humans."),
]))
story += [Spacer(1, 0.18 * inch), para("Product link: allmasafetyai.online", "Small"), para("Important: Allma Safety AI is an independent safety technology platform. In an emergency, always call official emergency numbers.", "Small")]

doc.build(story)
print(OUTPUT)
