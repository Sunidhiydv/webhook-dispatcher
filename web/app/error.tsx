"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h1 className="text-lg font-semibold">This view hit an error</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
