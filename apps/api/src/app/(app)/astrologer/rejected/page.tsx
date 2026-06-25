'use client';

import { motion } from 'framer-motion';

export default function AstrologerRejectedPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-4xl"
        >
          ✖️
        </motion.div>
        <div>
          <h1 className="text-xl font-extrabold text-text font-[family-name:var(--font-serif)] mb-2">
            Application Not Approved
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            Your astrologer application wasn&apos;t approved this time.
            Please contact us on WhatsApp at +91 95359 60988 for more information or to reapply.
          </p>
        </div>
        <button
          onClick={() => window.open('https://wa.me/919535960988', '_blank')}
          className="w-full py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm cursor-pointer border-none hover:opacity-90 transition-opacity"
        >
          Contact on WhatsApp
        </button>
      </div>
    </div>
  );
}
