export const metadata = {
  title: 'Delovne ure - Kamnoseštvo Čakš',
  description: 'Evidenca delovnega časa, dopusta, nadur in bolniške',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sl">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
