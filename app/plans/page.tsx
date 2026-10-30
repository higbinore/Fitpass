import GymDirectory from "../gyms/GymDirectory";
import PublicSiteHeader from "../PublicSiteHeader";

export default function MembershipPlansPage() {
  return <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <PublicSiteHeader subtitle="Membership plans" />
    <section className="mx-auto max-w-5xl py-10 sm:py-14"><p className="text-sm font-bold uppercase tracking-widest text-green-700">Gym membership pricing</p><h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Plans and prices by gym</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Membership prices are set by each participating gym and are not universal FitPass prices. Browse a gym to see its real, currently available plans, duration, and description.</p><GymDirectory /></section>
  </main>;
}
