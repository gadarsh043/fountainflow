import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import {
  Music,
  Cpu,
  Play,
  Download,
  Zap,
  Waves,
  Code2,
  ArrowRight,
  Star,
  Check,
  ChevronRight,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Music,
    title: 'AI Audio Analysis',
    description:
      'Beat tracking, section detection, and 6-band frequency decomposition powered by madmom and librosa. Works with any genre.',
  },
  {
    icon: Waves,
    title: '3D Preview Simulation',
    description:
      'GPU-accelerated particle simulation with 50,000+ water particles and real-time audio sync. See exactly what your fountain will do.',
  },
  {
    icon: Code2,
    title: 'Multi-Platform Code',
    description:
      'Download ready-to-flash Arduino .ino, ESP32 firmware, DMX Art-Net binary, JSON timeline, or CSV — for any hardware setup.',
  },
  {
    icon: Zap,
    title: 'Physics-Accurate',
    description:
      'Pump affinity law (H ∝ N²), valve timing constraints, VFD ramp rates — all modeled correctly so your fountain performs as designed.',
  },
  {
    icon: Cpu,
    title: 'Hardware Config Wizard',
    description:
      'Start from preset templates (100×30ft commercial, municipal, garden, hobbyist) or define custom nozzle configurations.',
  },
  {
    icon: Play,
    title: 'Real-Time Processing',
    description:
      'Track job progress stage-by-stage: beat analysis → choreography generation → code output. Typically under 2 minutes.',
  },
] as const;

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Configure Your Fountain',
    description:
      'Select a preset template or use our wizard to define your nozzle types, pump setup, LED count, and target hardware platform.',
  },
  {
    step: '02',
    title: 'Upload Your Song',
    description:
      'Upload any MP3 or WAV (up to 200 MB). Our Python worker analyzes beats, sections, and frequency bands — all server-side.',
  },
  {
    step: '03',
    title: 'Preview & Download',
    description:
      'Watch the 3D simulation synced to your audio, then download the generated control code for your target platform.',
  },
] as const;

const PLATFORMS = [
  { name: 'Arduino Mega', icon: '⚡', description: '.ino + SD card binary' },
  { name: 'ESP32', icon: '📡', description: 'SPIFFS + WiFi trigger' },
  { name: 'DMX Art-Net', icon: '🎭', description: '512-channel binary frames' },
  { name: 'JSON Timeline', icon: '{}', description: 'Universal keyframe format' },
  { name: 'CSV Export', icon: '📊', description: 'Spreadsheet-compatible' },
  { name: 'Modbus RTU', icon: '🔌', description: 'Industrial controller' },
] as const;

