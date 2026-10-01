"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div className="flex flex-col gap-2">
    <button className="btn btn-ghost btn-sm border border-base-300" disabled={pending} onClick={async () => {
      setPending(true);
      setError(false);
      try {
        const result = await authClient.signOut();
        if (result.error) throw new Error("Sign out failed");
        router.replace("/login");
        router.refresh();
      } catch { setError(true); }
      finally { setPending(false); }
    }}>{pending ? "Se deconectează…" : "Ieși din cont"}</button>
    {error && <p className="text-sm text-error" role="alert">Deconectarea a eșuat. Încearcă din nou.</p>}
  </div>;
}
