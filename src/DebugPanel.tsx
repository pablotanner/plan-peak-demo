import { useState } from "react";

type Tab = "raw" | "settings" | "computed";

type Props = {
  rawData: unknown[];
  settings: unknown;
  computedData: unknown[];
};

const TAB_LABELS: Record<Tab, (raw: unknown[], computed: unknown[]) => string> = {
    computed: (_, computed) => `Berechnungen (Letzte ${computed.length} Minuten)`,
    settings: () => "Parameter",
    raw: (raw) => `Rohdaten (${raw.length} Einträge)`,
};

export function DebugPanel({ rawData, settings, computedData }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("computed");
  const [copied, setCopied] = useState(false);

  const content: Record<Tab, unknown> = {
    raw: rawData,
    settings,
    computed: computedData,
  };

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(content[tab], null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ marginTop: 32, marginBottom: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 4,
          border: "1px solid #bbb",
          background: open ? "#f0f0f6" : "#fff",
          cursor: "pointer",
          fontSize: 13,
          color: "#555",
        }}
      >
        <span style={{ fontSize: 20, padding:0 }}>{open ? "▾" : "▸"}</span>
        Daten anzeigen
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: "1px solid #d0d5e8",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid #d0d5e8",
              background: "#f7f8fc",
            }}
          >
            {(["computed", "settings", "raw"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: tab === t ? "2px solid #1900ff" : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: tab === t ? 600 : 400,
                  fontSize: 13,
                  color: tab === t ? "#1900ff" : "#555",
                  whiteSpace: "nowrap",
                }}
              >
                {TAB_LABELS[t](rawData, computedData)}
              </button>
            ))}

            {/* Copy button (right-aligned) */}
            <button
              onClick={handleCopy}
              style={{
                marginLeft: "auto",
                padding: "6px 14px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 12,
                color: copied ? "#1bad3d" : "#888",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Copied!" : "Copy JSON"}
            </button>
          </div>

          {/* JSON viewer */}
          <pre
            style={{
              margin: 0,
              padding: 16,
              maxHeight: 440,
              overflowY: "auto",
              overflowX: "auto",
              fontSize: 12,
              lineHeight: 1.5,
              background: "#1e1e2e",
              color: "#cdd6f4",
              fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
            }}
          >
            {JSON.stringify(content[tab], null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
