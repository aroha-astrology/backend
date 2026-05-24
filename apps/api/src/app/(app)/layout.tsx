import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { SideNav } from '@/components/layout/SideNav';
import { MainPadding } from '@/components/layout/MainPadding';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CosmicBackground } from '@/components/CosmicBackground';
import { TokenToastProvider } from '@/components/ui/TokenToast';
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner';
import { ActivityProvider } from '@/components/ActivityProvider';
import { QueueProcessor } from '@/components/QueueProcessor';
import { NativeBoot } from '@/components/NativeBoot';
import { AnnouncementModal } from '@/components/AnnouncementModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NetworkStatusBanner />
      <CosmicBackground />
      <QueueProcessor />
      <NativeBoot />
      <AnnouncementModal />
      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
        <Navbar />
        <div className="flex flex-1">
          <SideNav />
          <main className="flex-1 min-w-0">
            <MainPadding>
              <ErrorBoundary>
                <ActivityProvider>
                  <TokenToastProvider>{children}</TokenToastProvider>
                </ActivityProvider>
              </ErrorBoundary>
            </MainPadding>
          </main>
        </div>
        <BottomNav />
      </div>
    </>
  );
}
