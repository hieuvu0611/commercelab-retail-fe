import type { Metadata } from 'next'
import { Bricolage_Grotesque, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin', 'vietnamese'],
  axes: ['opsz', 'wdth'],
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin', 'vietnamese'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CommerceLab Retail — Personal & Travel Accessories',
  description:
    'First-party retail of backpacks, insulated bottles and outdoor gear, with warehouse, order and payment operations.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${sourceSerif.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
