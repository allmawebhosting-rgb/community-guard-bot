from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.colors import HexColor
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "ALLMA_Safety_AI_Project_Pitch.pdf"
W, H = landscape(letter)
BLACK = HexColor("#090A0B")
PANEL = HexColor("#141618")
PANEL_2 = HexColor("#1C1F21")
WHITE = HexColor("#F5F5F2")
MUTED = HexColor("#A7ACAE")
GOLD = HexColor("#FCDC04")
RED = HexColor("#D90012")
GREEN = HexColor("#61D39B")
BLUE = HexColor("#7BA7FF")

styles = getSampleStyleSheet()
def style(name, **kwargs):
    parent = kwargs.pop("parent", styles["Normal"])
    kwargs.setdefault("fontName", "Helvetica")
    kwargs.setdefault("textColor", WHITE)
    return ParagraphStyle(name, parent=parent, **kwargs)

KICKER = style("Kicker", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=GOLD, spaceAfter=10)
TITLE = style("Title", fontName="Helvetica-Bold", fontSize=34, leading=36, textColor=WHITE, spaceAfter=12)
SUBTITLE = style("Subtitle", fontSize=15, leading=21, textColor=MUTED, spaceAfter=18)
H2 = style("H2", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=WHITE, spaceAfter=9)
BODY = style("Body", fontSize=10.5, leading=16, textColor=MUTED, spaceAfter=8)
SMALL = style("Small", fontSize=8.5, leading=12, textColor=MUTED)
CARD_TITLE = style("CardTitle", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=WHITE, spaceAfter=5)
CARD_BODY = style("CardBody", fontSize=9, leading=13, textColor=MUTED)
CENTER_TITLE = style("CenterTitle", parent=TITLE, alignment=TA_CENTER)
CENTER_BODY = style("CenterBody", parent=SUBTITLE, alignment=TA_CENTER)


def P(text, s=BODY):
    return Paragraph(text, s)


def card(title, body, accent=GOLD, width=2.22*inch, height=None):
    content = [P(title, CARD_TITLE), P(body, CARD_BODY)]
    t = Table([[content]], colWidths=[width], rowHeights=[height] if height else None)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), PANEL),
        ("BOX", (0,0), (-1,-1), 0.6, HexColor("#303437")),
        ("LINEABOVE", (0,0), (-1,0), 2.5, accent),
        ("LEFTPADDING", (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("TOPPADDING", (0,0), (-1,-1), 13),
        ("BOTTOMPADDING", (0,0), (-1,-1), 13),
    ]))
    return t


def bullet(items, accent=GOLD):
    rows = []
    for item in items:
        rows.append([P("●", style("dot", fontName="Helvetica-Bold", fontSize=9, textColor=accent)), P(item, BODY)])
    t = Table(rows, colWidths=[0.18*inch, 5.6*inch])
    t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 5), ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2)]))
    return t


