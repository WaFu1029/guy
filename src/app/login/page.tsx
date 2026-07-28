"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setInfo("Account created. If email confirmation is enabled, check your inbox, then sign in.");
      setMode("sign-in");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h1 className="mb-1 text-xl font-semibold text-neutral-50">Guy</h1>
        <p className="mb-6 text-sm text-neutral-400">I know a Guy™ — sign in to your network.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm text-neutral-300">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50 outline-none focus:border-neutral-500"
            />
          </label>
          <label className="text-sm text-neutral-300">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50 outline-none focus:border-neutral-500"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {loading ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
