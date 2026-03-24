import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Force UTF-8 output on Windows console
sys.stdout.reconfigure(encoding="utf-8")

# ─── Configure Gemini ──────────────────────────────────────────
API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.0-flash"

# ─── System prompt ─────────────────────────────────────────────
SYSTEM_PROMPT = (
    "You are VoiceAI, a smart, helpful, and friendly AI voice assistant. "
    "Keep your responses concise (1-3 sentences max) since they will be spoken aloud. "
    "Be conversational, warm, and clear. Avoid markdown formatting in your responses."
)

# ─── URL mappings ───────────────────────────────────────────────
URL_MAP = {
    "youtube":   "https://www.youtube.com",
    "spotify":   "https://www.spotify.com",
    "linkedin":  "https://www.linkedin.com",
    "google":    "https://www.google.com",
    "github":    "https://www.github.com",
    "gmail":     "https://mail.google.com",
    "twitter":   "https://www.twitter.com",
    "instagram": "https://www.instagram.com",
    "netflix":   "https://www.netflix.com",
    "amazon":    "https://www.amazon.com",
    "chatgpt":   "https://chat.openai.com",
    "whatsapp":  "https://web.whatsapp.com",
}


def detect_open_action(text: str):
    import re
    lower = text.lower()

    # Match any explicit URL like www.* or http(s)://
    url_pattern = re.search(r'(https?://[^\s]+|www\.[^\s]+)', lower)
    if url_pattern:
        url = url_pattern.group(0)
        if not url.startswith("http"):
            url = "https://" + url
        return {"action": "open_url", "url": url}

    # Match known keyword shortcuts
    if any(kw in lower for kw in ["open", "launch", "go to", "take me to"]):
        for keyword, url in URL_MAP.items():
            if keyword in lower:
                return {"action": "open_url", "url": url}
    return {}


FALLBACK_RESPONSES = {
    "youtube":   "Opening YouTube for you!",
    "spotify":   "Launching Spotify!",
    "linkedin":  "Opening LinkedIn!",
    "google":    "Opening Google!",
    "github":    "Opening GitHub!",
    "gmail":     "Opening Gmail!",
    "twitter":   "Opening Twitter!",
    "instagram": "Opening Instagram!",
    "netflix":   "Opening Netflix!",
    "amazon":    "Opening Amazon!",
    "chatgpt":   "Opening ChatGPT!",
    "whatsapp":  "Opening WhatsApp!",
    "time":      f"The current time is displayed on your screen.",
    "joke":      "Why do programmers prefer dark mode? Because light attracts bugs!",
    "hello":     "Hello! How can I help you today?",
    "hi":        "Hi there! Try asking me anything!",
}


def get_fallback(text: str) -> str:
    lower = text.lower()
    for kw, reply in FALLBACK_RESPONSES.items():
        if kw in lower:
            return reply
    return "I'm having trouble reaching the AI right now. Please try again in a moment."


def ask_gemini(prompt: str) -> str:
    """Call Gemini with 2 retries on 429 rate-limit errors."""
    import time
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=f"{SYSTEM_PROMPT}\n\nUser: {prompt}"
            )
            return response.text.strip()
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower():
                if attempt < 2:
                    time.sleep(2 ** attempt)  # 1s, then 2s
                    continue
                # All retries exhausted — use local fallback
                return get_fallback(prompt)
            # Non-quota error — return friendly message
            return f"Sorry, something went wrong: {err[:120]}"


# ─── Health check ──────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL})


# ─── Main voice command endpoint ──────────────────────────────────
@app.route("/start_listening", methods=["POST"])
def start_listening():
    data = request.get_json(silent=True) or {}
    transcript = data.get("transcript", "").strip()

    if not transcript:
        return jsonify({"message": "I didn't catch that. Please try again.", "transcript": ""})

    message = ask_gemini(transcript)
    result = {"transcript": transcript, "message": message}
    
    # ALWAYS detect url action, regardless of whether Gemini succeeded or fell back
    result.update(detect_open_action(transcript))
    return jsonify(result)


# ─── Shortcut button endpoint ──────────────────────────────────────
@app.route("/shortcut", methods=["POST"])
def shortcut():
    data = request.get_json(silent=True) or {}
    command = data.get("command", "").strip()

    if not command:
        return jsonify({"message": "No command received."})

    message = ask_gemini(command)
    result = {"command": command, "message": message}
    
    # ALWAYS detect url action, regardless of whether Gemini succeeded or fell back
    result.update(detect_open_action(command))
    return jsonify(result)


if __name__ == "__main__":
    print("VoiceAI Backend starting...")
    print(f"   Gemini API key: {'Found' if API_KEY else 'MISSING - check .env file'}")
    print("   Running on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
