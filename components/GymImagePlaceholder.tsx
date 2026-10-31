import { Dumbbell } from "lucide-react";

export default function GymImagePlaceholder({ label = "Gym imagery will appear here when published", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={`grid min-h-36 place-items-center bg-[linear-gradient(145deg,#eaf3e8,#dce9dc_48%,#c8ddcf)] p-6 text-center ${className}`}>
      <span className="grid justify-items-center gap-3 text-green-950">
        <span className="grid size-14 place-items-center rounded-2xl bg-white/75 text-green-800 shadow-sm"><Dumbbell size={25} strokeWidth={1.8} /></span>
        <span className="max-w-xs text-sm font-semibold">{label}</span>
      </span>
    </div>
  );
}
