'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function ChartZoomModal({ isOpen, onClose, children, title }: ChartZoomModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.2;

  useEffect(() => {
    if (!isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const handleWheel = (e: WheelEvent) => {
    if (!isOpen) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom === 1) return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handlePinchZoom = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();

    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const distance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );

    if (!contentRef.current) return;
  };

  const zoomIn = () => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
          onClick={onClose}
        >
          {/* Header with close button and title */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
            <h2 className="text-white text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Chart container with zoom */}
          <div
            ref={containerRef}
            className="flex-1 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ userSelect: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={contentRef}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center',
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              }}
            >
              {children}
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 z-10">
            <button
              onClick={() => { zoomOut(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors text-white"
              title="Zoom out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            <span className="text-white text-sm font-semibold w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={() => { zoomIn(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors text-white"
              title="Zoom in"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="11" y1="8" x2="11" y2="14" />
              </svg>
            </button>

            <div className="w-px h-6 bg-white/20" />

            <button
              onClick={resetZoom}
              className="text-white text-xs font-semibold px-3 py-1 hover:bg-white/20 transition-colors rounded-full"
              title="Reset zoom"
            >
              Reset
            </button>
          </div>

          {/* Hint */}
          {zoom > 1 && (
            <div className="absolute top-16 text-center text-white/60 text-sm">
              Drag to pan
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