def page_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#15110A"))
    canvas.circle(W-34, H-22, 140, fill=1, stroke=0)
    canvas.setFillColor(RED)
    canvas.setFillAlpha(0.07)
    canvas.circle(W*0.52, H*0.98, 135, fill=1, stroke=0)
    canvas.setFillAlpha(1)
    canvas.setStrokeColor(HexColor("#26292B"))
    canvas.setLineWidth(0.5)
    canvas.line(0.55*inch, 0.47*inch, W-0.55*inch, 0.47*inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.58*inch, 0.27*inch, "ALLMA SAFETY AI  /  PROJECT PITCH")
    canvas.drawRightString(W-0.58*inch, 0.27*inch, f"{doc.page:02d}")
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(str(OUT), pagesize=(W,H), leftMargin=0.62*inch, rightMargin=0.62*inch, topMargin=0.56*inch, bottomMargin=0.64*inch)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="pitch", frames=frame, onPage=page_bg)])
    story = []

    story += [Spacer(1, 0.5*inch), P("ALLMA SAFETY AI", KICKER), P("Safety intelligence<br/>for real life.", TITLE), P("A conversational, community-powered platform that helps people report, respond, remember, and recover with more clarity.", SUBTITLE), Spacer(1, 0.15*inch)]
    cover_cards = Table([[card("ACT NOW", "One calm interface for SOS, incident reporting, nearby help, and trusted response.", RED), card("STAY CONNECTED", "Real-time Safety Network coordination with existing in-app voice infrastructure.", GREEN), card("KEEP LIFE MOVING", "Private Health Reminders for appointments, medication routines, and follow-ups.", GOLD)]], colWidths=[2.28*inch]*3, hAlign="LEFT")
    cover_cards.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 10)]))
    story += [cover_cards, Spacer(1, 0.45*inch), P("Built mobile-first for Uganda. Designed to reduce cognitive load when the moment matters.", SMALL), PageBreak()]

    story += [P("01  /  THE OPPORTUNITY", KICKER), P("When something goes wrong, the next step is rarely obvious.", TITLE), P("People need more than a list of emergency numbers. They need a steady layer that turns uncertainty into an actionable path, without pretending to replace human judgment or official services.", SUBTITLE)]
    story += [Table([[card("FRAGMENTED MOMENTS", "Reports, calls, location, contacts, and follow-ups often live in separate tools.", RED), card("HIGH COGNITIVE LOAD", "Stress makes complex forms, unclear statuses, and repeated decisions harder to use.", GOLD), card("LOW TRUST", "People need to know what is happening, who sees their data, and what happens next.", BLUE)]], colWidths=[2.3*inch]*3, hAlign="LEFT", style=TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 10)]))]
    story += [Spacer(1, 0.32*inch), P("The product insight", H2), P("ALLMA is not a feature showcase. It is a coordination layer: conversational when users need guidance, structured when systems need reliable records, and transparent about what is real.", BODY), PageBreak()]

    story += [P("02  /  THE PRODUCT", KICKER), P("One assistant. Many moments of safety.", TITLE), P("The experience begins with conversation, then moves naturally into the right workflow: a report, a call, a map, a reminder, or a verified community signal.", SUBTITLE)]
    product = [[card("CONVERSATIONAL AI", "Natural-language guidance for crime, missing persons, lost & found, nearby facilities, and safety questions.", GOLD), card("EMERGENCY SOS", "Immediate emergency creation, location state, Safety Network escalation, real response status, and in-app voice.", RED), card("COMMUNITY RESPONSE", "Opt-in responder workflows with authorization, availability, approximate distance, and auditable status changes.", GREEN)], [card("HEALTH REMINDERS", "Private appointment, medication, routine, and follow-up reminders with recurrence and explicit notification controls.", BLUE), card("PUBLIC LOST & FOUND", "Search property handed in to police, submit safe claims, and post lost items for officer matching.", GOLD), card("POLICE WORKSPACE", "Verified officers review incidents, missing persons, responder activity, claims, and institutional workflows.", RED)]]
    t = Table(product, colWidths=[2.3*inch]*3, hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
    story += [t, PageBreak()]

    story += [P("03  /  SOS RESPONSE", KICKER), P("A control screen, not a dashboard.", TITLE), P("Manual SOS creates the real emergency immediately. The interface then answers five questions at a glance: what is happening, who is being contacted, whether location is shared, whether voice is connected, and how to stop or continue.", SUBTITLE)]
    flow = Table([[P("SOS ACTIVE", CARD_TITLE), P("LOCATION", CARD_TITLE), P("RESPONDERS", CARD_TITLE), P("VOICE", CARD_TITLE)], [P("Emergency created immediately", CARD_BODY), P("Shared, approximate, or unavailable", CARD_BODY), P("Authorized contacts, real statuses", CARD_BODY), P("ZEGOCLOUD state, never simulated", CARD_BODY)]], colWidths=[1.72*inch]*4)
    flow.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), PANEL), ("BOX", (0,0), (-1,-1), 0.6, HexColor("#303437")), ("INNERGRID", (0,0), (-1,-1), 0.4, HexColor("#303437")), ("LINEABOVE", (0,0), (-1,0), 2, RED), ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12), ("TOPPADDING", (0,0), (-1,-1), 12), ("BOTTOMPADDING", (0,0), (-1,-1), 12)]))
    story += [flow, Spacer(1, 0.3*inch), bullet(["Real emergency state is created before location or AI analysis completes.", "Responder states come from actual call and assignment records.", "Location permission never blocks SOS activation.", "A responder can confirm a welfare check; in-app reminders stop only after durable confirmation.", "Emergency calls and ordinary reminder calls remain separate systems."], RED), PageBreak()]

    story += [P("04  /  HEALTH REMINDERS", KICKER), P("A private rhythm for the care people already manage.", TITLE), P("Health Reminders is optional, calm, and supportive. It does not diagnose, provide medical advice, or make health disclosure part of account creation.", SUBTITLE)]
    health = Table([[card("CREATE", "Doctor visits, hospital appointments, follow-ups, medication schedules, routine checks, or other reminders.", BLUE), card("CONTROL", "Optional health context, recurring schedules, app notifications, Do Not Disturb, and explicit phone-call opt-in.", GOLD), card("DELIVER", "Due reminders are claimed atomically and delivered by a backend scheduler, even when the app is closed.", GREEN), card("REVIEW", "Complete, reschedule, remove, and revisit reminder history. Missed appointments get a gentle follow-up.", RED)]], colWidths=[1.72*inch]*4, hAlign="LEFT")
    health.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 9)]))
    story += [health, Spacer(1, 0.3*inch), P("Privacy by design", H2), P("Health data is stored in its own private model, protected by row-level ownership policies, and excluded from SOS, Safety Network, community responder, and advertising paths.", BODY), PageBreak()]

    story += [P("05  /  PUBLIC LOST & FOUND", KICKER), P("A safer bridge between people and police property desks.", TITLE), P("Anyone can search found property without signing in, submit a claim for officer review, or post something lost so it can be matched. Public summaries reveal enough to recognise an item, never enough to manufacture a claim.", SUBTITLE)]
    lost = Table([[card("SEARCH", "Free-text search, district filter, and category chips for phones, bags, documents, wallets, keys, and other property.", GOLD), card("CLAIM SAFELY", "Masked identifiers, coarse areas, and proof-of-ownership text keep claims meaningful and private.", BLUE), card("POLICE REVIEW", "Verified officers see contact details, proof, pending claims, and public lost reports in the command workspace.", RED)]], colWidths=[2.3*inch]*3, hAlign="LEFT")
    lost.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 10)]))
    story += [lost, Spacer(1, 0.3*inch), P("The trust rule", H2), P("No demo claims are approved. No public user can read another claimant's contact information. Approval is an officer action, recorded with an audit event, and releases the item only after review.", BODY), PageBreak()]

    story += [P("06  /  TRUST ARCHITECTURE", KICKER), P("Human systems, clear boundaries.", TITLE), P("ALLMA uses AI to assist understanding, not to invent certainty. It uses automation to keep a process moving, not to hide decisions.", SUBTITLE)]
    story += [bullet(["Supabase-backed records with row-level security and explicit ownership boundaries.", "Verified-officer policies for police-side review and public-facing safe summaries.", "Authorized Safety Network matching, consent-aware location sharing, and real call state.", "ZEGOCLOUD remains the in-app emergency voice layer; ordinary reminder calls are separate.", "Backend scheduling uses atomic due-claiming to prevent duplicate reminder delivery.", "Honest states for unavailable location, weak connection, no answer, and failed delivery."], GOLD), Spacer(1, 0.25*inch), Table([[card("AI ASSISTS", "Classifies, guides, and summarises with cautious language.", BLUE), card("PEOPLE DECIDE", "Users, responders, and verified officers retain the meaningful actions.", GREEN), card("SYSTEMS RECORD", "Events, statuses, claims, and outcomes remain auditable.", RED)]], colWidths=[2.3*inch]*3, hAlign="LEFT", style=TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 10)])), PageBreak()]

    story += [P("07  /  CURRENT BUILD", KICKER), P("A working foundation, ready for responsible scale.", TITLE), P("The current project is implemented as a mobile-first TanStack Start application with Supabase persistence and focused workflow surfaces.", SUBTITLE)]
    current = Table([[P("IMPLEMENTED NOW", CARD_TITLE), P("NEXT HARDENING", CARD_TITLE)], [bullet(["Conversational safety assistant", "SOS activation and live response UI", "Safety Network and responder workflows", "ZEGOCLOUD in-app voice integration", "Private Health Reminders with scheduler", "Public Lost & Found and officer review", "Responsive dark/light UI and accessibility foundations"], GREEN), bullet(["Production notification provider configuration", "Operational monitoring and delivery analytics", "Expanded officer matching tools", "Native mobile background delivery", "Pilot measurement with communities and police partners"], GOLD)]], colWidths=[3.5*inch, 3.5*inch])
    current.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), PANEL), ("BOX", (0,0), (-1,-1), 0.6, HexColor("#303437")), ("INNERGRID", (0,0), (-1,-1), 0.4, HexColor("#303437")), ("LINEABOVE", (0,0), (0,0), 2, GREEN), ("LINEABOVE", (1,0), (1,0), 2, GOLD), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 15), ("RIGHTPADDING", (0,0), (-1,-1), 15), ("TOPPADDING", (0,0), (-1,-1), 13), ("BOTTOMPADDING", (0,0), (-1,-1), 13)]))
    story += [current, Spacer(1, 0.28*inch), P("No traction, coverage, or response-time figures are claimed here until they are measured in the field.", SMALL), PageBreak()]

    story += [P("08  /  ROADMAP", KICKER), P("From useful product to trusted civic infrastructure.", TITLE), P("The roadmap grows capability without weakening the core promise: calm interfaces, real status, privacy by default, and systems that tell the truth.", SUBTITLE)]
    roadmap = Table([[card("PILOT", "Validate SOS and responder flows with a small set of communities; measure answer rates, completion, false alarms, and user comprehension.", RED), card("RELIABILITY", "Harden push, scheduler, reconnection, background behavior, and operational alerting across supported platforms.", BLUE), card("NETWORK", "Expand verified partners, facilities, police property workflows, and responder coverage with explicit governance.", GREEN), card("INTELLIGENCE", "Use aggregate, privacy-preserving signals to improve routing and guidance without profiling people or inferring health.", GOLD)]], colWidths=[1.72*inch]*4, hAlign="LEFT")
    roadmap.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 9)]))
    story += [roadmap, PageBreak()]

    story += [Spacer(1, 0.55*inch), P("THE ASK", KICKER), P("Help us make safety<br/>more understandable.", CENTER_TITLE), P("ALLMA is ready for the next step: responsible pilots, trusted institutional partners, and the operational support required to turn a strong product foundation into dependable public infrastructure.", CENTER_BODY), Spacer(1, 0.22*inch), Table([[card("PARTNER", "Community organisations, police property desks, health facilities, and responders.", GREEN, width=2.5*inch), card("PILOT", "Test the workflows with real people, real constraints, and measurable outcomes.", GOLD, width=2.5*inch), card("BUILD", "Support reliability, safety operations, and platform expansion.", RED, width=2.5*inch)]], colWidths=[2.5*inch]*3, hAlign="CENTER", style=TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7)])), Spacer(1, 0.45*inch), P("ALLMA SAFETY AI  /  Uganda coverage  /  Conversational safety, coordinated response, private reminders", style("footer", fontSize=9, alignment=TA_CENTER, textColor=MUTED))]
    doc.build(story)
    print(OUT)

if __name__ == "__main__":
    build()
