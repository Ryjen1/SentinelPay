'use client';
import { useState } from 'react';

export default function HackathonBadges() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 font-mono text-[10px]">
      <div className="bg-[#0a0a12]/90 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] rounded-lg p-4 backdrop-blur-md w-72 sm:w-80">
        <div className="flex justify-between items-center mb-3">
          <span className="text-cyan-400 font-bold uppercase tracking-widest">Partner Integrations</span>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
        </div>
        
        <div className="flex flex-col gap-3">
          {/* MetaMask Delegation Badge */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-md flex items-start gap-3 hover:border-[#F6851B]/30 transition-colors">
            <div className="w-6 h-6 mt-0.5 rounded flex-shrink-0 bg-[#F6851B]/10 border border-[#F6851B]/30 flex items-center justify-center text-[#F6851B] font-bold text-xs shadow-[0_0_8px_rgba(246,133,27,0.15)]">
              M
            </div>
            <div>
              <div className="text-white font-bold mb-1 tracking-wide">MetaMask Delegation</div>
              <div className="text-slate-400 text-[10px] leading-relaxed">
                Agent integrated with ERC-7715. Policy natively enforced via Smart Accounts ($5 USDC Spending Cap).
              </div>
            </div>
          </div>

          {/* Status Network Badge */}
          <div className="bg-white/[0.03] border border-white/[0.05] p-3 rounded-md flex items-start gap-3 hover:border-[#4360DF]/30 transition-colors">
            <div className="w-6 h-6 mt-0.5 rounded flex-shrink-0 bg-[#4360DF]/10 border border-[#4360DF]/30 flex items-center justify-center text-[#4360DF] font-bold text-xs shadow-[0_0_8px_rgba(67,96,223,0.15)]">
              S
            </div>
            <div>
              <div className="text-white font-bold mb-1 tracking-wide">Status Network</div>
              <div className="text-slate-400 text-[10px] leading-relaxed">
                Agent actions & telemetry deployed on Sepolia Testnet utilizing 100% gasless transactions.
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-white/[0.05] text-center text-slate-500 text-[9px] uppercase tracking-widest">
          Synthesis Hackathon Submissions
        </div>
      </div>
    </div>
  );
}
