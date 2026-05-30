import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

type Props = {
  eyebrow?: string;
  title: string;
  meta?: string;
  right?: React.ReactNode;
  hideSettings?: boolean;
};

export default function PageHeader({ eyebrow, title, meta, right, hideSettings }: Props) {
  return (
    <header className="px-5 pt-10 pb-5 relative">
      {!hideSettings && (
        <Link
          to="/account"
          aria-label="settings"
          className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-muted/60 transition-colors"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </Link>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[11px] text-ink-soft lowercase mb-2 tracking-wide">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display font-light text-[40px] leading-[1] text-ink lowercase tracking-[-0.02em]">
            {title}
          </h1>
          {meta && (
            <div className="text-[11px] text-ink-mute lowercase mt-2">{meta}</div>
          )}
        </div>
        {right && <div className="shrink-0 pb-1 mr-12">{right}</div>}
      </div>
    </header>
  );
}
