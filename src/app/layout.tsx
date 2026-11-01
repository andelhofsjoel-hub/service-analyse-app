import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service-analyse",
  description: "Aanvragen analyseren, documenten en onderdelen opzoeken",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-5xl px-4 py-3 font-semibold">Service-analyse</div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
