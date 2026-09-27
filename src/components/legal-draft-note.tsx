// Shown at the top of legal pages that a lawyer hasn't reviewed yet.
export default function LegalDraftNote({ updated }: { updated: string }) {
  return (
    <div
      role="note"
      className="not-prose mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-semibold">Draft, under legal review</p>
      <p className="mt-1">
        This page is a working draft (last updated {updated}). It may change after our lawyer
        reviews it. We&apos;ll say so inside the app before any change takes effect.
      </p>
    </div>
  );
}
