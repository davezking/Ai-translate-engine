/** Icon set ported from the claude/app-ui-ux-html-ctg49j UI prototype (ui-prototype/app.js `I`). */
const PATHS: Record<string, string> = {
  plus: "M8 3.5v9M3.5 8h9",
  check: "M3.5 8.5l3 3 6-6.5",
  x: "M4 4l8 8M12 4l-8 8",
  retry: "M13 8a5 5 0 1 1-1.6-3.7M13 3v2.5h-2.5",
  play: "M5 3.5l7 4.5-7 4.5z",
  warn: "M8 2.5 14.5 13.5h-13zM8 6.5v3M8 11.3v.2",
  info: "M8 7.5v4M8 5v.2M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  back: "M9.5 3.5 5 8l4.5 4.5",
  merge: "M4 3v4c0 2 1.5 3 3 3h5M12 10l-2-2M12 10l-2 2",
  split: "M3 8h4m0 0 3-3m-3 3 3 3M9.5 8H13",
  undo: "M6 3.4 2.6 6.8 6 10.2M2.6 6.8h6.6a3.4 3.4 0 0 1 0 6.8H6.6",
  doc: "M4 2.5h5l3 3v8H4zM9 2.5v3h3",
};

export default function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
