'use client';

interface Props {
  suggestedDhanam: number;
}

export function BookNowTrigger({ suggestedDhanam }: Props) {
  const handleClick = () => {
    window.dispatchEvent(new Event('puja-book-now'));
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="text-right">
        <div className="text-[10px] text-text-muted">Starting at</div>
        <div className="text-base font-bold text-text">{suggestedDhanam} Dhanam</div>
      </div>
      <button
        onClick={handleClick}
        className="j-btn j-btn-primary text-xs px-4 py-2"
      >
        Select Package
      </button>
    </div>
  );
}
