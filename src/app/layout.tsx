import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { InlineScript } from "@/components/InlineScript"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "CRM",
  description: "CRM interno",
}

// Setea la clase .dark antes del primer paint para evitar el flash (FOUC).
// Usa el tema guardado; si no hay, cae en la preferencia del sistema.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
