/**
 * The Sigurt lock: a padlock whose keyhole is a speech bubble.
 * `sealing` plays the shackle-closing motion once (used when a room's key is ready).
 */
export function LockMark({ size = 32, sealing = false, title = "Sigurt" }) {
  return (
    <svg
      className={`lock-mark${sealing ? " is-sealing" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <path
        className="lock-shackle"
        d="M21 30v-8a11 11 0 0 1 22 0v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <rect className="lock-body" x="12" y="28" width="40" height="30" rx="8" />
      <path
        className="lock-keyhole"
        d="M25.5 36.5h13a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5H32l-5 4v-4h-1.5a3.5 3.5 0 0 1-3.5-3.5v-5a3.5 3.5 0 0 1 3.5-3.5z"
      />
    </svg>
  );
}

export function Wordmark({ size = 28, sealing = false }) {
  return (
    <span className="wordmark">
      <LockMark size={size} sealing={sealing} title="" />
      <span className="wordmark-text">Sigurt</span>
    </span>
  );
}
