import Link from "next/link";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-8 text-center">
        <InternationalizedText
          as="h1"
          id="home.title"
          className="text-4xl font-bold tracking-tight text-zinc-900"
        />
        <InternationalizedText
          as="p"
          id="home.tagline"
          className="max-w-md text-lg leading-8 text-zinc-600"
        />
        <div className="flex gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            <InternationalizedText id="home.cta.dashboard" />
          </Link>
          <Link
            href="/claims"
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
          >
            Claims portal
          </Link>
        </div>
      </main>
    </div>
  );
}
