'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to customers list — the Add form is inline there
export default function NewCustomerRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/astrologer/customers'); }, [router]);
  return null;
}
