import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { ChatMessage } from "@/types/dayflow";
import { MessageCircle, Send, X, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { callPlannerAI, executeToolCalls } from "@/lib/planner-ai";
import { toast } from "sonner";

interface Props {
  onAddTask: () => void;
}

export default function ScheduleChatFab({ onAddTask }: Props) {
  const store = useDayFlow();
  const { chatMessages, addChatMessage, tasks, preferences, timeBlocks, customProjects } = store;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const send = async () => {
    if (!input.trim() || isTyping) return;
    const content = input.trim();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(userMsg);
    setInput("");
    setIsTyping(true);

    const history = [...chatMessages, userMsg]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await callPlannerAI({
        messages: history,
        currentTasks: tasks,
        preferences,
        timeBlocks,
        customProjects,
      });

      let actionSummary = "";
      if (response.toolCalls.length > 0) {
        const summaries = executeToolCalls(response.toolCalls, store, timeBlocks, tasks);
        if (summaries.length > 0) {
          actionSummary = "\n\n---\n✓ " + summaries.join(" · ");
        }
      }

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: (response.content || "Done!") + actionSummary,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(aiMsg);
    } catch (err: unknown) {
      console.error("Planner AI error:", err);
      const message = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(message);
      addChatMessage({
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "Sorry, I'm having trouble right now. Try again in a moment.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTyping(false);
    }
  };

  // Quick actions for the schedule context
  const quickActions = [
    "Reschedule my day",
    "Add a task",
    "What should I do next?",
  ];

  return (
    <>
      {/* FAB buttons */}
      <div className="fixed bottom-24 right-5 z-30 flex flex-col gap-2">
        <button
          onClick={onAddTask}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary shadow-md active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4 text-foreground" />
        </button>
        <button
          onClick={() => setOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg active:scale-95 transition-transform"
        >
          <MessageCircle className="h-5 w-5 text-primary-foreground" />
        </button>
      </div>

      {/* Chat overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card"
              style={{ maxHeight: "70vh", boxShadow: "0 -4px 24px hsl(220 20% 70% / 0.2)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
                <p className="text-sm font-medium text-foreground">Quick planner</p>
                <button
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center rounded-lg p-1.5 active:bg-secondary"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5" style={{ minHeight: 120 }}>
                {chatMessages.length === 0 && !isTyping && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {quickActions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setInput(s);
                          setTimeout(() => {
                            const userMsg: ChatMessage = {
                              id: `msg-${Date.now()}`,
                              role: "user",
                              content: s,
                              timestamp: new Date().toISOString(),
                            };
                            addChatMessage(userMsg);
                            setInput("");
                            setIsTyping(true);
                            const history = [userMsg].map((m) => ({ role: m.role, content: m.content }));
                            callPlannerAI({ messages: history, currentTasks: tasks, preferences, timeBlocks, customProjects })
                              .then((response) => {
                                let actionSummary = "";
                                if (response.toolCalls.length > 0) {
                                  const summaries = executeToolCalls(response.toolCalls, store, timeBlocks, tasks);
                                  if (summaries.length > 0) {
                                    actionSummary = "\n\n---\n✓ " + summaries.join(" · ");
                                  }
                                }
                                addChatMessage({
                                  id: `msg-${Date.now() + 1}`,
                                  role: "assistant",
                                  content: (response.content || "Done!") + actionSummary,
                                  timestamp: new Date().toISOString(),
                                });
                              })
                              .catch(() => {
                                addChatMessage({
                                  id: `msg-${Date.now() + 1}`,
                                  role: "assistant",
                                  content: "Sorry, something went wrong.",
                                  timestamp: new Date().toISOString(),
                                });
                              })
                              .finally(() => setIsTyping(false));
                          }, 0);
                        }}
                        className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground active:bg-border transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {chatMessages.slice(-10).map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary text-secondary-foreground rounded-bl-sm"
                      }`}
                    >
                      <div className="text-xs leading-relaxed prose prose-sm max-w-none [&_p]:m-0 [&_ul]:mt-1 [&_li]:text-xs">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-xl rounded-bl-sm px-3 py-2 flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="px-3 pb-6 pt-2 border-t border-border/50">
                <div className="flex items-end gap-2 rounded-xl bg-secondary p-1.5 pl-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Reschedule, add tasks, ask anything..."
                    rows={1}
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none py-1.5 leading-relaxed"
                    style={{ maxHeight: 80 }}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || isTyping}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary disabled:opacity-40 transition-opacity active:scale-95"
                  >
                    <Send className="h-3.5 w-3.5 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
