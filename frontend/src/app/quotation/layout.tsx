import { AuthenticatedShell } from "@/components/authenticated-shell";

export default function QuotationLayout({ children }: LayoutProps<"/quotation">) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
