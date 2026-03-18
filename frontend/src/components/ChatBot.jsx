import { useState, useRef, useEffect } from "react";
import { fetchChat } from "../api/cities";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const GREETING = "Ask anything about Massachusetts gateway cities.";
const EXAMPLES = [
  "What share of Boston residents are foreign-born?",
  "Compare Lowell and Worcester.",
  "Show the foreign-born trend in Worcester since 2010.",
];

function normalizeTimeSeries(rows = []) {
  return rows
    .map((r) => ({
      year: Number(r.year),
      value: r.value == null ? null : Number(r.value),
      metric: r.metric,
      city: r.city,
    }))
    .filter(
      (r) =>
        Number.isFinite(r.year) && r.value != null && !Number.isNaN(r.value),
    )
    .sort((a, b) => a.year - b.year);
}

/* ---- component ---- */
export default function ChatBot() {
  const DEFAULT_WIDTH = 340;
  const DEFAULT_HEIGHT = 404;
  const MIN_WIDTH = 280;
  const MIN_HEIGHT = 260;
  const HEADER_HEIGHT = 44;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [dragging, setDragging] = useState(false);
  const [resizeState, setResizeState] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (position === null) {
      const defaultX = window.innerWidth - DEFAULT_WIDTH - 24;
      const defaultY = 56;
      setPosition({
        x: Math.max(0, defaultX),
        y: defaultY,
      });
    }
  }, []);

  const handleMouseDown = (e) => {
    if (resizeState) return;
    setDragging(true);
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleResizeStart = (edge) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!position) return;

    setResizeState({
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: position.x,
      startTop: position.y,
      startWidth: size.width,
      startHeight: size.height,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (resizeState) {
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        const startRight = resizeState.startLeft + resizeState.startWidth;
        const startBottom = resizeState.startTop + resizeState.startHeight;

        let nextLeft = resizeState.startLeft;
        let nextTop = resizeState.startTop;
        let nextWidth = resizeState.startWidth;
        let nextHeight = resizeState.startHeight;

        if (resizeState.edge.includes("right")) {
          const nextRight = Math.min(
            window.innerWidth - 8,
            Math.max(resizeState.startLeft + MIN_WIDTH, startRight + dx),
          );
          nextWidth = nextRight - resizeState.startLeft;
        }

        if (resizeState.edge.includes("left")) {
          const nextLeftCandidate = Math.max(
            0,
            Math.min(startRight - MIN_WIDTH, resizeState.startLeft + dx),
          );
          nextLeft = nextLeftCandidate;
          nextWidth = startRight - nextLeftCandidate;
        }

        if (resizeState.edge.includes("bottom")) {
          const nextBottom = Math.min(
            window.innerHeight - 8,
            Math.max(resizeState.startTop + MIN_HEIGHT, startBottom + dy),
          );
          nextHeight = nextBottom - resizeState.startTop;
        }

        if (resizeState.edge.includes("top")) {
          const nextTopCandidate = Math.max(
            0,
            Math.min(startBottom - MIN_HEIGHT, resizeState.startTop + dy),
          );
          nextTop = nextTopCandidate;
          nextHeight = startBottom - nextTopCandidate;
        }

        setPosition({ x: nextLeft, y: nextTop });
        setSize({ width: nextWidth, height: nextHeight });
        return;
      }

      if (!dragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      setResizeState(null);
    };

    if (dragging || resizeState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, dragOffset, resizeState]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetchChat(q);
      const chart =
        res?.chart?.type === "time_series" && Array.isArray(res?.chart?.data)
          ? { ...res.chart, data: normalizeTimeSeries(res.chart.data) }
          : null;
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: res?.answer || "Sorry, I couldn't answer that.",
          chart,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "Sorry, something went wrong. Please try again." },
      ]);
    }
    setLoading(false);
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        ...styles.wrapper,
        bottom: "auto",
        right: "auto",
        top: position ? `${position.y}px` : "0",
        left: position ? `${position.x}px` : "0",
        width: `${size.width}px`,
      }}
    >
      {/* Collapsed bar — always visible */}
      <button
        style={{
          ...styles.header,
          borderRadius: open ? "10px 10px 0 0" : "10px",
          cursor: dragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={styles.headerIcon}>💬</span>
        <span style={styles.headerTitle}>ACS Assistant</span>
        <span style={styles.headerToggle}>{open ? "▼" : "▲"}</span>
        {!open && <span style={styles.closeX}>×</span>}
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            ...styles.body,
            height: `${Math.max(180, size.height - HEADER_HEIGHT)}px`,
          }}
        >
          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.welcome}>
                <p>{GREETING}</p>
                <p style={styles.examples}>
                  {EXAMPLES.map((ex, i) => (
                    <span key={i}>
                      <em>e.g. "{ex}"</em>
                      {i < EXAMPLES.length - 1 ? " or " : ""}
                    </span>
                  ))}
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  ...styles.msg,
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "#1a2540" : "#1e1f2e",
                  borderColor: m.role === "user" ? "#4e9af1" : "#2a2a3a",
                }}
              >
                {m.text.split("\n").map((line, li) => (
                  <span key={li}>
                    {line.startsWith("**") && line.endsWith("**") ? (
                      <strong>{line.slice(2, -2)}</strong>
                    ) : (
                      line
                    )}
                    {li < m.text.split("\n").length - 1 && <br />}
                  </span>
                ))}

                {m.role === "bot" && m.chart?.type === "time_series" && (
                  <div style={styles.chartWrap}>
                    <div style={styles.chartTitle}>{m.chart.title}</div>
                    <div style={styles.chartBox}>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={m.chart.data}>
                          <XAxis dataKey="year" stroke="#9aa4b2" />
                          <YAxis stroke="#9aa4b2" />
                          <Tooltip
                            contentStyle={{
                              background: "#13141f",
                              border: "1px solid #2a2a3a",
                              borderRadius: 8,
                              color: "#e0e0e0",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#4e9af1"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  ...styles.msg,
                  background: "#1e1f2e",
                  borderColor: "#2a2a3a",
                  alignSelf: "flex-start",
                }}
              >
                <em style={{ color: "#888" }}>Thinking…</em>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            style={styles.inputRow}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              style={styles.input}
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" style={styles.sendBtn} disabled={loading}>
              ▶
            </button>
          </form>

          <div style={styles.resizeHandleTop} onMouseDown={handleResizeStart("top")} />
          <div style={styles.resizeHandleRight} onMouseDown={handleResizeStart("right")} />
          <div style={styles.resizeHandleBottom} onMouseDown={handleResizeStart("bottom")} />
          <div style={styles.resizeHandleLeft} onMouseDown={handleResizeStart("left")} />
          <div style={styles.resizeHandleTopLeft} onMouseDown={handleResizeStart("top-left")} />
          <div style={styles.resizeHandleTopRight} onMouseDown={handleResizeStart("top-right")} />
          <div
            style={styles.resizeHandleBottomRight}
            onMouseDown={handleResizeStart("bottom-right")}
          />
          <div
            style={styles.resizeHandleBottomLeft}
            onMouseDown={handleResizeStart("bottom-left")}
          />
        </div>
      )}
    </div>
  );
}

