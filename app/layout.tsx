import type { ReactNode } from "react";

export const metadata = { title: "ZOU", description: "Le droit malgache expliqué, calculé et rédigé à partir des textes de loi." };

// L'interface publique est servie telle quelle depuis /app.html (voir next.config.mjs).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
