import Link from "next/link";
import { signOut } from "@/app/actions";

export function NavBar({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold text-neutral-50">
          Guy
        </Link>
        <Link href="/capture" className="text-sm text-neutral-400 hover:text-neutral-100">
          Capture
        </Link>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-100">
          Network
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">{email}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
