import "./globals.css";

export const metadata = {
  title: "Cafetería UCSD",
  description: "Pedidos y despacho digital de la cafetería UCSD",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
