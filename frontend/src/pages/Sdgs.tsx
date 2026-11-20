import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useScroll, useInView, useSpring, useTransform } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { useRole, can, type Role } from '../state/store'
import { QueryError, AnimatedNumber } from '../components/ui'
import { num } from '../lib/format'

type Goal = {
  n: string
  title: string
  color: string
  primary: boolean
  contribution: string
  metric: (d: any) => { label: string; value: string }
  link: { to: string; label: string; min: Role }
}

const GOALS: Goal[] = [
  {
    n: '7', title: 'Affordable and Clean Energy', color: '#FCC30B', primary: true,
    contribution: 'Day-ahead solar bands (P10/P50/P90) plus a dispatch engine that moves EV charging into the cheapest, cleanest hours — cutting bills while absorbing more sunshine into the fleet.',
    metric: (d) => ({ label: 'Saved across all dispatches', value: d ? `${num(d.total_saved, 0)} (mixed currencies)` : '—' }),
    link: { to: '/solar', label: 'Open the solar forecast', min: 'manager' },
  },
  {
    n: '13', title: 'Climate Action', color: '#3F7E44', primary: true,
    contribution: 'Every kilowatt shifted is metered in CO₂ with a published marginal-factor methodology — and every claim lands in the ledger as an auditable receipt, not a slogan.',
    metric: (d) => ({ label: 'CO₂ avoided to date', value: d ? `${num(d.total_co2_kg, 0)} kg` : '—' }),
    link: { to: '/ledger', label: 'Open the carbon ledger', min: 'viewer' },
  },
  {
    n: '9', title: 'Industry, Innovation and Infrastructure', color: '#FD6925', primary: false,
    contribution: 'A virtual power plant that turns ordinary EV fleets and batteries into grid infrastructure — with a black-start copilot that rehearses recovery before the real storm hits.',
    metric: (d) => ({ label: 'Peak shaved off feeders', value: d ? `${num(d.total_peak_kw, 1)} kW` : '—' }),
    link: { to: '/vpp', label: 'Open VPP dispatch', min: 'operator' },
  },
  {
    n: '11', title: 'Sustainable Cities and Communities', color: '#FD9D24', primary: false,
    contribution: 'City-first region profiles — Dhaka, Berlin, PJM — with evening-peak relief and hospital-first load pickup, so dense communities stay powered through scarcity.',
    metric: (d) => ({ label: 'Logged dispatch decisions', value: d ? `${d.decisions}` : '—' }),
    link: { to: '/grid', label: 'Open grid recovery', min: 'manager' },
  },
  {
    n: '12', title: 'Responsible Consumption and Production', color: '#BF8B2E', primary: false,
    contribution: 'Thermal inspections catch wasteful panels before they burn energy for nothing, and efficient dispatch means less generation is needed for the same miles driven.',
    metric: (d) => ({ label: 'Decisions tracked with receipts', value: d ? `${d.decisions}` : '—' }),
    link: { to: '/panels', label: 'Open panel inspector', min: 'manager' },
  },
]

const FILES: Record<string, string> = { '7': 'sdg07.jpg', '9': 'sdg09.jpg', '11': 'sdg11.jpg', '12': 'sdg12.jpg', '13': 'sdg13.jpg' }

