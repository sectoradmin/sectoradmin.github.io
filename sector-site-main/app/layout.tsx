import type React from "react"
import type { Metadata } from "next"
import { Orbitron } from "next/font/google"
import "./globals.css"

const orbitron = Orbitron({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-orbitron",
  weight: ["400", "500", "600", "700", "800", "900"],
})

export const metadata: Metadata = {
  title: "sector.fm",
  description: "Live",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} antialiased`}>
      <head>
        {/* Add mixcloud widget scripts to all pages */}
        <script src="//widget.mixcloud.com/media/js/widgetApi.js" type="text/javascript" async></script>
        <script src="//widget.mixcloud.com/media/js/footerWidgetApi.js" type="text/javascript" async></script>
      </head>
      <body>{children}</body>
    </html>
  )
}
