import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function DescriptionSidebar({ open, onClose, title = "Beschreibung", children }: Props) {
  // Close sidebar on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`sidebar-backdrop${open ? " sidebar-backdrop--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`sidebar-panel${open ? " sidebar-panel--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sidebar-header">
          <h2 className="sidebar-title">{title}</h2>
          <button className="sidebar-close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="sidebar-body">{children}</div>
      </div>
    </>
  );
}