function GoalCard({ g, d, big }: { g: Goal; d: any; big?: boolean }) {
  const role = useRole()
  const linked = can(role, g.link.min)
  return (
    <div className="card card-lift overflow-hidden flex flex-col">
      <div className="h-1.5" style={{ background: g.color }} />
      <div className="p-4 flex gap-4 flex-1">
        <img src={`/sdgs/${FILES[g.n]}`} alt={`SDG ${g.n} — ${g.title} logo`}
          className={big ? 'w-28 h-28 md:w-32 md:h-32 rounded-lg shrink-0 object-cover' : 'w-20 h-20 rounded-lg shrink-0 object-cover'}
          loading="lazy" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded num" style={{ background: g.color, color: '#141A17' }}>SDG {g.n}</span>
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
              style={g.primary ? { background: 'rgba(224,167,58,.15)', color: '#E0A73A' } : { background: 'rgba(127,127,127,.12)', color: 'var(--muted)' }}>
              {g.primary ? 'Primary focus' : 'Secondary'}
            </span>
          </div>
          <h3 className={`font-serif-d mt-1 ${big ? 'text-2xl' : 'text-lg'} leading-tight`}>{g.title}</h3>
          <p className="muted text-sm mt-1.5 leading-relaxed">{g.contribution}</p>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-sm"><b className="num">{g.metric(d).value}</b> <span className="muted text-xs">· {g.metric(d).label}</span></span>
            {linked && (
              <Link to={g.link.to} className="text-xs font-semibold inline-flex items-center gap-1 underline" style={{ color: '#E0A73A' }}>
                {g.link.label} <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* Counter that starts counting only when scrolled into view */
function ViewCounter({ value, suffix = '' }: { value?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <span ref={ref} className="num">
      {inView && value !== undefined ? <AnimatedNumber value={value} decimals={0} suffix={suffix} /> : <>0{suffix}</>}
    </span>
  )
}

/* Animated scene widgets for the Bangla story */
function ScanWidget() {
  return (
    <div>
      <div className="scanbox border hairline" style={{ background: '#1B2420' }} role="img" aria-label="Animated drone thermal scan finding a hotspot">
        <svg viewBox="0 0 200 110" className="w-full block">
          {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
            <rect key={`${r}-${c}`} x={12 + c * 46} y={10 + r * 32} width={40} height={26} rx={3}
              fill="none" stroke="#3E7C86" strokeWidth={1.5} opacity={0.8} />
          )))}
          <g className="hotspot" stroke="#E0A73A" strokeWidth={1.4}>
            <line x1="150" y1="18" x2="150" y2="98" strokeDasharray="4 3" />
            <line x1="104" y1="58" x2="196" y2="58" strokeDasharray="4 3" />
          </g>
          <circle cx={150} cy={58} r={9} fill="#C2503A" className="hotspot" />
          <circle cx={150} cy={58} r={15} fill="none" stroke="#C2503A" strokeWidth={1.5} className="hotspot" />
          <g stroke="#E0A73A" strokeWidth={2.5} fill="none">
            <path d="M118,34 h10 v10" />
            <path d="M182,34 h-10 v10" />
            <path d="M118,82 h10 v-10" />
            <path d="M182,82 h-10 v-10" />
          </g>
        </svg>
        <div className="stamp-in absolute px-2 py-0.5 text-xs font-black tracking-widest" style={{ top: '8%', right: '4%', border: '2px solid #C2503A', color: '#C2503A', borderRadius: 4, background: 'rgba(13,18,16,.72)' }}>DETECTED - D2</div>
      </div>
      <div className="ticket-slide mt-1 rounded border hairline px-2 py-1.5 num text-[11px] leading-relaxed" style={{ background: 'rgba(127,127,127,.06)' }}>
        <div>D2 - DIODE FAULT - dT +18.2C</div>
        <div className="muted">EST LOSS Tk 4,180/yr - CREW DISPATCHED</div>
      </div>
      <p className="muted text-[11px] mt-1">ড্রোন স্ক্যান চলছে… <span className="num">D2</span> ডায়োডে লাল দাগ — মরার আগেই ধরা পড়েছে।</p>
    </div>
  )
}

/* Sun-and-demand dial: why night charging wins (SDG 7, accurate shapes) */
function NightReplayWidget() {
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [hour, setHour] = useState(0);
  useEffect(() => {
    try {
      const s = svgRef.current as any;
      if (s) { if (playing) s.unpauseAnimations(); else s.pauseAnimations(); }
    } catch { /* SMIL control unavailable */ }
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      try {
        const t = (svgRef.current as any)?.getCurrentTime?.() || 0;
        const next = ((t % 14) / 14) * 24;
        setHour((prev) => (Math.abs(next - prev) > 0.03 ? next : prev));
      } catch { /* noop */ }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const replay = () => {
    try { (svgRef.current as any)?.setCurrentTime?.(0) } catch { /* noop */ }
    setHour(0); setPlaying(true);
  };
  const charging = hour >= 1 && hour < 4.5;
  const kwh = charging ? Math.max(0, hour - 1) * 11 : hour >= 4.5 ? 38.5 : 0;
  const hh = String(Math.floor(hour)).padStart(2, '0');
  const mm = String(Math.floor((hour - Math.floor(hour)) * 60)).padStart(2, '0');
  return (
    <div>
      <svg ref={svgRef} viewBox="0 0 300 132" className="w-full" role="img" aria-label="Interactive 24 hour replay of the night charging window">
        {[30, 60, 90].map((y) => (
          <line key={y} x1="20" y1={y} x2="280" y2={y} stroke="var(--line)" strokeWidth={1} opacity={0.6} />
        ))}
        <path d="M85,98 Q150,18 215,98" fill="#E0A73A" fillOpacity={0.16} stroke="#E0A73A" strokeWidth={2} />
        <path d="M20,78 L85,72 L128,58 L172,54 L204,48 L226,30 L247,52 L258,62 L280,76"
          fill="none" stroke="#C2503A" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={226} cy={30} r={4} fill="#C2503A" />
        <text x={226} y={20} textAnchor="middle" fontSize={8} fill="#C2503A">7pm peak</text>
        <rect x={31} y={88} width={38} height={12} rx={6} fill="#E0A73A" opacity={0.55} className="node-pulse" />
        <text x={50} y={84} textAnchor="middle" fontSize={8} fill="#E0A73A">charge window</text>
        <circle r={10} fill="#E0A73A" opacity={0.25} className="dial-glow">
          <animateMotion dur="14s" repeatCount="indefinite" path="M20,108 H280" />
        </circle>
        <circle r={4.5} fill="#E0A73A">
          <animateMotion dur="14s" repeatCount="indefinite" path="M20,108 H280" />
        </circle>
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={20 + h * 10.833} y={124} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>{h}</text>
        ))}
      </svg>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="num text-sm font-bold tabular-nums" style={{ color: charging ? '#E0A73A' : 'inherit' }}>{hh}:{mm}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={charging
            ? { background: 'rgba(224,167,58,.18)', color: '#E0A73A' }
            : { background: 'rgba(127,127,127,.12)', color: 'var(--muted)' }}>
          {charging ? 'CHARGING · 11 kW' : hour >= 4.5 ? 'DONE · FLEET READY' : 'WAITING FOR 1AM'}
        </span>
        <span className="num text-xs muted ml-auto">{kwh.toFixed(1)} kWh banked</span>
        <button className="btn-ghost text-xs !py-1 no-print" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause replay' : 'Play replay'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button className="btn-ghost text-xs !py-1 no-print" onClick={replay} aria-label="Replay the night">Replay</button>
      </div>
      <div className="flex gap-3 text-[11px] muted mt-2">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: '#E0A73A' }} /> solar</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: '#C2503A' }} /> demand</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{ background: '#E0A73A' }} /> night charge</span>
      </div>
    </div>
  )
}