/* ---- inline styles ---- */
const styles = {
  wrapper: {
    position: "fixed",
    bottom: 24,
    right: 24,
    width: 340,
    zIndex: 9999,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "#1a1b2e",
    border: "1px solid #2a2a3a",
    color: "#ccc",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
  },
  headerIcon: { fontSize: "1rem" },
  headerTitle: { flex: 1, textAlign: "left", color: "#e0e0e0" },
  headerToggle: { fontSize: "0.65rem", color: "#888" },
  closeX: { fontSize: "1rem", color: "#888", marginLeft: 4 },
  body: {
    display: "flex",
    flexDirection: "column",
    background: "#13141f",
    border: "1px solid #2a2a3a",
    borderTop: "none",
    borderRadius: "0 0 10px 10px",
    height: 360,
    position: "relative",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  welcome: {
    color: "#999",
    fontSize: "0.82rem",
    textAlign: "center",
    marginTop: 40,
    lineHeight: 1.6,
  },
  examples: {
    marginTop: 12,
    color: "#6e7a94",
    fontSize: "0.78rem",
  },
  msg: {
    maxWidth: "88%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: "0.82rem",
    color: "#ddd",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  chartWrap: {
    marginTop: 10,
  },
  chartTitle: {
    fontSize: "0.78rem",
    color: "#9aa4b2",
    marginBottom: 6,
  },
  chartBox: {
    width: "100%",
    height: 170,
    background: "#13141f",
    border: "1px solid #2a2a3a",
    borderRadius: 10,
    padding: 8,
  },
  inputRow: {
    display: "flex",
    gap: 6,
    padding: "8px 10px",
    borderTop: "1px solid #2a2a3a",
  },
  input: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2a2a3a",
    background: "#1e1f2e",
    color: "#e0e0e0",
    fontSize: "0.82rem",
    outline: "none",
  },
  sendBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #4e9af1",
    background: "#4e9af1",
    color: "#fff",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  resizeHandleTop: {
    position: "absolute",
    top: -3,
    left: 10,
    right: 10,
    height: 6,
    cursor: "ns-resize",
  },
  resizeHandleRight: {
    position: "absolute",
    top: 10,
    right: -3,
    bottom: 10,
    width: 6,
    cursor: "ew-resize",
  },
  resizeHandleBottom: {
    position: "absolute",
    bottom: -3,
    left: 10,
    right: 10,
    height: 6,
    cursor: "ns-resize",
  },
  resizeHandleLeft: {
    position: "absolute",
    top: 10,
    left: -3,
    bottom: 10,
    width: 6,
    cursor: "ew-resize",
  },
  resizeHandleTopLeft: {
    position: "absolute",
    top: -3,
    left: -3,
    width: 10,
    height: 10,
    cursor: "nwse-resize",
  },
  resizeHandleTopRight: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    cursor: "nesw-resize",
  },
  resizeHandleBottomRight: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 10,
    height: 10,
    cursor: "nwse-resize",
  },
  resizeHandleBottomLeft: {
    position: "absolute",
    left: -3,
    bottom: -3,
    width: 10,
    height: 10,
    cursor: "nesw-resize",
  },
};
