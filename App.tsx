import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Sparkles,
  Timer,
  Settings,
  LogOut,
  History,
  Info,
  ShieldAlert
} from "lucide-react";
import confetti from "canvas-confetti";
import { useAuth } from "./components/FirebaseProvider";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  doc,
  query,
  getDocs,
  limit,
  orderBy
} from "firebase/firestore";
import { db } from "./lib/firebase";

type AppState = "auth" | "browsing" | "intercepted" | "thinking" | "reframed" | "focus" | "settings" | "history";

interface ReframeResponse {
  text: string;
}

export default function App() {
  const { currentUser, preferences, loading, signInWithGoogle, signOut, updatePreferences } = useAuth();
  const [appState, setAppState] = useState<AppState>("browsing");
  const [emotion, setEmotion] = useState<string>("");
  const [task, setTask] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [scrollingDetected, setScrollingDetected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const monitorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const emotions = ["Overwhelmed", "Bored", "Anxious", "Tired", "Restless"];

  useEffect(() => {
    // Cleanup monitoring on unmount
    return () => {
      if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
    };
  }, []);

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          // @ts-ignore
          displaySurface: "window" 
        } 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      videoRef.current = video;
      setIsMonitoring(true);
      
      // Start analysis loop
      runMonitoringLoop();
    } catch (err) {
      console.error("Screen capture failed:", err);
      alert("Shield Mode requires Screen Sharing permission to monitor for doomscrolling.");
    }
  };

  const stopMonitoring = () => {
    if (monitorTimeoutRef.current) clearTimeout(monitorTimeoutRef.current);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
    setIsMonitoring(false);
    videoRef.current = null;
  };

  const runMonitoringLoop = async () => {
    if (!videoRef.current || !isMonitoring) return;

    try {
      // Capture frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.5);
        
        // Send to Gemini
        const res = await fetch("/api/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageData }),
        });
        
        const data = await res.json();
        if (data.isDoomscrolling && data.confidence > 0.7) {
          setScrollingDetected(true);
          // Auto trigger if confidence is high
          if (data.confidence > 0.9) triggerInterception();
        }
      }
    } catch (err) {
      console.error("Monitor loop error:", err);
    }

    // Schedule next check (every 10s)
    monitorTimeoutRef.current = setTimeout(runMonitoringLoop, 10000);
  };

  useEffect(() => {
    if (!loading && !currentUser) {
      setAppState("auth");
    } else if (currentUser && appState === "auth") {
      setAppState("browsing");
    }
  }, [currentUser, loading]);

  const triggerInterception = () => {
    setAppState("intercepted");
    setScrollingDetected(false);
  };

  const handleGetReframe = async () => {
    if (!emotion || !task || !currentUser) return;
    
    setAppState("thinking");
    setError(null);
    
    try {
      const res = await fetch("/api/reframe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          emotion, 
          task, 
          preferences: preferences || undefined 
        }),
      });
      
      if (!res.ok) throw new Error("Failed to connect to Speedbump AI");
      
      const data: ReframeResponse = await res.json();
      setAiResponse(data.text);
      
      // Save session to Firestore
      const sessionRef = await addDoc(collection(db, "users", currentUser.uid, "sessions"), {
        userId: currentUser.uid,
        emotion,
        task,
        aiResponse: data.text,
        timestamp: serverTimestamp(),
        completed: false
      });
      setCurrentSessionId(sessionRef.id);
      
      setAppState("reframed");
    } catch (err: any) {
      setError(err.message);
      setAppState("intercepted");
    }
  };

  const startFocus = async () => {
    if (currentUser && currentSessionId) {
      // Mark session as completed (intention set)
      await updateDoc(doc(db, "users", currentUser.uid, "sessions", currentSessionId), {
        completed: true
      });
    }
    
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#5A5A40", "#A35D4B", "#FAF9F6"]
    });
    setAppState("focus");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-natural-bg flex items-center justify-center">
        <Sparkles className="animate-pulse text-natural-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-natural-surface border-[6px] border-[#2D2D2A] rounded-[3.5rem] h-[800px] relative overflow-hidden shadow-2xl">
        {/* Status Bar Mockup */}
        <div className="h-10 w-full bg-transparent flex items-center justify-between px-10 text-[11px] font-bold text-natural-text/40 z-50">
          <span>9:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-3 h-2 rounded-[2px] bg-natural-text/20" />
            <div className="w-3 h-2 rounded-[2px] bg-natural-text/40" />
            <div className="w-4 h-2 rounded-[2px] border border-natural-text/40 flex items-center justify-start p-[1px]">
              <div className="h-full w-2/3 bg-natural-text/60" />
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {appState === "auth" && (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <AuthView onSignIn={signInWithGoogle} />
            </motion.div>
          )}

          {appState === "browsing" && (
            <motion.div key="browsing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <BrowsingView 
                onTrigger={triggerInterception} 
                onGoSettings={() => setAppState("settings")}
                onGoHistory={() => setAppState("history")}
                scrollingDetected={scrollingDetected}
                setScrollingDetected={setScrollingDetected}
                isMonitoring={isMonitoring}
                onToggleMonitor={isMonitoring ? stopMonitoring : startMonitoring}
              />
            </motion.div>
          )}

          {appState === "settings" && (
            <motion.div key="settings" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="absolute inset-0 z-50">
              <SettingsView 
                preferences={preferences} 
                onUpdate={updatePreferences} 
                onBack={() => setAppState("browsing")}
                onSignOut={signOut}
              />
            </motion.div>
          )}

          {appState === "history" && (
            <motion.div key="history" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="absolute inset-0 z-50">
              <HistoryView onBack={() => setAppState("browsing")} />
            </motion.div>
          )}

          {appState === "intercepted" && (
            <motion.div 
              key="intercepted"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-natural-surface z-40"
            >
              <InterceptionView 
                emotions={emotions}
                onBack={() => setAppState("browsing")}
                emotion={emotion}
                setEmotion={setEmotion}
                task={task}
                setTask={setTask}
                onNext={handleGetReframe}
                error={error}
              />
            </motion.div>
          )}

          {appState === "thinking" && (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50">
              <ThinkingView />
            </motion.div>
          )}

          {appState === "reframed" && (
            <motion.div 
              key="reframed"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className="absolute inset-0 z-40"
            >
              <ReframedView 
                response={aiResponse}
                onAccept={startFocus}
                onBack={() => setAppState("intercepted")}
              />
            </motion.div>
          )}

          {appState === "focus" && (
            <motion.div key="focus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50">
              <FocusView onDone={() => setAppState("browsing")} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-natural-text/10 rounded-full" />
      </div>
    </div>
  );
}