const RESTORE_STEPS = ['দ্বীপ', 'ক্র্যাংক', 'করিডোর', 'হাসপাতাল', 'সিঙ্ক']

function RestoreWidget({ co2 }: { co2?: number }) {
  return (
    <div>
      <svg viewBox="0 0 300 52" className="w-full mt-1" role="img" aria-label="Network re-energizing step by step">
        <line x1="16" y1="14" x2="284" y2="14" stroke="var(--line)" strokeWidth={3} strokeLinecap="round" />
        <line x1="16" y1="14" x2="284" y2="14" stroke="#5F8F6B" strokeWidth={3} strokeLinecap="round" className="draw-line" />
        {[0, 1].map((k) => (
          <circle key={k} r={4} fill="#E0A73A">
            <animateMotion dur="4s" begin={`${-k * 2}s`} repeatCount="indefinite" path="M16,14 H284" />
          </circle>
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <circle cx={16 + i * 67} cy={14} r={8} fill="#5F8F6B" className="restore-svgdot" style={{ animationDelay: `${i * 0.5}s` }} />
            <text x={16 + i * 67} y={38} textAnchor="middle" fontSize={8.5} fill="currentColor" opacity={0.75}>{RESTORE_STEPS[i]}</text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] num muted mt-1">50.0 Hz · 1.00 pu · <span style={{ color: '#5F8F6B' }}>stable ✓</span></p>
      <p className="text-sm mt-1">এ পর্যন্ত বাঁচানো CO₂: <b><ViewCounter value={co2} suffix=" kg" /></b></p>
    </div>
  )
}

type Beat = {
  img: string; alt: string; cap: string; tag: string; color: string;
  time: string; title: string; paras: string[]; quote: string; quoteby: string;
  widget: 'scan' | 'charge' | 'restore';
}

const STORY: Beat[] = [
  {
    img: '/sdgs/story-solar.jpg', alt: 'টিনের চালে বসানো সোলার প্যানেল',
    cap: 'টিনের চালে সোলার হোম সিস্টেম — ছবি: Wikimedia Commons',
    tag: 'লক্ষ্য ৭ · লক্ষ্য ১২', color: '#FCC30B',
    time: 'ভোর ৬টা · গাজীপুর',
    title: 'করিমের ড্রোন আগে ভাগেই লাল দাগটা দেখে ফেলে',
    paras: [
      'করিম সোলার টেকনিশিয়ান। ভোর ছয়টায় কারখানার ছাদে ড্রোন ওড়ান — রুটিন কাজ। কিন্তু আজ স্ক্রিনে এক কোণে লাল দাগ: D2 ডায়োড মরতে বসেছে।',
      'আগে এমন দাগ মাসের পর মাস নজর এড়িয়ে যেত; একটা স্ট্রিং মরে গেলে টের পাওয়া যেত বিল হাতে পেয়ে। আজ সকাল আটটার আগেই রিপোর্ট জমা — মেরামতের দল দুপুরের আগেই রওনা। এক ফোঁটা রোদও অপচয় নয়।',
    ],
    quote: 'আগে বিল দেখে বুঝতাম প্যানেল মরেছে। এখন প্যানেল মরার আগেই জানি।',
    quoteby: 'করিম, সোলার টেকনিশিয়ান',
    widget: 'scan',
  },
  {
    img: '/sdgs/story-grid.jpg', alt: 'আকাশের নিচে সঞ্চালন টাওয়ার ও লাইন',
    cap: 'সঞ্চালন টাওয়ার ও লাইন — ছবি: Wikimedia Commons',
    tag: 'লক্ষ্য ৭ · লক্ষ্য ৯ · লক্ষ্য ১১', color: '#FD6925',
    time: 'সন্ধ্যা ৭টা · ঢাকার ডিপো',
    title: 'রহিমের বারোটা ভ্যান ভোর ৬টায় রাস্তায় নামতেই হবে',
    paras: [
      'রহিমের ডিপোতে বারোটা ডেলিভারি ভ্যান — ভোর ৬টায় সব গাড়ি রাস্তায় নামতেই হবে। আগে নিয়ম ছিল সহজ: সন্ধ্যা ৭টায় সব গাড়ি একসাথে চার্জে, ঠিক যখন পুরো ঢাকা লাইট জ্বালে। ফল? ট্রিপ করা ফিডার, চড়া বিল, আর মাঝরাতে ফোন — “স্যার, তিনটা গাড়ি হাফ-চার্জ।”',
      'এখন রহিম সন্ধ্যায় শুধু একটা বোতাম চাপেন। রাত ১টা থেকে ভোর ৪টার সস্তা ঘণ্টায় চার্জ সাজে, প্রতিটি গাড়ির “ভোর ৬টার নিশ্চয়তা” স্লিপসহ। পাশের হাসপাতালের লোড ওঠে সবার আগে।',
    ],
    quote: 'এখন আমি ঘুমাই, গ্রিড জেগে থাকে।',
    quoteby: 'রহিম, ফ্লিট ম্যানেজার, ঢাকা',
    widget: 'charge',
  },
  {
    img: '/sdgs/story-flood.jpg', alt: 'বন্যায় প্লাবিত ফসলি মাঠ',
    cap: '২০১৬ সালের বন্যায় প্লাবিত মাঠ, বাংলাদেশ — ছবি: Wikimedia Commons',
    tag: 'লক্ষ্য ১৩ · লক্ষ্য ৯', color: '#3F7E44',
    time: 'বর্ষার রাত · উপকূল',
    title: 'ঝড়ের রাতে শহর জেগে থাকে, কারণ মহড়া আগেই হয়ে গেছে',
    paras: [
      'ঘূর্ণিঝড়ের রাতে লাইন পড়ে গেলে একসময় মানে ছিল ঘণ্টার পর ঘণ্টা অন্ধকার। এখন ঝড়ের আগেই মহড়া হয় — দ্বীপ-গ্রিড, হাসপাতাল আগে, সোলার-ব্যাটারি সিঙ্ক। যে মাঠ বর্ষায় ডুবে, সেই মাঠ মনে করিয়ে দেয়: এখানে বাঁচানো প্রতিটি কিলোওয়াট মানেই কম কার্বন।',
      'আর প্রতিটি বাঁচানো কিলোওয়াটের রসিদ জমা হয় লেজারে — মার্জিনাল ফ্যাক্টরে মাপা, যাচাইযোগ্য, সবার চোখের সামনে।',
    ],
    quote: 'মহড়ার রাতগুলোই আসল রাতগুলোকে বাঁচায়।',
    quoteby: 'নাসরিন, গ্রিড অপারেটর',
    widget: 'restore',
  },
]

function StoryBeat({ beat, flip, co2 }: { beat: Beat; flip: boolean; co2?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="grid md:grid-cols-2 gap-4 p-5 md:p-6 items-start">
      <div className={flip ? 'md:order-2' : ''}>
        <div className="overflow-hidden rounded-xl border hairline">
          <img src={beat.img} alt={beat.alt} loading="lazy" draggable={false}
            className="kenburns w-full h-56 md:h-64 object-cover block" />
        </div>
        <p className="muted text-[11px] mt-1">{beat.cap}</p>
        <div className="mt-3">
          {beat.widget === 'scan' && <ScanWidget />}
          {beat.widget === 'charge' && <NightReplayWidget />}
          {beat.widget === 'restore' && <RestoreWidget co2={co2} />}
        </div>
      </div>
      <div className={flip ? 'md:order-1' : ''}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="num text-[11px] muted">{beat.time}</span>
          <motion.span
          initial={{ scale: 0.6, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }} transition={{ type: 'spring', stiffness: 320, damping: 17 }}
          className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-block" style={{ background: beat.color, color: '#141A17' }}>{beat.tag}</motion.span>
        </div>
        <h3 className="font-serif-d text-xl mt-2 leading-snug">{beat.title}</h3>
        {beat.paras.map((p, i) => <p key={i} className="text-sm mt-2 leading-relaxed">{p}</p>)}
        <blockquote className="mt-3 pl-3 text-sm italic" style={{ borderLeft: '3px solid #E0A73A' }}>
          “{beat.quote}”
          <footer className="muted text-xs mt-1 not-italic">— {beat.quoteby}</footer>
        </blockquote>
      </div>
    </motion.div>
  )
}

export function Sdgs() {
  const ledger = useQuery({ queryKey: ['ledger-sum'], queryFn: api.ledgerSummary })
  const d = ledger.data
  const storyRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ['start end', 'end start'] })
  const storyProgress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.6 })
  const railDot = useTransform(storyProgress, [0, 1], ['2%', '98%'])
  const primaries = GOALS.filter((g) => g.primary)
  const secondaries = GOALS.filter((g) => !g.primary)
  return (
    <div className="space-y-5 max-w-5xl">
      <div className="fade-up">
        <div className="flex items-center gap-2">
          <h1 className="font-serif-d text-3xl tracking-tight">Sustainable Development Goals</h1>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#E0A73A', color: '#141A17' }}>5 goals in focus</span>
        </div>
        <p className="muted text-sm mt-1 max-w-2xl">
          This platform exists to move these five UN goals — every number below is
          computed live from the savings ledger, not written by hand.
        </p>
      </div>

      {ledger.isError && !d ? <QueryError message={(ledger.error as Error)?.message} onRetry={() => ledger.refetch()} /> : (
      <>
      <div className="grid md:grid-cols-2 gap-3 stagger">
        {primaries.map((g) => (
          <GoalCard key={g.n} g={g} d={d} big />
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
        {secondaries.map((g) => (
          <GoalCard key={g.n} g={g} d={d} />
        ))}
        <div className="card p-4 flex flex-col justify-center fade-up" style={{ borderColor: '#E0A73A66' }}>
          <div className="font-serif-d text-2xl num">{d ? num(d.total_co2_kg, 0) : '—'} kg</div>
          <div className="muted text-xs mt-1 uppercase tracking-wide">Combined CO₂ avoided across goals 7 · 13</div>
          <div className="mt-3 pt-3 border-t hairline">
            <div className="muted text-xs uppercase tracking-wide">Receipts issued</div>
            <div className="font-serif-d text-2xl num mt-0.5">{d ? num(d.decisions, 0) : '—'}</div>
            <div className="muted text-xs mt-0.5">Every claim has a ledger entry</div>
          </div>
          <Link to="/ledger" className="text-xs font-semibold inline-flex items-center gap-1 underline mt-2" style={{ color: '#E0A73A' }}>
            Verify in the ledger <ArrowRight size={12} />
          </Link>
        </div>
      </div>
      </>
      )}

      {/* Bangladesh story, in Bangla — a real day, three real jobs */}
      <div className="card overflow-hidden" lang="bn" ref={storyRef}>
        <motion.div style={{ scaleX: storyProgress, transformOrigin: '0 50%', background: '#E0A73A' }} className="h-1" aria-hidden />
        <div className="p-5 md:p-6 pb-0 fade-up">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif-d text-2xl tracking-tight">বাংলাদেশের গল্প: একদিন, তিনজন, একটাই চক্র</h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#5F8F6B', color: '#fff' }}>বাস্তব গল্প</span>
          </div>
          <p className="muted text-sm mt-1">করিমের ছাদ, রহিমের ডিপো, নাসরিনের কন্ট্রোল রুম — একদিনের ভেতর তিনটি পেশা, তিনটি ঘড়ি, একটাই সিদ্ধান্ত-চক্র।</p>
        </div>
        <div className="divide-y relative md:pl-12" style={{ borderColor: 'var(--line)' }}>
          <div className="hidden md:block absolute left-5 top-6 bottom-6 w-px" style={{ background: 'var(--line)' }} aria-hidden>
            <motion.div className="absolute inset-0 origin-top" style={{ scaleY: storyProgress, background: '#E0A73A' }} />
            <motion.div className="absolute w-3 h-3 rounded-full" style={{ top: railDot, left: -5.5, background: '#E0A73A', boxShadow: '0 0 10px rgba(224,167,58,.8)' }} />
          </div>
          {STORY.map((beat, i) => (
            <StoryBeat key={beat.title} beat={beat} flip={i % 2 === 1} co2={d?.total_co2_kg} />
          ))}
        </div>
        <div className="mx-5 md:mx-6 mb-5 md:mb-6 rounded-xl p-4 fade-up" style={{ background: 'rgba(224,167,58,.08)', border: '1px solid #E0A73A55' }}>
          <p className="text-sm leading-relaxed"><b>শেষ কথা:</b> তিনটি শিফট, তিনটি ভোর — একটাই চক্র: পূর্বাভাস → অপ্টিমাইজ → ডিসপ্যাচ → প্রমাণ। করিমের ছাদে রোদ বাঁচে, রহিমের ডিপোতে বিল বাঁচে, নাসরিনের গ্রিডে শহর বাঁচে। <b>কম বিল, কম কার্বন, আর অন্ধকারে না থাকা — এটাই গল্পের শেষ লাইন।</b></p>
          <Link to="/ledger" className="text-xs font-bold inline-flex items-center gap-1 underline mt-2" style={{ color: '#E0A73A' }}>
            লেজারে প্রমাণ দেখুন <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="card p-5 fade-up overflow-hidden relative">
        <div className="h-1 absolute top-0 left-0 right-0" style={{ background: '#E0A73A' }} aria-hidden />
        <h3 className="font-serif-d text-xl">গল্পের সংখ্যায় প্রভাব — লেজার থেকে সরাসরি</h3>
        <p className="muted text-xs mt-1">স্ক্রল করলেই সংখ্যাগুলো গুনে ওঠে — প্রতিটি এই প্ল্যাটফর্মের ভেতরেই মাপা।</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 stagger">
          {[
            { l: 'টাকা সাশ্রয়', v: d?.total_saved, s: '' },
            { l: 'CO₂ কমেছে', v: d?.total_co2_kg, s: ' kg' },
            { l: 'পিক কমেছে', v: d?.total_peak_kw, s: ' kW' },
            { l: 'সিদ্ধান্তের রসিদ', v: d?.decisions, s: '' },
          ].map((s, i) => (
            <div key={s.l} className="rounded-xl p-3 border hairline" style={{ background: 'rgba(127,127,127,.05)', animationDelay: `${i * 70}ms` }}>
              <div className="muted text-[11px] uppercase tracking-wide">{s.l}</div>
              <div className="font-serif-d text-2xl mt-0.5"><ViewCounter value={s.v} suffix={s.s} /></div>
            </div>
          ))}
        </div>
      </div>

      <p className="muted text-[11px] fade-up">
        SDG icons © United Nations (sdgs.un.org), shown for informational purposes.
        Story photos: Wikimedia Commons contributors (CC BY-SA).
        Metrics refresh from the ledger — seed demo data or run a dispatch to watch them move.
      </p>
    </div>
  )
}
