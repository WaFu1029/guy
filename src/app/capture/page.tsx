import { VoiceCapture } from "@/components/VoiceCapture";

export default function CapturePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-neutral-50">Log a new connection</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Right after you meet someone, tell Guy who they are and what you talked about.
      </p>
      <VoiceCapture />
    </div>
  );
}