function BrowsingView({ 
  onTrigger, 
  onGoSettings, 
  onGoHistory,
  scrollingDetected,
  setScrollingDetected,
  isMonitoring,
  onToggleMonitor
}: { 
  onTrigger: () => void, 
  onGoSettings: () => void, 
  onGoHistory: () => void,
  scrollingDetected: boolean,
  setScrollingDetected: (val: boolean) => void,
  isMonitoring: boolean,
  onToggleMonitor: () => void
}) {
  const posts = [
    { id: 1, user: "travel_junkie", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=60" },
    { id: 2, user: "gadget_guru", img: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop&q=60" },
    { id: 3, user: "foodie_vibes", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=60" },
    { id: 4, user: "arch_daily", img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=60" },
  ];

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current;
      if (scrollTop > 800 && !scrollingDetected) {
        setScrollingDetected(true);
      }
    }
  };

  return (
    <div className="h-full flex flex-col pt-4 overflow-hidden bg-natural-surface">
      <header className="px-6 mb-4 flex items-center justify-between border-b border-natural-border pb-4 mx-2">
        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleMonitor}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              isMonitoring 
              ? "bg-natural-accent text-white shadow-lg shadow-natural-accent/20" 
              : "bg-natural-sidebar text-natural-text-muted border border-natural-border"
            }`}
          >
            <ShieldAlert size={12} className={isMonitoring ? "animate-pulse" : ""} />
            {isMonitoring ? "Shield Active" : "Shield Mode"}
          </button>
        </div>
        <h1 className="text-xl font-serif italic font-bold tracking-tight text-natural-primary absolute left-1/2 -translate-x-1/2">VibeFeed</h1>
        <div className="flex gap-4 text-natural-text/60">
          <button onClick={onGoHistory} aria-label="History"><History size={20} /></button>
          <button onClick={onGoSettings} aria-label="Settings"><Settings size={20} /></button>
        </div>
      </header>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-6 px-4 pb-20 overflow-y-auto hide-scrollbar"
      >
        {posts.map((post) => (
          <div key={post.id} className="bg-white rounded-3xl overflow-hidden border border-natural-border shadow-xs">
            <div className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-natural-border flex items-center justify-center border border-natural-border">
                <User size={16} className="text-natural-text-muted" />
              </div>
              <span className="text-sm font-semibold tracking-tight">{post.user}</span>
            </div>
            <img src={post.img} alt="Post content" className="w-full aspect-square object-cover" />
            <div className="p-4 flex gap-5 text-natural-text/70">
              <Heart size={22} />
              <MessageCircle size={22} />
              <Share2 size={22} />
            </div>
          </div>
        ))}

        <div className="p-6">
          <button 
            onClick={onTrigger}
            className="w-full py-4 bg-natural-sidebar border border-natural-border rounded-2xl text-natural-text-muted text-sm font-medium hover:bg-natural-border transition-colors italic font-serif"
          >
            "Building friction into distraction is the first step toward intention."
          </button>
        </div>
      </div>

      <AnimatePresence>
        {scrollingDetected && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-6 left-4 right-4 bg-natural-accent text-white p-4 rounded-2xl shadow-xl flex items-center gap-3 z-50 cursor-pointer"
            onClick={onTrigger}
          >
            <ShieldAlert size={24} />
            <div className="flex-1">
              <p className="text-xs font-bold leading-tight">MINDLESS SCROLLING DETECTED</p>
              <p className="text-[10px] opacity-80">Speedbump intercept recommended. Click to check-in.</p>
            </div>
            <ArrowRight size={18} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AuthView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-natural-surface">
      <div className="w-20 h-20 bg-natural-primary rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-natural-primary/20 rotate-3">
        <Sparkles className="text-white" size={40} />
      </div>
      <h1 className="text-4xl font-serif text-natural-text font-bold italic mb-3">Speedbump</h1>
      <p className="text-natural-text-muted mb-12 leading-relaxed">
        Reconnect with your intention. <br /> Break the loop of mindless scrolling.
      </p>
      
      <button
        onClick={onSignIn}
        className="flex items-center justify-center gap-3 w-full py-5 bg-natural-text text-white rounded-2xl font-bold shadow-xl shadow-black/10 active:scale-95 transition-all"
      >
        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
          <Sparkles className="text-natural-text" size={10} />
        </div>
        Sign in with Google
      </button>

      <div className="mt-12 p-6 bg-natural-sidebar rounded-3xl border border-natural-border/50 text-left">
        <div className="flex items-center gap-2 mb-2 text-natural-primary">
          <ShieldAlert size={16} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Privacy First</span>
        </div>
        <p className="text-[11px] text-natural-text-muted leading-relaxed">
          We use Google Auth for secure identity. Your session data is private and used only to power your reframing history.
        </p>
      </div>
    </div>
  );
}

function SettingsView({ 
  preferences, 
  onUpdate, 
  onBack,
  onSignOut
}: { 
  preferences: any, 
  onUpdate: (prefs: any) => void, 
  onBack: () => void,
  onSignOut: () => void
}) {
  const personas = ["Supportive Peer", "Direct Coach", "Formal Mentor"];
  const lengths = ["Ultra-short (<50 words)", "Detailed (<150 words)"];
  const types = ["Digital", "Physical", "Mental"];

  return (
    <div className="h-full flex flex-col p-8 pt-16 bg-natural-surface">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white border border-natural-border rounded-full shadow-sm text-natural-text">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-serif font-bold italic">Preferences</h2>
        <button onClick={onSignOut} className="w-10 h-10 flex items-center justify-center text-natural-accent">
          <LogOut size={20} />
        </button>
      </div>

      <div className="space-y-8 overflow-y-auto hide-scrollbar pb-10">
        <section className="space-y-4">
          <label className="text-[10px] uppercase tracking-widest text-natural-primary font-bold pl-1 flex items-center gap-2">
            <User size={12} /> AI Persona
          </label>
          <div className="flex flex-col gap-2">
            {personas.map(p => (
              <button
                key={p}
                onClick={() => onUpdate({ persona: p })}
                className={`w-full py-4 px-6 rounded-2xl text-left text-sm font-medium transition-all border ${
                  preferences?.persona === p 
                  ? "bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/10" 
                  : "bg-white text-natural-text border-natural-border hover:bg-natural-sidebar"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <label className="text-[10px] uppercase tracking-widest text-natural-primary font-bold pl-1 flex items-center gap-2">
            <Info size={12} /> Response Style
          </label>
          <div className="flex flex-col gap-2">
            {lengths.map(l => (
              <button
                key={l}
                onClick={() => onUpdate({ length: l })}
                className={`w-full py-4 px-6 rounded-2xl text-left text-sm font-medium transition-all border ${
                  preferences?.length === l 
                  ? "bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/10" 
                  : "bg-white text-natural-text border-natural-border hover:bg-natural-sidebar"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <label className="text-[10px] uppercase tracking-widest text-natural-primary font-bold pl-1 flex items-center gap-2">
            <Sparkles size={12} /> Micro-step Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {types.map(t => (
              <button
                key={t}
                onClick={() => onUpdate({ microStepType: t })}
                className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                  preferences?.microStepType === t 
                  ? "bg-natural-primary text-white border-natural-primary shadow-md shadow-natural-primary/10" 
                  : "bg-white text-natural-primary border-natural-border"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      </div>
      
      <div className="mt-auto pt-6 text-center">
        <p className="text-[10px] text-natural-text-muted opacity-60">Speedbump Pro v1.0 • Connected as {preferences?.email}</p>
      </div>
    </div>
  );
}

function HistoryView({ onBack }: { onBack: () => void }) {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchSessions = async () => {
      try {
        const q = query(
          collection(db, "users", currentUser.uid, "sessions"), 
          orderBy("timestamp", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to fetch sessions. If this is a new collection, ensure indexes are created.", e);
        // Fallback to unordered if index is missing
        try {
          const qSimple = query(collection(db, "users", currentUser.uid, "sessions"), limit(10));
          const snapSimple = await getDocs(qSimple);
          setSessions(snapSimple.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e2) {
          console.error(e2);
        }
      } finally {
        setSessionLoading(false);
      }
    };

    fetchSessions();
  }, [currentUser]);

  return (
    <div className="h-full flex flex-col p-8 pt-16 bg-natural-surface">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white border border-natural-border rounded-full shadow-sm text-natural-text">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-serif font-bold italic">Intention Log</h2>
        <div className="w-10 h-10" />
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-4 pb-10">
        {sessionLoading ? (
            <div className="mt-20 text-center"><Sparkles className="animate-pulse mx-auto text-natural-primary/30" size={32} /></div>
        ) : sessions.length === 0 ? (
            <div className="mt-20 text-center text-natural-text-muted italic px-10">No interception sessions recorded yet. Start scrolling to begin.</div>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="bg-white border border-natural-border rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${s.completed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {s.completed ? 'INTENTION SET' : 'ABANDONED'}
                </span>
                <span className="text-[10px] text-natural-text-muted">{s.emotion}</span>
              </div>
              <p className="text-xs font-bold text-natural-text mb-1 truncate">Avoiding: {s.task}</p>
              <p className="text-[11px] text-natural-text-muted leading-relaxed line-clamp-3">
                "{s.aiResponse}"
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InterceptionView({ 
  emotions, 
  onBack, 
  emotion, 
  setEmotion, 
  task, 
  setTask, 
  onNext,
  error
}: { 
  emotions: string[], 
  onBack: () => void,
  emotion: string,
  setEmotion: (e: string) => void,
  task: string,
  setTask: (t: string) => void,
  onNext: () => void,
  error: string | null
}) {
  return (
    <div className="absolute inset-0 bg-natural-surface flex flex-col p-8 pt-16 z-40">
      <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white border border-natural-border rounded-full mb-8 shadow-sm text-natural-text">
        <ChevronLeft size={20} />
      </button>

      <div className="space-y-3 mb-10">
        <div className="w-12 h-12 bg-natural-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-natural-primary/20">
          <Clock className="text-white" size={24} />
        </div>
        <h2 className="text-3xl font-serif text-[#1A1A17] tracking-tight">Pause for a second.</h2>
        <p className="text-natural-text-muted">Before you continue, how are you feeling right now?</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-8">
        {emotions.map(e => (
          <button
            key={e}
            onClick={() => setEmotion(e)}
            className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
              emotion === e 
              ? "bg-natural-primary text-white border-natural-primary shadow-md" 
              : "bg-white text-natural-primary border-natural-border hover:bg-natural-sidebar"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <label className="text-[10px] uppercase tracking-widest text-natural-text-muted font-bold pl-1">
          What are you avoiding?
        </label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Starting that research report..."
          className="w-full h-32 bg-white border border-natural-border rounded-2xl p-5 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/30 resize-none transition-all placeholder:text-natural-border shadow-inner"
        />
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-natural-accent text-xs bg-natural-accent/5 p-3 rounded-xl border border-natural-accent/20">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-auto pt-8">
        <button
          onClick={onNext}
          disabled={!emotion || !task}
          className="w-full py-5 bg-natural-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-natural-primary/20 disabled:opacity-30 disabled:active:scale-100"
        >
          Get AI Perspective
          <Sparkles size={18} />
        </button>
      </div>
    </div>
  );
}

function ThinkingView() {
  return (
    <div className="absolute inset-0 bg-natural-surface flex flex-col items-center justify-center p-8 z-50">
      <div className="relative mb-8">
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
           className="w-24 h-24 rounded-full border-t-2 border-r-2 border-natural-primary"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="text-natural-primary/60" size={32} />
        </div>
      </div>
      <motion.p 
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-natural-text-muted font-serif italic text-lg"
      >
        Gemini is reframing your friction...
      </motion.p>
    </div>
  );
}

function ReframedView({ response, onAccept, onBack }: { response: string, onAccept: () => void, onBack: () => void }) {
  return (
    <div className="absolute inset-0 bg-natural-sidebar flex flex-col p-8 pt-12 z-40">
      <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white border border-natural-border rounded-full mb-8 shadow-sm">
        <ChevronLeft size={20} className="text-natural-text" />
      </button>

      <div className="flex-1 flex flex-col justify-center">
        <div className="bg-white border border-natural-border rounded-[2.5rem] p-8 shadow-xl relative">
          <div className="absolute -top-6 left-8 w-12 h-12 bg-natural-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Sparkles className="text-white" size={24} />
          </div>
          
          <div className="space-y-6">
            <p className="text-[10px] uppercase tracking-widest text-natural-primary font-bold">Gemini Reframe</p>
            <p className="text-xl leading-relaxed text-natural-text font-serif italic">
              "{response}"
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-6">
        <div className="space-y-4">
          <button
            onClick={onAccept}
            className="w-full py-5 bg-natural-primary text-white rounded-2xl font-bold text-lg active:scale-95 transition-all shadow-xl shadow-natural-primary/20"
          >
            I'll do that instead
          </button>
          <button
            onClick={onBack}
            className="w-full py-2 text-xs text-natural-text-muted hover:text-natural-text font-medium transition-colors"
          >
            No, let me scroll
          </button>
        </div>
        <p className="text-center text-xs text-natural-text-muted italic bg-white/40 py-2 rounded-full border border-natural-border/30">
          Intention requires friction.
        </p>
      </div>
    </div>
  );
}

function FocusView({ onDone }: { onDone: () => void }) {
  const [seconds, setSeconds] = useState(120);

  useEffect(() => {
    if (seconds > 0) {
      const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [seconds]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="absolute inset-0 bg-natural-primary flex flex-col items-center justify-center p-8 z-50 text-center text-white">
      <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-10 shadow-inner">
        <Timer className="text-white" size={40} />
      </div>

      <h2 className="text-5xl font-serif italic font-bold tabular-nums mb-3 tracking-tight">
        {formatTime(seconds)}
      </h2>
      <p className="text-white/60 mb-12 font-medium">Focus mode active. You are capable.</p>

      <div className="relative w-56 h-1.5 bg-white/10 rounded-full overflow-hidden mb-16">
        <motion.div 
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 120, ease: "linear" }}
          className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
        />
      </div>

      <button
        onClick={onDone}
        className="px-10 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white/80 text-sm font-bold transition-all border border-white/20 backdrop-blur-md"
      >
        Surrender Focus
      </button>

      {seconds === 0 && (
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute inset-0 bg-natural-surface flex flex-col items-center justify-center z-[60] p-8 text-natural-text"
        >
          <div className="w-24 h-24 bg-natural-primary/10 rounded-full flex items-center justify-center mb-8">
            <CheckCircle2 className="text-natural-primary" size={48} />
          </div>
          <h2 className="text-3xl font-serif text-natural-primary font-bold mb-4 italic">Beautifully done.</h2>
          <p className="text-natural-text-muted mb-10 leading-relaxed max-w-[240px]">
            You honored your intention. The loop is broken. Content is unlocked, but notice how you feel now.
          </p>
          <button
            onClick={onDone}
            className="w-full py-5 bg-natural-primary text-white rounded-2xl font-bold shadow-xl shadow-natural-primary/20"
          >
            Continue with Intention
          </button>
        </motion.div>
      )}
    </div>
  );
}
