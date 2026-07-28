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
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-neutral-800 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-100 dark:bg-neutral-900 p-6">
        <h1 className="mb-1 text-xl font-bold text-neutral-900 dark:text-neutral-50">Guy.</h1>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">I know a Guy™ — sign in to your network.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 font-normal text-neutral-900 dark:text-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </label>
          <label className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 font-normal text-neutral-900 dark:text-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-50 disabled:opacity-50"
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
          className="mt-4 text-sm text-neutral-500 dark:text-neutral-400 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-50"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
