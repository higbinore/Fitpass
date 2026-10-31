import { MapPin } from "lucide-react";
import { buildGoogleMapsDirectionsUrl, buildGoogleMapsEmbedUrl } from "@/lib/google-maps";

export default function GymLocationMap({ name, address, className = "" }: { name: string; address: string | null; className?: string }) {
  const mapUrl = buildGoogleMapsEmbedUrl(name, address, process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const directionsUrl = buildGoogleMapsDirectionsUrl(name, address);

  return (
    <div className={className}>
      {mapUrl ? (
        <iframe
          title={`Map for ${name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className="aspect-video w-full rounded-xl border border-slate-200 bg-slate-100"
          src={mapUrl}
        />
      ) : (
        <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">
          <MapPin className="mr-2 inline-block align-text-bottom text-green-700" size={16} />
          {address?.trim()
            ? `Map preview is unavailable until the Google Maps Embed API key is configured. Published address: ${address.trim()}`
            : "The gym has not published an address, so a map preview is unavailable."}
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