const PRICING = [
  {
    name: 'Hobbyist',
    price: 'Free',
    period: 'forever',
    description: 'Perfect for home fountain projects',
    features: [
      '3 projects',
      'Songs up to 5 minutes',
      'Arduino & JSON export',
      '3D preview',
      'Community support',
    ],
    cta: 'Get Started Free',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '$29',
    period: 'per month',
    description: 'For fountain designers and installers',
    features: [
      'Unlimited projects',
      'Songs up to 60 minutes',
      'All export formats',
      'Priority processing',
      'Email support',
      'Custom preset templates',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For large commercial fountain systems',
    features: [
      'Unlimited everything',
      'On-premise deployment',
      'Custom hardware integrations',
      'SLA guarantee',
      'Dedicated support',
      'API access',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <nav className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <Waves className="h-6 w-6 text-fountain-400" />
            <span className="text-gradient">FountainFlow</span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#platforms" className="hover:text-foreground transition-colors">
              Platforms
            </Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Sign In
                </button>
              </SignInButton>
              <SignInButton mode="modal">
                <button className="rounded-md bg-fountain-500 px-4 py-2 text-sm font-medium text-white hover:bg-fountain-400 transition-colors">
                  Get Started Free
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 py-24 md:py-36 lg:py-48">
          {/* Background gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-fountain-500/10 blur-[120px]" />
            <div className="absolute top-1/3 -left-20 h-[400px] w-[400px] rounded-full bg-fountain-700/15 blur-[100px]" />
            <div className="absolute top-1/4 -right-20 h-[350px] w-[350px] rounded-full bg-fountain-300/10 blur-[100px]" />
          </div>

          <div className="container relative text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-fountain-500/30 bg-fountain-500/10 px-4 py-1.5 text-sm text-fountain-400">
              <Zap className="h-3.5 w-3.5" />
              Now with GPU-accelerated 3D simulation
            </div>

            <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
              Convert any song to{' '}
              <span className="text-gradient">fountain choreography</span> in minutes
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Upload a song, configure your fountain hardware, and get downloadable control code for
              Arduino, DMX, ESP32 and more — with a stunning 3D simulation preview.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="group flex items-center gap-2 rounded-lg bg-fountain-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-fountain-500/25 hover:bg-fountain-400 transition-all hover:shadow-fountain-400/30 hover:scale-105">
                    Get Started Free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="group flex items-center gap-2 rounded-lg bg-fountain-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-fountain-500/25 hover:bg-fountain-400 transition-all hover:shadow-fountain-400/30 hover:scale-105"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </SignedIn>
              <Link
                href="#how-it-works"
                className="flex items-center gap-2 rounded-lg border border-border px-8 py-3.5 text-base font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <Play className="h-4 w-4" />
                See How It Works
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <span>Loved by fountain designers</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">50,000+</span>
                <span>particles rendered per scene</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">6</span>
                <span>export platforms supported</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="px-4 py-24 bg-secondary/20">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl">
                Everything you need to{' '}
                <span className="text-gradient">orchestrate water and music</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                From beat analysis to ready-to-flash firmware — FountainFlow handles the entire
                pipeline.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="group glass rounded-xl p-6 hover:border-fountain-500/40 transition-all hover:glow-blue-sm"
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-fountain-500/15 text-fountain-400 group-hover:bg-fountain-500/25 transition-colors">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="px-4 py-24">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl">
                From upload to <span className="text-gradient">showtime</span> in 3 steps
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3 relative">
              {/* Connecting lines */}
              <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-fountain-500/50 to-fountain-500/50" />

              {HOW_IT_WORKS.map((step, index) => (
                <div key={step.step} className="relative flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="h-16 w-16 rounded-full bg-fountain-500/20 border border-fountain-500/40 flex items-center justify-center glow-blue-sm">
                      <span className="text-2xl font-bold text-fountain-400">{step.step}</span>
                    </div>
                    {index < HOW_IT_WORKS.length - 1 && (
                      <ChevronRight className="hidden md:block absolute -right-8 top-1/2 -translate-y-1/2 h-5 w-5 text-fountain-500/50" />
                    )}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported Platforms */}
        <section id="platforms" className="px-4 py-24 bg-secondary/20">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl">
                Works with <span className="text-gradient">any hardware platform</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Whether you&apos;re running a hobby project on Arduino or a commercial show on
                Art-Net, FountainFlow generates the right code.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLATFORMS.map((platform) => (
                <div
                  key={platform.name}
                  className="glass rounded-xl p-5 flex items-center gap-4 hover:border-fountain-500/30 transition-all"
                >
                  <span className="text-3xl">{platform.icon}</span>
                  <div>
                    <h3 className="font-semibold">{platform.name}</h3>
                    <p className="text-sm text-muted-foreground">{platform.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="px-4 py-24">
          <div className="container">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl">
                Simple, transparent <span className="text-gradient">pricing</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Start free. Upgrade when you need more projects or export formats.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {PRICING.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl p-8 flex flex-col ${
                    plan.highlighted
                      ? 'bg-fountain-500/15 border border-fountain-500/50 glow-blue'
                      : 'glass'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-fountain-500 px-4 py-1 text-xs font-semibold text-white">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground text-sm ml-2">/{plan.period}</span>
                    </div>
                  </div>

                  <ul className="space-y-3 flex-1 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm">
                        <Check className="h-4 w-4 text-fountain-400 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <SignedOut>
                    <SignInButton mode="modal">
                      <button
                        className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                          plan.highlighted
                            ? 'bg-fountain-500 text-white hover:bg-fountain-400'
                            : 'border border-border hover:bg-secondary text-foreground'
                        }`}
                      >
                        {plan.cta}
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      href="/dashboard"
                      className={`w-full text-center rounded-lg py-2.5 text-sm font-semibold transition-all ${
                        plan.highlighted
                          ? 'bg-fountain-500 text-white hover:bg-fountain-400'
                          : 'border border-border hover:bg-secondary text-foreground'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </SignedIn>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 py-24 bg-secondary/20">
          <div className="container text-center max-w-3xl mx-auto">
            <div className="glass rounded-3xl p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-fountain-500/10 to-transparent pointer-events-none" />
              <Waves className="mx-auto mb-6 h-12 w-12 text-fountain-400 animate-float" />
              <h2 className="text-3xl font-bold md:text-4xl mb-4">
                Ready to bring your fountain to life?
              </h2>
              <p className="text-muted-foreground mb-8">
                Join fountain designers and hobbyists creating stunning water shows with
                FountainFlow.
              </p>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="group inline-flex items-center gap-2 rounded-lg bg-fountain-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-fountain-500/25 hover:bg-fountain-400 transition-all hover:scale-105">
                    Get Started Free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/project/new"
                  className="group inline-flex items-center gap-2 rounded-lg bg-fountain-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-fountain-500/25 hover:bg-fountain-400 transition-all hover:scale-105"
                >
                  Create New Project
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </SignedIn>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Waves className="h-4 w-4 text-fountain-400" />
            <span>FountainFlow</span>
            <span>—</span>
            <span>Music-Synchronized Fountain Choreography</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Docs
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
