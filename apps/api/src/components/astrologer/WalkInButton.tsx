'use client';

import { useState } from 'react';
import { WalkInLogSheet } from './WalkInLogSheet';

export function WalkInButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="j-btn j-btn-primary text-sm"
      >
        + Log Walk-in
      </button>
      <WalkInLogSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
