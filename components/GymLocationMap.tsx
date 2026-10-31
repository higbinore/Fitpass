import { MapPin } from "lucide-react";

export default function GymLocationMap({ name, address, className = "" }: { name: string; address: string | null; className?: string }) {
  const query = address?.trim() ? `${name}, ${address.trim()}` : "";
  const mapUrl = query ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : null;
  const directionsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;

  return (
    <div className={className}>
      {mapUrl ? (
        <iframe
          title={`Map for ${name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-video w-full rounded-xl border border-slate-200 bg-slate-100"
          src={mapUrl}
        />
      ) : (
        <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">
          <MapPin className="mr-2 inline-block align-text-bottom text-green-700" size={16} />
          The gym has not published an address, so a map preview is unavailable.
        </p>
      )}
      {directionsUrl && (
        <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-green-800 px-4 text-sm font-semibold text-green-900 hover:bg-green-50">
          Open {name} in Google Maps
        </a>
      )}
    </div>
  );
}
