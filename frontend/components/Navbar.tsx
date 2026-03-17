'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ConnectButton from './ConnectButton';
import LogoSVG from './LogoSVG';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Infrastructure', href: '/infrastructure' },
  { label: 'Policies', href: '/policies' },
  { label: 'Docs', href: '/docs' },
  { label: 'Demo', href: '/demo' },
];

interface NavbarProps {
  variant?: 'fixed' | 'sticky';
}

export default function Navbar({ variant = 'fixed' }: NavbarProps) {
  const pathname = usePathname();
  const networkLabel =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_NETWORK_LABEL) || 'Celo Sepolia';

  return (
    <nav
      className={`${variant === 'fixed' ? 'fixed' : 'sticky'} top-0 w-full z-50 navbar-blur border-b border-white/[0.05]`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo Section */}
        <Link href="/" className="flex items-center gap-2 group mr-8">
          <div className="w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 border transition-colors group-hover:border-purple-500/50" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }}>
            <LogoSVG variant="mono" width={16} height={16} className="text-white opacity-80 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-400 hidden sm:block h-full leading-none flex items-center pt-1" style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
            SentinelPay
          </span>
        </Link>

        {/* Center nav */}
        <div className="hidden lg:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-[13px] font-medium transition-colors duration-200 py-0.5 ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute -bottom-[22px] left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/[0.07] border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              {networkLabel}
            </span>
          </div>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
