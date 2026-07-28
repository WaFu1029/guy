import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guy — I know a Guy",
  description: "Organize and follow up on the people you meet.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Credential-free pages like /demo must render even before .env.local
  // exists — treat missing Supabase config as "signed out" instead of throwing.
  let user = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createClient();
    ({
      data: { user },
    } = await supabase.auth.getUser());
  }

  return (
    <html
      lang="en"
      // The pre-paint theme script toggles .dark before hydration, so the
      // class attribute legitimately differs from the server render.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the stored theme before first paint so dark mode doesn't flash white. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("guy-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        {user && <TopNav />}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
