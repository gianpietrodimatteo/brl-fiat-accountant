import { AuthenticatedShell } from "@/components/authenticated-shell";

export default function HistoryLayout({ children }: LayoutProps<"/history">) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
