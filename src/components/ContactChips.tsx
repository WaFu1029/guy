import type { Person } from "@/types/database";

// Platform-branded contact chips: recognizable icon + handle, so a glance
// tells you which platform each one is. Inline SVGs — no icon dependency.

const stripAt = (s: string) => s.replace(/^@/, "");

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m22 7-10 6L2 7" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#d6249f" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="#d6249f" stroke="none" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function ContactChips({ person, className }: { person: Person; className?: string }) {
  const chips = [
    person.phone && {
      key: "phone",
      href: `tel:${person.phone}`,
      icon: <PhoneIcon />,
      label: person.phone,
      external: false,
    },
    person.email && {
      key: "email",
      href: `mailto:${person.email}`,
      icon: <MailIcon />,
      label: person.email,
      external: false,
    },
    person.instagram && {
      key: "instagram",
      href: `https://instagram.com/${stripAt(person.instagram)}`,
      icon: <InstagramIcon />,
      label: `@${stripAt(person.instagram)}`,
      external: true,
    },
    person.twitter && {
      key: "twitter",
      href: `https://x.com/${stripAt(person.twitter)}`,
      icon: <XIcon />,
      label: `@${stripAt(person.twitter)}`,
      external: true,
    },
  ].filter((c): c is Exclude<typeof c, null | "" | false> => Boolean(c));

  if (chips.length === 0) return null;

  return (
    <div className={"flex flex-wrap gap-1.5 " + (className ?? "")}>
      {chips.map((c) => (
        <a
          key={c.key}
          href={c.href}
          {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2.5 py-1 text-xs text-neutral-800 dark:text-neutral-100"
        >
          {c.icon}
          {c.label}
        </a>
      ))}
    </div>
  );
}
