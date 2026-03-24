import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:5000";

const SHORTCUTS = [
  { label: "▶ YouTube", command: "open youtube", icon: "🎬" },
  { label: "♫ Spotify", command: "open spotify", icon: "🎵" },
  { label: "💼 LinkedIn", command: "open linkedin", icon: "💼" },
  { label: "🔍 Google", command: "open google", icon: "🔍" },
  { label: "⏰ Time", command: "what time is it", icon: "⏰" },
  { label: "😄 Joke", command: "tell me a joke", icon: "😄" },
];

function WaveBar({ delay }) {
  return <div className="wave-bar" style={{ animationDelay: `${delay}ms` }} />;
}

function App() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [statusText, setStatusText] = useState("Click mic to start");
  const [backendStatus, setBackendStatus] = useState("checking"); // "checking" | "online" | "offline"
  const recognitionRef = useRef(null);

  // ─── Check backend health on load ────────────────────────────
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 10000); // re-check every 10s
    return () => clearInterval(interval);
  }, []);

  // ─── Setup Web Speech API ─────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const current = event.results[event.results.length - 1];
        const text = current[0].transcript;
        setTranscript(text);
        if (current.isFinal) {
          sendToBackend(text);
        }
      };

      recognition.onend = () => {
        setListening(false);
        setPulse(false);
        setStatusText("Click mic to start");
      };

      recognition.onerror = (e) => {
        setListening(false);
        setPulse(false);
        setStatusText("Click mic to start");
        if (e.error === "not-allowed") {
          setTranscript("❌ Microphone access denied. Please allow mic in browser settings.");
        } else {
          setTranscript("Could not hear you. Try again!");
        }
      };

      recognitionRef.current = recognition;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Send to Flask backend ────────────────────────────────────
  const sendToBackend = useCallback(async (text) => {
    setStatusText("Thinking...");
    try {
      const res = await fetch(`${BACKEND_URL}/start_listening`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      handleResponse(text, data);
    } catch {
      handleResponse(text, {
        message: "⚠️ Backend not connected. Start app.py to enable AI responses.",
      });
    }
    setStatusText("Click mic to start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handle structured backend response ──────────────────────
  const handleResponse = (commandText, data) => {
    const msg = data.message || "Done!";
    setResponse(msg);
    setActivityLog((prev) => [
      { command: commandText, result: msg, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 9),
    ]);
    if (data.action === "open_url" && data.url) {
      window.open(data.url, "_blank");
    }
    setSpeaking(true);
    speak(msg);
    setTimeout(() => setSpeaking(false), 3500);
  };

  const speak = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[🎬🎵💼🔍⏰😄👋🤖🐛⚠️❌✅]/g, "");
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  // ─── Mic toggle ───────────────────────────────────────────────
  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setTranscript("⚠️ Web Speech API not supported. Use Chrome browser.");
      return;
    }
    if (listening) {
      recognition.stop();
      setListening(false);
      setPulse(false);
      setStatusText("Click mic to start");
    } else {
      setTranscript("");
      setResponse("");
      recognition.start();
      setListening(true);
      setPulse(true);
      setStatusText("Listening... speak now");
    }
  };

  // ─── Shortcut buttons ─────────────────────────────────────────
  const sendShortcut = async (command) => {
    setTranscript(command);
    setResponse("");
    setStatusText("Thinking...");
    try {
      const res = await fetch(`${BACKEND_URL}/shortcut`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      handleResponse(command, data);
    } catch {
      handleResponse(command, {
        message: "⚠️ Backend not connected. Start app.py to enable AI responses.",
      });
    }
    setStatusText("Click mic to start");
  };

  return (
    <div className="app">
      <div className="bg-orb orb1" />
      <div className="bg-orb orb2" />
      <div className="bg-orb orb3" />

      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="logo">
            <span className="logo-icon">🤖</span>
            <div>
              <h1 className="logo-title">VoiceAI</h1>
              <p className="logo-sub">AI-Powered Voice Assistant</p>
            </div>
          </div>
          <div className={`status-badge ${backendStatus}`}>
            <span className="status-dot" />
            {backendStatus === "checking" ? "CHECKING..." : backendStatus === "online" ? "BACKEND LIVE" : "BACKEND OFFLINE"}
          </div>
        </header>

        {/* Offline warning banner */}
        {backendStatus === "offline" && (
          <div className="offline-banner">
            ⚠️ Backend not running — start it with: <code>myenv\Scripts\python app.py</code>
          </div>
        )}

        <div className="main-grid">
          {/* Mic Card */}
          <div className="card mic-card">
            <div className="mic-area">
              <div className={`wave-container ${listening ? "active" : ""}`}>
                {[0, 80, 160, 240, 320, 400, 480].map((d, i) => <WaveBar key={i} delay={d} />)}
              </div>

              <button
                className={`mic-button ${listening ? "listening" : ""} ${pulse ? "pulse" : ""}`}
                onClick={toggleListening}
                aria-label="Toggle listening"
              >
                <span className="mic-icon">{listening ? "⏹" : "🎤"}</span>
                {listening && <div className="mic-ripple" />}
                {listening && <div className="mic-ripple ripple2" />}
              </button>

              <div className={`wave-container ${listening ? "active" : ""}`}>
                {[120, 40, 200, 0, 280, 160, 60].map((d, i) => <WaveBar key={i} delay={d} />)}
              </div>
            </div>

            <p className="status-text">{statusText}</p>

            <div className={`transcript-box ${transcript ? "has-content" : ""}`}>
              <div className="box-label">
                <span className="label-dot you-dot" /> YOU
              </div>
              <p className="transcript-text">
                {transcript || "Your speech will appear here..."}
              </p>
            </div>

            <div className={`response-box ${speaking ? "speaking" : ""} ${response ? "has-content" : ""}`}>
              <div className="box-label">
                <span className="label-dot ai-dot" />
                ASSISTANT (Gemini AI)
                {speaking && <span className="speaking-badge">Speaking...</span>}
              </div>
              <p className="response-text">
                {response || "Gemini AI response will appear here..."}
              </p>
            </div>
          </div>

          {/* Right Panel */}
          <div className="right-panel">
            <div className="card shortcuts-card">
              <h2 className="card-title">⚡ Quick Commands</h2>
              <div className="shortcuts-grid">
                {SHORTCUTS.map((s) => (
                  <button key={s.command} className="shortcut-btn" onClick={() => sendShortcut(s.command)}>
                    <span className="shortcut-icon">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card log-card">
              <h2 className="card-title">📋 Activity Log</h2>
              <div className="log-list">
                {activityLog.length === 0 ? (
                  <div className="log-empty">No activity yet. Try a command!</div>
                ) : (
                  activityLog.map((item, idx) => (
                    <div key={idx} className="log-item">
                      <div className="log-header">
                        <span className="log-command">🎤 {item.command}</span>
                        <span className="log-time">{item.time}</span>
                      </div>
                      <div className="log-result">↳ {item.result}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="footer">
          <p>Powered by Gemini AI · React · Flask · Web Speech API · © 2024 VoiceAI</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
