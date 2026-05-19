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
  ShieldAlert,
  Layout
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
  orderBy,
  limit,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";
import { db } from "./lib/firebase";

interface UserTask {
  id: string;
  text: string;
  completed: boolean;
  createdAt: any;
}

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
  const [lastDetection, setLastDetection] = useState<{ reasoning: string, confidence: number } | null>(null);
  const [scrollingDetected, setScrollingDetected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [taskLoading, setTaskLoading] = useState(true);
  const [usageLogs, setUsageLogs] = useState<{ appName: string, count: number }[]>([]);
  const monitorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const emotions = ["Overwhelmed", "Bored", "Anxious", "Tired", "Restless"];

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "users", currentUser.uid, "tasks"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserTask)));
      setTaskLoading(false);
    });

    // Fetch today's logs for usage summary
    const today = new Date();
    today.setHours(0,0,0,0);
    const logQ = query(
      collection(db, "users", currentUser.uid, "logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsubLogs = onSnapshot(logQ, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.appName && data.appName !== "null") {
          counts[data.appName] = (counts[data.appName] || 0) + 1; // Each log represents roughly 5-10s
        }
      });
      setUsageLogs(Object.entries(counts).map(([appName, count]) => ({ appName, count })));
    });

    return () => {
      unsubscribe();
      unsubLogs();
    };
  }, [currentUser]);

  const addTask = async (text: string) => {
    if (!currentUser || !text.trim()) return;
    try {
      await addDoc(collection(db, "users", currentUser.uid, "tasks"), {
        text,
        completed: false,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error adding task:", e);
    }
  };

  const toggleTask = async (id: string, current: boolean) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), {
        completed: !current
      });
    } catch (e) {
      console.error("Error toggling task:", e);
    }
  };

  const deleteTask = async (id: string) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id));
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  const startMonitoring = async () => {
    try {
      // @ts-ignore - captureController is experimental but useful
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          cursor: "always",
        } as any,
        // @ts-ignore
        selfBrowserSurface: "exclude" 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      // We need to wait for metadata to get dimensions
      video.onloadedmetadata = () => {
        video.play();
        videoRef.current = video;
        setIsMonitoring(true);
        runMonitoringLoop();
      };
    } catch (err: any) {
      console.error("Screen capture failed:", err);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setError("Screen capture was blocked. If you're in a preview, please open the app in a new tab (button at top right) to grant permissions.");
      } else {
        setError("Could not start monitoring: " + err.message);
      }
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
    setLastDetection(null);
  };

  const runMonitoringLoop = async () => {
    // Check if video is still active
    if (!videoRef.current || !isMonitoring || videoRef.current.paused) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.4); // Lower quality for speed
        
        const res = await fetch("/api/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageData }),
        });
        
        const data = await res.json();
        setLastDetection({ reasoning: data.reasoning, confidence: data.confidence });

        // Log detection if app identified
        if (currentUser && data.appName && data.appName !== "null") {
          addDoc(collection(db, "users", currentUser.uid, "logs"), {
            appName: data.appName,
            confidence: data.confidence,
            timestamp: serverTimestamp(),
            reasoning: data.reasoning
          }).catch(console.error);
        }

        if (data.isDoomscrolling && data.confidence > 0.8) {
          setScrollingDetected(true);
          // If extremely high confidence, trigger immediately
          if (data.confidence > 0.95) {
            triggerInterception();
            return; // Stop loop while intercepted
          }
        } else {
          setScrollingDetected(false);
        }
      }
    } catch (err) {
      console.error("Monitor loop error:", err);
    }

    // Faster checks while active (5 seconds)
    monitorTimeoutRef.current = setTimeout(runMonitoringLoop, 5000);
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
              <DashboardView 
                onTrigger={triggerInterception} 
                onGoSettings={() => setAppState("settings")}
                onGoHistory={() => setAppState("history")}
                isMonitoring={isMonitoring}
                onToggleMonitor={isMonitoring ? stopMonitoring : startMonitoring}
                lastDetection={lastDetection}
                scrollingDetected={scrollingDetected}
                tasks={tasks}
                addTask={addTask}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                usageLogs={usageLogs}
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
                tasks={tasks}
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

