"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

export default function Home() {
  const { ready, session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready) {
      router.replace(session === null ? "/login" : "/quotation");
    }
  }, [ready, session, router]);

  return null;
}
