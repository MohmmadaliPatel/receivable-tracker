import Image from 'next/image';

type Props = {
  className?: string;
  /** Narrow layout (e.g. sidebar w-64): both marks stay on one row without clipping. */
  variant?: 'default' | 'sidebar';
};

/** Taxteck × CleanMax mark — keep in sync across sidebar and login. */
export function BrandLogosRow({ className = '', variant = 'default' }: Props) {
  if (variant === 'sidebar') {
    // One row, side-by-side: grid splits width so the square CleanMax asset gets
    // a real column (not a tiny flex-1 slice) and the wide Taxteck mark keeps height.
    return (
      <div
        className={`grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)] items-center gap-1.5 w-full min-w-0 ${className}`}
      >
        <div className="min-w-0 flex items-center justify-end pr-0.5">
          <Image
            src="/logo.png"
            alt="Taxteck"
            width={160}
            height={40}
            className="h-10 w-auto max-w-[min(100%,6.75rem)] object-contain object-right"
            priority
          />
        </div>
        <span
          className="text-gray-400 text-sm font-light leading-none shrink-0 select-none"
          aria-hidden
        >
          ×
        </span>
        <div className="min-w-0 flex items-center justify-start pl-0.5">
          <Image
            src="/cleanmax-logo.png"
            alt="CleanMax"
            width={554}
            height={554}
            className="h-[4.5rem] w-[4.5rem] max-w-full shrink-0 object-contain object-center"
            sizes="(max-width: 256px) 96px, 120px"
            priority
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-4 flex-wrap ${className}`}>
      <Image
        src="/logo.png"
        alt="Taxteck"
        width={160}
        height={42}
        className="h-11 w-auto object-contain"
        priority
      />
      <span className="text-gray-400 text-2xl font-light">×</span>
      <Image
        src="/cleanmax-logo.png"
        alt="CleanMax"
        width={240}
        height={64}
        className="h-[80px] w-auto max-w-[min(100%,220px)] object-contain object-left"
        priority
      />
    </div>
  );
}