function DashboardView({ 
  onTrigger, 
  onGoSettings, 
  onGoHistory,
  isMonitoring,
  onToggleMonitor,
  lastDetection,
  scrollingDetected,
  tasks,
  addTask,
  toggleTask,
  deleteTask,
  usageLogs
}: { 
  onTrigger: () => void, 
  onGoSettings: () => void, 
  onGoHistory: () => void, 
  isMonitoring: boolean,
  onToggleMonitor: () => void,
  lastDetection: { reasoning: string, confidence: number } | null,
  scrollingDetected: boolean,
  tasks: UserTask[],
  addTask: (text: string) => void,
  toggleTask: (id: string, current: boolean) => void,
  deleteTask: (id: string) => void,
  usageLogs: { appName: string, count: number }[]
}) {
  const [newTaskText, setNewTaskText] = useState("");

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      addTask(newTaskText);
      setNewTaskText("");
    }
  };

  return (
    <div className="h-full flex flex-col bg-natural-surface">
      <header className="px-8 pt-12 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif italic font-bold text-natural-primary">Speedbump</h1>
          <p className="text-xs text-natural-text-muted">Personal Accountability</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onGoHistory} className="p-2 bg-white rounded-xl shadow-xs border border-natural-border text-natural-primary" aria-label="History"><History size={20} /></button>
          <button onClick={onGoSettings} className="p-2 bg-white rounded-xl shadow-xs border border-natural-border text-natural-primary" aria-label="Settings"><Settings size={20} /></button>
        </div>
      </header>

      <div className="flex-1 px-8 space-y-6 pt-4 overflow-y-auto hide-scrollbar pb-32">
        {/* Shield Status Card */}
        <div className={`p-8 rounded-[2.5rem] border-[3px] transition-all duration-500 shadow-sm ${
          isMonitoring 
          ? scrollingDetected 
            ? "bg-natural-accent/10 border-natural-accent" 
            : "bg-blue-50 border-blue-200"
          : "bg-natural-sidebar border-natural-border"
        }`}>
          <div className="flex justify-between items-start mb-8">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
              isMonitoring ? "bg-natural-accent text-white animate-pulse" : "bg-natural-border text-natural-text-muted transition-colors"
            }`}>
              <ShieldAlert size={32} />
            </div>
            <button 
              onClick={onToggleMonitor}
              className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all shadow-md ${
                isMonitoring 
                ? "bg-natural-text text-white hover:bg-natural-primary" 
                : "bg-natural-primary text-white shadow-xl shadow-natural-primary/20 hover:scale-105 active:scale-95"
              }`}
            >
              {isMonitoring ? "Deactivate" : "Activate Shield"}
            </button>
          </div>

          <h2 className="text-2xl font-serif font-bold mb-2">
            {isMonitoring 
              ? scrollingDetected ? "Intervention Needed" : "Monitoring Active" 
              : "Shield is Offline"}
          </h2>
          <p className="text-sm text-natural-text-muted leading-relaxed">
            {isMonitoring 
              ? "Recording usage habits and watching for mindless scrolling. Your Focus Shield is active."
              : "Enable Shield Mode to automatically track usage and detect loops across your phone."}
          </p>
          
          {isMonitoring && usageLogs.length > 0 && (
             <div className="mt-8 pt-6 border-t border-natural-border/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-natural-text-muted mb-4">Detected Usage (Approx)</p>
                <div className="flex flex-wrap gap-2">
                  {usageLogs.slice(0, 5).map(log => (
                    <div key={log.appName} className="bg-white/50 border border-natural-border/30 px-3 py-1.5 rounded-full flex items-center gap-2">
                      <span className="text-xs font-medium">{log.appName}</span>
                      <span className="text-[10px] font-bold text-natural-primary">{(log.count * 10 / 60).toFixed(0)}m</span>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>

        {/* Priority Tasks Card */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-natural-border shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-natural-sidebar flex items-center justify-center text-natural-primary">
                 <CheckCircle2 size={20} />
               </div>
               <h3 className="text-xl font-serif font-bold">Your Focus</h3>
            </div>
          </div>

          <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
            <input 
              type="text" 
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="What are you avoiding?"
              className="flex-1 bg-natural-sidebar border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-natural-primary/20 outline-none"
            />
            <button 
              type="submit"
              className="bg-natural-primary text-white p-3 rounded-2xl shadow-lg shadow-natural-primary/10"
            >
              <Sparkles size={20} />
            </button>
          </form>

          <div className="space-y-3">
            {tasks.length > 0 ? (
              tasks.slice(0, 5).map(task => (
                <div key={task.id} className="flex items-center justify-between group p-1">
                  <button 
                    onClick={() => toggleTask(task.id, task.completed)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      task.completed ? "bg-natural-primary border-natural-primary text-white" : "border-natural-border bg-natural-sidebar"
                    }`}>
                      {task.completed && <CheckCircle2 size={14} />}
                    </div>
                    <span className={`text-sm ${task.completed ? "text-natural-text-muted line-through" : "text-natural-text font-medium"}`}>
                      {task.text}
                    </span>
                  </button>
                  <button 
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-natural-accent"
                  >
                    <AlertCircle size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-8 text-center bg-natural-sidebar rounded-3xl border border-dashed border-natural-border">
                <p className="text-sm text-natural-text-muted italic">No active tasks. Add one to stay focused.</p>
              </div>
            )}
          </div>
        </div>

        {/* AI Insight Card */}
        {isMonitoring && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-natural-primary text-white p-8 rounded-[2.5rem] shadow-xl shadow-natural-primary/20"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Real-time Analysis</span>
            </div>
            
            {lastDetection ? (
              <div className="space-y-4">
                <p className="text-xl font-serif italic leading-relaxed">
                  "{lastDetection.reasoning}"
                </p>
                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                  <span className="text-[10px] font-mono opacity-60 uppercase">Confidence: {(lastDetection.confidence * 100).toFixed(0)}%</span>
                  {scrollingDetected && (
                    <button 
                      onClick={onTrigger}
                      className="bg-white text-natural-primary px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      Break the Loop
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm italic opacity-70">Scanning environment for patterns...</p>
            )}
          </motion.div>
        )}
      </div>

      <div className="p-8 fixed bottom-0 left-0 right-0 max-w-md mx-auto pointer-events-none">
        <div className="bg-natural-surface/80 backdrop-blur-xl border border-natural-border p-4 rounded-[2rem] flex items-center gap-3 shadow-2xl pointer-events-auto">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-natural-primary shadow-xs border border-natural-border">
              <Info size={18} />
            </div>
            <p className="text-[10px] text-natural-text-muted leading-relaxed flex-1">
                <strong>Usage Note:</strong> Speedbump tracks app usage *live* while active to help identify distraction patterns.
            </p>
        </div>
      </div>
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
  const [logs, setLogs] = useState<any[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [view, setView] = useState<"sessions" | "usage">("sessions");

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchData = async () => {
      try {
        const qSession = query(collection(db, "users", currentUser.uid, "sessions"), orderBy("timestamp", "desc"), limit(20));
        const qLogs = query(collection(db, "users", currentUser.uid, "logs"), orderBy("timestamp", "desc"), limit(50));
        
        const [sessionSnap, logsSnap] = await Promise.all([getDocs(qSession), getDocs(qLogs)]);
        
        setSessions(sessionSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const counts: Record<string, number> = {};
        logsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.appName && data.appName !== "null") {
            counts[data.appName] = (counts[data.appName] || 0) + 1;
          }
        });
        setLogs(Object.entries(counts).map(([name, count]) => ({ name, duration: count * 10 })));
      } catch (e) {
        console.error("Data fetch error", e);
      } finally {
        setSessionLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  return (
    <div className="h-full flex flex-col p-8 pt-16 bg-natural-surface">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white border border-natural-border rounded-full shadow-sm text-natural-text">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-serif font-bold italic">History</h2>
        <div className="w-10 h-10" />
      </div>

      <div className="flex bg-natural-sidebar p-1 rounded-2xl mb-8">
        <button 
          onClick={() => setView("sessions")}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${view === "sessions" ? "bg-white shadow-sm text-natural-primary" : "text-natural-text-muted"}`}
        >
          Check-ins
        </button>
        <button 
          onClick={() => setView("usage")}
          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${view === "usage" ? "bg-white shadow-sm text-natural-primary" : "text-natural-text-muted"}`}
        >
          App Usage
        </button>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-4 pb-10">
        {sessionLoading ? (
            <div className="mt-20 text-center"><Sparkles className="animate-pulse mx-auto text-natural-primary/30" size={32} /></div>
        ) : view === "sessions" ? (
          sessions.length === 0 ? (
            <div className="mt-2 text-center text-natural-text-muted italic px-10">No interception sessions yet.</div>
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
                <p className="text-[11px] text-natural-text-muted leading-relaxed line-clamp-3 italic">"{s.aiResponse}"</p>
              </div>
            ))
          )
        ) : (
          logs.length === 0 ? (
            <div className="mt-2 text-center text-natural-text-muted italic px-10">No app usage detected yet. Enable Shield mode to track.</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.name} className="bg-white border border-natural-border rounded-2xl p-4 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-natural-sidebar flex items-center justify-center text-natural-primary">
                      <Layout size={16} />
                    </div>
                    <span className="text-sm font-semibold">{log.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-natural-primary">{Math.floor(log.duration / 60)}m {log.duration % 60}s</span>
                </div>
              ))}
              <p className="text-[10px] text-natural-text-muted text-center pt-4 italic">Usage is approximated based on Shield Mode captures.</p>
            </div>
          )
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
  error,
  tasks
}: { 
  emotions: string[], 
  onBack: () => void,
  emotion: string,
  setEmotion: (e: string) => void,
  task: string,
  setTask: (t: string) => void,
  onNext: () => void,
  error: string | null,
  tasks: UserTask[]
}) {
  const activeTasks = tasks.filter(t => !t.completed);

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
        <p className="text-natural-text-muted">Mindless loop detected. Are you avoiding one of these?</p>
      </div>

      {activeTasks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {activeTasks.slice(0, 3).map(t => (
            <button 
              key={t.id} 
              onClick={() => setTask(t.text)}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                task === t.text ? "bg-natural-primary text-white border-natural-primary" : "bg-white text-natural-text border-natural-border"
              }`}
            >
              {t.text}
            </button>
          ))}
        </div>
      )}

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
          {task ? "Focusing on:" : "What are you avoiding?"}
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
