import GymDirectory from "./GymDirectory";
import PublicSiteHeader from "../PublicSiteHeader";

export default function GymsPage() {
  return <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <PublicSiteHeader subtitle="Find your gym" />
    <section className="mx-auto max-w-5xl py-10 sm:py-14"><p className="text-sm font-bold uppercase tracking-widest text-green-700">Find your gym</p><h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Explore FitPass gyms</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Each gym sets its own membership plans and prices. Choose a gym to view its current options before you sign in or join.</p><GymDirectory /></section>
  </main>;
}
