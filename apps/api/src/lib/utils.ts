import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function getTimeConfidenceIndicator(source: string): { emoji: string; label: string } {
  switch (source) {
    case 'hospital':
    case 'certificate':
      return { emoji: '🟢', label: 'High confidence' };
    case 'family':
      return { emoji: '🟡', label: 'Medium confidence' };
    case 'approximate':
    case 'unknown':
      return { emoji: '🔴', label: 'Low confidence' };
    default:
      return { emoji: '🟡', label: 'Medium confidence' };
  }
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str;
}

export function generateId(): string {
  return crypto.randomUUID();
}
