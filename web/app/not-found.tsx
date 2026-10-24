import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h1 className="text-lg font-semibold">That page is not on the control plane</h1>
      <Link href="/" className="mt-3 inline-block text-sm text-primary">
        Back to overview
      </Link>
    </div>
  );
}
